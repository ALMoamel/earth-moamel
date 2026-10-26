import * as THREE from "three";
import type { City } from "../data/cities";

const GLOBE_RADIUS = 2;
const DEG2RAD = Math.PI / 180;
const IMG = "https://unpkg.com/three-globe/example/img/";
const BORDERS_URL =
  "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson";
const CLOUDS_URL =
  "https://cdn.jsdelivr.net/gh/turban/webgl-earth@master/images/fair_clouds_4k.png";

function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lon + 180) * DEG2RAD;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function makeGlowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "#ffd36b");
  g.addColorStop(0.6, "rgba(255,180,70,0.3)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeLabel(text: string, sub: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "bold 54px 'Orbitron', Arial, sans-serif";
  ctx.fillStyle = "#eafffb";
  ctx.shadowColor = "#4de1ff";
  ctx.shadowBlur = 22;
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  ctx.fillText(text.toUpperCase(), 256, 10);
  ctx.font = "600 34px 'Rajdhani', Arial, sans-serif";
  ctx.fillStyle = "#7fe9ff";
  ctx.shadowBlur = 10;
  ctx.fillText(sub, 256, 86);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }),
  );
  sprite.scale.set(2.2, 0.69, 1);
  return sprite;
}

export class HoloGlobe {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private earthGroup!: THREE.Group;
  private atmosphere!: THREE.Mesh;
  private clouds: THREE.Mesh | null = null;
  private bordersGroup!: THREE.Group;
  private cityPoints!: THREE.Points;
  private marker!: THREE.Group;
  private markerRing!: THREE.Mesh;
  private markerLabel: THREE.Sprite | null = null;

  private targetQuat = new THREE.Quaternion();
  private currentDist = 6.5;
  private targetDist = 6.5;
  private clock = new THREE.Clock();
  private raf = 0;
  private autoRotate = true;
  private cities: City[] = [];
  private canvas!: HTMLCanvasElement;
  private sunDir = new THREE.Vector3(1, 0.25, 0.6).normalize();

  init(canvas: HTMLCanvasElement, cities: City[]) {
    this.canvas = canvas;
    this.cities = cities;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
    this.camera.position.set(0, 0, this.currentDist);

    this.earthGroup = new THREE.Group();
    this.scene.add(this.earthGroup);

    this.buildLights();
    this.buildStars();
    this.buildEarth();
    this.buildClouds();
    this.buildAtmosphere();
    this.buildBorders();
    this.buildCityPoints();
    this.buildMarker();

    this.targetQuat.copy(this.earthGroup.quaternion);
    this.resize();
    window.addEventListener("resize", this.resize);
    this.animate();
  }

  setCities(cities: City[]) {
    this.cities = cities;
    if (this.cityPoints) {
      this.earthGroup.remove(this.cityPoints);
      this.cityPoints.geometry.dispose();
    }
    this.buildCityPoints();
  }

  private buildLights() {
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.copy(this.sunDir.clone().multiplyScalar(10));
    this.scene.add(dir);
    this.scene.add(new THREE.AmbientLight(0x335577, 0.35));
  }

  private buildStars() {
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";
    loader.load(
      IMG + "night-sky.png",
      (t) => {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(400, 32, 32),
          new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide }),
        );
        this.scene.add(mesh);
      },
      undefined,
      () => this.buildProceduralStars(),
    );
  }

  private buildProceduralStars() {
    const count = 1800;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 60 + Math.random() * 60;
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(p) * Math.cos(t);
      pos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
      pos[i * 3 + 2] = r * Math.cos(p);
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.scene.add(
      new THREE.Points(
        geo,
        new THREE.PointsMaterial({ color: 0x88bbff, size: 0.4, transparent: true, opacity: 0.7 }),
      ),
    );
  }

  private buildEarth() {
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";
    const uniforms = {
      dayTex: { value: null as THREE.Texture | null },
      nightTex: { value: null as THREE.Texture | null },
      specTex: { value: null as THREE.Texture | null },
      sunDir: { value: this.sunDir.clone() },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vNormalW; varying vec3 vViewDir;
        void main(){
          vUv = uv;
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vec4 wp = modelMatrix * vec4(position,1.0);
          vViewDir = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
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
          float water = texture2D(specTex, vUv).r;
          vec3 H = normalize(normalize(sunDir) + normalize(vViewDir));
          float spec = pow(max(dot(N, H), 0.0), 28.0) * water * day;
          col += vec3(0.4,0.55,0.7) * spec * 0.9;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_RADIUS, 96, 96), mat);
    earth.name = "earth";
    this.earthGroup.add(earth);

    loader.load(IMG + "earth-blue-marble.jpg", (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      uniforms.dayTex.value = t;
    });
    loader.load(IMG + "earth-night.jpg", (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      uniforms.nightTex.value = t;
    });
    loader.load(IMG + "earth-water.png", (t) => {
      uniforms.specTex.value = t;
    });
  }

  private buildClouds() {
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";
    loader.load(CLOUDS_URL, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      this.clouds = new THREE.Mesh(
        new THREE.SphereGeometry(GLOBE_RADIUS * 1.01, 96, 96),
        new THREE.MeshPhongMaterial({ map: t, transparent: true, opacity: 0.4, depthWrite: false }),
      );
      this.earthGroup.add(this.clouds);
    });
  }

  private buildAtmosphere() {
    const geo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.14, 64, 64);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color(0x3fa9ff) } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV;
        void main(){ vN=normalize(normalMatrix*normal);
          vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz);
          gl_Position=projectionMatrix*mv; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
        void main(){ float i=pow(0.72-dot(vN,vV),2.6); gl_FragColor=vec4(uColor,clamp(i,0.0,1.0)); }`,
    });
    this.atmosphere = new THREE.Mesh(geo, mat);
    this.scene.add(this.atmosphere);
  }

  private buildBorders() {
    this.bordersGroup = new THREE.Group();
    this.earthGroup.add(this.bordersGroup);
    fetch(BORDERS_URL)
      .then((r) => r.json())
      .then((gj: any) => {
        const mat = new THREE.LineBasicMaterial({
          color: 0x5fe9ff,
          transparent: true,
          opacity: 0.4,
        });
        const addRing = (ring: number[][]) => {
          const pts = ring.map(([lon, lat]) => latLonToVector3(lat, lon, GLOBE_RADIUS * 1.002));
          this.bordersGroup.add(
            new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat),
          );
        };
        for (const f of gj.features) {
          const g = f.geometry;
          if (!g) continue;
          if (g.type === "Polygon") g.coordinates.forEach(addRing);
          else if (g.type === "MultiPolygon")
            g.coordinates.forEach((poly: number[][][]) => poly.forEach(addRing));
        }
      })
      .catch(() => {});
  }

  private buildCityPoints() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(this.cities.length * 3);
    this.cities.forEach((c, i) => {
      const v = latLonToVector3(c.lat, c.lon, GLOBE_RADIUS * 1.012);
      pos[i * 3] = v.x;
      pos[i * 3 + 1] = v.y;
      pos[i * 3 + 2] = v.z;
    });
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: makeGlowTexture(),
      color: 0xffe9b0,
      size: 0.12,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.cityPoints = new THREE.Points(geo, mat);
    this.earthGroup.add(this.cityPoints);
  }

  private buildMarker() {
    this.marker = new THREE.Group();
    this.marker.visible = false;
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x7ffcff,
      transparent: true,
      blending: THREE.AdditiveBlending,
    });
    this.markerRing = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.01, 12, 48), ringMat);
    this.marker.add(this.markerRing);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.04, 0.6, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x4de1ff,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    beam.position.y = 0.3;
    this.marker.add(beam);
    this.marker.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      ),
    );
    this.earthGroup.add(this.marker);
  }

  private orientationForLatLon(lat: number, lon: number, tilt = 0.25): THREE.Quaternion {
    const v = latLonToVector3(lat, lon, 1);
    const aY = Math.atan2(-v.x, v.z);
    const R = Math.sqrt(v.x * v.x + v.z * v.z);
    const aX = Math.atan2(v.y, R);
    const qY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), aY);
    const qX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), aX);
    const qTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -tilt);
    return qTilt.multiply(qX.multiply(qY));
  }

  flyTo(city: City, label?: string, sub?: string) {
    this.autoRotate = false;
    this.targetQuat.copy(this.orientationForLatLon(city.lat, city.lon));
    this.targetDist = 3.6;
    const surf = latLonToVector3(city.lat, city.lon, GLOBE_RADIUS * 1.012);
    this.marker.position.copy(surf);
    this.marker.lookAt(0, 0, 0);
    this.marker.rotateX(Math.PI / 2);
    this.marker.visible = true;
    if (this.markerLabel) {
      this.marker.remove(this.markerLabel);
      (this.markerLabel.material as THREE.SpriteMaterial).map?.dispose();
      (this.markerLabel.material as THREE.SpriteMaterial).dispose();
    }
    this.markerLabel = makeLabel(label || city.name, sub || city.country);
    this.markerLabel.position.set(0, 0.7, 0);
    this.marker.add(this.markerLabel);
  }

  rotateBy(deltaX: number, deltaY: number) {
    this.autoRotate = false;
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), deltaX);
    const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), deltaY);
    this.targetQuat.premultiply(qy);
    this.targetQuat.premultiply(qx);
  }

  zoomBy(factor: number) {
    this.targetDist = THREE.MathUtils.clamp(this.targetDist * factor, 2.6, 9.0);
  }

  resetView() {
    this.autoRotate = true;
    this.targetDist = 6.5;
    this.marker.visible = false;
  }

  toggleBorders(): boolean {
    this.bordersGroup.visible = !this.bordersGroup.visible;
    return this.bordersGroup.visible;
  }
  toggleClouds(): boolean {
    if (this.clouds) this.clouds.visible = !this.clouds.visible;
    return this.clouds?.visible ?? false;
  }
  toggleCities(): boolean {
    this.cityPoints.visible = !this.cityPoints.visible;
    return this.cityPoints.visible;
  }

  private resize = () => {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private animate = () => {
    this.raf = requestAnimationFrame(this.animate);
    const dt = this.clock.getDelta();
    const t = this.clock.elapsedTime;

    if (this.autoRotate) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.04);
      this.targetQuat.premultiply(q);
    }
    // استجابة أسرع وأكثر سلاسة للحركة والتكبير (مثل النموذج أ)
    this.earthGroup.quaternion.slerp(this.targetQuat, 0.22);
    this.currentDist += (this.targetDist - this.currentDist) * 0.18;
    this.camera.position.set(0, 0, this.currentDist);
    this.camera.lookAt(0, 0, 0);

    if (this.clouds) this.clouds.rotation.y += dt * 0.006;
    if (this.marker.visible) {
      const s = 1 + Math.sin(t * 3) * 0.18;
      this.markerRing.scale.set(s, s, s);
      (this.markerRing.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(t * 3) * 0.3;
      this.markerRing.rotation.z += dt * 1.2;
      if (this.markerLabel) {
        const sc = THREE.MathUtils.clamp(this.currentDist * 0.5, 1.4, 3);
        this.markerLabel.scale.set(sc, sc * 0.31, 1);
      }
    }
    this.atmosphere.quaternion.copy(this.earthGroup.quaternion);

    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    this.renderer.dispose();
  }
}
