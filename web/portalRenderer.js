/**
 * portalRenderer.js - High Performance Canvas 2D Mystic Portal Engine
 * Features:
 * - 60 FPS particle engine with object pooling
 * - Dynamic HSL Color Blending (Orange -> Blue on hand turn)
 * - Color Mode setting: 'auto' (turn hand), 'fixed-orange', 'fixed-blue'
 * - Secondary smaller orbiting ring for PEACE gesture
 * - Grab & Drag ring adhering to pinch point
 * - Toggleable inner Kamar-Taj runic mandala (Three Fingers gesture)
 * - High-speed spark fountain blast for FLICK gesture
 * - Stretched dimensional bridge between dual open hands
 * - Fiery shockwave rings & screen flash on push gesture
 * - Additive blending ('lighter') with glowing ember trails
 */

/**
 * Interpolates between two HSL values
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Converts HSL values to CSS string
 */
function hsl(h, s, l, a = 1.0) {
  return a < 1.0 ? `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${a})` : `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

class Spark {
  constructor() {
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.size = 2;
    this.life = 1.0;
    this.decay = 0.02;
    this.palette = null;
    this.gravity = 0.08;
    this.friction = 0.96;
    this.trail = [];
    this.maxTrail = 4;
  }

  init(x, y, vx, vy, size, decay, palette, gravity = 0.08) {
    this.active = true;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.size = size;
    this.life = 1.0;
    this.decay = decay;
    this.palette = palette;
    this.gravity = gravity;
    this.trail = [{ x, y }];
  }

  update() {
    if (!this.active) return;

    this.trail.unshift({ x: this.x, y: this.y });
    if (this.trail.length > this.maxTrail) {
      this.trail.pop();
    }

    this.x += this.vx;
    this.y += this.vy;
    this.vx *= this.friction;
    this.vy = this.vy * this.friction + this.gravity;
    this.life -= this.decay;

    if (this.life <= 0) {
      this.active = false;
      this.trail = [];
    }
  }

  draw(ctx) {
    if (!this.active || this.life <= 0) return;

    const p = this.palette;
    let strokeCol = p.ember;
    if (this.life > 0.72) strokeCol = p.core;
    else if (this.life > 0.42) strokeCol = p.bright;
    else if (this.life > 0.22) strokeCol = p.primary;
    else strokeCol = p.deep;

    ctx.save();
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = Math.max(1, this.size * this.life);
    ctx.lineCap = "round";

    if (this.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      for (let i = 0; i < this.trail.length; i++) {
        ctx.lineTo(this.trail[i].x, this.trail[i].y);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = strokeCol;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * this.life, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

export class PortalRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });

    // Color mode: 'auto' (turn hand), 'fixed-orange', 'fixed-blue'
    this.colorMode = "auto";

    // Current color blend ratio (0.0 = classic orange, 1.0 = mystic blue)
    this.colorBlend = 0.0;
    this.activePalette = this._computePalette(0.0);

    // High performance particle object pool (1500 reusable sparks)
    this.poolSize = 1500;
    this.sparkPool = [];
    for (let i = 0; i < this.poolSize; i++) {
      this.sparkPool.push(new Spark());
    }

    // Portal state per hand
    this.portals = new Map();

    // Secondary orbiting ring state per hand
    this.orbitAngles = new Map();

    // Shockwaves
    this.shockwaves = [];
    this.screenFlash = 0;
    this.spinDegree = 0;
  }

  /**
   * Set color mode: 'auto' (turn hand), 'fixed-orange', 'fixed-blue'
   */
  setColorMode(mode) {
    this.colorMode = mode;
  }

  /**
   * Computes dynamic HSL palette interpolated between Orange and Cyan-Blue
   * @param {number} t Ratio between 0.0 (orange) and 1.0 (blue)
   */
  _computePalette(t) {
    const clampedT = Math.max(0, Math.min(1, t));

    // Orange -> Cyan-Blue HSL interpolation
    // Bright: Gold (48 deg) -> Cyan (190 deg)
    const brightH = lerp(48, 190, clampedT);
    const brightL = lerp(70, 82, clampedT);

    // Primary: Fiery Orange (35 deg) -> Electric Blue (195 deg)
    const primH = lerp(35, 195, clampedT);
    const primL = lerp(50, 52, clampedT);

    // Deep: Red-Orange (18 deg) -> Royal Blue (215 deg)
    const deepH = lerp(18, 215, clampedT);
    const deepL = lerp(45, 42, clampedT);

    // Ember: Dark Ember (12 deg) -> Deep Navy (225 deg)
    const emberH = lerp(12, 225, clampedT);
    const emberL = lerp(25, 25, clampedT);

    // Glow RGBA
    const r = Math.round(lerp(255, 0, clampedT));
    const g = Math.round(lerp(140, 212, clampedT));
    const b = Math.round(lerp(0, 255, clampedT));

    return {
      t: clampedT,
      core: "#ffffff",
      bright: hsl(brightH, 100, brightL),
      primary: hsl(primH, 100, primL),
      deep: hsl(deepH, 100, deepL),
      ember: hsl(emberH, 100, emberL),
      glowRgba: `rgba(${r}, ${g}, ${b}, 0.45)`,
      rgb: { r, g, b }
    };
  }

  /**
   * Update color blend ratio smoothly over ~0.3 seconds (lerp ~0.15 per frame at 60fps)
   */
  updateColorBlend(handTurnRatio = 0.0) {
    let target = 0.0;

    if (this.colorMode === "fixed-orange") {
      target = 0.0;
    } else if (this.colorMode === "fixed-blue") {
      target = 1.0;
    } else {
      // Auto: driven by hand orientation (palm facing camera vs back of hand)
      target = handTurnRatio;
    }

    // Smooth lerp over ~0.3s
    this.colorBlend += (target - this.colorBlend) * 0.16;
    this.activePalette = this._computePalette(this.colorBlend);
  }

  /**
   * Spawns spark from object pool
   */
  spawnSpark(x, y, vx, vy, size = 2.5, decay = 0.03, gravity = 0.08) {
    for (let i = 0; i < this.poolSize; i++) {
      const s = this.sparkPool[i];
      if (!s.active) {
        s.init(x, y, vx, vy, size, decay, this.activePalette, gravity);
        return s;
      }
    }
    return null;
  }

  /**
   * Shoots high-velocity spark burst in the direction of the finger flick
   */
  spawnFlickBurst(originX, originY, dirX, dirY, speed = 1200) {
    const count = 42;
    const baseAngle = Math.atan2(dirY, dirX);
    const speedScale = Math.min(22, Math.max(9, speed / 110));

    for (let i = 0; i < count; i++) {
      // Spread in a cone of +/- 28 degrees
      const coneAngle = baseAngle + (Math.random() - 0.5) * 0.48;
      const velocity = (Math.random() * 0.65 + 0.7) * speedScale;
      const vx = Math.cos(coneAngle) * velocity;
      const vy = Math.sin(coneAngle) * velocity;

      this.spawnSpark(
        originX + (Math.random() - 0.5) * 10,
        originY + (Math.random() - 0.5) * 10,
        vx,
        vy,
        Math.random() * 3.8 + 2.0,
        Math.random() * 0.035 + 0.02,
        0.05
      );
    }
  }

  /**
   * Triggers expanding shockwave ring and screen flash
   */
  triggerShockwave(x, y, maxRadius = 550) {
    this.shockwaves.push({
      x,
      y,
      radius: 20,
      maxRadius,
      life: 1.0,
      decay: 0.024
    });

    this.screenFlash = 0.85;

    const burstCount = 65;
    for (let i = 0; i < burstCount; i++) {
      const angle = (Math.PI * 2 * i) / burstCount + (Math.random() - 0.5) * 0.15;
      const speed = Math.random() * 12 + 6;
      this.spawnSpark(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        Math.random() * 3.5 + 2,
        Math.random() * 0.025 + 0.015,
        0.02
      );
    }
  }

  /**
   * Triggers implosion collapse spark burst when fist closes
   */
  triggerCollapseBurst(x, y, radius) {
    const count = 40;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius * 0.7;
      const sx = x + Math.cos(angle) * dist;
      const sy = y + Math.sin(angle) * dist;
      const toCenterX = x - sx;
      const toCenterY = y - sy;
      const d = Math.hypot(toCenterX, toCenterY) || 1;
      const speed = Math.random() * 9 + 4;

      this.spawnSpark(
        sx,
        sy,
        (toCenterX / d) * speed,
        (toCenterY / d) * speed,
        Math.random() * 3 + 1.5,
        Math.random() * 0.04 + 0.03,
        0
      );
    }
  }

  /**
   * Main render loop called every frame
   */
  render(videoElement, gestureState) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 1. Draw mirrored webcam feed
    if (videoElement && videoElement.readyState >= 2) {
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(videoElement, 0, 0, w, h);
      ctx.restore();

      // Atmospheric dark vignette
      ctx.save();
      const vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      vignette.addColorStop(0, "rgba(4, 6, 12, 0.18)");
      vignette.addColorStop(1, "rgba(2, 4, 8, 0.75)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    } else {
      ctx.fillStyle = "#060810";
      ctx.fillRect(0, 0, w, h);
    }

    this.spinDegree = (this.spinDegree + 2.4) % 360;

    // Update dynamic color blend based on primary hand's orientation
    const primaryHand = (gestureState && gestureState.hands && gestureState.hands[0]) || null;
    const handTurnRatio = primaryHand ? primaryHand.turnRatio : 0.0;
    this.updateColorBlend(handTurnRatio);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // 2. Render Circle Drawing Trail (Pointing gesture)
    if (gestureState && gestureState.hands) {
      gestureState.hands.forEach(hand => {
        if (hand.circleStatus && hand.circleStatus.trailPoints && hand.circleStatus.trailPoints.length > 1) {
          this._drawCircleTrail(ctx, hand.circleStatus.trailPoints);
        }
      });
    }

    // 3. Render Two Hands Stretched Dimensional Bridge
    if (gestureState && gestureState.isTwoHandsOpen && gestureState.twoHandConnection) {
      this._drawTwoHandBridge(ctx, gestureState.twoHandConnection);
    }

    // 4. Update and Render Portals for each detected hand
    const activeHandIds = new Set();
    const runesState = gestureState ? gestureState.runesState : true;

    if (gestureState && gestureState.hands) {
      gestureState.hands.forEach(hand => {
        activeHandIds.add(hand.id);
        this._updateAndRenderHandPortal(ctx, hand, runesState);
      });
    }

    // Clean up or fade out removed portals
    for (const [id, portal] of this.portals.entries()) {
      if (!activeHandIds.has(id)) {
        portal.scale += (0 - portal.scale) * 0.2;
        if (portal.scale > 0.02) {
          this._drawSlingRing(ctx, portal.x, portal.y, portal.radius, portal.rotation, portal.scale, portal.showRunes);
        } else {
          this.portals.delete(id);
          this.orbitAngles.delete(id);
        }
      }
    }

    // 5. Render Fiery Shockwaves
    this._renderShockwaves(ctx);

    // 6. Update and Render All Sparks
    for (let i = 0; i < this.poolSize; i++) {
      const s = this.sparkPool[i];
      if (s.active) {
        s.update();
        s.draw(ctx);
      }
    }

    // 7. Render Screen Flash (Push shockwave trigger)
    if (this.screenFlash > 0.01) {
      const p = this.activePalette;
      ctx.fillStyle = `rgba(${p.rgb.r}, ${p.rgb.g}, ${p.rgb.b}, ${this.screenFlash * 0.35})`;
      ctx.fillRect(0, 0, w, h);
      this.screenFlash *= 0.88;
    }

    ctx.restore();
  }

  /**
   * Update and render individual hand portal with grab, pinch scaling, and peace orbit
   */
  _updateAndRenderHandPortal(ctx, hand, runesState) {
    if (!this.portals.has(hand.id)) {
      this.portals.set(hand.id, {
        x: hand.palmCenter.x,
        y: hand.palmCenter.y,
        radius: 125,
        rotation: hand.tiltAngle || 0,
        scale: 0.0,
        orbitScale: 0.0,
        wasClosedFist: false,
        showRunes: true,
        runesAlpha: 1.0
      });
    }

    const portal = this.portals.get(hand.id);

    // Update runes visibility flag
    portal.showRunes = runesState;
    const targetRunesAlpha = portal.showRunes ? 1.0 : 0.0;
    portal.runesAlpha += (targetRunesAlpha - portal.runesAlpha) * 0.15;

    // 1. POSITIONING:
    // If grabbed (Thumb + Index pinch), portal sticks to pinch point!
    // Otherwise, follows smoothed palm center (landmark 9).
    const targetPos = hand.isGrabbed ? hand.pinchPoint : hand.palmCenter;
    const followLerp = hand.isGrabbed ? 0.65 : 0.35;
    portal.x += (targetPos.x - portal.x) * followLerp;
    portal.y += (targetPos.y - portal.y) * followLerp;

    // 2. ROTATION:
    const targetRot = (hand.tiltAngle || 0) + (this.spinDegree * Math.PI) / 180;
    portal.rotation = targetRot;

    // 3. SCALE DYNAMICS:
    const targetRadius = Math.max(75, Math.min(320, 120 * hand.scaleMultiplier));
    portal.radius += (targetRadius - portal.radius) * 0.25;

    // 4. CLOSED FIST / OPEN VISIBILITY:
    const isFist = hand.stableGesture === "FIST";
    if (isFist) {
      if (!portal.wasClosedFist && portal.scale > 0.25) {
        this.triggerCollapseBurst(portal.x, portal.y, portal.radius * portal.scale);
      }
      portal.wasClosedFist = true;
      portal.scale += (0 - portal.scale) * 0.35;
    } else {
      portal.wasClosedFist = false;
      // Show portal for open palm, grab, peace sign, three fingers, or circle drawing
      const activePosture = hand.isOpenPalm || hand.isGrabbed || hand.stableGesture === "PEACE" || hand.stableGesture === "THREE_FINGERS" || (hand.circleStatus && hand.circleStatus.isDrawing);
      const targetScale = activePosture ? 1.0 : 0.0;
      portal.scale += (targetScale - portal.scale) * 0.22;
    }

    // 5. ORBITING SECONDARY RING FOR PEACE GESTURE:
    const isPeace = hand.stableGesture === "PEACE";
    const targetOrbitScale = isPeace ? 1.0 : 0.0;
    portal.orbitScale += (targetOrbitScale - portal.orbitScale) * 0.2;

    // Render Main Sling Ring
    if (portal.scale > 0.02) {
      this._drawSlingRing(ctx, portal.x, portal.y, portal.radius, portal.rotation, portal.scale, portal.runesAlpha);
      this._emitRimSparks(portal.x, portal.y, portal.radius * portal.scale, portal.rotation);

      // Render Orbiting Secondary Ring if active
      if (portal.orbitScale > 0.02) {
        this._renderOrbitingRing(ctx, hand.id, portal.x, portal.y, portal.radius * portal.scale, portal.orbitScale);
      }
    }
  }

  /**
   * Renders smaller secondary ring that orbits around the main ring (PEACE sign)
   */
  _renderOrbitingRing(ctx, handId, cx, cy, mainRadius, orbitScale) {
    if (!this.orbitAngles.has(handId)) {
      this.orbitAngles.set(handId, 0);
    }

    let angle = this.orbitAngles.get(handId);
    angle += 0.045; // Orbit speed
    this.orbitAngles.set(handId, angle);

    const orbitDist = mainRadius * 1.55;
    const ox = cx + Math.cos(angle) * orbitDist;
    const oy = cy + Math.sin(angle) * orbitDist;
    const oRadius = mainRadius * 0.38 * orbitScale;

    // Draw secondary orbiting ring
    this._drawSlingRing(ctx, ox, oy, oRadius, -angle * 2, orbitScale, 0.6);
    this._emitRimSparks(ox, oy, oRadius, -angle * 2, 2);

    // Orbit connecting energy tether
    const p = this.activePalette;
    ctx.save();
    ctx.strokeStyle = p.bright;
    ctx.lineWidth = 1.5 * orbitScale;
    ctx.shadowColor = p.primary;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * mainRadius, cy + Math.sin(angle) * mainRadius);
    ctx.lineTo(ox, oy);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draws the Doctor Strange Sling Ring with dynamic HSL palette and toggleable runic mandala
   */
  _drawSlingRing(ctx, cx, cy, baseRadius, rotation, scale, runesAlpha = 1.0) {
    const r = baseRadius * scale;
    if (r <= 5) return;

    const p = this.activePalette;

    ctx.save();
    ctx.translate(cx, cy);

    // 1. Soft radial backdrop glow
    const glowGrad = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.45);
    glowGrad.addColorStop(0, "rgba(255, 255, 255, 0.12)");
    glowGrad.addColorStop(0.5, p.glowRgba);
    glowGrad.addColorStop(0.85, `rgba(${p.rgb.r}, ${p.rgb.g}, ${p.rgb.b}, 0.12)`);
    glowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.45, 0, Math.PI * 2);
    ctx.fill();

    // 2. Cosmic Dimensional Portal Window
    const portalCoreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.92);
    portalCoreGrad.addColorStop(0, "rgba(10, 14, 28, 0.88)");
    portalCoreGrad.addColorStop(0.7, "rgba(20, 25, 45, 0.75)");
    portalCoreGrad.addColorStop(0.95, p.primary);
    portalCoreGrad.addColorStop(1, p.core);
    ctx.fillStyle = portalCoreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
    ctx.fill();

    // 3. Procedural Sacred Geometry (Runes & Mandalas - toggled by Three Fingers)
    if (runesAlpha > 0.02) {
      ctx.save();
      ctx.globalAlpha = Math.min(1.0, scale * runesAlpha);
      this._drawProceduralMandala(ctx, r, rotation, p);
      ctx.restore();
    }

    // 4. Outer Fiery Perimeter Ring
    ctx.save();
    ctx.lineWidth = 3.5 * scale;
    ctx.strokeStyle = p.bright;
    ctx.shadowColor = p.primary;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    // Secondary intense white core ring
    ctx.lineWidth = 1.8 * scale;
    ctx.strokeStyle = p.core;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.98, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  /**
   * Procedural sacred geometry: rotating Kamar-Taj octagrams, Sanskrit runic dials, tick marks
   */
  _drawProceduralMandala(ctx, r, rotation, p) {
    ctx.save();
    ctx.lineWidth = 1.5;

    // A. Outer Clockwise Runic Dial with Tick Marks
    ctx.save();
    ctx.rotate(rotation * 0.8);
    ctx.strokeStyle = p.bright;
    ctx.shadowColor = p.primary;
    ctx.shadowBlur = 10;

    const ticks = 36;
    for (let i = 0; i < ticks; i++) {
      const angle = (Math.PI * 2 * i) / ticks;
      const isMajor = i % 4 === 0;
      const innerR = isMajor ? r * 0.82 : r * 0.87;
      const outerR = r * 0.94;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * innerR, Math.sin(angle) * innerR);
      ctx.lineTo(Math.cos(angle) * outerR, Math.sin(angle) * outerR);
      ctx.stroke();
    }
    ctx.restore();

    // B. Counter-Rotating Interlocking Sacred Squares (Kamar-Taj Octagram)
    ctx.save();
    ctx.rotate(-rotation * 1.1);
    ctx.strokeStyle = p.primary;
    ctx.lineWidth = 1.8;
    ctx.shadowBlur = 8;

    const sqRadius = r * 0.65;
    this._drawRegularPolygon(ctx, 0, 0, sqRadius, 4, 0);
    this._drawRegularPolygon(ctx, 0, 0, sqRadius, 4, Math.PI / 4);

    // Intersecting Triangles (Hexagram dial inside)
    ctx.strokeStyle = p.deep;
    const triRadius = r * 0.48;
    this._drawRegularPolygon(ctx, 0, 0, triRadius, 3, rotation * 0.5);
    this._drawRegularPolygon(ctx, 0, 0, triRadius, 3, rotation * 0.5 + Math.PI);
    ctx.restore();

    // C. Innermost Glowing Glyph Ring with 8 Mystic Nodes
    ctx.save();
    ctx.rotate(rotation * 1.5);
    ctx.strokeStyle = p.core;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      ctx.fillStyle = p.bright;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.28, Math.sin(a) * r * 0.28, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  }

  _drawRegularPolygon(ctx, cx, cy, radius, sides, startAngle = 0) {
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const angle = startAngle + (Math.PI * 2 * i) / sides;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  /**
   * Emits fiery tangential sparks flying off the rim of the sling ring
   */
  _emitRimSparks(cx, cy, radius, rotation, count = 5) {
    if (radius <= 10) return;

    for (let i = 0; i < count; i++) {
      const nozzleAngle = rotation * 1.8 + (Math.PI * 2 * i) / count;
      const rimX = cx + Math.cos(nozzleAngle) * radius;
      const rimY = cy + Math.sin(nozzleAngle) * radius;

      const tangentAngle = nozzleAngle + Math.PI / 2;
      const flareAngle = tangentAngle + (Math.random() - 0.35) * 0.8;
      const speed = Math.random() * 6.5 + 3.2;

      this.spawnSpark(
        rimX + (Math.random() - 0.5) * 6,
        rimY + (Math.random() - 0.5) * 6,
        Math.cos(flareAngle) * speed,
        Math.sin(flareAngle) * speed,
        Math.random() * 3 + 1.8,
        Math.random() * 0.035 + 0.02,
        0.08
      );
    }
  }

  /**
   * Draws glowing index finger trace trail when drawing a circle in the air
   */
  _drawCircleTrail(ctx, points) {
    if (points.length < 2) return;

    const p = this.activePalette;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.strokeStyle = p.glowRgba;
    ctx.lineWidth = 14;
    ctx.shadowColor = p.primary;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    ctx.strokeStyle = p.core;
    ctx.lineWidth = 3.5;
    ctx.shadowBlur = 8;
    ctx.stroke();

    const head = points[points.length - 1];
    for (let s = 0; s < 3; s++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 4 + 1.5;
      this.spawnSpark(
        head.x,
        head.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        Math.random() * 3 + 1.5,
        Math.random() * 0.04 + 0.02,
        0.05
      );
    }

    ctx.restore();
  }

  /**
   * Draws stretched dimensional gateway between two open hands
   */
  _drawTwoHandBridge(ctx, conn) {
    const { hand1, hand2, dist, midPoint, angle, stretchFactor } = conn;
    const p = this.activePalette;

    ctx.save();
    ctx.translate(midPoint.x, midPoint.y);
    ctx.rotate(angle);

    const halfDist = dist / 2;
    const bowHeight = Math.min(180, dist * 0.38);

    ctx.strokeStyle = p.bright;
    ctx.lineWidth = 3.5;
    ctx.shadowColor = p.primary;
    ctx.shadowBlur = 18;

    // Top arc
    ctx.beginPath();
    ctx.moveTo(-halfDist, -35);
    ctx.quadraticCurveTo(0, -bowHeight, halfDist, -35);
    ctx.stroke();

    // Bottom arc
    ctx.beginPath();
    ctx.moveTo(-halfDist, 35);
    ctx.quadraticCurveTo(0, bowHeight, halfDist, 35);
    ctx.stroke();

    // Center plasma lightning arcs
    ctx.strokeStyle = p.core;
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(-halfDist, 0);

    const segments = 10;
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const px = -halfDist + dist * t;
      const py = (Math.random() - 0.5) * 32 * stretchFactor;
      ctx.lineTo(px, py);
    }
    ctx.lineTo(halfDist, 0);
    ctx.stroke();

    ctx.restore();

    for (let k = 0; k < 4; k++) {
      const t = Math.random();
      const bx = hand1.palmCenter.x + (hand2.palmCenter.x - hand1.palmCenter.x) * t;
      const by = hand1.palmCenter.y + (hand2.palmCenter.y - hand1.palmCenter.y) * t + (Math.random() - 0.5) * 45;
      const vAngle = Math.random() * Math.PI * 2;
      const vSpeed = Math.random() * 5 + 2;

      this.spawnSpark(
        bx,
        by,
        Math.cos(vAngle) * vSpeed,
        Math.sin(vAngle) * vSpeed,
        Math.random() * 3 + 1.5,
        Math.random() * 0.04 + 0.02,
        0.04
      );
    }
  }

  /**
   * Renders expanding shockwave rings
   */
  _renderShockwaves(ctx) {
    const p = this.activePalette;

    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += (sw.maxRadius - sw.radius) * 0.12 + 6;
      sw.life -= sw.decay;

      if (sw.life <= 0 || sw.radius >= sw.maxRadius) {
        this.shockwaves.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.strokeStyle = p.core;
      ctx.lineWidth = Math.max(1, 8 * sw.life);
      ctx.shadowColor = p.primary;
      ctx.shadowBlur = 25;
      ctx.globalAlpha = sw.life;

      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = p.bright;
      ctx.lineWidth = Math.max(1, 3 * sw.life);
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, Math.max(0, sw.radius - 22), 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }
  }
}
