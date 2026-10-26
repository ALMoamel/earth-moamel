import { useCallback, useEffect, useRef, useState } from "react";
import { HoloGlobe } from "./lib/holoGlobe";
import {
  HandTracker,
  dist,
  handCenter,
  listCameras,
  pinchAmount,
  type CameraDevice,
  type HandFrame,
} from "./lib/handTracking";
import { CITIES, loadCities, searchCities, type City } from "./data/cities";
import { HudFrame } from "./components/HudFrame";
import { UI, type Lang } from "./data/i18n";

type Gesture = "IDLE" | "PAN" | "ZOOM";

const FINGERTIPS = [4, 8, 12, 16, 20];
const HAND_BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const globeCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const globeRef = useRef<HoloGlobe | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);

  const prevPinch = useRef<{ x: number; y: number } | null>(null);
  const prevTwoDist = useRef<number | null>(null);
  const dragging = useRef(false);
  const lastMouse = useRef<{ x: number; y: number } | null>(null);
  const citiesRef = useRef<City[]>(CITIES);

  const [lang, setLang] = useState<Lang>("ar");
  const t = UI[lang];

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [loadingCam, setLoadingCam] = useState(false);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCam, setSelectedCam] = useState<string>("");
  const [gesture, setGesture] = useState<Gesture>("IDLE");
  const [handCount, setHandCount] = useState(0);
  const [pinch, setPinch] = useState(0);
  const [cityCount, setCityCount] = useState(CITIES.length);

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<City[]>([]);
  const [activeCity, setActiveCity] = useState<City | null>(null);
  const [showSug, setShowSug] = useState(false);
  const [showGate, setShowGate] = useState(true);
  const [layers, setLayers] = useState({ borders: true, clouds: true, cities: true });

  const gLabel = (g: Gesture) => (g === "PAN" ? t.pan : g === "ZOOM" ? t.zoom : t.idle);

  /* init globe + load cities */
  useEffect(() => {
    if (!globeCanvasRef.current) return;
    const g = new HoloGlobe();
    g.init(globeCanvasRef.current, citiesRef.current);
    globeRef.current = g;
    loadCities().then((c) => {
      citiesRef.current = c;
      setCityCount(c.length);
      g.setCities(c);
    });
    return () => g.dispose();
  }, []);

  const flyToCity = useCallback(
    (city: City) => {
      const main = lang === "ar" ? city.name_ar || city.name : city.name;
      const sub = lang === "ar" ? city.country_ar || city.country : city.country;
      globeRef.current?.flyTo(city, main, sub);
      setActiveCity(city);
      setQuery(lang === "ar" ? city.name_ar || city.name : city.name);
      setShowSug(false);
    },
    [lang],
  );

  useEffect(() => {
    setSuggestions(searchCities(query, 8, citiesRef.current));
  }, [query]);

  const submitSearch = () => {
    const hits = searchCities(query, 1, citiesRef.current);
    if (hits.length) flyToCity(hits[0]);
  };

  const drawOverlay = useCallback((frame: HandFrame) => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement!;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    const px = (nx: number) => (1 - nx) * w;
    const py = (ny: number) => ny * h;
    for (const hand of frame.hands) {
      ctx.strokeStyle = "rgba(77,225,255,0.55)";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#4de1ff";
      ctx.shadowBlur = 12;
      for (const [a, b] of HAND_BONES) {
        ctx.beginPath();
        ctx.moveTo(px(hand[a].x), py(hand[a].y));
        ctx.lineTo(px(hand[b].x), py(hand[b].y));
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(150,240,255,0.5)";
      for (const lm of hand) {
        ctx.beginPath();
        ctx.arc(px(lm.x), py(lm.y), 3, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const tip of FINGERTIPS) {
        const x = px(hand[tip].x);
        const y = py(hand[tip].y);
        const grad = ctx.createRadialGradient(x, y, 0, x, y, 22);
        grad.addColorStop(0, "rgba(255,255,255,0.95)");
        grad.addColorStop(0.3, "rgba(127,240,255,0.8)");
        grad.addColorStop(1, "rgba(77,225,255,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, 22, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.shadowBlur = 0;
  }, []);

  const handleFrame = useCallback(
    (frame: HandFrame) => {
      drawOverlay(frame);
      const globe = globeRef.current;
      if (!globe) return;
      const hands = frame.hands;
      setHandCount(hands.length);

      if (hands.length === 2) {
        prevPinch.current = null;
        const p0 = pinchAmount(hands[0]);
        const p1 = pinchAmount(hands[1]);
        setPinch(Math.min(p0, p1));
        // التكبير/التصغير فقط عند القرص بكلتا اليدين (Pinch بكلتيهما)
        if (p0 > 0.5 && p1 > 0.5) {
          // المسافة بين طرفي السبابة في اليدين (نقطة القرص)
          const a = hands[0][8];
          const b = hands[1][8];
          const d = dist({ x: a.x, y: a.y, z: 0 }, { x: b.x, y: b.y, z: 0 });
          if (prevTwoDist.current != null) {
            const delta = d - prevTwoDist.current;
            if (Math.abs(delta) > 0.0008) {
              // مباعدة اليدين = تكبير (factor < 1) ، تقريبهما = تصغير
              globe.zoomBy(1 - delta * 9);
              setGesture("ZOOM");
            }
          }
          prevTwoDist.current = d;
        } else {
          prevTwoDist.current = null;
          setGesture("IDLE");
        }
        return;
      }
      prevTwoDist.current = null;

      if (hands.length === 1) {
        const hand = hands[0];
        const p = pinchAmount(hand);
        setPinch(p);
        if (p > 0.6) {
          const c = handCenter(hand);
          if (prevPinch.current) {
            const dx = c.x - prevPinch.current.x;
            const dy = c.y - prevPinch.current.y;
            // حركة أرض أسرع وأكثر استجابة
            globe.rotateBy(dx * 5.2, dy * 5.2);
            setGesture("PAN");
          }
          prevPinch.current = c;
        } else {
          prevPinch.current = null;
          setGesture("IDLE");
        }
        return;
      }
      prevPinch.current = null;
      setPinch(0);
      setGesture("IDLE");
    },
    [drawOverlay],
  );

  const refreshCameras = useCallback(async () => {
    const cams = await listCameras();
    setCameras(cams);
    return cams;
  }, []);

  const startCamera = async (deviceId?: string) => {
    if (!videoRef.current) return;
    setLoadingCam(true);
    setCameraError(null);
    try {
      const tracker = new HandTracker(videoRef.current, handleFrame);
      await tracker.start(deviceId || selectedCam || undefined);
      trackerRef.current = tracker;
      setCameraOn(true);
      // Labels are available only after permission is granted.
      const cams = await refreshCameras();
      if (!selectedCam && cams.length) {
        // Reflect the actually-used device if available.
        const track = videoRef.current.srcObject
          ? (videoRef.current.srcObject as MediaStream).getVideoTracks()[0]
          : null;
        const activeId = track?.getSettings().deviceId;
        setSelectedCam(activeId || cams[0].deviceId);
      }
    } catch (e: any) {
      setCameraError(
        lang === "ar"
          ? "تعذّر الوصول للكاميرا — استخدم تحكم الفأرة."
          : "Camera unavailable — use mouse controls.",
      );
    } finally {
      setLoadingCam(false);
    }
  };

  const switchCamera = async (deviceId: string) => {
    setSelectedCam(deviceId);
    if (trackerRef.current && cameraOn) {
      setLoadingCam(true);
      try {
        await trackerRef.current.switchCamera(deviceId);
      } catch {
        setCameraError(
          lang === "ar" ? "تعذّر تبديل الكاميرا." : "Could not switch camera.",
        );
      } finally {
        setLoadingCam(false);
      }
    }
  };

  // Try to list cameras on mount (labels may be empty until permission granted).
  useEffect(() => {
    refreshCameras();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshCameras);
    return () =>
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshCameras);
  }, [refreshCameras]);

  useEffect(() => () => trackerRef.current?.stop(), []);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !lastMouse.current) return;
    const dx = (e.clientX - lastMouse.current.x) / window.innerWidth;
    const dy = (e.clientY - lastMouse.current.y) / window.innerHeight;
    globeRef.current?.rotateBy(dx * 4, dy * 4);
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setGesture("PAN");
  };
  const onPointerUp = () => {
    dragging.current = false;
    lastMouse.current = null;
    setGesture((g) => (g === "PAN" ? "IDLE" : g));
  };
  const onWheel = (e: React.WheelEvent) => {
    globeRef.current?.zoomBy(e.deltaY > 0 ? 1.08 : 0.92);
    setGesture("ZOOM");
  };

  const cityMain = (c: City) => (lang === "ar" ? c.name_ar || c.name : c.name);
  const citySub = (c: City) => (lang === "ar" ? c.country_ar || c.country : c.country);

  return (
    <div
      dir={t.dir}
      className="relative h-screen w-screen overflow-hidden bg-[#000308] text-cyan-100 select-none"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover opacity-20 [transform:scaleX(-1)]"
        style={{ filter: "hue-rotate(150deg) saturate(1.2) brightness(0.6)" }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,20,30,0.15)_0%,rgba(0,3,8,0.8)_75%)]" />

      <canvas ref={globeCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />

      <div
        className="absolute inset-0 z-20 cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      />

      <div className="scanline pointer-events-none absolute left-0 top-0 z-30 h-24 w-full bg-gradient-to-b from-transparent via-cyan-400/5 to-transparent" />
      <HudFrame />

      {/* language toggle */}
      <div className="absolute top-4 z-50 flex gap-2" style={{ insetInlineEnd: "1rem" }}>
        <button
          onClick={() => setLang((l) => (l === "ar" ? "en" : "ar"))}
          className="neon-border glass font-hud rounded-full px-4 py-2 text-xs tracking-widest text-cyan-100 transition hover:bg-cyan-400/20"
        >
          {lang === "ar" ? "EN 🌐" : "عربي 🌐"}
        </button>
      </div>

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex flex-col items-center gap-3 px-6 pt-5">
        <div className="text-center flicker">
          <h1 className="font-hud text-xl font-black tracking-[0.35em] neon-text sm:text-2xl">
            {t.title}
          </h1>
          <p className="font-body text-xs tracking-wide text-cyan-300/70">{t.subtitle}</p>
        </div>

        <div className="pointer-events-auto relative w-full max-w-xl">
          <div className="neon-border glass flex items-center gap-3 rounded-full px-5 py-3">
            <span className="text-cyan-300 neon-text">◎</span>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowSug(true);
              }}
              onFocus={() => setShowSug(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitSearch();
                if (e.key === "Escape") setShowSug(false);
              }}
              placeholder={t.searchPlaceholder}
              className="font-body w-full bg-transparent text-sm tracking-wide text-cyan-100 placeholder:text-cyan-400/40"
            />
            <button
              onClick={submitSearch}
              className="font-hud rounded-full border border-cyan-400/50 px-4 py-1 text-[11px] tracking-widest text-cyan-200 transition hover:bg-cyan-400/20 neon-text"
            >
              {t.fly}
            </button>
          </div>

          {showSug && suggestions.length > 0 && (
            <div className="neon-border glass absolute mt-2 max-h-80 w-full overflow-y-auto rounded-2xl p-1">
              {suggestions.map((c, i) => (
                <button
                  key={`${c.name}-${c.country}-${i}`}
                  onClick={() => flyToCity(c)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl px-4 py-2 text-start transition hover:bg-cyan-400/15"
                >
                  <span className="font-body text-sm tracking-wide text-cyan-100">
                    {cityMain(c)}
                    <span className="mx-2 text-cyan-400/50">{citySub(c)}</span>
                  </span>
                  <span className="font-hud text-[10px] text-cyan-400/60">
                    {c.lat.toFixed(1)}°, {c.lon.toFixed(1)}°
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* left: gesture status */}
      <div
        className="pointer-events-none absolute top-1/2 z-40 hidden -translate-y-1/2 sm:block"
        style={{ insetInlineStart: "1.25rem" }}
      >
        <div className="neon-border glass w-56 rounded-2xl p-4">
          <div className="font-hud mb-3 text-[10px] tracking-[0.3em] text-cyan-300/70">
            {t.gesture}
          </div>
          <Row label={t.tracking} value={cameraOn ? t.online : t.offline} on={cameraOn} />
          <Row label={t.hands} value={String(handCount)} on={handCount > 0} />
          <Row label={t.mode} value={gLabel(gesture)} on={gesture !== "IDLE"} />
          <Row label={t.cities} value={String(cityCount)} on />
          <div className="mt-3">
            <div className="font-body mb-1 flex justify-between text-[10px] tracking-widest text-cyan-300/60">
              <span>{t.pinch}</span>
              <span>{Math.round(pinch * 100)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-cyan-900/40">
              <div
                className="h-full rounded-full bg-cyan-300 shadow-[0_0_8px_#4de1ff] transition-all"
                style={{ width: `${pinch * 100}%` }}
              />
            </div>
          </div>
          {!cameraOn && (
            <button
              onClick={() => startCamera()}
              className="pointer-events-auto font-hud mt-3 w-full rounded-lg border border-cyan-400/40 py-1.5 text-[10px] tracking-widest text-cyan-200 transition hover:bg-cyan-400/15"
            >
              {t.activateCamera}
            </button>
          )}

          {/* camera selector (external camera support) */}
          {(cameras.length > 0 || cameraOn) && (
            <div className="pointer-events-auto mt-3">
              <div className="font-body mb-1 text-[10px] tracking-widest text-cyan-300/60">
                📷 {t.selectCamera}
              </div>
              <select
                value={selectedCam}
                onChange={(e) => switchCamera(e.target.value)}
                className="font-body w-full rounded-lg border border-cyan-400/40 bg-[#02121a] px-2 py-1.5 text-[11px] text-cyan-100 outline-none"
              >
                {cameras.length === 0 && <option value="">{t.noCameras}</option>}
                {cameras.map((c, i) => (
                  <option key={c.deviceId || i} value={c.deviceId} className="bg-[#02121a]">
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* right: target */}
      <div
        className="pointer-events-none absolute top-1/2 z-40 hidden -translate-y-1/2 sm:block"
        style={{ insetInlineEnd: "1.25rem" }}
      >
        <div className="neon-border glass w-60 rounded-2xl p-4">
          <div className="font-hud mb-3 text-[10px] tracking-[0.3em] text-cyan-300/70">
            {t.target}
          </div>
          {activeCity ? (
            <div>
              <div className="font-hud text-xl font-bold neon-text">
                {cityMain(activeCity).toUpperCase()}
              </div>
              <div className="font-body text-xs tracking-widest text-cyan-300/70">
                {citySub(activeCity)}
              </div>
              <div className="mt-3 space-y-1 font-hud text-[11px] text-cyan-200/80">
                <div className="flex justify-between">
                  <span className="text-cyan-400/60">{t.lat}</span>
                  <span>{activeCity.lat.toFixed(4)}°</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cyan-400/60">{t.lon}</span>
                  <span>{activeCity.lon.toFixed(4)}°</span>
                </div>
                {activeCity.pop ? (
                  <div className="flex justify-between">
                    <span className="text-cyan-400/60">{t.pop}</span>
                    <span>{(activeCity.pop / 1e6).toFixed(2)}M</span>
                  </div>
                ) : null}
              </div>
              <button
                onClick={() => {
                  globeRef.current?.resetView();
                  setActiveCity(null);
                  setQuery("");
                }}
                className="pointer-events-auto font-hud mt-4 w-full rounded-lg border border-cyan-400/40 py-1.5 text-[10px] tracking-widest text-cyan-200 transition hover:bg-cyan-400/15"
              >
                {t.releaseLock}
              </button>
            </div>
          ) : (
            <div className="font-body text-sm tracking-widest text-cyan-400/50">{t.noTarget}</div>
          )}
        </div>
      </div>

      {/* layer toggles */}
      <div
        className="absolute bottom-16 z-40 flex flex-col gap-2"
        style={{ insetInlineStart: "1.25rem" }}
      >
        <LayerBtn
          label={`◭ ${t.borders}`}
          on={layers.borders}
          onClick={() => setLayers((s) => ({ ...s, borders: globeRef.current!.toggleBorders() }))}
        />
        <LayerBtn
          label={`☁ ${t.clouds}`}
          on={layers.clouds}
          onClick={() => setLayers((s) => ({ ...s, clouds: globeRef.current!.toggleClouds() }))}
        />
        <LayerBtn
          label={`◉ ${t.cities}`}
          on={layers.cities}
          onClick={() => setLayers((s) => ({ ...s, cities: globeRef.current!.toggleCities() }))}
        />
        <LayerBtn
          label={`⟲ ${t.reset}`}
          on
          onClick={() => {
            globeRef.current?.resetView();
            setActiveCity(null);
            setQuery("");
          }}
        />
      </div>

      {/* legend */}
      <div className="pointer-events-none absolute bottom-16 z-40 hidden sm:block" style={{ insetInlineEnd: "1.25rem" }}>
        <div className="neon-border glass rounded-2xl p-3 font-hud text-[10px] tracking-widest text-cyan-200/80">
          <div>{t.legendPan}</div>
          <div>{t.legendZoom}</div>
          <div>{t.legendSearch}</div>
          <div className="text-cyan-400/50">{t.legendMouse}</div>
        </div>
      </div>

      {/* credit bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex justify-center">
        <div className="neon-border glass rounded-full px-6 py-1.5">
          <span className="font-hud text-[11px] tracking-[0.25em] neon-text">✦ {t.credit} ✦</span>
        </div>
      </div>

      {/* gate */}
      {showGate && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="neon-border glass mx-6 max-w-md rounded-3xl p-8 text-center">
            <div className="absolute end-4 top-4">
              <button
                onClick={() => setLang((l) => (l === "ar" ? "en" : "ar"))}
                className="font-hud rounded-full border border-cyan-400/40 px-3 py-1 text-[10px] tracking-widest text-cyan-200 transition hover:bg-cyan-400/20"
              >
                {lang === "ar" ? "EN" : "عربي"}
              </button>
            </div>
            <div className="font-hud text-2xl font-black tracking-[0.3em] neon-text">{t.title}</div>
            <div className="font-body mt-1 text-sm text-cyan-300/80">{t.subtitle}</div>
            <p className="font-body mt-4 text-sm leading-relaxed tracking-wide text-cyan-200/85">
              {t.gateDesc}
            </p>

            {/* camera picker on the gate */}
            {cameras.length > 0 && (
              <div className="mt-5 text-start">
                <div className="font-body mb-1 text-[11px] tracking-widest text-cyan-300/70">
                  📷 {t.selectCamera}
                </div>
                <select
                  value={selectedCam}
                  onChange={(e) => setSelectedCam(e.target.value)}
                  className="font-body w-full rounded-lg border border-cyan-400/40 bg-[#02121a] px-3 py-2 text-sm text-cyan-100 outline-none"
                >
                  {cameras.map((c, i) => (
                    <option key={c.deviceId || i} value={c.deviceId} className="bg-[#02121a]">
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={() => {
                setShowGate(false);
                startCamera();
              }}
              disabled={loadingCam}
              className="font-hud mt-5 w-full rounded-xl border border-cyan-400/60 bg-cyan-400/10 py-3 text-sm tracking-[0.2em] text-cyan-100 transition hover:bg-cyan-400/25 disabled:opacity-50 neon-text"
            >
              {loadingCam ? t.initializing : t.activateCamera}
            </button>
            <button
              onClick={() => setShowGate(false)}
              className="font-hud mt-3 w-full rounded-xl border border-cyan-400/20 py-2 text-[11px] tracking-[0.2em] text-cyan-300/70 transition hover:bg-cyan-400/10"
            >
              {t.skipMouse}
            </button>
            {cameraError && <p className="font-body mt-4 text-xs text-rose-300/90">{cameraError}</p>}
            <div className="font-hud mt-5 text-[10px] tracking-[0.25em] text-cyan-400/60">
              ✦ {t.credit} ✦
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, on }: { label: string; value: string; on: boolean }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="font-body text-[11px] tracking-widest text-cyan-300/60">{label}</span>
      <span
        className={`font-hud text-xs tracking-widest ${on ? "text-cyan-200 neon-text" : "text-cyan-500/40"}`}
      >
        {value}
      </span>
    </div>
  );
}

function LayerBtn({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`neon-border glass font-hud w-40 rounded-full px-4 py-2 text-[10px] tracking-widest transition hover:bg-cyan-400/20 ${on ? "text-cyan-100" : "text-cyan-500/40"}`}
    >
      {label}
    </button>
  );
}
