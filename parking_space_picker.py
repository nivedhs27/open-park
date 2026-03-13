import cv2
import os
import pickle
from math import sqrt

width, height = 40, 23
pt1_x, pt1_y, pt2_x, pt2_y = None, None, None, None
line_count = 0
drag_start_right = None
is_right_dragging = False
drag_current = None
current_orientation = 0  
confirmation_active = False
last_backup = None
show_help = False  

def draw_help_overlay(img):
    overlay_w, overlay_h = 480, 260
    x0, y0 = 6, info_h + 8 + 36 + 12
    sub = img.copy()
    cv2.rectangle(sub, (x0, y0), (x0 + overlay_w, y0 + overlay_h), (0, 0, 0), -1)
    alpha = 0.85
    cv2.addWeighted(sub, alpha, img, 1 - alpha, 0, img)
    title = "Controls (press H to hide)"
    cv2.putText(img, title, (x0 + 10, y0 + 26), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 255, 255), 2, cv2.LINE_AA)
    lines = [
        "  Left click  : add spot / drag to add multiple",
        "  Right click : delete spot / drag to delete multiple",
        "  H           : toggle this help",
        "  R           : toggle orientation (H/V)",
        "  A / D      : decrease/increase width",
        "  W / S      : decrease/increase height",
        "  C           : clear all (confirm)",
        "  U           : undo last clear",
        "  Esc         : exit"
    ]
    for i, line in enumerate(lines):
        cv2.putText(img, line, (x0 + 10, y0 + 48 + i * 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)


current_dir = os.path.dirname(os.path.abspath(__file__))
park_positions_dir = os.path.join(current_dir, 'park_positions')
os.makedirs(park_positions_dir, exist_ok=True)
pickle_path = os.path.join(park_positions_dir, 'positions.pkl')
settings_path = os.path.join(park_positions_dir, 'settings.pkl')

try:
    with open(pickle_path, 'rb') as f:
        park_positions = pickle.load(f)
except:
    park_positions = []

try:
    if os.path.exists(settings_path):
        with open(settings_path, 'rb') as sf:
            settings = pickle.load(sf)
            w_h = settings.get('size') if isinstance(settings, dict) else None
            if w_h and isinstance(w_h, (list, tuple)) and len(w_h) == 2:
                width, height = int(w_h[0]), int(w_h[1])
except Exception:
    pass

def save_settings():
    try:
        with open(settings_path, 'wb') as sf:
            pickle.dump({'size': (width, height)}, sf)
    except Exception:
        pass


def parking_line_counter():
    global line_count
    step = height if current_orientation == 0 else width
    line_count = int((sqrt((pt2_x - pt1_x) ** 2 + (pt2_y - pt1_y) ** 2)) / step)
    return line_count


def mouse_events(event, x, y, flag, param):
    global pt1_x, pt1_y, pt2_x, pt2_y, drag_start_right, is_right_dragging
    global drag_current

    if event == cv2.EVENT_LBUTTONDOWN:
        pt1_x, pt1_y = x, y

    elif event == cv2.EVENT_LBUTTONUP:
        pt2_x, pt2_y = x, y
        parking_spaces = parking_line_counter()
        if parking_spaces == 0:
            park_positions.append((x, y, current_orientation))
        else:
            if current_orientation == 0:
                for i in range(parking_spaces):
                    park_positions.append((pt1_x, pt1_y + i * height, current_orientation))
            else:
                for i in range(parking_spaces):
                    park_positions.append((pt1_x + i * width, pt1_y, current_orientation))

    if event == cv2.EVENT_RBUTTONDOWN:
        drag_start_right = (x, y)
        is_right_dragging = True
    elif event == cv2.EVENT_MOUSEMOVE and is_right_dragging:
        drag_current = (x, y)
    elif event == cv2.EVENT_RBUTTONUP and drag_start_right:
        x1, y1 = drag_start_right
        x2, y2 = x, y
        x1n, x2n = min(x1, x2), max(x1, x2)
        y1n, y2n = min(y1, y2), max(y1, y2)
        w = x2n - x1n
        h = y2n - y1n
        if w <= 5 and h <= 5:
            for i, position in enumerate(list(park_positions)):
                px, py = position[0], position[1]
                orient = position[2] if len(position) > 2 else 0
                w = width if orient == 0 else height
                h = height if orient == 0 else width
                if px < x < px + w and py < y < py + h:
                    park_positions.pop(i)
                    break
        else:
            new_positions = []
            for position in park_positions:
                px, py = position[0], position[1]
                if not (x1n <= px <= x2n and y1n <= py <= y2n):
                    new_positions.append(position)
            park_positions[:] = new_positions
        drag_start_right = None
        is_right_dragging = False
        drag_current = None

    with open(pickle_path, 'wb') as f:
        pickle.dump(park_positions, f)

while True:
    try:
        image_path = os.path.join(current_dir, 'input', 'parking.png')
        img = cv2.imread(image_path)
        if img is None:
            print(f"Error: Could not load image at {image_path}")
            print("Please check if the file exists and is a valid image.")
            break
    except Exception as e:
        print(f"Error loading image: {e}")
        break
    for position in park_positions:
        px, py = position[0], position[1]
        orient = position[2] if len(position) > 2 else 0
        w = width if orient == 0 else height
        h = height if orient == 0 else width
        cv2.rectangle(img, (px, py), (px + w, py + h), (255, 0, 255), 3)
    info_w, info_h = 220, 40
    cv2.rectangle(img, (0, 0), (info_w, info_h), (0, 0, 0), -1)
    info_text = f"Size: {width}x{height}px {'V' if current_orientation==1 else 'H'}"
    cv2.putText(img, info_text, (6, int(info_h * 0.7)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)
    if confirmation_active:
        overlay_w, overlay_h = 380, 36
        x0, y0 = 6, info_h + 8
        cv2.rectangle(img, (x0, y0), (x0 + overlay_w, y0 + overlay_h), (0, 0, 0), -1)
        cv2.putText(img, "Confirm clear all positions? Y=Yes  N=No", (x0 + 6, y0 + 24), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2, cv2.LINE_AA)
    if last_backup:
        hint_x, hint_y = 6, info_h + 8 + 36 + 6
        cv2.putText(img, "Undo available: press 'u'", (hint_x, hint_y + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 200, 200), 1, cv2.LINE_AA)
    if is_right_dragging and drag_start_right and drag_current:
        sx, sy = drag_start_right
        cx, cy = drag_current
        x1n, x2n = min(sx, cx), max(sx, cx)
        y1n, y2n = min(sy, cy), max(sy, cy)
        cv2.rectangle(img, (x1n, y1n), (x2n, y2n), (0, 255, 255), 2)
    hint_x, hint_y = 6, info_h + 8 + 36 + 12
    if show_help:
        draw_help_overlay(img)
    else:
        hint_text = "Press H for help"
        (tw, th), _ = cv2.getTextSize(hint_text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 1)
        bx0, by0 = hint_x - 6, hint_y - 18
        cv2.rectangle(img, (bx0, by0), (bx0 + tw + 12, by0 + th + 12), (0, 0, 0), -1)
        cv2.putText(img, hint_text, (hint_x, hint_y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 1, cv2.LINE_AA)

    cv2.namedWindow('image', cv2.WINDOW_NORMAL)
    cv2.setWindowProperty('image', cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN) 
    cv2.imshow('image', img)
    cv2.setMouseCallback('image', mouse_events)
    key = cv2.waitKey(30) & 0xFF
    if key == 27:
        break
    if key == ord('r') or key == ord('R'):
        current_orientation = 0 if current_orientation == 1 else 1
        print(f"Orientation toggled: {'vertical' if current_orientation==1 else 'horizontal'}")
    if key == ord('a'):
        width = max(5, width - 1)
        save_settings()
        print(f"Width set to {width}")
    elif key == ord('d'):
        width = width + 1
        save_settings()
        print(f"Width set to {width}")
    elif key == ord('w'):
        height = max(5, height - 1)
        save_settings()
        print(f"Height set to {height}")
    elif key == ord('s'):
        height = height + 1
        save_settings()
        print(f"Height set to {height}")
    elif key == ord('c') and not confirmation_active:
        confirmation_active = True
    elif confirmation_active:
        if key == ord('y'):
            last_backup = park_positions.copy()
            park_positions[:] = []
            try:
                if os.path.exists(pickle_path):
                    os.remove(pickle_path)
            except Exception:
                pass
            try:
                with open(pickle_path, 'wb') as f:
                    pickle.dump(park_positions, f)
            except Exception:
                pass
            print("All parking positions cleared.")
            confirmation_active = False
        elif key == ord('n') or key == 27:
            confirmation_active = False
            print("Clear cancelled.")
    elif key == ord('u'):
        if last_backup:
            park_positions[:] = last_backup
            try:
                with open(pickle_path, 'wb') as f:
                    pickle.dump(park_positions, f)
            except Exception:
                pass
            last_backup = None
            print("Undo: restored cleared positions.")
        else:
            print("No undo available.")
    elif key == ord('h') or key == ord('H'):
        show_help = not show_help

cv2.destroyAllWindows()
