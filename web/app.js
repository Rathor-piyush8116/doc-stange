/**
 * Doctor Strange Eldritch Portal Web Filter Engine
 * Uses MediaPipe Hands, HTML5 Canvas, Web Audio API, and Particle Simulation
 */

// Configuration & State
const CONFIG = {
  presets: {
    1: { name: "Eldritch Orange", inner: "assets/inner_circles/orange.png", outer: "assets/outer_circles/orange.png", color: "#ff9900", glow: "rgba(255, 153, 0, 0.6)", filter: "none" },
    2: { name: "Mystic Crimson", inner: "assets/inner_circles/light_orange.png", outer: "assets/outer_circles/red.png", color: "#ff2a4b", glow: "rgba(255, 42, 75, 0.6)", filter: "hue-rotate(330deg)" },
    3: { name: "Astral Azure", inner: "assets/inner_circles/blue.png", outer: "assets/outer_circles/dark_red.png", color: "#00e5ff", glow: "rgba(0, 229, 255, 0.6)", filter: "hue-rotate(180deg)" },
    4: { name: "Time Stone Emerald", inner: "assets/inner_circles/orange.png", outer: "assets/outer_circles/orange.png", color: "#00f076", glow: "rgba(0, 240, 118, 0.6)", filter: "hue-rotate(90deg) saturate(1.8)" },
    5: { name: "Quantum Amethyst", inner: "assets/inner_circles/blue.png", outer: "assets/outer_circles/orange.png", color: "#e040fb", glow: "rgba(224, 64, 251, 0.6)", filter: "hue-rotate(260deg) saturate(1.6)" }
  },
  rotationInc: 2.5,
  easeFactor: 0.22,
  defaultDiameter: 280,
  scaleMultiplier: 1.0,
  maxSparks: 120
};

// Application State
const state = {
  mode: "auto", // "auto" (camera) or "manual" (mouse/touch)
  activePresetId: 1,
  rotationDegree: 0,
  manualActive: true,
  manualPos: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
  manualScale: 1.0,
  manualTargetScale: 1.0,
  manualDiameter: CONFIG.defaultDiameter,
  sparksEnabled: true,
  audioEnabled: true,
  hudVisible: true,
  fps: 60,
  lastFrameTime: performance.now(),
  cameraActive: false,
  hands: [] // List of detected hand states
};

// DOM Elements
const videoElement = document.getElementById("webcam");
const canvas = document.getElementById("render-canvas");
const ctx = canvas.getContext("2d");
const ambientGlow = document.getElementById("ambient-glow");
const modeText = document.getElementById("mode-text");
const gesturePill = document.getElementById("gesture-pill");
const gestureText = document.getElementById("gesture-text");
const fpsCounter = document.getElementById("fps-counter");
const spellToast = document.getElementById("spell-toast");
const toastText = document.getElementById("toast-text");
const controlPanel = document.querySelector(".control-panel");
const cameraModal = document.getElementById("camera-modal");

// Sliders & Controls
const sliderSize = document.getElementById("slider-size");
const valSize = document.getElementById("val-size");
const sliderSpeed = document.getElementById("slider-speed");
const valSpeed = document.getElementById("val-speed");
const btnModeAuto = document.getElementById("btn-mode-auto");
const btnModeManual = document.getElementById("btn-mode-manual");
const btnSparks = document.getElementById("btn-sparks");
const btnAudio = document.getElementById("btn-audio");
const audioIcon = document.getElementById("audio-icon");
const btnSnap = document.getElementById("btn-snap");
const btnHideUi = document.getElementById("btn-hide-ui");
const btnGrantCamera = document.getElementById("btn-grant-camera");
const btnUseMouse = document.getElementById("btn-use-mouse");

// Preload Images
const loadedImages = {};
function preloadImages() {
  const paths = [
    "assets/inner_circles/orange.png",
    "assets/inner_circles/light_orange.png",
    "assets/inner_circles/blue.png",
    "assets/outer_circles/orange.png",
    "assets/outer_circles/red.png",
    "assets/outer_circles/dark_red.png"
  ];
  paths.forEach(p => {
    const img = new Image();
    img.src = p;
    loadedImages[p] = img;
  });
}
preloadImages();

// Particle System
class SparkParticle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 5 + 2;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed + (Math.random() - 0.5) * 2;
    this.life = 1.0;
    this.decay = Math.random() * 0.035 + 0.02;
    this.size = Math.random() * 3.5 + 1.5;
    this.color = color;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.96;
    this.vy *= 0.96;
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
function emitSparks(x, y, count = 3, color = "#ff9900") {
  if (!state.sparksEnabled || particles.length > CONFIG.maxSparks) return;
  for (let i = 0; i < count; i++) {
    particles.push(new SparkParticle(x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 20, color));
  }
}

// Web Audio Mystical Synthesizer
class MysticAudioSynth {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.droneOsc = null;
    this.droneGain = null;
    this.sparkGain = null;
    this.isInitialized = false;
  }

  init() {
    if (this.isInitialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.2, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // Mystical Drone
      this.droneOsc = this.ctx.createOscillator();
      this.droneOsc.type = "sawtooth";
      this.droneOsc.frequency.setValueAtTime(65.41, this.ctx.currentTime); // C2

      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(320, this.ctx.currentTime);
      filter.Q.setValueAtTime(6, this.ctx.currentTime);

      this.droneGain = this.ctx.createGain();
      this.droneGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);

      this.droneOsc.connect(filter);
      filter.connect(this.droneGain);
      this.droneGain.connect(this.masterGain);
      this.droneOsc.start();

      this.isInitialized = true;
    } catch (e) {
      console.warn("AudioContext initialization prevented:", e);
    }
  }

  playCastSpell(pitch = 280) {
    if (!state.audioEnabled || !this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(pitch, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(pitch * 2.2, this.ctx.currentTime + 0.35);

    g.gain.setValueAtTime(0.3, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.4);
  }

  updateDrone(active, intensity = 1.0) {
    if (!this.isInitialized || !state.audioEnabled) return;
    if (this.ctx.state === "suspended" && active) this.ctx.resume();

    const targetGain = active ? 0.18 * intensity : 0.0001;
    this.droneGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.15);
  }
}

const audioSynth = new MysticAudioSynth();

// Resize canvas handling
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// Show Toast Message
let toastTimer = null;
function showToast(msg) {
  toastText.textContent = msg;
  spellToast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    spellToast.classList.remove("show");
  }, 1800);
}

// Preset Changer
function setPreset(presetId) {
  state.activePresetId = presetId;
  const p = CONFIG.presets[presetId];
  if (!p) return;

  document.documentElement.style.setProperty("--active-color", p.color);
  document.documentElement.style.setProperty("--active-glow", p.glow);

  document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.classList.toggle("active", parseInt(btn.dataset.preset) === presetId);
  });

  audioSynth.playCastSpell(350 + presetId * 40);
  showToast(`${p.name.toUpperCase()} EQUIPPED`);
}

// Mode Switcher
function setMode(newMode) {
  state.mode = newMode;
  if (newMode === "auto") {
    btnModeAuto.classList.add("active");
    btnModeManual.classList.remove("active");
    modeText.textContent = "AUTO GESTURE";
    document.getElementById("status-badge").className = "badge badge-auto";
    showToast("AUTO GESTURE MODE ENABLED");
  } else {
    btnModeManual.classList.add("active");
    btnModeAuto.classList.remove("active");
    modeText.textContent = "MANUAL MOUSE";
    document.getElementById("status-badge").className = "badge";
    showToast("MANUAL MOUSE MODE ENABLED");
  }
}

// MediaPipe Hand Detection Setup
let handsDetector = null;
let cameraInstance = null;

function setupMediaPipe() {
  if (typeof Hands === "undefined") {
    console.warn("MediaPipe Hands not loaded yet. Retrying in 1s...");
    setTimeout(setupMediaPipe, 1000);
    return;
  }

  handsDetector = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });

  handsDetector.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.65,
    minTrackingConfidence: 0.5
  });

  handsDetector.onResults(onHandResults);

  startCamera();
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: false
    });
    videoElement.srcObject = stream;
    await videoElement.play();
    state.cameraActive = true;
    cameraModal.classList.add("hidden");

    if (typeof Camera !== "undefined") {
      cameraInstance = new Camera(videoElement, {
        onFrame: async () => {
          if (state.mode === "auto") {
            await handsDetector.send({ image: videoElement });
          }
        },
        width: 1280,
        height: 720
      });
      cameraInstance.start();
    }
  } catch (err) {
    console.warn("Camera access failed or denied:", err);
    cameraModal.classList.remove("hidden");
    setMode("manual");
  }
}

// Distance Helper
function distance(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

// Process MediaPipe Hand Results
function onHandResults(results) {
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    state.hands = [];
    gestureText.textContent = "READY";
    gesturePill.style.borderColor = "var(--border-glass-subtle)";
    return;
  }

  const detected = [];
  results.multiHandLandmarks.forEach((landmarks, idx) => {
    // MediaPipe normalized coords (0.0 to 1.0)
    // Horizontal mirror: x -> (1 - x)
    const points = landmarks.map(lm => ({
      x: (1 - lm.x) * canvas.width,
      y: lm.y * canvas.height,
      z: lm.z
    }));

    // Palm Center: midpoint of wrist(0) and middle MCP(9)
    const palmCenter = {
      x: (points[0].x + points[9].x) / 2,
      y: (points[0].y + points[9].y) / 2
    };

    // Palm openness / size metric
    const palmSpan = distance(points[0], points[9]);
    
    // Check extended fingers: tip distance to wrist vs pip distance to wrist
    const isIndexOpen = distance(points[8], points[0]) > distance(points[6], points[0]) * 1.15;
    const isMiddleOpen = distance(points[12], points[0]) > distance(points[10], points[0]) * 1.15;
    const isRingOpen = distance(points[16], points[0]) > distance(points[14], points[0]) * 1.15;
    const isPinkyOpen = distance(points[20], points[0]) > distance(points[18], points[0]) * 1.15;
    const openCount = [isIndexOpen, isMiddleOpen, isRingOpen, isPinkyOpen].filter(Boolean).length;

    // Pinch distance between thumb tip (4) and index tip (8)
    const pinchDist = distance(points[4], points[8]);
    const isPinch = pinchDist < 45 && isIndexOpen;

    let gesture = "Fist";
    let active = false;
    let diameter = palmSpan * 3.2 * CONFIG.scaleMultiplier;

    if (openCount >= 3) {
      gesture = "Open Palm";
      active = true;
    } else if (isPinch) {
      gesture = "Pinch Scale";
      active = true;
      diameter = Math.max(120, pinchDist * 4.5 * CONFIG.scaleMultiplier);
    }

    detected.push({
      center: palmCenter,
      active: active,
      diameter: diameter,
      fingertip: points[8],
      gesture: gesture
    });
  });

  state.hands = detected;
  if (detected.length > 0) {
    gestureText.textContent = detected[0].gesture.toUpperCase();
    gesturePill.style.borderColor = detected[0].active ? "var(--active-color)" : "var(--border-glass-subtle)";
  }
}

// Render Portal Shield on Canvas
function drawPortalShield(cx, cy, diameter, preset, degree, scale = 1.0) {
  if (diameter <= 10 || scale <= 0.01) return;

  const curPreset = CONFIG.presets[preset];
  const innerImg = loadedImages[curPreset.inner];
  const outerImg = loadedImages[curPreset.outer];

  const renderSize = diameter * scale;
  const halfSize = renderSize / 2;

  ctx.save();
  ctx.translate(cx, cy);

  if (curPreset.filter && curPreset.filter !== "none") {
    ctx.filter = curPreset.filter;
  }

  // Outer Ring (Clockwise)
  if (outerImg && outerImg.complete) {
    ctx.save();
    ctx.rotate((degree * Math.PI) / 180);
    ctx.globalAlpha = Math.min(1.0, scale * 1.1);
    ctx.shadowColor = curPreset.color;
    ctx.shadowBlur = 18;
    ctx.drawImage(outerImg, -halfSize, -halfSize, renderSize, renderSize);
    ctx.restore();
  }

  // Inner Ring (Counter-Clockwise)
  if (innerImg && innerImg.complete) {
    ctx.save();
    ctx.rotate((-degree * Math.PI) / 180);
    ctx.globalAlpha = Math.min(1.0, scale * 1.2);
    ctx.shadowColor = curPreset.color;
    ctx.shadowBlur = 24;
    ctx.drawImage(innerImg, -halfSize, -halfSize, renderSize, renderSize);
    ctx.restore();
  }

  ctx.restore();

  // Radial spell sparks along rim
  if (state.sparksEnabled && scale > 0.6) {
    const rimAngle = (degree * 3 * Math.PI) / 180;
    const sparkX = cx + Math.cos(rimAngle) * halfSize * 0.92;
    const sparkY = cy + Math.sin(rimAngle) * halfSize * 0.92;
    emitSparks(sparkX, sparkY, 2, curPreset.color);
  }
}

// Main Animation & Render Loop
function renderLoop(timestamp) {
  // FPS calculation
  const delta = timestamp - state.lastFrameTime;
  state.lastFrameTime = timestamp;
  state.fps = Math.round(1000 / Math.max(1, delta));
  if (Math.random() < 0.05) fpsCounter.textContent = state.fps;

  // Clear Canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Render Video Feed Mirrored
  if (videoElement.readyState >= 2) {
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  } else {
    // Dark mystic background when camera not connected
    ctx.fillStyle = "#07090e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255, 153, 0, 0.04)";
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 350, 0, Math.PI * 2);
    ctx.fill();
  }

  // Increment rotation
  state.rotationDegree = (state.rotationDegree + CONFIG.rotationInc) % 360;

  let anyPortalActive = false;

  // 2. Render Portals Based on Mode
  if (state.mode === "auto" && state.hands.length > 0) {
    state.hands.forEach(hand => {
      if (!hand.currentScale) hand.currentScale = 0;
      const target = hand.active ? 1.0 : 0;
      hand.currentScale += (target - hand.currentScale) * CONFIG.easeFactor;

      if (hand.currentScale > 0.02) {
        anyPortalActive = true;
        drawPortalShield(
          hand.center.x,
          hand.center.y,
          hand.diameter,
          state.activePresetId,
          state.rotationDegree,
          hand.currentScale
        );
      }

      if (state.sparksEnabled && hand.fingertip && hand.active) {
        emitSparks(hand.fingertip.x, hand.fingertip.y, 1, CONFIG.presets[state.activePresetId].color);
      }
    });
  } else if (state.mode === "manual" || state.hands.length === 0) {
    const target = state.manualActive ? 1.0 : 0;
    state.manualScale += (target - state.manualScale) * CONFIG.easeFactor;

    if (state.manualScale > 0.02) {
      anyPortalActive = true;
      drawPortalShield(
        state.manualPos.x,
        state.manualPos.y,
        state.manualDiameter * CONFIG.scaleMultiplier,
        state.activePresetId,
        state.rotationDegree,
        state.manualScale
      );
    }
  }

  // Update mystical audio drone
  audioSynth.updateDrone(anyPortalActive);

  // 3. Render Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.update();
    p.draw(ctx);
    if (p.life <= 0) particles.splice(i, 1);
  }

  requestAnimationFrame(renderLoop);
}

// Event Listeners & Interactions
function setupEvents() {
  // Preset buttons
  document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      audioSynth.init();
      setPreset(parseInt(btn.dataset.preset));
    });
  });

  // Mode toggles
  btnModeAuto.addEventListener("click", () => {
    audioSynth.init();
    setMode("auto");
  });
  btnModeManual.addEventListener("click", () => {
    audioSynth.init();
    setMode("manual");
  });

  // Sliders
  sliderSize.addEventListener("input", (e) => {
    CONFIG.scaleMultiplier = parseFloat(e.target.value);
    valSize.textContent = `${CONFIG.scaleMultiplier.toFixed(1)}x`;
  });

  sliderSpeed.addEventListener("input", (e) => {
    CONFIG.rotationInc = parseFloat(e.target.value);
    valSpeed.textContent = `${CONFIG.rotationInc.toFixed(1)}°`;
  });

  // FX Buttons
  btnSparks.addEventListener("click", () => {
    state.sparksEnabled = !state.sparksEnabled;
    btnSparks.classList.toggle("active", state.sparksEnabled);
    showToast(state.sparksEnabled ? "SPARKS ACTIVATED" : "SPARKS DEACTIVATED");
  });

  btnAudio.addEventListener("click", () => {
    audioSynth.init();
    state.audioEnabled = !state.audioEnabled;
    btnAudio.classList.toggle("active", state.audioEnabled);
    audioIcon.textContent = state.audioEnabled ? "🔊" : "🔇";
    showToast(state.audioEnabled ? "AUDIO ENABLED" : "AUDIO MUTED");
  });

  btnSnap.addEventListener("click", takeSnapshot);

  // HUD Visibility
  btnHideUi.addEventListener("click", () => {
    state.hudVisible = !state.hudVisible;
    controlPanel.classList.toggle("hidden", !state.hudVisible);
    document.querySelector(".hud-top").style.opacity = state.hudVisible ? "1" : "0";
    document.querySelector(".keyboard-hints").style.opacity = state.hudVisible ? "1" : "0";
  });

  // Mouse / Touch Controls for Manual Mode
  window.addEventListener("pointermove", (e) => {
    state.manualPos.x = e.clientX;
    state.manualPos.y = e.clientY;
    if (state.sparksEnabled && (state.mode === "manual" || !state.cameraActive)) {
      emitSparks(e.clientX, e.clientY, 1, CONFIG.presets[state.activePresetId].color);
    }
  });

  window.addEventListener("pointerdown", (e) => {
    // Only toggle if not clicking on UI controls
    if (e.target.closest(".control-panel") || e.target.closest(".hud-top") || e.target.closest(".hud-bottom") || e.target.closest(".modal-card")) {
      return;
    }
    audioSynth.init();
    if (state.mode === "manual") {
      state.manualActive = !state.manualActive;
      if (state.manualActive) audioSynth.playCastSpell(380);
    }
  });

  // Modal Camera Permission Actions
  btnGrantCamera.addEventListener("click", () => {
    audioSynth.init();
    startCamera();
  });
  btnUseMouse.addEventListener("click", () => {
    audioSynth.init();
    cameraModal.classList.add("hidden");
    setMode("manual");
  });

  // Keyboard Shortcuts
  window.addEventListener("keydown", (e) => {
    audioSynth.init();
    const key = e.key.toUpperCase();

    if (key === "M") {
      setMode(state.mode === "auto" ? "manual" : "auto");
    } else if (["1", "2", "3", "4", "5"].includes(e.key)) {
      setPreset(parseInt(e.key));
    } else if (e.code === "Space") {
      e.preventDefault();
      if (state.mode === "manual") {
        state.manualActive = !state.manualActive;
        if (state.manualActive) audioSynth.playCastSpell(380);
      }
    } else if (key === "S") {
      btnSparks.click();
    } else if (key === "A") {
      btnAudio.click();
    } else if (key === "H") {
      btnHideUi.click();
    }
  });
}

// High-Res Snapshot Downloader
function takeSnapshot() {
  audioSynth.playCastSpell(520);
  const link = document.createElement("a");
  link.download = `Doctor-Strange-Spell-${Date.now()}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
  showToast("SNAPSHOT SAVED 📸");
}

// Initialization
window.addEventListener("DOMContentLoaded", () => {
  setupEvents();
  setupMediaPipe();
  requestAnimationFrame(renderLoop);
});
