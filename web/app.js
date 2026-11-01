/**
 * Doctor Strange Magic Shield Filter
 * Real-time MediaPipe Hand Landmark Tracking & Manual Mouse/Touch/Keyboard Controls
 */

const videoElement = document.getElementById("webcam");
const canvas = document.getElementById("render-canvas");
const ctx = canvas.getContext("2d");
const gestureText = document.getElementById("gesture-text");

// Preset styles
const PRESETS = {
  1: {
    name: "Eldritch Orange",
    inner: "assets/inner_circles/orange.png",
    outer: "assets/outer_circles/orange.png",
    sparkColor: "#ff9900"
  },
  2: {
    name: "Mystic Crimson",
    inner: "assets/inner_circles/light_orange.png",
    outer: "assets/outer_circles/red.png",
    sparkColor: "#ff2244"
  },
  3: {
    name: "Astral Azure",
    inner: "assets/inner_circles/blue.png",
    outer: "assets/outer_circles/dark_red.png",
    sparkColor: "#00d4ff"
  }
};

// Settings
const CONFIG = {
  rotationSpeed: 2.5,
  easeFactor: 0.2,
  shieldMultiplier: 3.2,
  sparkColor: "#ff9900"
};

let currentPresetId = 1;
let currentMode = "manual"; // 'manual' or 'auto'
let manualActive = true;
let manualPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let manualScale = 1.0;
let manualDiameter = 280;
let manualSparksEnabled = true;
let rotationDegree = 0;
let detectedHands = [];

// Preload Images
const loadedImages = {};
Object.entries(PRESETS).forEach(([id, p]) => {
  const iImg = new Image();
  iImg.src = p.inner;
  const oImg = new Image();
  oImg.src = p.outer;
  loadedImages[id] = { inner: iImg, outer: oImg };
});

// Resize Handling
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Sparks Particle Engine
class Spark {
  constructor(x, y, color = CONFIG.sparkColor) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 4 + 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = 1.0;
    this.decay = Math.random() * 0.03 + 0.02;
    this.size = Math.random() * 3 + 1.5;
    this.color = color;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.95;
    this.vy *= 0.95;
    this.life -= this.decay;
  }

  draw(context) {
    if (this.life <= 0) return;
    context.save();
    context.globalAlpha = Math.max(0, this.life);
    context.fillStyle = this.color;
    context.shadowColor = this.color;
    context.shadowBlur = 10;
    context.beginPath();
    context.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

const particles = [];
function emitSparks(x, y, count = 2) {
  const color = PRESETS[currentPresetId]?.sparkColor || CONFIG.sparkColor;
  for (let i = 0; i < count; i++) {
    particles.push(new Spark(x + (Math.random() - 0.5) * 15, y + (Math.random() - 0.5) * 15, color));
  }
}

// Distance helper
function distance(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

// MediaPipe Hand Detection Handler
function onHandResults(results) {
  if (currentMode !== "auto") return;

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    detectedHands = [];
    gestureText.textContent = "LOOKING FOR HAND...";
    return;
  }

  const hands = [];
  results.multiHandLandmarks.forEach(landmarks => {
    const points = landmarks.map(lm => ({
      x: (1 - lm.x) * canvas.width,
      y: lm.y * canvas.height
    }));

    const center = {
      x: (points[0].x + points[9].x) / 2,
      y: (points[0].y + points[9].y) / 2
    };

    const palmSpan = distance(points[0], points[9]);
    const isIndexOpen = distance(points[8], points[0]) > distance(points[6], points[0]) * 1.15;
    const isMiddleOpen = distance(points[12], points[0]) > distance(points[10], points[0]) * 1.15;
    const isRingOpen = distance(points[16], points[0]) > distance(points[14], points[0]) * 1.15;
    const isPinkyOpen = distance(points[20], points[0]) > distance(points[18], points[0]) * 1.15;
    const openCount = [isIndexOpen, isMiddleOpen, isRingOpen, isPinkyOpen].filter(Boolean).length;

    const pinchDist = distance(points[4], points[8]);
    const isPinch = pinchDist < 45 && isIndexOpen;

    let active = false;
    let diameter = palmSpan * CONFIG.shieldMultiplier;
    let label = "FIST";

    if (openCount >= 3) {
      active = true;
      label = "ELDRITCH SHIELD ACTIVE";
    } else if (isPinch) {
      active = true;
      diameter = Math.max(120, pinchDist * 4.5);
      label = "PINCH SCALING";
    }

    hands.push({
      center,
      active,
      diameter,
      fingertip: points[8]
    });

    gestureText.textContent = label;
  });

  detectedHands = hands;
}

// Mouse & Touch Listeners for Manual Control
window.addEventListener("mousemove", (e) => {
  manualPos.x = e.clientX;
  manualPos.y = e.clientY;
  if (manualActive && manualSparksEnabled && currentMode === "manual") {
    emitSparks(manualPos.x, manualPos.y, 2);
  }
});

window.addEventListener("mousedown", (e) => {
  if (e.target.closest(".hud-controls")) return;
  manualActive = !manualActive;
  if (currentMode === "manual") {
    gestureText.textContent = manualActive ? `MANUAL MODE (${PRESETS[currentPresetId].name})` : "MANUAL MODE (STANDBY)";
  }
});

window.addEventListener("wheel", (e) => {
  if (currentMode === "manual") {
    manualDiameter = Math.max(80, Math.min(600, manualDiameter - Math.sign(e.deltaY) * 20));
  }
});

window.addEventListener("touchmove", (e) => {
  if (e.touches.length > 0) {
    manualPos.x = e.touches[0].clientX;
    manualPos.y = e.touches[0].clientY;
    if (manualActive && manualSparksEnabled && currentMode === "manual") {
      emitSparks(manualPos.x, manualPos.y, 2);
    }
  }
}, { passive: true });

window.addEventListener("touchstart", (e) => {
  if (e.touches.length > 0) {
    manualPos.x = e.touches[0].clientX;
    manualPos.y = e.touches[0].clientY;
    manualActive = true;
  }
}, { passive: true });

// Keyboard Listeners
window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (key === "m") {
    currentMode = currentMode === "manual" ? "auto" : "manual";
    gestureText.textContent = currentMode === "manual" 
      ? `MANUAL MODE (${PRESETS[currentPresetId].name})` 
      : "LOOKING FOR HAND...";
  } else if (key === " ") {
    manualActive = !manualActive;
  } else if (key === "1" || key === "2" || key === "3") {
    currentPresetId = parseInt(key);
    CONFIG.sparkColor = PRESETS[currentPresetId].sparkColor;
    if (currentMode === "manual") {
      gestureText.textContent = `MANUAL MODE (${PRESETS[currentPresetId].name})`;
    }
  } else if (key === "+" || key === "=") {
    manualDiameter = Math.min(600, manualDiameter + 25);
  } else if (key === "-" || key === "_") {
    manualDiameter = Math.max(80, manualDiameter - 25);
  } else if (key === "s") {
    manualSparksEnabled = !manualSparksEnabled;
  }
});

// Draw Doctor Strange Magic Shield with Custom Images
function drawCustomShield(cx, cy, diameter, deg, scale, iImg, oImg) {
  if (diameter <= 10 || scale <= 0.02) return;

  const renderSize = diameter * scale;
  const halfSize = renderSize / 2;

  ctx.save();
  ctx.translate(cx, cy);

  // Outer Ring (Clockwise)
  if (oImg && oImg.complete) {
    ctx.save();
    ctx.rotate((deg * Math.PI) / 180);
    ctx.globalAlpha = Math.min(1.0, scale);
    ctx.shadowColor = PRESETS[currentPresetId].sparkColor;
    ctx.shadowBlur = 20;
    ctx.drawImage(oImg, -halfSize, -halfSize, renderSize, renderSize);
    ctx.restore();
  }

  // Inner Ring (Counter-Clockwise)
  if (iImg && iImg.complete) {
    ctx.save();
    ctx.rotate((-deg * Math.PI) / 180);
    ctx.globalAlpha = Math.min(1.0, scale * 1.1);
    ctx.shadowColor = PRESETS[currentPresetId].sparkColor;
    ctx.shadowBlur = 25;
    ctx.drawImage(iImg, -halfSize, -halfSize, renderSize, renderSize);
    ctx.restore();
  }

  ctx.restore();

  // Perimeter sparks
  if (scale > 0.5) {
    const rimAngle = (deg * 3 * Math.PI) / 180;
    const sparkX = cx + Math.cos(rimAngle) * halfSize * 0.92;
    const sparkY = cy + Math.sin(rimAngle) * halfSize * 0.92;
    emitSparks(sparkX, sparkY, 2);
  }
}

// Render Loop
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw Mirrored Webcam Feed if available
  if (videoElement.readyState >= 2) {
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  rotationDegree = (rotationDegree + CONFIG.rotationSpeed) % 360;
  const curImages = loadedImages[currentPresetId] || loadedImages[1];

  if (currentMode === "manual") {
    const targetScale = manualActive ? 1.0 : 0.0;
    manualScale += (targetScale - manualScale) * CONFIG.easeFactor;

    if (manualScale > 0.02) {
      drawCustomShield(
        manualPos.x,
        manualPos.y,
        manualDiameter,
        rotationDegree,
        manualScale,
        curImages.inner,
        curImages.outer
      );
    }
  } else {
    // Render Shields on Detected Hands
    detectedHands.forEach(hand => {
      if (!hand.currentScale) hand.currentScale = 0;
      const target = hand.active ? 1.0 : 0;
      hand.currentScale += (target - hand.currentScale) * CONFIG.easeFactor;

      if (hand.currentScale > 0.02) {
        drawCustomShield(
          hand.center.x,
          hand.center.y,
          hand.diameter,
          rotationDegree,
          hand.currentScale,
          curImages.inner,
          curImages.outer
        );
      }

      if (hand.active && hand.fingertip) {
        emitSparks(hand.fingertip.x, hand.fingertip.y, 1);
      }
    });
  }

  // Render Sparks
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.update();
    p.draw(ctx);
    if (p.life <= 0) particles.splice(i, 1);
  }

  requestAnimationFrame(render);
}

// Initialize MediaPipe & Camera
async function init() {
  gestureText.textContent = `MANUAL MODE (${PRESETS[currentPresetId].name})`;

  if (typeof Hands !== "undefined") {
    const hands = new Hands({
      locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.65,
      minTrackingConfidence: 0.5
    });

    hands.onResults(onHandResults);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false
      });
      videoElement.srcObject = stream;
      await videoElement.play();

      if (typeof Camera !== "undefined") {
        const camera = new Camera(videoElement, {
          onFrame: async () => {
            if (currentMode === "auto") {
              await hands.send({ image: videoElement });
            }
          },
          width: 1280,
          height: 720
        });
        camera.start();
      }
    } catch (err) {
      console.warn("Camera optional or permission pending:", err);
    }
  }

  requestAnimationFrame(render);
}

window.addEventListener("DOMContentLoaded", init);
