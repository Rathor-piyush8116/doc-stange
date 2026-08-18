/**
 * Doctor Strange Pure Hand Gesture Filter
 * Real-time MediaPipe Hand Landmark Tracking & Dual Mandala Rendering
 */

const videoElement = document.getElementById("webcam");
const canvas = document.getElementById("render-canvas");
const ctx = canvas.getContext("2d");
const gestureText = document.getElementById("gesture-text");

// Assets
const innerImg = new Image();
innerImg.src = "assets/inner_circles/orange.png";

const outerImg = new Image();
outerImg.src = "assets/outer_circles/orange.png";

// Settings
const CONFIG = {
  rotationSpeed: 2.5,
  easeFactor: 0.2,
  shieldMultiplier: 3.2,
  sparkColor: "#ff9900"
};

let rotationDegree = 0;
let detectedHands = [];

// Resize Handling
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Sparks Particle Engine
class Spark {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 4 + 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = 1.0;
    this.decay = Math.random() * 0.03 + 0.02;
    this.size = Math.random() * 3 + 1.5;
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
    context.fillStyle = CONFIG.sparkColor;
    context.shadowColor = CONFIG.sparkColor;
    context.shadowBlur = 10;
    context.beginPath();
    context.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

const particles = [];
function emitSparks(x, y, count = 2) {
  for (let i = 0; i < count; i++) {
    particles.push(new Spark(x + (Math.random() - 0.5) * 15, y + (Math.random() - 0.5) * 15));
  }
}

// Distance helper
function distance(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

// MediaPipe Results Handler
function onHandResults(results) {
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    detectedHands = [];
    gestureText.textContent = "LOOKING FOR HAND...";
    return;
  }

  const hands = [];
  results.multiHandLandmarks.forEach(landmarks => {
    // Mirror horizontally to match webcam mirror
    const points = landmarks.map(lm => ({
      x: (1 - lm.x) * canvas.width,
      y: lm.y * canvas.height
    }));

    // Palm Center (midpoint of wrist 0 and middle MCP 9)
    const center = {
      x: (points[0].x + points[9].x) / 2,
      y: (points[0].y + points[9].y) / 2
    };

    const palmSpan = distance(points[0], points[9]);

    // Check open fingers (tip distance to wrist > pip distance to wrist)
    const isIndexOpen = distance(points[8], points[0]) > distance(points[6], points[0]) * 1.15;
    const isMiddleOpen = distance(points[12], points[0]) > distance(points[10], points[0]) * 1.15;
    const isRingOpen = distance(points[16], points[0]) > distance(points[14], points[0]) * 1.15;
    const isPinkyOpen = distance(points[20], points[0]) > distance(points[18], points[0]) * 1.15;
    const openCount = [isIndexOpen, isMiddleOpen, isRingOpen, isPinkyOpen].filter(Boolean).length;

    // Pinch distance between thumb tip and index tip
    const pinchDist = distance(points[4], points[8]);
    const isPinch = pinchDist < 45 && isIndexOpen;

    let active = false;
    let diameter = palmSpan * CONFIG.shieldMultiplier;
    let label = "FIST";

    if (openCount >= 3) {
      active = true;
      label = "ELDRICTH SHIELD ACTIVE";
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

// Draw Doctor Strange Magic Shield
function drawShield(cx, cy, diameter, deg, scale) {
  if (diameter <= 10 || scale <= 0.02) return;

  const renderSize = diameter * scale;
  const halfSize = renderSize / 2;

  ctx.save();
  ctx.translate(cx, cy);

  // Outer Ring (Clockwise)
  if (outerImg.complete) {
    ctx.save();
    ctx.rotate((deg * Math.PI) / 180);
    ctx.globalAlpha = Math.min(1.0, scale);
    ctx.shadowColor = CONFIG.sparkColor;
    ctx.shadowBlur = 18;
    ctx.drawImage(outerImg, -halfSize, -halfSize, renderSize, renderSize);
    ctx.restore();
  }

  // Inner Ring (Counter-Clockwise)
  if (innerImg.complete) {
    ctx.save();
    ctx.rotate((-deg * Math.PI) / 180);
    ctx.globalAlpha = Math.min(1.0, scale * 1.1);
    ctx.shadowColor = CONFIG.sparkColor;
    ctx.shadowBlur = 24;
    ctx.drawImage(innerImg, -halfSize, -halfSize, renderSize, renderSize);
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

  // Draw Mirrored Webcam Feed
  if (videoElement.readyState >= 2) {
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  rotationDegree = (rotationDegree + CONFIG.rotationSpeed) % 360;

  // Render Shields on Detected Hands
  detectedHands.forEach(hand => {
    if (!hand.currentScale) hand.currentScale = 0;
    const target = hand.active ? 1.0 : 0;
    hand.currentScale += (target - hand.currentScale) * CONFIG.easeFactor;

    if (hand.currentScale > 0.02) {
      drawShield(hand.center.x, hand.center.y, hand.diameter, rotationDegree, hand.currentScale);
    }

    if (hand.active && hand.fingertip) {
      emitSparks(hand.fingertip.x, hand.fingertip.y, 1);
    }
  });

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
  if (typeof Hands === "undefined") {
    setTimeout(init, 500);
    return;
  }

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
          await hands.send({ image: videoElement });
        },
        width: 1280,
        height: 720
      });
      camera.start();
    }
  } catch (err) {
    console.error("Camera access failed:", err);
    gestureText.textContent = "CAMERA ACCESS REQUIRED";
  }

  requestAnimationFrame(render);
}

window.addEventListener("DOMContentLoaded", init);
