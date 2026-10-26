/* MediaPipe Hands wrapper. Loads the solution from CDN, streams a chosen
   camera (built-in or external/overhead), and reports hand landmarks. */

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}
export type HandResult = HandLandmark[]; // 21 landmarks per hand

export interface HandFrame {
  hands: HandResult[];
  handedness: string[];
  width: number;
  height: number;
}

export interface CameraDevice {
  deviceId: string;
  label: string;
}

declare global {
  interface Window {
    Hands: any;
  }
}

const SCRIPTS = ["https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js"];

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.crossOrigin = "anonymous";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
}

/** Enumerate available video input devices (cameras). */
export async function listCameras(): Promise<CameraDevice[]> {
  try {
    // A permission prompt is usually needed before labels are populated.
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "videoinput")
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${i + 1}`,
      }));
  } catch {
    return [];
  }
}

export class HandTracker {
  private hands: any;
  private video: HTMLVideoElement;
  private onFrame: (f: HandFrame) => void;
  private stream: MediaStream | null = null;
  private raf = 0;
  private running = false;

  constructor(video: HTMLVideoElement, onFrame: (f: HandFrame) => void) {
    this.video = video;
    this.onFrame = onFrame;
  }

  /** Start tracking. Pass a deviceId to use a specific (e.g. external) camera. */
  async start(deviceId?: string): Promise<void> {
    for (const src of SCRIPTS) await loadScript(src);

    this.hands = new window.Hands({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });
    this.hands.onResults((results: any) => {
      const hands: HandResult[] = results.multiHandLandmarks || [];
      const handedness: string[] =
        (results.multiHandedness || []).map((h: any) => h.label) || [];
      this.onFrame({
        hands,
        handedness,
        width: this.video.videoWidth || 1280,
        height: this.video.videoHeight || 720,
      });
    });

    await this.openStream(deviceId);
    this.running = true;
    this.loop();
  }

  private async openStream(deviceId?: string) {
    // Stop any previous stream.
    this.stream?.getTracks().forEach((t) => t.stop());

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play().catch(() => {});
    // Wait until the video has dimensions.
    if (!this.video.videoWidth) {
      await new Promise<void>((res) => {
        const h = () => {
          this.video.removeEventListener("loadeddata", h);
          res();
        };
        this.video.addEventListener("loadeddata", h);
      });
    }
  }

  /** Switch to a different camera without recreating the tracker. */
  async switchCamera(deviceId?: string): Promise<void> {
    await this.openStream(deviceId);
  }

  private loop = async () => {
    if (!this.running) return;
    if (this.video.readyState >= 2) {
      try {
        await this.hands.send({ image: this.video });
      } catch {
        /* frame skip */
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    try {
      this.hands?.close();
    } catch {
      /* noop */
    }
  }
}

/* ---------- Gesture helpers ---------- */

export function dist(a: HandLandmark, b: HandLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/** Pinch strength: 0 = open, 1 = fully pinched (thumb tip #4 vs index tip #8). */
export function pinchAmount(hand: HandResult): number {
  const d = dist(hand[4], hand[8]);
  const scale = dist(hand[0], hand[9]) || 0.001;
  const ratio = d / scale;
  return Math.max(0, Math.min(1, 1 - (ratio - 0.28) / 0.8));
}

export function isPinching(hand: HandResult): boolean {
  return pinchAmount(hand) > 0.6;
}

export function handCenter(hand: HandResult): { x: number; y: number } {
  return { x: hand[9].x, y: hand[9].y };
}
