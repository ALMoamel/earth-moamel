/* =====================================================================
   HOLO-TABLE PRO // كرة أرضية واقعية بالكامل + تحكم باليد
   - Three.js  : أرض واقعية (صور أقمار صناعية + أضواء ليلية + غيوم + غلاف جوي)
   - حدود جميع الدول + 1250+ مدينة حقيقية (Natural Earth GeoJSON)
   - دعم عربي كامل (أسماء الدول والمدن)
   - MediaPipe : تتبع اليد (قرص للتحريك، مباعدة للتكبير)
   ===================================================================== */
import * as THREE from "three";

const AR_COUNTRIES = window.AR_COUNTRIES || {};
const AR_CITIES = window.AR_CITIES || {};
const log = (m) => { const e = document.getElementById("loadmsg"); if (e) e.textContent = m; };

/* ---------------- ثوابت ---------------- */
const R = 2, D2R = Math.PI / 180;
function latLon(lat, lon, r) {
  const phi = (90 - lat) * D2R, th = (lon + 180) * D2R;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
}

/* ---------------- المشهد ---------------- */
const canvas = document.getElementById("globe");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
let curDist = 6.5, tgtDist = 6.5;
camera.position.z = curDist;

const earthGroup = new THREE.Group(); // الأرض + الحدود + المدن (تدور معاً)
scene.add(earthGroup);

const texLoader = new THREE.TextureLoader();
texLoader.crossOrigin = "anonymous";
const IMG = "https://unpkg.com/three-globe/example/img/";

/* ---------------- خلفية النجوم ---------------- */
texLoader.load(IMG + "night-sky.png", (t) => {
  const g = new THREE.SphereGeometry(400, 64, 64);
  const m = new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide });
  scene.add(new THREE.Mesh(g, m));
});

/* ---------------- اتجاه الشمس ---------------- */
const sunDir = new THREE.Vector3(1, 0.25, 0.6).normalize();
const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
dirLight.position.copy(sunDir.clone().multiplyScalar(10));
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0x335577, 0.35));

/* ---------------- الأرض الواقعية (شيدر نهار/ليل) ---------------- */
const earthUniforms = {
  dayTex: { value: null },
  nightTex: { value: null },
  specTex: { value: null },
  sunDir: { value: sunDir.clone() },
};
const earthMat = new THREE.ShaderMaterial({
  uniforms: earthUniforms,
  vertexShader: `
    varying vec2 vUv; varying vec3 vNormalW; varying vec3 vViewDir;
    void main(){
      vUv = uv;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vec4 wp = modelMatrix * vec4(position,1.0);
      vViewDir = normalize(cameraPosition - wp.xyz);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: `
    uniform sampler2D dayTex; uniform sampler2D nightTex; uniform sampler2D specTex;
    uniform vec3 sunDir;
    varying vec2 vUv; varying vec3 vNormalW; varying vec3 vViewDir;
    void main(){
      vec3 N = normalize(vNormalW);
      float cosSun = dot(N, normalize(sunDir));
      float day = smoothstep(-0.12, 0.28, cosSun);
      vec3 dayCol = texture2D(dayTex, vUv).rgb;
      vec3 nightCol = texture2D(nightTex, vUv).rgb * 1.5;
      vec3 col = mix(nightCol, dayCol, day);
      // لمعان الماء على جهة النهار (في هذه الصورة: المحيط أبيض=1، اليابسة سوداء=0)
      float water = texture2D(specTex, vUv).r;
      vec3 H = normalize(normalize(sunDir) + normalize(vViewDir));
      float spec = pow(max(dot(N, H), 0.0), 28.0) * water * day;
      col += vec3(0.4, 0.55, 0.7) * spec * 0.9;
      // تعزيز الحواف قليلاً
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 96), earthMat);
earthGroup.add(earth);

let loaded = 0;
const need = 3;
const done = () => { if (++loaded >= need) log("READY"); };
texLoader.load(IMG + "earth-blue-marble.jpg", (t) => { t.colorSpace = THREE.SRGBColorSpace; earthUniforms.dayTex.value = t; log("Earth day…"); done(); });
texLoader.load(IMG + "earth-night.jpg", (t) => { t.colorSpace = THREE.SRGBColorSpace; earthUniforms.nightTex.value = t; log("Night lights…"); done(); });
texLoader.load(IMG + "earth-water.png", (t) => { earthUniforms.specTex.value = t; done(); });

/* ---------------- الغيوم ---------------- */
let clouds = null;
texLoader.load("https://cdn.jsdelivr.net/gh/turban/webgl-earth@master/images/fair_clouds_4k.png", (t) => {
  t.colorSpace = THREE.SRGBColorSpace;
  clouds = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.01, 96, 96),
    new THREE.MeshPhongMaterial({ map: t, transparent: true, opacity: 0.4, depthWrite: false })
  );
  earthGroup.add(clouds);
});

/* ---------------- الغلاف الجوي ---------------- */
const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.14, 64, 64), new THREE.ShaderMaterial({
  transparent: true, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
  uniforms: { uColor: { value: new THREE.Color(0x3fa9ff) } },
  vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN=normalize(normalMatrix*normal);
    vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
  fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
    void main(){ float i=pow(0.72-dot(vN,vV),2.6); gl_FragColor=vec4(uColor,clamp(i,0.0,1.0)); }`,
}));
scene.add(atmo);

/* ---------------- حدود الدول (GeoJSON) ---------------- */
const bordersGroup = new THREE.Group();
earthGroup.add(bordersGroup);
function addBorders(geojson) {
  const mat = new THREE.LineBasicMaterial({ color: 0x5fe9ff, transparent: true, opacity: 0.45 });
  const addRing = (ring) => {
    const pts = ring.map(([lon, lat]) => latLon(lat, lon, R * 1.002));
    bordersGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  };
  for (const f of geojson.features) {
    const g = f.geometry; if (!g) continue;
    if (g.type === "Polygon") g.coordinates.forEach(addRing);
    else if (g.type === "MultiPolygon") g.coordinates.forEach((poly) => poly.forEach(addRing));
  }
}

/* ---------------- المدن ---------------- */
let CITIES = [];
const cityMarkers = new THREE.Group();
earthGroup.add(cityMarkers);
function glowTex() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d"), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.3, "#ffd36b");
  g.addColorStop(0.6, "rgba(255,180,70,0.3)"); g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
function buildCityPoints() {
  const geo = new THREE.BufferGeometry(), p = new Float32Array(CITIES.length * 3);
  CITIES.forEach((c, i) => { const v = latLon(c.lat, c.lon, R * 1.012); p[i*3]=v.x; p[i*3+1]=v.y; p[i*3+2]=v.z; });
  geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
  cityMarkers.add(new THREE.Points(geo, new THREE.PointsMaterial({
    map: glowTex(), color: 0xffe9b0, size: 0.07, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true,
  })));
}

/* ---------------- علامة الهدف ---------------- */
const marker = new THREE.Group(); marker.visible = false;
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.01, 12, 48),
  new THREE.MeshBasicMaterial({ color: 0x7ffcff, transparent: true, blending: THREE.AdditiveBlending }));
marker.add(ring);
const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.035, 0.6, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x4de1ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
beam.position.y = 0.3; marker.add(beam);
marker.add(new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffffff })));
let markerLabel = null;
earthGroup.add(marker);

function makeLabelSprite(ar, en) {
  const cv = document.createElement("canvas"); cv.width = 512; cv.height = 180;
  const x = cv.getContext("2d");
  x.font = "bold 60px 'Orbitron', Arial"; x.fillStyle = "#eafffb";
  x.shadowColor = "#4de1ff"; x.shadowBlur = 20; x.textAlign = "center";
  x.fillText(en.toUpperCase(), 256, 60);
  x.font = "600 48px 'Rajdhani', Arial"; x.fillStyle = "#9ff0ff"; x.shadowBlur = 12;
  x.fillText(ar, 256, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  s.scale.set(1.3, 0.46, 1); s.position.set(0, 0.7, 0); return s;
}

/* ---------------- تحكم الدوران/التكبير ---------------- */
function orientation(lat, lon, tilt = 0.25) {
  const v = latLon(lat, lon, 1);
  const aY = Math.atan2(-v.x, v.z), Rr = Math.hypot(v.x, v.z), aX = Math.atan2(v.y, Rr);
  const qY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), aY);
  const qX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), aX);
  const qT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -tilt);
  return qT.multiply(qX.multiply(qY));
}
let targetQuat = new THREE.Quaternion().copy(earthGroup.quaternion);
let autoRotate = true;

function flyTo(city) {
  autoRotate = false;
  targetQuat.copy(orientation(city.lat, city.lon));
  tgtDist = 3.6;
  const surf = latLon(city.lat, city.lon, R * 1.012);
  marker.position.copy(surf); marker.lookAt(0, 0, 0); marker.rotateX(Math.PI / 2); marker.visible = true;
  if (markerLabel) marker.remove(markerLabel);
  markerLabel = makeLabelSprite(city.name_ar || city.name, city.name);
  marker.add(markerLabel);
  setTarget(city);
}
function rotateBy(dx, dy) {
  autoRotate = false;
  targetQuat.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx));
  targetQuat.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy));
}
const zoomBy = (f) => { tgtDist = Math.max(2.6, Math.min(9, tgtDist * f)); };

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener("resize", resize); resize();

const clock = new THREE.Clock();
(function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta(), t = clock.elapsedTime;
  if (autoRotate) targetQuat.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.04));
  earthGroup.quaternion.slerp(targetQuat, 0.22);
  curDist += (tgtDist - curDist) * 0.18; camera.position.z = curDist; camera.lookAt(0, 0, 0);
  if (clouds) clouds.rotation.y += dt * 0.006;
  if (marker.visible) { const s = 1 + Math.sin(t * 3) * 0.18; ring.scale.set(s, s, s); ring.rotation.z += dt * 1.2; }
  atmo.quaternion.copy(earthGroup.quaternion);
  // ثبّت حجم اللصيقة
  if (markerLabel) { const sc = THREE.MathUtils.clamp(curDist * 0.32, 0.9, 2); markerLabel.scale.set(sc, sc * 0.35, 1); }
  renderer.render(scene, camera);
})();

/* ---------------- تحميل البيانات الحقيقية ---------------- */
async function loadWorld() {
  try {
    log("Loading borders…");
    const b = await fetch("https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson").then(r => r.json());
    addBorders(b);
  } catch (e) { console.warn("borders failed", e); }
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
    buildCityPoints();
  } catch (e) { console.warn("cities failed", e); CITIES = FALLBACK_CITIES; buildCityPoints(); }
  log("READY");
  setTimeout(() => { const l = document.getElementById("loader"); if (l) l.style.display = "none"; }, 700);
}
// مدن احتياطية إذا فشل الإنترنت
const FALLBACK_CITIES = [
  { name:"Baghdad", name_ar:"بغداد", country:"Iraq", country_ar:"العراق", lat:33.31, lon:44.36, pop:7000000 },
  { name:"Cairo", name_ar:"القاهرة", country:"Egypt", country_ar:"مصر", lat:30.04, lon:31.23, pop:20000000 },
  { name:"Riyadh", name_ar:"الرياض", country:"Saudi Arabia", country_ar:"السعودية", lat:24.71, lon:46.67, pop:7000000 },
  { name:"Tokyo", name_ar:"طوكيو", country:"Japan", country_ar:"اليابان", lat:35.68, lon:139.65, pop:37000000 },
  { name:"London", name_ar:"لندن", country:"UK", country_ar:"المملكة المتحدة", lat:51.5, lon:-0.12, pop:9000000 },
  { name:"New York", name_ar:"نيويورك", country:"USA", country_ar:"الولايات المتحدة", lat:40.71, lon:-74.0, pop:18000000 },
];

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
    `<div class="font-hud neon" style="font-size:22px">${c.name.toUpperCase()}</div>
     <div style="font-size:18px;color:#bdf6ff;margin-top:2px">${c.name_ar || ""}</div>
     <div style="letter-spacing:2px;color:rgba(120,220,255,.7);font-size:13px;margin-top:4px">${c.country_ar || c.country}</div>
     <div style="margin-top:10px;font-family:'Orbitron';font-size:11px;color:rgba(200,240,255,.85)">
       <div class="row"><span>LAT خط العرض</span><span>${c.lat.toFixed(3)}°</span></div>
       <div class="row"><span>LON خط الطول</span><span>${c.lon.toFixed(3)}°</span></div>
       ${c.pop ? `<div class="row"><span>POP التعداد</span><span>${(c.pop/1e6).toFixed(2)}M</span></div>` : ""}
     </div>`;
}

/* ---------------- أزرار الطبقات ---------------- */
document.getElementById("t-borders")?.addEventListener("click", (e) => {
  bordersGroup.visible = !bordersGroup.visible; e.target.classList.toggle("off", !bordersGroup.visible);
});
document.getElementById("t-clouds")?.addEventListener("click", (e) => {
  if (clouds) { clouds.visible = !clouds.visible; e.target.classList.toggle("off", !clouds.visible); }
});
document.getElementById("t-cities")?.addEventListener("click", (e) => {
  cityMarkers.visible = !cityMarkers.visible; e.target.classList.toggle("off", !cityMarkers.visible);
});
document.getElementById("t-reset")?.addEventListener("click", () => {
  autoRotate = true; tgtDist = 6.5; marker.visible = false;
  document.getElementById("target").textContent = "NO TARGET ACQUIRED";
});

/* ---------------- تحكم الفأرة (احتياطي) ---------------- */
const inter = document.getElementById("interaction");
let dragging = false, last = null;
inter.addEventListener("pointerdown", (e) => { dragging = true; last = { x: e.clientX, y: e.clientY }; });
inter.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  rotateBy((e.clientX - last.x) / innerWidth * 4, (e.clientY - last.y) / innerHeight * 4);
  last = { x: e.clientX, y: e.clientY }; setMode("PAN");
});
addEventListener("pointerup", () => { dragging = false; setMode("IDLE"); });
inter.addEventListener("wheel", (e) => { zoomBy(e.deltaY > 0 ? 1.08 : 0.92); setMode("ZOOM"); }, { passive: true });

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
  const w = overlay.width = innerWidth, h = overlay.height = innerHeight;
  octx.clearRect(0, 0, w, h);
  const hands = res.multiHandLandmarks || [];
  setHands(hands.length);
  const px = (n) => (1 - n) * w, py = (n) => n * h;
  for (const hand of hands) {
    octx.strokeStyle = "rgba(77,225,255,0.55)"; octx.lineWidth = 2;
    octx.shadowColor = "#4de1ff"; octx.shadowBlur = 12;
    for (const [a, b] of BONES) { octx.beginPath(); octx.moveTo(px(hand[a].x), py(hand[a].y)); octx.lineTo(px(hand[b].x), py(hand[b].y)); octx.stroke(); }
    octx.fillStyle = "rgba(150,240,255,0.5)";
    for (const lm of hand) { octx.beginPath(); octx.arc(px(lm.x), py(lm.y), 3, 0, 6.283); octx.fill(); }
    for (const tip of FINGERTIPS) {
      const x = px(hand[tip].x), y = py(hand[tip].y), g = octx.createRadialGradient(x, y, 0, x, y, 22);
      g.addColorStop(0, "rgba(255,255,255,0.95)"); g.addColorStop(0.3, "rgba(127,240,255,0.8)"); g.addColorStop(1, "rgba(77,225,255,0)");
      octx.fillStyle = g; octx.beginPath(); octx.arc(x, y, 22, 0, 6.283); octx.fill();
    }
  }
  octx.shadowBlur = 0;
  if (hands.length === 2) {
    prevPinch = null;
    const p0 = pinchAmount(hands[0]), p1 = pinchAmount(hands[1]);
    setPinch(Math.min(p0, p1));
    // التكبير/التصغير عبر القرص بكلتا اليدين ثم المباعدة/التقريب
    if (p0 > 0.5 && p1 > 0.5) {
      const d = dist2(hands[0][8], hands[1][8]);
      if (prevTwo != null) { const dl = d - prevTwo; if (Math.abs(dl) > 0.0008) { zoomBy(1 - dl * 9); setMode("ZOOM"); } }
      prevTwo = d;
    } else { prevTwo = null; setMode("IDLE"); }
    return;
  }
  prevTwo = null;
  if (hands.length === 1) {
    const hand = hands[0], p = pinchAmount(hand); setPinch(p);
    if (p > 0.6) {
      const c = center(hand);
      if (prevPinch) { rotateBy((c.x - prevPinch.x) * 5.2, (c.y - prevPinch.y) * 5.2); setMode("PAN"); }
      prevPinch = c;
    } else { prevPinch = null; setMode("IDLE"); }
    return;
  }
  prevPinch = null; setPinch(0); setMode("IDLE");
}

/* ---------------- دعم الكاميرا الخارجية ---------------- */
let handsEngine = null, videoStream = null, rafLoop = 0, camRunning = false;

async function listCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "videoinput").map((d, i) => ({ id: d.deviceId, label: d.label || ("Camera " + (i + 1)) }));
  } catch (e) { return []; }
}

async function populateCamSelect() {
  const sel = document.getElementById("cam-select");
  if (!sel) return;
  const cams = await listCameras();
  sel.innerHTML = cams.length
    ? cams.map((c) => `<option value="${c.id}">${c.label}</option>`).join("")
    : '<option value="">لا توجد كاميرات</option>';
  if (window._selectedCam) sel.value = window._selectedCam;
}

async function openStream(deviceId) {
  if (videoStream) videoStream.getTracks().forEach((t) => t.stop());
  const video = document.getElementById("video");
  const constraints = { audio: false, video: deviceId
    ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
    : { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } };
  videoStream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = videoStream;
  await video.play().catch(() => {});
  const track = videoStream.getVideoTracks()[0];
  window._selectedCam = track.getSettings().deviceId || deviceId || "";
}

async function startCamera(deviceId) {
  const video = document.getElementById("video");
  if (!handsEngine) {
    handsEngine = new Hands({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
    handsEngine.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });
    handsEngine.onResults(onResults);
  }
  await openStream(deviceId || window._selectedCam);
  await populateCamSelect();
  document.getElementById("s-track").textContent = "ONLINE";
  if (!camRunning) {
    camRunning = true;
    const loop = async () => {
      if (!camRunning) return;
      if (video.readyState >= 2) { try { await handsEngine.send({ image: video }); } catch (e) {} }
      rafLoop = requestAnimationFrame(loop);
    };
    loop();
  }
}

async function switchCamera(deviceId) {
  window._selectedCam = deviceId;
  if (camRunning) { try { await openStream(deviceId); } catch (e) {} }
}

/* ---------------- بوابة التفعيل ---------------- */
const gate = document.getElementById("gate");
document.getElementById("activate").addEventListener("click", async () => {
  try { await startCamera(); gate.classList.add("hidden"); }
  catch (e) { document.getElementById("err").textContent = "تعذّر الوصول للكاميرا — استخدم تحكم الفأرة."; }
});
document.getElementById("skip").addEventListener("click", () => gate.classList.add("hidden"));

/* اختيار الكاميرا */
const camSel = document.getElementById("cam-select");
if (camSel) camSel.addEventListener("change", (e) => switchCamera(e.target.value));
// حاول سرد الكاميرات مبكراً (قد تكون الأسماء فارغة قبل منح الإذن)
populateCamSelect();
navigator.mediaDevices && navigator.mediaDevices.addEventListener &&
  navigator.mediaDevices.addEventListener("devicechange", populateCamSelect);

/* ابدأ تحميل العالم فوراً */
loadWorld();
