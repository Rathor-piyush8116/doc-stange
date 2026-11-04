/**
 * main.js - Doctor Strange Sling Ring & Mystic Portal Orchestrator
 * Integrates:
 * - handTracker.js (MediaPipe Tasks-Vision 21-point tracking)
 * - gestures.js (7 Doctor Strange gestures + finger gestures & hand orientation)
 * - portalRenderer.js (60fps Canvas 2D engine, HSL color blend, orbiting ring, runes toggle)
 * - audioManager.js (Web Audio API procedural sound effects)
 * - Color Mode Switcher ("Auto (turn hand)", "Fixed orange", "Fixed blue")
 * - Interactive Mouse/Touch Fallback Test Mode
 */

import { HandTracker } from "./handTracker.js";
import { GestureRecognizer } from "./gestures.js";
import { PortalRenderer } from "./portalRenderer.js";
import { AudioManager } from "./audioManager.js";

// DOM Elements
const videoElement = document.getElementById("webcam");
const canvas = document.getElementById("render-canvas");
const startOverlay = document.getElementById("start-overlay");
const startBtn = document.getElementById("start-btn");
const testModeBtn = document.getElementById("test-mode-btn");
const statusText = document.getElementById("gesture-text");
const gestureBadge = document.getElementById("gesture-badge-label");
const orientationBadge = document.getElementById("orientation-badge-label");
const debugToggleBtn = document.getElementById("debug-toggle");
const audioToggleBtn = document.getElementById("audio-toggle");
const colorModeSelector = document.getElementById("color-mode-selector");
const errorModal = document.getElementById("error-modal");
const errorText = document.getElementById("error-text");
const closeErrorBtn = document.getElementById("close-error-btn");
const fallbackTestBtn = document.getElementById("fallback-test-btn");
const fpsCounter = document.getElementById("fps-counter");

// Application Instances
const audioManager = new AudioManager();
const handTracker = new HandTracker({
  lerpFactor: 0.45,
  onStatus: (msg) => updateLoadingStatus(msg),
  onError: (err) => handleCameraError(err)
});
const gestureRecognizer = new GestureRecognizer();
const portalRenderer = new PortalRenderer(canvas);

// Application State
let isAppRunning = false;
let isDebugMode = false;
let isTestMode = false;
let lastFrameTime = performance.now();
let frameCount = 0;
let currentFps = 60;

// Test Mode (Interactive Mouse/Touch) Fallback State
const testState = {
  active: true,
  x: window.innerWidth / 2,
  y: window.innerHeight / 2,
  scaleMultiplier: 1.0,
  tiltAngle: 0,
  turnRatio: 0.0, // 0.0 = palm (orange), 1.0 = back (blue)
  stableGesture: "OPEN_PALM",
  isGrabbed: false,
  showRunes: true,
  trail: [],
  twoHandSimulation: false
};

/**
 * Resize canvas to match window dimensions
 */
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

/**
 * Update start screen status text during initialization
 */
function updateLoadingStatus(text) {
  const loadingElem = document.getElementById("loading-status");
  if (loadingElem) loadingElem.textContent = text;
}

/**
 * Handle camera access errors gracefully
 */
function handleCameraError(error) {
  console.warn("Camera access issue:", error);
  if (startOverlay) startOverlay.classList.add("hidden");
  if (errorModal) {
    errorText.textContent = typeof error === "string" ? error : (error.message || "Camera permission was denied or not found.");
    errorModal.classList.remove("hidden");
  }
}

/**
 * Start the application with Webcam & MediaPipe
 */
async function startWebcamApp() {
  audioManager.init();
  audioManager.playWhoosh();

  startBtn.disabled = true;
  startBtn.textContent = "CONJURING PORTAL...";

  const initialized = await handTracker.init();
  if (!initialized) {
    handleCameraError("Could not load MediaPipe vision runtime. Check internet connection or CORS.");
    return;
  }

  const cameraStarted = await handTracker.startCamera(videoElement);
  if (!cameraStarted) {
    return;
  }

  startOverlay.classList.add("fade-out");
  setTimeout(() => startOverlay.classList.add("hidden"), 600);

  isAppRunning = true;
  isTestMode = false;
  statusText.textContent = "SHOW HAND TO CAST";
  requestAnimationFrame(gameLoop);
}

/**
 * Start the application in Interactive Mouse/Touch Test Mode
 */
function startTestMode() {
  audioManager.init();
  audioManager.playWhoosh();

  if (startOverlay) startOverlay.classList.add("hidden");
  if (errorModal) errorModal.classList.add("hidden");

  isAppRunning = true;
  isTestMode = true;
  statusText.textContent = "TEST MODE: MOVE MOUSE / TOUCH TO CAST";

  initTestModeListeners();
  requestAnimationFrame(gameLoop);
}

/**
 * Setup Mouse & Touch listeners for fallback Test Mode
 */
function initTestModeListeners() {
  window.addEventListener("mousemove", (e) => {
    if (!isTestMode) return;
    testState.x = e.clientX;
    testState.y = e.clientY;

    if (testState.stableGesture === "POINT") {
      testState.trail.push({ x: e.clientX, y: e.clientY, time: performance.now() });
      if (testState.trail.length > 50) testState.trail.shift();

      audioManager.playCrackle();

      if (testState.trail.length > 25) {
        const first = testState.trail[0];
        const last = testState.trail[testState.trail.length - 1];
        if (Math.hypot(first.x - last.x, first.y - last.y) < 65) {
          portalRenderer.triggerShockwave(testState.x, testState.y);
          audioManager.playShockwave();
          testState.trail = [];
          statusText.textContent = "PORTAL IGNITION SUCCESS!";
        }
      }
    }
  });

  window.addEventListener("wheel", (e) => {
    if (!isTestMode) return;
    e.preventDefault();
    const delta = -Math.sign(e.deltaY) * 0.12;
    testState.scaleMultiplier = Math.max(0.4, Math.min(2.5, testState.scaleMultiplier + delta));
    statusText.textContent = `RING SCALE: ${testState.scaleMultiplier.toFixed(2)}x (SCROLL)`;
  }, { passive: false });

  window.addEventListener("mousedown", (e) => {
    if (!isTestMode || e.target.closest(".hud-top") || e.target.closest(".hud-bottom") || e.target.closest("button")) return;
    if (e.shiftKey) {
      testState.stableGesture = "POINT";
      testState.trail = [{ x: e.clientX, y: e.clientY, time: performance.now() }];
      statusText.textContent = "GESTURE: POINT (DRAG IN A CIRCLE TO IGNITE)";
    } else {
      if (testState.stableGesture === "FIST") {
        testState.stableGesture = "OPEN_PALM";
        audioManager.playWhoosh();
        statusText.textContent = "GESTURE: OPEN PALM (SLING RING ACTIVE)";
      } else {
        testState.stableGesture = "FIST";
        audioManager.playCollapse();
        statusText.textContent = "GESTURE: FIST (PORTAL COLLAPSED)";
      }
    }
  });

  window.addEventListener("mouseup", () => {
    if (testState.stableGesture === "POINT") {
      testState.stableGesture = "OPEN_PALM";
      testState.trail = [];
    }
  });

  window.addEventListener("dblclick", (e) => {
    if (!isTestMode || e.target.closest(".hud-top") || e.target.closest(".hud-bottom") || e.target.closest("button")) return;
    portalRenderer.triggerShockwave(e.clientX, e.clientY);
    audioManager.playShockwave();
    statusText.textContent = "MYSTIC PUSH SHOCKWAVE!";
  });

  // Keyboard shortcut controls in test mode
  window.addEventListener("keydown", (e) => {
    if (!isTestMode) return;
    const key = e.key.toLowerCase();

    if (key === "t") {
      // Toggle hand orientation (turn hand)
      testState.turnRatio = testState.turnRatio > 0.5 ? 0.0 : 1.0;
      statusText.textContent = testState.turnRatio > 0.5 ? "HAND TURNED: BACK OF HAND (CYAN-BLUE)" : "HAND FACING: PALM (ORANGE-GOLD)";
    } else if (key === "1") {
      testState.stableGesture = "POINT";
      statusText.textContent = "GESTURE: POINT (INDEX FINGER)";
    } else if (key === "2") {
      testState.stableGesture = testState.stableGesture === "PEACE" ? "OPEN_PALM" : "PEACE";
      statusText.textContent = testState.stableGesture === "PEACE" ? "GESTURE: PEACE (SECONDARY ORBITING RING)" : "OPEN PALM";
    } else if (key === "3") {
      testState.showRunes = !testState.showRunes;
      audioManager.playWhoosh();
      statusText.textContent = testState.showRunes ? "GESTURE: THREE FINGERS (RUNES ACTIVATED)" : "GESTURE: THREE FINGERS (RUNES CONCEALED)";
    } else if (key === "g") {
      testState.isGrabbed = !testState.isGrabbed;
      statusText.textContent = testState.isGrabbed ? "GESTURE: GRAB (PINCH STICKING RING)" : "RELEASED GRAB";
    } else if (key === "f") {
      portalRenderer.spawnFlickBurst(testState.x, testState.y, 1.0, -0.5, 1800);
      audioManager.playWhoosh();
      statusText.textContent = "GESTURE: FLICK (SPARK FOUNTAIN SHOT)";
    } else if (key === "p") {
      portalRenderer.triggerShockwave(testState.x, testState.y);
      audioManager.playShockwave();
    }
  });
}

/**
 * Main 60 FPS Animation & Tracking Loop
 */
function gameLoop(timestamp) {
  if (!isAppRunning) return;

  frameCount++;
  if (timestamp - lastFrameTime >= 1000) {
    currentFps = frameCount;
    frameCount = 0;
    lastFrameTime = timestamp;
    if (fpsCounter) fpsCounter.textContent = `${currentFps} FPS`;
  }

  let gestureState = null;

  if (isTestMode) {
    // Synthesize gesture state from test controls
    const simulatedHands = [{
      id: 0,
      handedness: "Right",
      palmCenter: { x: testState.x, y: testState.y, z: 0 },
      palmSpan: 120 * testState.scaleMultiplier,
      stableGesture: testState.stableGesture,
      isGrabbed: testState.isGrabbed,
      pinchPoint: { x: testState.x, y: testState.y },
      scaleMultiplier: testState.scaleMultiplier,
      tiltAngle: testState.tiltAngle,
      orientation: testState.turnRatio > 0.5 ? "BACK" : "PALM",
      turnRatio: testState.turnRatio,
      isOpenPalm: testState.stableGesture === "OPEN_PALM",
      circleStatus: {
        isDrawing: testState.stableGesture === "POINT",
        completed: false,
        trailPoints: testState.trail
      }
    }];

    gestureState = {
      hands: simulatedHands,
      isTwoHandsOpen: false,
      twoHandConnection: null,
      triggeredShockwave: false,
      triggeredFlick: null,
      runesState: testState.showRunes
    };
  } else {
    // 1. Detect smoothed hands with MediaPipe
    const detectedHands = handTracker.detectHands(timestamp, canvas.width, canvas.height);

    // 2. Recognize Gestures & Orientations
    gestureState = gestureRecognizer.analyze(detectedHands, timestamp);

    // 3. Handle Special Gesture Action Triggers
    // A. Index Flick Spark Burst
    if (gestureState.triggeredFlick) {
      const f = gestureState.triggeredFlick;
      portalRenderer.spawnFlickBurst(f.origin.x, f.origin.y, f.direction.x, f.direction.y, f.speed);
      audioManager.playWhoosh();
    }

    // B. Three-Finger Runes Toggle Sound
    if (gestureState.runesToggleRequested) {
      audioManager.playWhoosh();
    }

    // C. Forward Push Shockwave
    if (gestureState.triggeredShockwave) {
      const focalHand = gestureState.hands[0] || { palmCenter: { x: canvas.width / 2, y: canvas.height / 2 } };
      portalRenderer.triggerShockwave(focalHand.palmCenter.x, focalHand.palmCenter.y);
      audioManager.playShockwave();
    }

    // D. Air Circle Drawing Completion
    gestureState.hands.forEach(h => {
      if (h.circleStatus && h.circleStatus.completed) {
        portalRenderer.triggerShockwave(h.circleStatus.center.x, h.circleStatus.center.y, 480);
        audioManager.playWhoosh();
      } else if (h.circleStatus && h.circleStatus.isDrawing) {
        audioManager.playCrackle();
      }
    });

    // 4. Update HUD Telemetry Badges
    updateStatusHUD(gestureState);
  }

  // Sustained hum sound update
  const hasActivePortal = gestureState.hands.some(h => 
    h.stableGesture === "OPEN_PALM" || 
    h.stableGesture === "PEACE" || 
    h.isGrabbed || 
    h.stableGesture === "THREE_FINGERS" ||
    (h.circleStatus && h.circleStatus.isDrawing)
  );
  audioManager.updateHum(hasActivePortal, gestureState.hands.length > 0 ? gestureState.hands[0].scaleMultiplier : 1.0);

  // 5. Render Portals, Sparks, Mandalas, and Shockwaves
  portalRenderer.render(videoElement, gestureState);

  // 6. Draw Skeleton Landmarks if Debug Mode enabled
  if (isDebugMode && !isTestMode) {
    handTracker.drawDebug(portalRenderer.ctx);
  }

  requestAnimationFrame(gameLoop);
}

/**
 * Updates HUD status badges with real-time feedback
 */
function updateStatusHUD(gestureState) {
  if (gestureState.hands.length === 0) {
    statusText.textContent = "SHOW HAND TO CAST";
    if (gestureBadge) gestureBadge.textContent = "IDLE";
    if (orientationBadge) orientationBadge.textContent = "PALM";
    return;
  }

  const primaryHand = gestureState.hands[0];
  const g = primaryHand.stableGesture;

  // Update gesture label in debug badge
  if (gestureBadge) {
    gestureBadge.textContent = primaryHand.isGrabbed ? "GRAB" : g;
  }

  // Update orientation badge (Palm vs Back)
  if (orientationBadge) {
    const isBack = primaryHand.turnRatio > 0.5;
    orientationBadge.textContent = isBack ? "BACK (BLUE)" : "PALM (ORANGE)";
    orientationBadge.className = isBack ? "badge-tag tag-blue" : "badge-tag tag-orange";
  }

  if (gestureState.isTwoHandsOpen) {
    const dist = Math.round(gestureState.twoHandConnection.dist);
    statusText.textContent = `TWO-HANDED PORTAL STRETCH (${dist}px)`;
    return;
  }

  if (primaryHand.isGrabbed) {
    statusText.textContent = "GRAB: RING STICKS TO PINCH POINT (DRAG TO MOVE)";
  } else if (g === "PEACE") {
    statusText.textContent = "PEACE: ORBITING SECONDARY RING ACTIVE";
  } else if (g === "THREE_FINGERS") {
    statusText.textContent = gestureState.runesState ? "THREE FINGERS: RUNES & MANDALAS ON" : "THREE FINGERS: RUNES CONCEALED";
  } else if (g === "POINT") {
    statusText.textContent = "POINTING: DRAWING SPARK TRAIL (CLOSE LOOP TO IGNITE)";
  } else if (g === "FIST") {
    statusText.textContent = "CLOSED FIST: PORTAL COLLAPSED (SPARK IMPLOSION)";
  } else if (g === "OPEN_PALM") {
    const scaleStr = primaryHand.scaleMultiplier.toFixed(2);
    const colorStr = primaryHand.turnRatio > 0.5 ? "CYAN-BLUE" : "ELDRITCH ORANGE";
    statusText.textContent = `OPEN PALM: SLING RING ACTIVE (${scaleStr}x SCALE, ${colorStr})`;
  } else {
    statusText.textContent = `GESTURE: ${g}`;
  }
}

// UI Event Listeners
startBtn.addEventListener("click", startWebcamApp);
testModeBtn.addEventListener("click", startTestMode);
fallbackTestBtn.addEventListener("click", startTestMode);

closeErrorBtn.addEventListener("click", () => {
  errorModal.classList.add("hidden");
  startOverlay.classList.remove("hidden");
});

debugToggleBtn.addEventListener("click", () => {
  isDebugMode = !isDebugMode;
  debugToggleBtn.classList.toggle("active", isDebugMode);
  debugToggleBtn.setAttribute("aria-pressed", isDebugMode);
});

audioToggleBtn.addEventListener("click", () => {
  const isMuted = audioManager.toggleMute();
  audioToggleBtn.classList.toggle("muted", isMuted);
  audioToggleBtn.innerHTML = isMuted ? "🔇 SOUND OFF" : "🔊 SOUND ON";
});

// Color Mode Switcher ("Auto (turn hand)", "Fixed orange", "Fixed blue")
if (colorModeSelector) {
  colorModeSelector.addEventListener("click", (e) => {
    const btn = e.target.closest(".color-mode-btn");
    if (!btn) return;

    document.querySelectorAll(".color-mode-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const mode = btn.dataset.colormode;
    portalRenderer.setColorMode(mode);
  });
}

// Global Keyboard shortcuts
window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (key === "d") {
    debugToggleBtn.click();
  } else if (key === "m") {
    audioToggleBtn.click();
  } else if (key === "o") {
    // Cycle color modes
    const modes = ["auto", "fixed-orange", "fixed-blue"];
    const currentMode = portalRenderer.colorMode;
    const nextIdx = (modes.indexOf(currentMode) + 1) % modes.length;
    const nextBtn = document.querySelector(`.color-mode-btn[data-colormode="${modes[nextIdx]}"]`);
    if (nextBtn) nextBtn.click();
  }
});
