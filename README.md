# Doctor Strange Sling Ring & Mystic Portal Filter 🌀✨

Real-time in-browser Doctor Strange Sling Ring & Mystic Portal filter controlled entirely by hand gestures via your webcam using **MediaPipe Tasks-Vision (`@mediapipe/tasks-vision`, `HandLandmarker`)** and a high-performance **60 FPS Canvas 2D particle engine**.

[![Live Demo](https://img.shields.io/badge/Live_Demo-Try_in_Browser-ff8800?style=for-the-badge&logo=googlechrome&logoColor=white)](http://localhost:8080)
[![Technology](https://img.shields.io/badge/Tech-HTML5_Canvas_•_MediaPipe_•_Web_Audio-ffaa00?style=for-the-badge)](#tech-stack)

---

## 🌟 Visual Effects & Features

- **Iconic Sling Ring Fiery Sparks**: Tangential and radial glowing spark nozzles flying off the rim with aerodynamic friction, gravity, and decaying ember trails.
- **Kamar-Taj Sacred Geometry & Runic Mandala**: Procedural counter-rotating runic dials, interlocking sacred squares (octagram), hexagram dials, glyph nodes, and texture blending.
- **Dynamic HSL Color Blending (Orange ↔ Cyan-Blue)**:
  - Palm facing camera: classic orange-gold sparks and runes.
  - Back of hand facing camera: celestial cyan-blue astral energy.
  - Smooth HSL interpolation over ~0.3 seconds; partial hand turn gives a partial color mix.
  - Color mode switcher: `Auto (turn hand)`, `Fixed orange`, `Fixed blue`.
- **Procedural Web Audio API Synthesizer**: Zero-dependency resonant sling ring hum, fiery ignition whoosh, crackles, implosion collapse, and sub-bass shockwave impact.
- **Secondary Orbiting Ring (Peace Sign)**: Spawns a smaller secondary portal ring orbiting around the main ring.
- **Pinch Grab with Hysteresis**: Grab the ring with thumb + index pinch to drag it across the screen; release to drop.
- **Three-Finger Runes Toggle**: Index + middle + ring fingers up toggles the inner runic symbols on and off.
- **Index Finger Flick Burst**: Fast fingertip movement shoots a cone of sparks in that direction.
- **5-Frame Stability Filter**: Prevents gesture flicker and false positives.
- **Interactive Test Mode**: Full mouse/touch controls available if webcam is not connected or permission is denied.

---

## 🖐️ Finger Gestures & Controls

| Gesture | Finger State | Action & Visual Effect |
| :--- | :--- | :--- |
| **Point** | Index only | Traces glowing spark loop in the air; closing loop ignites full portal. |
| **Peace Sign** | Index + Middle | Spawns a second smaller ring that orbits around the main ring. |
| **Pinch Grab** | Thumb + Index | Sticks the portal ring to the pinch point with hysteresis to move it around. |
| **Three Fingers** | Index + Middle + Ring | Toggles the inner runic/mandala symbols on and off. |
| **Index Flick** | High fingertip velocity | Shoots a high-velocity spark fountain off the ring in that direction. |
| **Open Palm** | 3+ fingers open | Ring follows palm center (landmark 9) with low-pass lerp filtering. |
| **Turn Hand** | 3D cross product | Palm faces camera = Orange-gold; Back of hand = Cyan-blue. |
| **Closed Fist** | All fingers curled | Portal collapses inward with an imploding suction animation and spark burst. |
| **Two Hands** | Both palms open | Stretches a dimensional bridge / wormhole between hands with plasma lightning. |

---

## 📁 File Structure

```
Doctor-Strange-Filter-main/
├── index.html                    # Root launcher / redirect to web application
├── serve.py                      # Local Python web server (port 8080)
├── README.md                     # Documentation & run instructions
└── web/
    ├── index.html                # App shell, start screen overlay, HUD & controls
    ├── style.css                 # Cinematic Doctor Strange Kamar-Taj dark aesthetic
    ├── main.js                   # Application coordinator, HUD telemetry, loop
    ├── handTracker.js            # MediaPipe Tasks-Vision 21-point tracking & lerp filter
    ├── gestures.js               # 5-frame stable gestures, 3D cross-product orientation
    ├── portalRenderer.js         # 60 FPS Canvas 2D engine, HSL color blend, orbiting ring
    ├── audioManager.js           # Web Audio API procedural sound synthesizer
    ├── assets/                   # High-resolution inner & outer circle textures
    ├── models/
    │   └── hand_landmarker.task  # Preloaded local MediaPipe model
    └── vendor/                   # Bundled offline MediaPipe tasks-vision bundle & WASM
```

---

## 🚀 Run Instructions

From the project root directory, run:

```bash
python3 serve.py
```

Then open your browser to:
👉 **[http://localhost:8080](http://localhost:8080)**

---

## ⌨️ Controls & Shortcuts

- **`Click "SHOW YOUR HAND TO CAST"`**: Activates camera, initializes MediaPipe HandLandmarker, and starts Web Audio.
- **`D`**: Toggle landmark debug skeleton overlay.
- **`M`**: Toggle audio effects (Mute / Unmute).
- **`O`**: Cycle spell color mode (`Auto`, `Fixed Orange`, `Fixed Blue`).
- **`Interactive Test Mode`**:
  - **Move Mouse**: Position sling ring
  - **Scroll Wheel**: Resize ring
  - **Shift + Click & Drag**: Draw circle in air
  - **Click**: Toggle Open Palm vs Closed Fist
  - **Double Click / P**: Trigger shockwave blast
  - **T**: Turn hand (toggle Orange ↔ Blue)
  - **1**: Point gesture
  - **2**: Peace sign (orbiting ring)
  - **3**: Three fingers (toggle runes)
  - **G**: Pinch grab
  - **F**: Index flick sparks
