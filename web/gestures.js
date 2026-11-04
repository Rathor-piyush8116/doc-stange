/**
 * gestures.js - Doctor Strange Mystic Gesture Recognition Engine
 * Detects:
 * 1. Finger Extension: Tip farther from wrist (0) than PIP joint
 * 2. Hand Orientation (Palm vs Back of Hand) via 3D Cross Product of 0->5 and 0->17
 * 3. Specific Finger Gestures with 5-Frame Stability Filter:
 *    - POINT (Index only): Traces glowing sparks in air, closes into full portal
 *    - PEACE (Index + Middle): Spawns smaller secondary orbiting ring
 *    - GRAB (Thumb + Index pinch with hysteresis): Sticks ring to pinch point
 *    - THREE_FINGERS (Index + Middle + Ring): Toggles runic/mandala symbols
 *    - FLICK (Fast index fingertip movement): Shoots sparks off in that direction
 *    - OPEN_PALM: Primary sling ring follows palm center
 *    - FIST: Implosion / collapse animation
 * 4. Dual Hand Stretched Dimensional Portal
 * 5. Quick Push Shockwave
 */

export class GestureRecognizer {
  constructor() {
    // 5-Frame gesture stability buffers per hand (handId -> Array of 5 gestures)
    this.gestureHistories = new Map();

    // Hysteresis state for Thumb+Index pinch grab (handId -> boolean)
    this.grabStates = new Map();
    this.PINCH_GRAB_THRESHOLD = 40;    // px: distance to trigger grab
    this.PINCH_RELEASE_THRESHOLD = 62; // px: distance to release grab

    // Circle drawing tracker state (handId -> Array of [{x, y, time}])
    this.circleTrails = new Map();
    this.circleCompleteCooldown = 0;

    // Index fingertip velocity tracker for FLICK detection (handId -> [{x, y, time}])
    this.indexFingertipHistories = new Map();
    this.lastFlickTime = 0;
    this.FLICK_SPEED_THRESHOLD = 1500; // px/sec

    // Three fingers runes toggle debounce
    this.runesToggledState = true;
    this.lastRunesToggleTime = 0;

    // Push velocity tracker per hand
    this.handHistories = new Map();
    this.lastPushTime = 0;
  }

  /**
   * Main analysis method called every frame
   * @param {Array} hands Array of smoothed hands with 21 landmarks
   * @param {number} timestamp performance.now()
   * @returns {Object} Full gesture analysis state
   */
  analyze(hands, timestamp) {
    const analyzedHands = [];
    let isTwoHandsOpen = false;
    let twoHandConnection = null;
    let triggeredShockwave = false;
    let triggeredFlick = null;
    let runesToggleRequested = false;

    hands.forEach((hand, index) => {
      const lms = hand.landmarks;
      const handId = hand.id !== undefined ? hand.id : index;

      // 1. Palm Center (Landmark 9: Middle Finger MCP base)
      const palmCenter = {
        x: lms[9].x,
        y: lms[9].y,
        z: lms[9].z
      };

      // Palm span (wrist to middle MCP) for scale baseline
      const palmSpan = Math.hypot(lms[9].x - lms[0].x, lms[9].y - lms[0].y);

      // 2. Hand Orientation: Palm vs Back of Hand via 3D Cross Product
      const orientationData = this._detectHandOrientation(lms, hand.handedness);

      // 3. Finger Extension Detection
      // A finger is "up" if its tip is farther from the wrist (0) than its PIP joint
      const fingersExtended = this._checkFingersExtended(lms);

      // 4. Pinch Distance & Grab with Hysteresis
      const pinchDist = Math.hypot(lms[4].x - lms[8].x, lms[4].y - lms[8].y);
      const isGrabbed = this._updateGrabState(handId, pinchDist);
      const pinchPoint = {
        x: (lms[4].x + lms[8].x) / 2,
        y: (lms[4].y + lms[8].y) / 2
      };

      // Scale multiplier from pinch spread (when not grabbed)
      const normalizedPinchRatio = Math.max(0, (pinchDist - 28) / (190 - 28));
      const scaleMultiplier = Math.max(0.35, Math.min(2.5, 0.4 + normalizedPinchRatio * 1.8));

      // 5. Hand Tilt Rotation: angle from wrist (0) to middle finger base (9)
      const tiltAngle = Math.atan2(lms[9].y - lms[0].y, lms[9].x - lms[0].x) + Math.PI / 2;

      // 6. Classify Raw Finger Gesture for this Frame
      const rawGesture = this._classifyRawGesture(fingersExtended, isGrabbed);

      // 7. Apply 5-Frame Stability Filter to Prevent Flicker
      const stableGesture = this._updateGestureStability(handId, rawGesture);

      // 8. Check Flick of the Index Finger (fast fingertip movement)
      const flickData = this._checkIndexFlick(handId, lms[8], fingersExtended.index, timestamp);
      if (flickData) {
        triggeredFlick = {
          handId,
          origin: { x: lms[8].x, y: lms[8].y },
          direction: flickData.direction,
          speed: flickData.speed
        };
      }

      // 9. Check Three-Finger Runes Toggle
      if (stableGesture === "THREE_FINGERS" && timestamp - this.lastRunesToggleTime > 700) {
        this.lastRunesToggleTime = timestamp;
        this.runesToggledState = !this.runesToggledState;
        runesToggleRequested = true;
      }

      // 10. Circle Drawing Detection (Index finger drawing in air)
      const isDrawingPointing = stableGesture === "POINT";
      const circleStatus = this._updateCircleDrawing(handId, lms[8], isDrawingPointing, timestamp);

      // 11. Quick Push toward Camera Detection
      const pushDetected = this._checkPushTowardCamera(handId, palmSpan, lms[0].z, lms[9], timestamp);
      if (pushDetected) {
        triggeredShockwave = true;
      }

      analyzedHands.push({
        id: handId,
        handedness: hand.handedness,
        palmCenter,
        palmSpan,
        fingersExtended,
        rawGesture,
        stableGesture,
        isGrabbed,
        pinchPoint,
        pinchDist,
        scaleMultiplier,
        tiltAngle,
        orientation: orientationData.orientation,       // 'PALM' or 'BACK'
        turnRatio: orientationData.turnRatio,           // 0.0 (palm) to 1.0 (back of hand)
        indexTip: { x: lms[8].x, y: lms[8].y },
        thumbTip: { x: lms[4].x, y: lms[4].y },
        wrist: { x: lms[0].x, y: lms[0].y },
        circleStatus,
        pushDetected
      });
    });

    // 12. Two Hands Open Gesture: Stretches portal between them
    if (analyzedHands.length >= 2) {
      const h1 = analyzedHands[0];
      const h2 = analyzedHands[1];
      const h1Open = h1.stableGesture === "OPEN_PALM" || h1.stableGesture === "PEACE";
      const h2Open = h2.stableGesture === "OPEN_PALM" || h2.stableGesture === "PEACE";

      if (h1Open && h2Open) {
        isTwoHandsOpen = true;
        const dist = Math.hypot(h1.palmCenter.x - h2.palmCenter.x, h1.palmCenter.y - h2.palmCenter.y);
        const midPoint = {
          x: (h1.palmCenter.x + h2.palmCenter.x) / 2,
          y: (h1.palmCenter.y + h2.palmCenter.y) / 2
        };
        const angle = Math.atan2(h2.palmCenter.y - h1.palmCenter.y, h2.palmCenter.x - h1.palmCenter.x);

        twoHandConnection = {
          hand1: h1,
          hand2: h2,
          dist,
          midPoint,
          angle,
          stretchFactor: Math.min(2.2, Math.max(0.6, dist / 350))
        };
      }
    }

    // Clean up stale histories
    this._cleanStaleHistories(timestamp);

    return {
      hands: analyzedHands,
      isTwoHandsOpen,
      twoHandConnection,
      triggeredShockwave,
      triggeredFlick,
      runesToggleRequested,
      runesState: this.runesToggledState
    };
  }

  /**
   * Detect hand orientation (Palm facing camera vs Back of hand facing camera)
   * Using the 3D cross product of vectors:
   * v1 = wrist (0) -> index base (5)
   * v2 = wrist (0) -> pinky base (17)
   * taking handedness into account.
   */
  _detectHandOrientation(lms, handedness) {
    const p0 = lms[0];
    const p5 = lms[5];
    const p17 = lms[17];

    // Vector 0 -> 5 (wrist to index MCP)
    const v1x = p5.x - p0.x;
    const v1y = p5.y - p0.y;
    const v1z = p5.z - p0.z;

    // Vector 0 -> 17 (wrist to pinky MCP)
    const v2x = p17.x - p0.x;
    const v2y = p17.y - p0.y;
    const v2z = p17.z - p0.z;

    // 3D Cross Product: N = v1 x v2
    const nx = v1y * v2z - v1z * v2y;
    const ny = v1z * v2x - v1x * v2z;
    const nz = v1x * v2y - v1y * v2x; // 2D signed area component

    const norm = Math.hypot(nx, ny, nz) || 1;
    const unitZ = nz / norm;

    // In mirrored display coordinates:
    // For Right Hand: palm facing camera produces positive normal z
    // For Left Hand: handedness is inverted, so negate sign
    const isLeft = (handedness || "").toLowerCase().includes("left");
    const handednessMultiplier = isLeft ? -1.0 : 1.0;
    const signedZ = unitZ * handednessMultiplier;

    // signedZ > 0 means Palm is facing camera; signedZ < 0 means Back of Hand faces camera
    // Map signedZ smoothly from [-0.65, 0.65] to turnRatio [1.0 (back), 0.0 (palm)]
    const clamped = Math.max(-0.65, Math.min(0.65, signedZ));
    const turnRatio = Math.max(0, Math.min(1, (0.65 - clamped) / 1.3));

    const orientation = turnRatio > 0.5 ? "BACK" : "PALM";

    return {
      orientation,
      turnRatio,
      normalZ: signedZ
    };
  }

  /**
   * Evaluates finger extension:
   * "a finger is 'up' if its tip is farther from the wrist than its PIP joint"
   */
  _checkFingersExtended(lms) {
    const wrist = lms[0];
    const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

    return {
      // Thumb: tip (4) farther from wrist than IP joint (3)
      thumb: dist(lms[4], wrist) > dist(lms[3], wrist) * 1.08,
      // Index: tip (8) farther from wrist than PIP joint (6)
      index: dist(lms[8], wrist) > dist(lms[6], wrist) * 1.06,
      // Middle: tip (12) farther from wrist than PIP joint (10)
      middle: dist(lms[12], wrist) > dist(lms[10], wrist) * 1.06,
      // Ring: tip (16) farther from wrist than PIP joint (14)
      ring: dist(lms[16], wrist) > dist(lms[14], wrist) * 1.06,
      // Pinky: tip (20) farther from wrist than PIP joint (18)
      pinky: dist(lms[20], wrist) > dist(lms[18], wrist) * 1.06
    };
  }

  /**
   * Thumb + Index pinch grab with hysteresis to prevent flickering
   */
  _updateGrabState(handId, pinchDist) {
    const currentlyGrabbed = this.grabStates.get(handId) || false;

    if (!currentlyGrabbed) {
      if (pinchDist < this.PINCH_GRAB_THRESHOLD) {
        this.grabStates.set(handId, true);
        return true;
      }
      return false;
    } else {
      if (pinchDist > this.PINCH_RELEASE_THRESHOLD) {
        this.grabStates.set(handId, false);
        return false;
      }
      return true;
    }
  }

  /**
   * Classifies raw finger gesture configuration for current frame
   */
  _classifyRawGesture(fingers, isGrabbed) {
    // 1. Grab (Thumb + Index pinch)
    if (isGrabbed) {
      return "GRAB";
    }

    // 2. Closed Fist: no fingers up
    if (!fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky) {
      return "FIST";
    }

    // 3. Index finger only (pointing)
    if (fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky) {
      return "POINT";
    }

    // 4. Index + Middle fingers (peace sign)
    if (fingers.index && fingers.middle && !fingers.ring && !fingers.pinky) {
      return "PEACE";
    }

    // 5. Three fingers up (index, middle, ring)
    if (fingers.index && fingers.middle && fingers.ring && !fingers.pinky) {
      return "THREE_FINGERS";
    }

    // 6. Open Palm: 3 or 4 fingers up
    const openCount = [fingers.index, fingers.middle, fingers.ring, fingers.pinky].filter(Boolean).length;
    if (openCount >= 3) {
      return "OPEN_PALM";
    }

    return "IDLE";
  }

  /**
   * Requires a gesture to be stable across ~5 frames before triggering
   */
  _updateGestureStability(handId, rawGesture) {
    if (!this.gestureHistories.has(handId)) {
      this.gestureHistories.set(handId, []);
    }

    const history = this.gestureHistories.get(handId);
    history.push(rawGesture);

    // Keep 5-frame sliding window
    while (history.length > 5) {
      history.shift();
    }

    if (history.length < 5) {
      return history[history.length - 1];
    }

    // Count frequency of each gesture in 5-frame window
    const counts = {};
    history.forEach(g => {
      counts[g] = (counts[g] || 0) + 1;
    });

    let bestGesture = rawGesture;
    let maxCount = 0;
    for (const [gesture, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        bestGesture = gesture;
      }
    }

    // Require at least 4 out of 5 frames to switch stable gesture
    return maxCount >= 4 ? bestGesture : history[history.length - 2] || rawGesture;
  }

  /**
   * Flick of the index finger: detects sudden high fingertip velocity
   */
  _checkIndexFlick(handId, indexTip, isIndexExtended, timestamp) {
    if (!this.indexFingertipHistories.has(handId)) {
      this.indexFingertipHistories.set(handId, []);
    }

    const history = this.indexFingertipHistories.get(handId);
    history.push({ x: indexTip.x, y: indexTip.y, time: timestamp });

    // Keep last 120ms window (roughly 4-8 frames)
    while (history.length > 0 && timestamp - history[0].time > 120) {
      history.shift();
    }

    if (!isIndexExtended || history.length < 3) return null;

    const oldest = history[0];
    const latest = history[history.length - 1];
    const dt = (latest.time - oldest.time) / 1000;
    if (dt <= 0.02) return null;

    const dx = latest.x - oldest.x;
    const dy = latest.y - oldest.y;
    const dist = Math.hypot(dx, dy);
    const speed = dist / dt;

    if (speed > this.FLICK_SPEED_THRESHOLD && timestamp - this.lastFlickTime > 400) {
      this.lastFlickTime = timestamp;
      history.length = 0; // Reset history after trigger

      return {
        speed,
        direction: {
          x: dx / dist,
          y: dy / dist
        }
      };
    }

    return null;
  }

  /**
   * Tracks index finger trajectory to detect complete circular drawing in the air
   */
  _updateCircleDrawing(handId, indexTip, isPointing, timestamp) {
    if (!this.circleTrails.has(handId)) {
      this.circleTrails.set(handId, []);
    }

    const trail = this.circleTrails.get(handId);

    if (!isPointing) {
      if (trail.length > 0) trail.shift();
      return { isDrawing: false, completed: false, trailPoints: trail };
    }

    trail.push({ x: indexTip.x, y: indexTip.y, time: timestamp });

    const maxAge = 1900;
    while (trail.length > 0 && timestamp - trail[0].time > maxAge) {
      trail.shift();
    }
    if (trail.length > 85) trail.shift();

    if (trail.length < 18) {
      return { isDrawing: true, completed: false, trailPoints: trail };
    }

    let sumX = 0;
    let sumY = 0;
    trail.forEach(pt => {
      sumX += pt.x;
      sumY += pt.y;
    });
    const centerX = sumX / trail.length;
    const centerY = sumY / trail.length;

    let cumulativeAngle = 0;
    let prevAngle = null;
    let totalRadius = 0;

    for (let i = 0; i < trail.length; i++) {
      const pt = trail[i];
      const dx = pt.x - centerX;
      const dy = pt.y - centerY;
      const r = Math.hypot(dx, dy);
      totalRadius += r;

      const angle = Math.atan2(dy, dx);
      if (prevAngle !== null) {
        let diff = angle - prevAngle;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        cumulativeAngle += diff;
      }
      prevAngle = angle;
    }

    const avgRadius = totalRadius / trail.length;
    const totalSweep = Math.abs(cumulativeAngle);
    const startPoint = trail[0];
    const endPoint = trail[trail.length - 1];
    const closeDistance = Math.hypot(startPoint.x - endPoint.x, startPoint.y - endPoint.y);

    const isFullLoop = totalSweep >= 4.9 && avgRadius >= 40 && avgRadius <= 380;
    const isClosed = closeDistance < avgRadius * 1.25 || totalSweep >= 5.8;

    if (isFullLoop && isClosed && timestamp - this.circleCompleteCooldown > 1200) {
      this.circleCompleteCooldown = timestamp;
      this.circleTrails.set(handId, []);

      return {
        isDrawing: false,
        completed: true,
        center: { x: centerX, y: centerY },
        radius: avgRadius,
        trailPoints: []
      };
    }

    return {
      isDrawing: true,
      completed: false,
      center: { x: centerX, y: centerY },
      radius: avgRadius,
      trailPoints: trail
    };
  }

  /**
   * Detects rapid forward thrust / push towards camera
   */
  _checkPushTowardCamera(handId, palmSpan, rawZ, palmCenter, timestamp) {
    if (!this.handHistories.has(handId)) {
      this.handHistories.set(handId, []);
    }

    const history = this.handHistories.get(handId);
    history.push({ span: palmSpan, z: rawZ, time: timestamp, x: palmCenter.x, y: palmCenter.y });

    while (history.length > 0 && timestamp - history[0].time > 180) {
      history.shift();
    }

    if (history.length < 4) return false;

    const oldest = history[0];
    const dt = (timestamp - oldest.time) / 1000;
    if (dt <= 0.03) return false;

    const spanGrowthRate = (palmSpan - oldest.span) / oldest.span / dt;

    if (spanGrowthRate > 1.85 && timestamp - this.lastPushTime > 900) {
      this.lastPushTime = timestamp;
      history.length = 0;
      return true;
    }

    return false;
  }

  /**
   * Clean up stale hand histories
   */
  _cleanStaleHistories(timestamp) {
    for (const [handId, history] of this.handHistories.entries()) {
      if (history.length > 0 && timestamp - history[history.length - 1].time > 1000) {
        this.handHistories.delete(handId);
      }
    }
    for (const [handId, trail] of this.circleTrails.entries()) {
      if (trail.length > 0 && timestamp - trail[trail.length - 1].time > 2000) {
        this.circleTrails.delete(handId);
      }
    }
    for (const [handId, history] of this.indexFingertipHistories.entries()) {
      if (history.length > 0 && timestamp - history[history.length - 1].time > 1000) {
        this.indexFingertipHistories.delete(handId);
      }
    }
    for (const [handId, history] of this.gestureHistories.entries()) {
      if (history.length > 0 && this.handHistories.has(handId) === false) {
        this.gestureHistories.delete(handId);
      }
    }
  }
}
