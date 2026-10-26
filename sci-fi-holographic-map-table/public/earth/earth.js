/* =====================================================================
   HOLO-EARTH // أرض واقعية مثل Google Earth
   - MapLibre GL : صور أقمار ESRI + أسماء + تضاريس 3D + وضع الكرة
   - MediaPipe   : تتبع اليد (قرص للتحريك، مباعدة للتكبير)
   - بحث عالمي بالطيران (FlyTo) + دعم عربي كامل
   ===================================================================== */

const AR_COUNTRIES = window.AR_COUNTRIES || {};
const AR_CITIES = window.AR_CITIES || {};
const log = (m) => { const e = document.getElementById("loadmsg"); if (e) e.textContent = m; };

/* ---------------- تعريف نمط الخريطة (بدون مفتاح API) ---------------- */
const style = {
  version: 8,
  // خط افتراضي (مطلوب لبعض الإضافات)
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    // صور الأقمار الصناعية عالية الدقة (ESRI World Imagery) — مجاني
    satellite: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    },
    // أسماء الدول والمدن والشوارع والحدود (شفافة فوق الأقمار)
    labels: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
    },
    // بيانات الارتفاع للتضاريس ثلاثية الأبعاد (AWS Terrarium) — مجاني
    terrain: {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      tileSize: 256,
      encoding: "terrarium",
      maxzoom: 14,
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#000308" } },
    { id: "satellite", type: "raster", source: "satellite" },
    { id: "labels", type: "raster", source: "labels", paint: { "raster-opacity": 0.9 } },
  ],
  // تفعيل وضع الكرة الأرضية منذ البداية
  projection: { type: "globe" },
};

/* ---------------- إنشاء الخريطة ---------------- */
const map = new maplibregl.Map({
  container: "map",
  style,
  center: [30, 25],
  zoom: 1.6,
  pitch: 0,
  bearing: 0,
  attributionControl: { compact: true },
  maxZoom: 19,
  dragRotate: true,
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-left");

map.on("style.load", () => {
  // وضع الكرة الأرضية
  try { map.setProjection({ type: "globe" }); } catch (e) {}
  // غلاف جوي
  try {
    map.setSky({
      "sky-color": "#0a2540",
      "sky-horizon-blend": 0.5,
      "horizon-color": "#4de1ff",
      "horizon-fog-blend": 0.6,
      "fog-color": "#06121c",
      "fog-ground-blend": 0.4,
      "atmosphere-blend": 0.8,
    });
  } catch (e) {}
  // تضاريس ثلاثية الأبعاد
  try {
    map.setTerrain({ source: "terrain", exaggeration: 1.4 });
    terrainOn = true;
  } catch (e) {}
});

map.on("load", () => {
  log("READY");
  setTimeout(() => { const l = document.getElementById("loader"); if (l) l.style.display = "none"; }, 500);
  updateZoom();
});
map.on("zoom", updateZoom);
map.on("moveend", reverseName);

function updateZoom() {
  const z = map.getZoom();
  document.getElementById("s-zoom").textContent = z.toFixed(1);
}

/* ---------------- قاعدة بيانات المدن ---------------- */
let CITIES = [];
async function loadCities() {
  try {
    log("Loading cities…");
    const c = await fetch("https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_50m_populated_places_simple.geojson").then(r => r.json());
    CITIES = c.features.map((f) => {
      const p = f.properties, [lon, lat] = f.geometry.coordinates;
      return {
        name: p.name, name_ar: AR_CITIES[p.name] || null,
        country: p.adm0name, iso: p.iso_a2,
        country_ar: AR_COUNTRIES[p.iso_a2] || p.adm0name,
        lat, lon, pop: p.pop_max || p.pop_min || 0,
      };
    }).sort((a, b) => b.pop - a.pop);
  } catch (e) {
    console.warn("cities fallback", e);
    CITIES = [
      { name:"Baghdad", name_ar:"بغداد", country:"Iraq", country_ar:"العراق", lat:33.31, lon:44.36, pop:7e6 },
      { name:"Cairo", name_ar:"القاهرة", country:"Egypt", country_ar:"مصر", lat:30.04, lon:31.23, pop:2e7 },
      { name:"Dubai", name_ar:"دبي", country:"UAE", country_ar:"الإمارات", lat:25.2, lon:55.27, pop:3e6 },
      { name:"Tokyo", name_ar:"طوكيو", country:"Japan", country_ar:"اليابان", lat:35.68, lon:139.65, pop:3.7e7 },
      { name:"London", name_ar:"لندن", country:"UK", country_ar:"المملكة المتحدة", lat:51.5, lon:-0.12, pop:9e6 },
      { name:"New York", name_ar:"نيويورك", country:"USA", country_ar:"الولايات المتحدة", lat:40.71, lon:-74, pop:1.8e7 },
      { name:"Paris", name_ar:"باريس", country:"France", country_ar:"فرنسا", lat:48.85, lon:2.35, pop:1.1e7 },
      { name:"Mecca", name_ar:"مكة المكرمة", country:"Saudi Arabia", country_ar:"السعودية", lat:21.42, lon:39.82, pop:2e6 },
    ];
  }
}
loadCities();

/* ---------------- البحث (عربي + إنجليزي) ---------------- */
function searchCities(q, n = 8) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  return CITIES.filter((c) =>
    c.name.toLowerCase().includes(q) ||
    (c.name_ar && c.name_ar.includes(q)) ||
    (c.country && c.country.toLowerCase().includes(q)) ||
    (c.country_ar && c.country_ar.includes(q))
  ).slice(0, n);
}
let marker = null;
function flyTo(city) {
  map.flyTo({ center: [city.lon, city.lat], zoom: 11, pitch: 55, bearing: -15, duration: 4500, essential: true });
  if (marker) marker.remove();
  const el = document.createElement("div");
  el.innerHTML = "◎";
  el.style.cssText = "color:#4de1ff;font-size:28px;text-shadow:0 0 10px #4de1ff;animation:sp 3s linear infinite";
  marker = new maplibregl.Marker({ element: el }).setLngLat([city.lon, city.lat]).addTo(map);
  setTarget(city);
}

const qEl = document.getElementById("q");
const sug = document.getElementById("suggestions");
function renderSug() {
  const hits = searchCities(qEl.value, 8);
  if (!hits.length) { sug.classList.add("hidden"); return; }
  sug.classList.remove("hidden");
  sug.innerHTML = hits.map((c, i) =>
    `<div data-i="${i}"><span>${c.name_ar || c.name}
     <span style="color:rgba(95,233,255,.5)">${c.name} — ${c.country_ar}</span></span>
     <span class="font-hud" style="color:rgba(95,233,255,.6);font-size:10px">${c.lat.toFixed(1)}°, ${c.lon.toFixed(1)}°</span></div>`
  ).join("");
  sug._hits = hits;
  sug.querySelectorAll("div").forEach((d) =>
    d.addEventListener("click", () => { const c = sug._hits[+d.dataset.i]; flyTo(c); qEl.value = c.name_ar || c.name; sug.classList.add("hidden"); })
  );
}
qEl.addEventListener("input", renderSug);
const doSearch = () => { const h = searchCities(qEl.value, 1); if (h[0]) { flyTo(h[0]); sug.classList.add("hidden"); } };
document.getElementById("scan").addEventListener("click", doSearch);
qEl.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

function setTarget(c) {
  document.getElementById("target").innerHTML =
    `<div class="font-hud neon" style="font-size:20px">${c.name.toUpperCase()}</div>
     <div style="font-size:17px;color:#bdf6ff;margin-top:2px">${c.name_ar || ""}</div>
     <div style="letter-spacing:1px;color:rgba(120,220,255,.7);font-size:13px;margin-top:3px">${c.country_ar || c.country}</div>
     <div style="margin-top:8px;font-family:'Orbitron';font-size:11px;color:rgba(200,240,255,.85)">
       <div class="row"><span>LAT العرض</span><span>${c.lat.toFixed(3)}°</span></div>
       <div class="row"><span>LON الطول</span><span>${c.lon.toFixed(3)}°</span></div>
       ${c.pop ? `<div class="row"><span>POP التعداد</span><span>${(c.pop/1e6).toFixed(2)}M</span></div>` : ""}
     </div>`;
}
// عرض أقرب مدينة عند التوقف عن التحريك
function reverseName() {
  if (!CITIES.length) return;
  const c = map.getCenter();
  let best = null, bd = 1e9;
  for (const city of CITIES) {
    const d = Math.hypot(city.lat - c.lat, city.lon - c.lng);
    if (d < bd) { bd = d; best = city; }
  }
  if (best && bd < 3 && map.getZoom() > 5) setTarget(best);
}

/* ---------------- أزرار الطبقات ---------------- */
let terrainOn = false;
document.getElementById("t-labels").addEventListener("click", (e) => {
  const v = map.getLayoutProperty("labels", "visibility") !== "none";
  map.setLayoutProperty("labels", "visibility", v ? "none" : "visible");
  e.target.classList.toggle("off", v);
});
document.getElementById("t-3d").addEventListener("click", (e) => {
  if (terrainOn) { map.setTerrain(null); terrainOn = false; e.target.classList.add("off"); map.easeTo({ pitch: 0 }); }
  else { map.setTerrain({ source: "terrain", exaggeration: 1.4 }); terrainOn = true; e.target.classList.remove("off"); map.easeTo({ pitch: 60 }); }
});
let globeOn = true;
document.getElementById("t-globe").addEventListener("click", (e) => {
  globeOn = !globeOn;
  try { map.setProjection({ type: globeOn ? "globe" : "mercator" }); } catch (err) {}
  e.target.classList.toggle("off", !globeOn);
});
document.getElementById("t-reset").addEventListener("click", () => {
  map.flyTo({ center: [30, 25], zoom: 1.8, pitch: 0, bearing: 0, duration: 2500 });
  if (marker) { marker.remove(); marker = null; }
  document.getElementById("target").textContent = "NO TARGET";
});

/* ---------------- لوحة الحالة ---------------- */
const setMode = (m) => (document.getElementById("s-mode").textContent = m);
const setHands = (n) => (document.getElementById("s-hands").textContent = n);
const setPinch = (p) => {
  document.getElementById("s-pinch").textContent = Math.round(p * 100) + "%";
  document.getElementById("s-pinchbar").style.width = p * 100 + "%";
};

/* ---------------- تتبع اليد (MediaPipe) ---------------- */
const FINGERTIPS = [4, 8, 12, 16, 20];
const BONES = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
const overlay = document.getElementById("overlay"), octx = overlay.getContext("2d");
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pinchAmount = (h) => { const r = dist2(h[4], h[8]) / (dist2(h[0], h[9]) || 0.001); return Math.max(0, Math.min(1, 1 - (r - 0.28) / 0.8)); };
const center = (h) => ({ x: h[9].x, y: h[9].y });
let prevPinch = null, prevTwo = null;

function onResults(res) {
  const w = overlay.width, h = overlay.height;
  octx.clearRect(0, 0, w, h);
  const hands = res.multiHandLandmarks || [];
  setHands(hands.length);
  const px = (n) => (1 - n) * w, py = (n) => n * h;
  for (const hand of hands) {
    octx.strokeStyle = "rgba(77,225,255,0.6)"; octx.lineWidth = 1.5;
    octx.shadowColor = "#4de1ff"; octx.shadowBlur = 8;
    for (const [a, b] of BONES) { octx.beginPath(); octx.moveTo(px(hand[a].x), py(hand[a].y)); octx.lineTo(px(hand[b].x), py(hand[b].y)); octx.stroke(); }
    for (const tip of FINGERTIPS) {
      const x = px(hand[tip].x), y = py(hand[tip].y), g = octx.createRadialGradient(x, y, 0, x, y, 10);
      g.addColorStop(0, "rgba(255,255,255,0.95)"); g.addColorStop(0.4, "rgba(127,240,255,0.7)"); g.addColorStop(1, "rgba(77,225,255,0)");
      octx.fillStyle = g; octx.beginPath(); octx.arc(x, y, 10, 0, 6.283); octx.fill();
    }
  }
  octx.shadowBlur = 0;

  // إيماءتان => تكبير/تصغير
  if (hands.length === 2) {
    prevPinch = null;
    const d = dist2(center(hands[0]), center(hands[1]));
    if (prevTwo != null) {
      const dl = d - prevTwo;
      if (Math.abs(dl) > 0.004) { map.setZoom(map.getZoom() + dl * 12); setMode("ZOOM"); }
    }
    prevTwo = d; setPinch(0); return;
  }
  prevTwo = null;

  // يد واحدة => قرص للتحريك
  if (hands.length === 1) {
    const hand = hands[0], p = pinchAmount(hand); setPinch(p);
    if (p > 0.6) {
      const c = center(hand);
      if (prevPinch) {
        const dx = (c.x - prevPinch.x), dy = (c.y - prevPinch.y);
        // تحريك الخريطة (x معكوس بسبب مرآة الكاميرا)
        map.panBy([dx * 1400, dy * 900], { duration: 0 });
        setMode("PAN");
      }
      prevPinch = c;
    } else { prevPinch = null; setMode("IDLE"); }
    return;
  }
  prevPinch = null; setPinch(0); setMode("IDLE");
}

let camStarted = false;
async function startCamera() {
  if (camStarted) return;
  const video = document.getElementById("video");
  const hands = new Hands({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
  hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
  hands.onResults(onResults);
  const cam = new Camera(video, { onFrame: async () => await hands.send({ image: video }), width: 640, height: 480 });
  await cam.start();
  camStarted = true;
  document.getElementById("s-track").textContent = "ONLINE";
}

/* ---------------- البوابة والأزرار ---------------- */
const gate = document.getElementById("gate");
document.getElementById("start").addEventListener("click", () => gate.classList.add("hidden"));
document.getElementById("start-cam").addEventListener("click", async () => {
  try { await startCamera(); gate.classList.add("hidden"); }
  catch (e) { document.getElementById("err").textContent = "تعذّر الوصول للكاميرا — جرّب بدون كاميرا."; }
});
document.getElementById("cam-btn").addEventListener("click", async () => {
  try { await startCamera(); } catch (e) { alert("تعذّر تشغيل الكاميرا"); }
});
