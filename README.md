![Banne](https://i.pinimg.com/originals/3f/35/90/3f3590a3809163db554425361295f121.jpg)

# Doctor Strange Filter with Python

This project is a test of my skills in computer vision. The project was created using Mediapipe and OpenCV libraries and Python program language. As the name suggests, I tried to replicate the magic circles that appear on the palms of the popular MARVEL hero Dr. Strange when he casts a spell.

To summarize the working logic of the project, the script starts by detecting hand gestures from your device's camera and then calculates the midpoint of your palm and the openness of your palm with these points.  If your hand is open enough, a mask (the filter itself) is created using the previously given images and pasted onto the calculated midpoint.  

Of course, this was a very simple explanation. There are many things to know about perspective, rotating image objects and creating transparent objects during this project. I hope this project will help you to understand these topics :)

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
