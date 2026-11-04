/**
 * audioManager.js - Doctor Strange Mystic Portal Synthesizer
 * Uses Web Audio API for zero-dependency, low-latency procedural audio:
 * - Resonant sling ring hum with organic LFO modulation
 * - Fiery portal ignition whoosh
 * - Implosion collapse sound
 * - Push shockwave blast
 * - Subtle spark sizzles & crackles
 */

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.isInitialized = false;

    // Sustained hum nodes
    this.humGain = null;
    this.humOsc1 = null;
    this.humOsc2 = null;
    this.humFilter = null;
    this.lfo = null;

    // Noise buffer for whooshes & sizzles
    this.noiseBuffer = null;
  }

  /**
   * Initialize AudioContext on first user interaction
   */
  init() {
    if (this.isInitialized) return;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass();

      // Create white/pink noise buffer (2 seconds loop)
      const bufferSize = this.ctx.sampleRate * 2;
      this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = this.noiseBuffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        // Brown/pink noise generator for richer cosmic whoosh
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = output[i];
        output[i] *= 3.5; // Gain compensation
      }

      this._setupHumGenerator();
      this.isInitialized = true;
    } catch (e) {
      console.warn("Web Audio API not supported or blocked:", e);
    }
  }

  /**
   * Resume context if suspended by browser autoplay policy
   */
  resumeContext() {
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  /**
   * Toggle mute state
   */
  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted && this.humGain) {
      this.humGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  /**
   * Continuous Mystic Sling Ring Hum
   */
  _setupHumGenerator() {
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // Master hum gain
    this.humGain = this.ctx.createGain();
    this.humGain.gain.setValueAtTime(0, now);

    // Resonant low-pass filter for ancient harmonic drone
    this.humFilter = this.ctx.createBiquadFilter();
    this.humFilter.type = "lowpass";
    this.humFilter.frequency.setValueAtTime(140, now);
    this.humFilter.Q.setValueAtTime(4.0, now);

    // Fundamental oscillator (mystic D note: ~73.4 Hz)
    this.humOsc1 = this.ctx.createOscillator();
    this.humOsc1.type = "sawtooth";
    this.humOsc1.frequency.setValueAtTime(73.4, now);

    // Detuned sub-octave oscillator (~73.9 Hz + sub)
    this.humOsc2 = this.ctx.createOscillator();
    this.humOsc2.type = "sine";
    this.humOsc2.frequency.setValueAtTime(74.1, now);

    // LFO for slow pulsing mystical aura (0.4 Hz)
    this.lfo = this.ctx.createOscillator();
    this.lfo.frequency.setValueAtTime(0.4, now);

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(25, now);
    this.lfo.connect(lfoGain);
    lfoGain.connect(this.humFilter.frequency);

    // Connect graph
    this.humOsc1.connect(this.humFilter);
    this.humOsc2.connect(this.humFilter);
    this.humFilter.connect(this.humGain);
    this.humGain.connect(this.ctx.destination);

    this.humOsc1.start();
    this.humOsc2.start();
    this.lfo.start();
  }

  /**
   * Update sustained portal hum intensity based on active portals count and scale
   */
  updateHum(portalActive, intensity = 1.0) {
    if (!this.ctx || !this.humGain || this.isMuted) return;

    const now = this.ctx.currentTime;
    const targetGain = portalActive ? Math.min(0.22, 0.08 + intensity * 0.14) : 0;
    this.humGain.gain.setTargetAtTime(targetGain, now, 0.15);

    if (this.humFilter) {
      const targetFreq = 120 + intensity * 160;
      this.humFilter.frequency.setTargetAtTime(targetFreq, now, 0.2);
    }
  }

  /**
   * Play ignition whoosh when a portal sparks to life or circle finishes
   */
  playWhoosh() {
    if (!this.ctx || !this.noiseBuffer || this.isMuted) return;
    this.resumeContext();

    const now = this.ctx.currentTime;

    // Noise burst through sweeping bandpass filter
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.setValueAtTime(3.5, now);
    filter.frequency.setValueAtTime(250, now);
    filter.frequency.exponentialRampToValueAtTime(1800, now + 0.35);
    filter.frequency.exponentialRampToValueAtTime(350, now + 0.7);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);

    // Sub harmonic burst
    const subOsc = this.ctx.createOscillator();
    subOsc.type = "sine";
    subOsc.frequency.setValueAtTime(180, now);
    subOsc.frequency.exponentialRampToValueAtTime(60, now + 0.5);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.2, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    subOsc.connect(subGain);
    subGain.connect(this.ctx.destination);

    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noiseSource.start(now);
    noiseSource.stop(now + 0.8);
    subOsc.start(now);
    subOsc.stop(now + 0.5);
  }

  /**
   * Play shockwave boom (forward punch / push gesture)
   */
  playShockwave() {
    if (!this.ctx || this.isMuted) return;
    this.resumeContext();

    const now = this.ctx.currentTime;

    // Heavy bass drop
    const sub = this.ctx.createOscillator();
    sub.type = "triangle";
    sub.frequency.setValueAtTime(140, now);
    sub.frequency.exponentialRampToValueAtTime(35, now + 0.6);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.45, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    sub.connect(subGain);
    subGain.connect(this.ctx.destination);
    sub.start(now);
    sub.stop(now + 0.7);

    // White noise explosion impact
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1200, now);
      filter.frequency.exponentialRampToValueAtTime(200, now + 0.4);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.35, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);

      noise.start(now);
      noise.stop(now + 0.5);
    }
  }

  /**
   * Play collapse / implosion sound (closed fist)
   */
  playCollapse() {
    if (!this.ctx || this.isMuted) return;
    this.resumeContext();

    const now = this.ctx.currentTime;

    // Upward pitch bend suction + sudden drop
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.22);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.35);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(380, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + 0.35);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.4);
  }

  /**
   * Play crackle sound for active sparks & circle drawing
   */
  playCrackle() {
    if (!this.ctx || !this.noiseBuffer || this.isMuted || Math.random() > 0.3) return;

    const now = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(2200, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(now);
    noise.stop(now + 0.09);
  }
}
