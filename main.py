import argparse
import json
from collections import deque
from typing import Any, Dict, List, Tuple

import cv2 as cv
import mediapipe as mp
import numpy as np

from functions import (
    calculate_distance,
    classify_gesture,
    draw_hud,
    draw_line,
    draw_spark,
    finger_states,
    overlay_image,
    position_data,
)


class HandDetector:
    """Universal hand detector supporting both MediaPipe Tasks and Solutions APIs."""
    def __init__(self, model_path: str = "Models/hand_landmarker.task", max_num_hands: int = 2):
        if hasattr(mp, "solutions") and hasattr(mp.solutions, "hands"):
            self.mode = "solutions"
            self.detector = mp.solutions.hands.Hands(
                max_num_hands=max_num_hands,
                min_detection_confidence=0.7,
                min_tracking_confidence=0.5
            )
        else:
            self.mode = "tasks"
            try:
                import mediapipe.tasks as tasks
                from mediapipe.tasks.python.vision.core.image import Image, ImageFormat
                self.Image = Image
                self.ImageFormat = ImageFormat
                base_options = tasks.BaseOptions(model_asset_path=model_path)
                options = tasks.vision.HandLandmarkerOptions(
                    base_options=base_options,
                    num_hands=max_num_hands,
                    min_hand_detection_confidence=0.7,
                    min_tracking_confidence=0.5
                )
                self.detector = tasks.vision.HandLandmarker.create_from_options(options)
            except Exception as e:
                print(f"Warning: HandLandmarker initialization failed: {e}. Falling back to manual mode.")
                self.detector = None

    def detect(self, rgb_frame: np.ndarray) -> List[Tuple[List[Tuple[float, float]], str]]:
        """Returns list of tuples: ([(norm_x, norm_y), ... 21 points], handedness_label)."""
        if self.detector is None:
            return []
        hands = []
        try:
            if self.mode == "solutions":
                results = self.detector.process(rgb_frame)
                if results.multi_hand_landmarks and results.multi_handedness:
                    for idx, lm in enumerate(results.multi_hand_landmarks):
                        label = results.multi_handedness[idx].classification[0].label
                        lms = [(p.x, p.y) for p in lm.landmark]
                        hands.append((lms, label))
            else:
                mp_img = self.Image(image_format=self.ImageFormat.SRGB, data=rgb_frame)
                results = self.detector.detect(mp_img)
                if results.hand_landmarks and results.handedness:
                    for idx, lm_list in enumerate(results.hand_landmarks):
                        handedness_cats = results.handedness[idx]
                        label = handedness_cats[0].category_name if handedness_cats else "Right"
                        lms = [(p.x, p.y) for p in lm_list]
                        hands.append((lms, label))
        except Exception:
            pass
        return hands


def load_config(path: str = "config.json") -> dict:
    """Loads the configuration from a JSON file."""
    with open(path, "r") as file:
        return json.load(file)


def limit_value(val: float, min_val: float, max_val: float) -> float:
    """Clamps a value between a given min and max."""
    return max(min(val, max_val), min_val)


def initialize_camera(config: dict) -> cv.VideoCapture:
    """Initializes the webcam with given width, height, and device ID."""
    device_id = config["camera"]["device_id"]
    cap = cv.VideoCapture(device_id, cv.CAP_AVFOUNDATION)
    if not cap.isOpened():
        cap = cv.VideoCapture(device_id)

    cap.set(cv.CAP_PROP_FRAME_WIDTH, config["camera"]["width"])
    cap.set(cv.CAP_PROP_FRAME_HEIGHT, config["camera"]["height"])
    if not cap.isOpened():
        raise RuntimeError("Failed to open the webcam.")
    return cap


def load_style_presets() -> Dict[int, Dict[str, Any]]:
    """Loads all available Doctor Strange shield style pairs."""
    presets = {
        1: {
            "name": "Eldritch Orange",
            "inner_path": "Models/inner_circles/orange.png",
            "outer_path": "Models/outer_circles/orange.png",
        },
        2: {
            "name": "Mystic Crimson",
            "inner_path": "Models/inner_circles/light_orange.png",
            "outer_path": "Models/outer_circles/red.png",
        },
        3: {
            "name": "Astral Azure",
            "inner_path": "Models/inner_circles/blue.png",
            "outer_path": "Models/outer_circles/dark_red.png",
        }
    }

    loaded_presets = {}
    for key, item in presets.items():
        inner = cv.imread(item["inner_path"], cv.IMREAD_UNCHANGED)
        outer = cv.imread(item["outer_path"], cv.IMREAD_UNCHANGED)
        if inner is None:
            inner = cv.imread("Models/inner_circles/orange.png", cv.IMREAD_UNCHANGED)
        if outer is None:
            outer = cv.imread("Models/outer_circles/orange.png", cv.IMREAD_UNCHANGED)
        loaded_presets[key] = {
            "name": item["name"],
            "inner": inner,
            "outer": outer
        }
    return loaded_presets


# Global state for manual mouse tracking
mouse_pos = [640, 360]
mouse_clicked = False
manual_active = False


def on_mouse_event(event: int, x: int, y: int, flags: int, param: Any) -> None:
    """OpenCV Mouse Callback handler for manual mode."""
    global mouse_pos, manual_active
    mouse_pos[0] = x
    mouse_pos[1] = y
    if event == cv.EVENT_LBUTTONDOWN:
        manual_active = not manual_active
    elif event == cv.EVENT_MOUSEWHEEL:
        # Wheel scroll adjustment handled in main loop if needed
        pass


def render_portal(
    frame: np.ndarray,
    center: Tuple[int, int],
    diameter: int,
    inner_img: np.ndarray,
    outer_img: np.ndarray,
    degree: float
) -> np.ndarray:
    """Renders a dual rotating Doctor Strange portal shield."""
    if diameter <= 10 or inner_img is None or outer_img is None:
        return frame

    cx, cy = center
    x1 = cx - diameter // 2
    y1 = cy - diameter // 2

    m_outer = cv.getRotationMatrix2D((outer_img.shape[1] // 2, outer_img.shape[0] // 2), degree, 1.0)
    m_inner = cv.getRotationMatrix2D((inner_img.shape[1] // 2, inner_img.shape[0] // 2), -degree, 1.0)

    rotated_outer = cv.warpAffine(outer_img, m_outer, (outer_img.shape[1], outer_img.shape[0]))
    rotated_inner = cv.warpAffine(inner_img, m_inner, (inner_img.shape[1], inner_img.shape[0]))

    frame = overlay_image(rotated_outer, frame, x1, y1, (diameter, diameter))
    frame = overlay_image(rotated_inner, frame, x1, y1, (diameter, diameter))
    return frame


def main():
    global manual_active, mouse_pos
    parser = argparse.ArgumentParser(description="Doctor Strange Magic Filter (Auto & Manual)")
    parser.add_argument("--manual", action="store_true", help="Launch directly in Manual Control mode")
    args = parser.parse_args()

    config = load_config()
    cap = initialize_camera(config)
    presets = load_style_presets()
    current_preset_id = 1

    detector = HandDetector(max_num_hands=2)
    window_name = "Doctor Strange Magic Filter"
    cv.namedWindow(window_name)
    cv.setMouseCallback(window_name, on_mouse_event)

    # State variables
    default_mode = config.get("default_mode", "manual")
    mode = "manual" if args.manual else default_mode
    manual_active = (mode == "manual")
    manual_diameter = 260
    manual_scale = 1.0 if manual_active else 0.0
    manual_deg = 0.0
    manual_spark_trail = deque(maxlen=20)
    manual_spark_enabled = False
    show_hud = True

    rot_inc = config["overlay"].get("rotation_degree_increment", 2.5)
    ease_factor = config.get("animation", {}).get("ease_factor", 0.2)
    pinch_cfg = config.get("pinch", {"min_pinch": 20, "max_pinch": 150, "min_size": 80, "max_size": 450})
    shield_mult = config["overlay"].get("shield_size_multiplier", 3.0)

    hand_states: Dict[str, Dict[str, Any]] = {}

    try:
        while cap.isOpened():
            success, frame = cap.read()
            if not success:
                print("Failed to capture frame from camera.")
                break

            frame = cv.flip(frame, 1)
            h, w, _ = frame.shape
            cur_preset = presets.get(current_preset_id, presets[1])

            if mode == "manual":
                # Manual Controls
                target_scale = 1.0 if manual_active else 0.0
                manual_scale += (target_scale - manual_scale) * ease_factor
                manual_deg = (manual_deg + rot_inc) % 360

                if manual_spark_enabled:
                    frame = draw_spark(frame, (mouse_pos[0], mouse_pos[1]), manual_spark_trail)
                elif len(manual_spark_trail) > 0:
                    manual_spark_trail.popleft()

                if manual_scale > 0.02:
                    cur_diam = int(manual_diameter * manual_scale)
                    frame = render_portal(
                        frame,
                        (mouse_pos[0], mouse_pos[1]),
                        cur_diam,
                        cur_preset["inner"],
                        cur_preset["outer"],
                        manual_deg
                    )

            else:
                # Auto Mode (Hand Tracking)
                rgb_frame = cv.cvtColor(frame, cv.COLOR_BGR2RGB)
                detected_hands = detector.detect(rgb_frame)
                seen_hands = set()

                for idx, (norm_landmarks, handedness_label) in enumerate(detected_hands):
                    hand_key = f"{handedness_label}_{idx}"
                    seen_hands.add(hand_key)

                    if hand_key not in hand_states:
                        hand_states[hand_key] = {
                            "scale": 0.0,
                            "deg": 0.0,
                            "last_diameter": 220,
                            "trail": deque(maxlen=15)
                        }
                    state = hand_states[hand_key]

                    lm_list = [(int(pt[0] * w), int(pt[1] * h)) for pt in norm_landmarks]
                    (wrist, thumb_tip, index_mcp, index_tip,
                     middle_mcp, middle_tip, ring_tip, pinky_tip) = position_data(lm_list)

                    states = finger_states(lm_list, handedness_label)
                    gesture = classify_gesture(states)
                    index_wrist_dist = calculate_distance(wrist, index_mcp)

                    if gesture == "fist":
                        target_scale = 0.0
                        state["trail"].clear()
                    elif gesture == "open_palm":
                        target_scale = 1.0
                        state["trail"].clear()
                        pinch_dist = calculate_distance(thumb_tip, index_tip)
                        clamped_pinch = limit_value(pinch_dist, pinch_cfg["min_pinch"], pinch_cfg["max_pinch"])
                        diameter = int(
                            pinch_cfg["min_size"] +
                            (clamped_pinch - pinch_cfg["min_pinch"]) /
                            (pinch_cfg["max_pinch"] - pinch_cfg["min_pinch"]) *
                            (pinch_cfg["max_size"] - pinch_cfg["min_size"])
                        )
                        state["last_diameter"] = diameter
                    elif gesture == "peace":
                        target_scale = 1.0
                        state["trail"].clear()
                        state["last_diameter"] = round(index_wrist_dist * shield_mult)
                    elif gesture == "point":
                        target_scale = 0.0
                        frame = draw_spark(frame, index_tip, state["trail"])
                    else:
                        target_scale = 0.0
                        if len(state["trail"]) > 0:
                            state["trail"].popleft()

                    state["scale"] += (target_scale - state["scale"]) * ease_factor

                    if state["scale"] > 0.02:
                        base_diameter = state.get("last_diameter", round(index_wrist_dist * shield_mult))
                        animated_diameter = int(base_diameter * state["scale"])
                        state["deg"] = (state["deg"] + rot_inc) % 360

                        frame = render_portal(
                            frame,
                            middle_mcp,
                            animated_diameter,
                            cur_preset["inner"],
                            cur_preset["outer"],
                            state["deg"]
                        )

                # Decay hands no longer in view
                for hand_key, state in list(hand_states.items()):
                    if hand_key not in seen_hands:
                        state["scale"] += (0.0 - state["scale"]) * ease_factor
                        if state["scale"] < 0.01:
                            state["scale"] = 0.0

            # Render Heads-Up Display
            is_active = (manual_scale > 0.05) if mode == "manual" else any(s["scale"] > 0.05 for s in hand_states.values())
            active_size = manual_diameter if mode == "manual" else int(manual_diameter)
            frame = draw_hud(frame, mode, is_active, active_size, cur_preset["name"], show_hud)

            cv.imshow(window_name, frame)

            # Keyboard Events
            key = cv.waitKey(1) & 0xFF
            if key in [ord("q"), ord("Q"), 27]:  # 'q' or ESC
                break
            elif key in [ord("m"), ord("M")]:
                mode = "auto" if mode == "manual" else "manual"
                print(f"Switched mode to: {mode.upper()}")
            elif key == ord(" "):  # Spacebar
                manual_active = not manual_active
            elif key == ord("1"):
                current_preset_id = 1
            elif key == ord("2"):
                current_preset_id = 2
            elif key == ord("3"):
                current_preset_id = 3
            elif key in [ord("+"), ord("=")]:
                manual_diameter = min(600, manual_diameter + 25)
            elif key in [ord("-"), ord("_")]:
                manual_diameter = max(60, manual_diameter - 25)
            elif key in [ord("s"), ord("S")]:
                manual_spark_enabled = not manual_spark_enabled
            elif key in [ord("h"), ord("H")]:
                show_hud = not show_hud

    finally:
        cap.release()
        cv.destroyAllWindows()


if __name__ == "__main__":
    main()


