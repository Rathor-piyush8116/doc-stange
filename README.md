![Banne](https://i.pinimg.com/originals/3f/35/90/3f3590a3809163db554425361295f121.jpg)

# Doctor Strange Magic Shield Filter

[![Live Demo](https://img.shields.io/badge/Live_Demo-Try_in_Browser-ff9900?style=for-the-badge&logo=googlechrome&logoColor=white)](https://rathor-piyush8116.github.io/doc-stange/)
[![GitHub Pages](https://img.shields.io/badge/GitHub_Pages-Active-success?style=for-the-badge&logo=github)](https://rathor-piyush8116.github.io/doc-stange/)

> 🚀 **Live Browser Demo**: [https://rathor-piyush8116.github.io/doc-stange/](https://rathor-piyush8116.github.io/doc-stange/)
>
> Experience the Doctor Strange magic shield in real time right in your browser! Powered by **MediaPipe Hands** gesture tracking and interactive mouse/touch controls.

This project replicates the iconic eldritch magic shields that appear when Marvel's Doctor Strange casts a spell. It is available both as an in-browser web app and as a Python (OpenCV + MediaPipe) desktop application.

## Folder Structure

```
.
├── Models                    # Models to be used when creating the filter
|   ├── Inner Circles         # Circle models to be found on the inner side 
|   └── Outer Circles         # Circle models to be found on the outer side 
├── functions.py              
├── main.py                    
├── LICENSE
├── requirements.txt                   
└── README.md
```

## Setup & Manual Run

1. **Install requirements**:
   ```bash
   pip install -r requirements.txt
   ```
2. **Run (Defaults to Manual Mode with Mouse & Keyboard Controls)**:
   ```bash
   python main.py
   ```
   *Or explicitly via dedicated script:*
   ```bash
   python manual.py
   ```
3. **Toggle Modes at Runtime**:
   Press **`M`** at any time while the window is active to switch between **Manual Mode** and **Auto Gesture Mode**.

---

## 🎮 Controls & Shortcuts

| Key / Action | Function |
| :--- | :--- |
| **`M`** | **Toggle between Manual & Auto (Gesture) Mode** |
| **`Space` or Left Click** | Toggle Doctor Strange portal ON / OFF |
| **Mouse Move** | Position portal dynamically on screen |
| **`1` / `2` / `3`** | Switch shield preset styles (*Eldritch Orange*, *Mystic Crimson*, *Astral Azure*) |
| **`+` / `-` (or `=` / `_`)** | Increase / Decrease portal size manually |
| **`S`** | Toggle magical spark particle trail at cursor |
| **`H`** | Toggle on-screen Heads-Up Display (HUD) |
| **`Q` or `ESC`** | Quit application |

---

## 🖐️ Hand Gestures (Auto Mode)

- **Open Palm**: Cast portal shield (use thumb and index finger pinch to resize diameter).
- **Fist**: Dismiss / close portal shield.
- **Peace Sign (`✌`)**: Cast alternate shield style.
- **Pointing Finger (`👉`)**: Emit magical spark trails from your fingertip.

***
<h3 align="center"> Enes ARSLAN </h3>
<p align="center">
<a href="https://www.instagram.com/_enes.arslan_/?next=%2F">
<img src="https://img.shields.io/badge/Instagram-000000?style=for-the-badge&logo=instagram&logoColor=white"/>
<a href="https://www.linkedin.com/in/enes-arslan-/">
<img src="https://img.shields.io/badge/LinkedIn-000000?style=for-the-badge&logo=linkedin&logoColor=white"/>
<a href="https://github.com/Arslanex">
<img src="https://img.shields.io/badge/GitHub-000000?style=for-the-badge&logo=github&logoColor=white"/ >
</p>
