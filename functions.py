import cv2 as cv
import numpy as np
from typing import List, Tuple, Sequence
from collections import deque

LINE_COLOR = (0, 140, 255)
WHITE_COLOR = (255, 255, 255)

FINGER_TIPS = [4, 8, 12, 16, 20]
FINGER_PIPS = [3, 6, 10, 14, 18]

def position_data(lmlist: List[Tuple[int, int]]) -> List[Tuple[int, int]]:
    """
    Extracts and returns key fingertip and hand positions from the landmark list.

    Args:
        lmlist (list): List of tuples containing (x, y) coordinates of keypoints.

    Returns:
        list: Coordinates of wrist, thumb tip, index mcp, index tip,
              middle mcp, middle tip, ring tip, and pinky tip.
    """
    if len(lmlist) < 21:
        raise ValueError("Landmark list must contain at least 21 points.")

    keys = [0, 4, 5, 8, 9, 12, 16, 20]  # Indices of relevant landmarks
    return [lmlist[i] for i in keys]

def finger_states(lmlist: List[Tuple[int, int]], handedness: str = "Right") -> List[bool]:
    """
    Returns [thumb, index, middle, ring, pinky] as booleans,
    True = finger extended, False = finger curled.
    lmlist must be the FULL 21-point landmark list (not position_data's subset).
    """
    if len(lmlist) < 21:
        raise ValueError("Landmark list must contain at least 21 points.")

    states = []

    # Thumb folds sideways, not up/down, so compare x instead of y.
    # Flip the comparison if handedness is "Left" (mirrored frame).
    if handedness == "Right":
        states.append(lmlist[4][0] > lmlist[3][0])
    else:
        states.append(lmlist[4][0] < lmlist[3][0])

    # Other four fingers: tip above its own pip joint (smaller y) = extended
    for tip, pip in zip(FINGER_TIPS[1:], FINGER_PIPS[1:]):
        states.append(lmlist[tip][1] < lmlist[pip][1])

    return states

def classify_gesture(states: List[bool]) -> str:
    """Maps a finger-state vector to a named gesture."""
    thumb, index, middle, ring, pinky = states

    if all(states):
        return "open_palm"
    if not any(states):
        return "fist"
    if index and not any([middle, ring, pinky]):
        return "point"
    if index and middle and not any([ring, pinky]):
        return "peace"
    return "unknown"

def calculate_distance(p1: Tuple[int, int], p2: Tuple[int, int]) -> float:
    """
    Calculates the Euclidean distance between two points.

    Args:
        p1 (tuple): First point (x1, y1).
        p2 (tuple): Second point (x2, y2).

    Returns:
        float: Euclidean distance between the two points.
    """
    return float(np.linalg.norm(np.array(p1) - np.array(p2)))

def draw_line(
    frame: np.ndarray,
    p1: Tuple[int, int],
    p2: Tuple[int, int],
    color: Tuple[int, int, int] = LINE_COLOR,
    thickness: int = 5
) -> np.ndarray:
    """
    Draws a line between two points on the given frame.

    Args:
        frame (ndarray): The image/frame to draw the line on.
        p1 (tuple): First point (x1, y1).
        p2 (tuple): Second point (x2, y2).
        color (tuple): Color of the outer line.
        thickness (int): Thickness of the outer line.

    Returns:
        ndarray: Modified frame with the drawn line.
    """
    cv.line(frame, p1, p2, color, thickness)
    cv.line(frame, p1, p2, WHITE_COLOR, max(1, thickness // 2))
    return frame

def draw_spark(frame: np.ndarray, tip: Tuple[int, int], trail: deque) -> np.ndarray:
    """
    Draws a glowing spark and particle trail at the fingertip.
    """
    trail.append(tip)
    for i, pt in enumerate(trail):
        alpha = (i + 1) / len(trail)
        radius = int(3 + alpha * 5)
        # Glowing outer circle
        cv.circle(frame, pt, radius, (0, int(140 + alpha * 115), 255), -1)
        # Hot white core
        cv.circle(frame, pt, max(1, radius // 2), (255, 255, 255), -1)
    return frame

def overlay_image(
    target_img: np.ndarray,
    frame: np.ndarray,
    x: int, y: int,
    size: Tuple[int, int] = None
) -> np.ndarray:
    """
    Overlays a target image onto a frame at the given position with boundary clipping.

    Args:
        target_img (ndarray): Image to be overlaid with an alpha channel.
        frame (ndarray): Frame on which the target image is to be overlaid.
        x (int): X-coordinate for the top-left corner of the overlay.
        y (int): Y-coordinate for the top-left corner of the overlay.
        size (tuple, optional): Size to resize the target image. Defaults to None.

    Returns:
        ndarray: Modified frame with the overlaid image.
    """
    if size is not None:
        if size[0] <= 0 or size[1] <= 0:
            return frame
        try:
            target_img = cv.resize(target_img, size)
        except cv.error:
            return frame

    if target_img.shape[-1] != 4:
        raise ValueError("Target image must have 4 channels (RGBA).")

    fh, fw = frame.shape[:2]
    h, w = target_img.shape[:2]

    # Calculate valid overlap region within frame boundaries
    x1, y1 = max(0, x), max(0, y)
    x2, y2 = min(fw, x + w), min(fh, y + h)

    if x1 >= x2 or y1 >= y2:
        return frame

    # Sub-region of the overlay corresponding to visible frame area
    overlay_x1 = x1 - x
    overlay_y1 = y1 - y
    overlay_x2 = overlay_x1 + (x2 - x1)
    overlay_y2 = overlay_y1 + (y2 - y1)

    target_crop = target_img[overlay_y1:overlay_y2, overlay_x1:overlay_x2]
    b, g, r, a = cv.split(target_crop)
    overlay_color = cv.merge((b, g, r))
    mask = cv.medianBlur(a, 5)
    mask_inv = cv.bitwise_not(mask)

    roi = frame[y1:y2, x1:x2]
    img1_bg = cv.bitwise_and(roi, roi, mask=mask_inv)
    img2_fg = cv.bitwise_and(overlay_color, overlay_color, mask=mask)

    # Overlay the foreground onto the background
    frame[y1:y2, x1:x2] = cv.add(img1_bg, img2_fg)
    return frame

def draw_hud(
    frame: np.ndarray,
    mode: str,
    active: bool,
    diameter: int,
    style_name: str,
    show_help: bool = True
) -> np.ndarray:
    """
    Renders a sleek HUD (Heads-Up Display) with current mode, status, and keyboard shortcuts.
    """
    h, w = frame.shape[:2]
    
    # Semi-transparent overlay box for HUD
    hud_h = 160 if show_help else 70
    hud_w = 340
    overlay = frame.copy()
    cv.rectangle(overlay, (15, 15), (15 + hud_w, 15 + hud_h), (20, 20, 25), -1)
    cv.rectangle(overlay, (15, 15), (15 + hud_w, 15 + hud_h), (0, 165, 255), 1)
    
    # Blend HUD background
    alpha = 0.75
    cv.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)
    
    # Header & Mode
    status_text = "ACTIVE" if active else "STANDBY"
    status_color = (0, 255, 120) if active else (150, 150, 150)
    cv.putText(frame, f"MODE: {mode.upper()}", (25, 40), cv.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)
    cv.putText(frame, f"[{status_text}]", (190, 40), cv.FONT_HERSHEY_SIMPLEX, 0.5, status_color, 2)
    
    cv.putText(frame, f"Style: {style_name} | Size: {diameter}px", (25, 62), cv.FONT_HERSHEY_SIMPLEX, 0.42, (200, 200, 200), 1)
    
    if show_help:
        cv.line(frame, (25, 75), (15 + hud_w - 10, 75), (70, 70, 80), 1)
        shortcuts = [
            "[M] Toggle Manual / Auto Mode",
            "[Space/Click] Toggle Portal",
            "[1/2/3] Switch Shield Styles",
            "[+/- or Scroll] Adjust Portal Size",
            "[S] Spark Trail  |  [H] Toggle HUD",
            "[Q/ESC] Quit"
        ]
        y_pos = 95
        for sc in shortcuts:
            cv.putText(frame, sc, (25, y_pos), cv.FONT_HERSHEY_SIMPLEX, 0.38, (0, 215, 255), 1)
            y_pos += 18
            
    return frame

