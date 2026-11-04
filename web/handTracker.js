/**
 * handTracker.js - MediaPipe Hand Landmark Tracking Module
 * Uses @mediapipe/tasks-vision HandLandmarker for real-time 21-point tracking up to 2 hands.
 * Includes:
 * - Offline-first loader (local vendor/wasm with CDN fallback)
 * - Low-pass / exponential lerp filtering to eliminate camera jitter
 * - Mirrored coordinate normalization
 * - Landmark skeleton debug renderer
 * - Graceful camera fallback handling
 */

// Dynamically import vision bundle (local vendor with CDN fallback)
async function loadVisionTasks() {
  try {
    const mod = await import("./vendor/vision_bundle.mjs");
    if (mod && mod.FilesetResolver && mod.HandLandmarker) {
      return mod;
    }
  } catch (err) {
    console.info("Local vendor vision bundle not found, using CDN fallback:", err);
  }
  return await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs");
}

// Standard hand landmark connections for skeleton rendering
export const HAND_CONNECTIONS = [
  // Palm perimeter
  [0, 1], [0, 5], [5, 9], [9, 13], [13, 17], [0, 17],
  // Thumb
  [1, 2], [2, 3], [3, 4],
  // Index
  [5, 6], [6, 7], [7, 8],
  // Middle
  [9, 10], [10, 11], [11, 12],
  // Ring
  [13, 14], [14, 15], [15, 16],
  // Pinky
  [17, 18], [18, 19], [19, 20]
];

export class HandTracker {
  constructor(options = {}) {
    this.videoElement = null;
    this.handLandmarker = null;
    this.isReady = false;
    this.isRunning = false;
    this.cameraStream = null;
    this.lastVideoTime = -1;

    // Smoothing factor (0.0 = static freeze, 1.0 = raw unsmoothed jitter)
    this.lerpFactor = options.lerpFactor || 0.42;

    // Historical smoothed hands cache
    this.previousHands = [];
    this.smoothedHands = [];

    // Callbacks
    this.onError = options.onError || console.error;
    this.onStatus = options.onStatus || console.log;
  }

  /**
   * Initializes MediaPipe FilesetResolver & HandLandmarker
   */
  async init() {
    this.onStatus("Initializing ancient mystic vision runtime...");

    try {
      const { FilesetResolver, HandLandmarker } = await loadVisionTasks();

      // Determine WASM directory (local vendor/wasm or CDN fallback)
      let wasmPath = "vendor/wasm";
      try {
        const testWasm = await fetch(`${wasmPath}/vision_wasm_internal.wasm`, { method: "HEAD" });
        if (!testWasm.ok) {
          wasmPath = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
        }
      } catch {
        wasmPath = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
      }

      const vision = await FilesetResolver.forVisionTasks(wasmPath);

      // Check if local model file exists, fallback to Google CDN
      let modelAssetPath = "models/hand_landmarker.task";
      try {
        const testRes = await fetch(modelAssetPath, { method: "HEAD" });
        if (!testRes.ok) {
          modelAssetPath = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
        }
      } catch {
        modelAssetPath = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
      }

      this.onStatus("Loading Hand Landmarker model weights...");

      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelAssetPath,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.55
      });

      this.isReady = true;
      this.onStatus("Mystic hand tracker ready.");
      return true;
    } catch (err) {
      this.onError("Failed to initialize HandLandmarker: " + (err.message || err));
      return false;
    }
  }

  /**
   * Request webcam stream and attach to video element
   */
  async startCamera(videoElement) {
    this.videoElement = videoElement;

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("getUserMedia is not supported on this browser or origin (requires localhost or HTTPS).");
      }

      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      this.videoElement.srcObject = this.cameraStream;
      await this.videoElement.play();
      this.isRunning = true;
      this.onStatus("Camera portal stream active.");
      return true;
    } catch (err) {
      this.isRunning = false;
      this.onError(err);
      return false;
    }
  }

  /**
   * Stop camera stream
   */
  stopCamera() {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(track => track.stop());
      this.cameraStream = null;
    }
    this.isRunning = false;
  }

  /**
   * Perform detection on current video frame with low-pass filtering
   * @param {number} timestamp Current performance.now() timestamp
   * @param {number} canvasWidth Render canvas width
   * @param {number} canvasHeight Render canvas height
   * @returns {Array} Array of processed, smoothed hands
   */
  detectHands(timestamp, canvasWidth, canvasHeight) {
    if (!this.handLandmarker || !this.videoElement || this.videoElement.readyState < 2) {
      return this.smoothedHands;
    }

    // Only process if new video frame is available
    if (this.videoElement.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.videoElement.currentTime;

      const detectionResults = this.handLandmarker.detectForVideo(this.videoElement, timestamp);
      const rawHands = [];

      if (detectionResults && detectionResults.landmarks && detectionResults.landmarks.length > 0) {
        for (let h = 0; h < detectionResults.landmarks.length; h++) {
          const rawLandmarks = detectionResults.landmarks[h];
          const handedness = detectionResults.handedness && detectionResults.handedness[h] && detectionResults.handedness[h][0]
            ? detectionResults.handedness[h][0].categoryName
            : "Hand";

          // Mirror horizontal X coordinate for natural mirrored webcam feel
          const mirroredPoints = rawLandmarks.map((lm, idx) => ({
            id: idx,
            x: (1.0 - lm.x) * canvasWidth,
            y: lm.y * canvasHeight,
            z: lm.z * canvasWidth, // Depth relative to wrist
            rawX: 1.0 - lm.x,
            rawY: lm.y,
            rawZ: lm.z
          }));

          rawHands.push({
            handedness,
            landmarks: mirroredPoints
          });
        }
      }

      this.smoothedHands = this._smoothHands(rawHands);
    }

    return this.smoothedHands;
  }

  /**
   * Exponential moving average / lerp smoothing across frames to cancel jitter
   */
  _smoothHands(currentHands) {
    if (currentHands.length === 0) {
      this.previousHands = [];
      return [];
    }

    const smoothed = [];

    currentHands.forEach((hand, hIdx) => {
      // Find closest corresponding hand in previous frame by comparing palm bases (landmark 0)
      let prevHand = null;
      let minDistance = Infinity;

      for (const pHand of this.previousHands) {
        if (!pHand || !pHand.landmarks) continue;
        const d = Math.hypot(
          hand.landmarks[0].x - pHand.landmarks[0].x,
          hand.landmarks[0].y - pHand.landmarks[0].y
        );
        if (d < minDistance) {
          minDistance = d;
          prevHand = pHand;
        }
      }

      // If hand moved too far or no previous hand, initialize directly
      const lerp = (!prevHand || minDistance > 250) ? 1.0 : this.lerpFactor;

      const smoothedLandmarks = hand.landmarks.map((curPt, idx) => {
        if (!prevHand || !prevHand.landmarks[idx]) {
          return { ...curPt, vx: 0, vy: 0, vz: 0 };
        }
        const prevPt = prevHand.landmarks[idx];
        const sx = prevPt.x + (curPt.x - prevPt.x) * lerp;
        const sy = prevPt.y + (curPt.y - prevPt.y) * lerp;
        const sz = prevPt.z + (curPt.z - prevPt.z) * lerp;

        return {
          id: idx,
          x: sx,
          y: sy,
          z: sz,
          vx: sx - prevPt.x,
          vy: sy - prevPt.y,
          vz: sz - prevPt.z,
          rawX: curPt.rawX,
          rawY: curPt.rawY,
          rawZ: curPt.rawZ
        };
      });

      smoothed.push({
        id: hIdx,
        handedness: hand.handedness,
        landmarks: smoothedLandmarks
      });
    });

    this.previousHands = smoothed;
    return smoothed;
  }

  /**
   * Draw visual landmark skeleton overlay for debug mode
   */
  drawDebug(ctx) {
    if (!this.smoothedHands || this.smoothedHands.length === 0) return;

    ctx.save();
    ctx.lineWidth = 2.5;

    this.smoothedHands.forEach((hand) => {
      const lms = hand.landmarks;

      // Draw bone connections
      ctx.strokeStyle = "rgba(255, 170, 0, 0.75)";
      ctx.shadowColor = "#ff9900";
      ctx.shadowBlur = 8;

      HAND_CONNECTIONS.forEach(([startIdx, endIdx]) => {
        const p1 = lms[startIdx];
        const p2 = lms[endIdx];
        if (p1 && p2) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      });

      // Draw joint markers & labels
      lms.forEach((pt) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.id === 8 || pt.id === 4 || pt.id === 0 ? 5 : 3.5, 0, Math.PI * 2);

        if (pt.id === 8) {
          // Index fingertip
          ctx.fillStyle = "#ffffff";
          ctx.shadowColor = "#00ffff";
        } else if (pt.id === 4) {
          // Thumb tip
          ctx.fillStyle = "#ffdd44";
          ctx.shadowColor = "#ffaa00";
        } else if (pt.id === 9) {
          // Palm center anchor
          ctx.fillStyle = "#ff4400";
          ctx.shadowColor = "#ff2200";
        } else {
          ctx.fillStyle = "#ffb300";
          ctx.shadowColor = "#ff6600";
        }
        ctx.fill();

        // Landmark number label
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        ctx.font = "9px Outfit, monospace";
        ctx.fillText(pt.id, pt.x + 6, pt.y - 3);
      });
    });

    ctx.restore();
  }
}
