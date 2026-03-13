import cv2
import pickle
import os
import numpy as np

current_dir = os.path.dirname(os.path.abspath(__file__))
video_path = os.path.join(current_dir, 'input', 'parking.mp4')
cap = cv2.VideoCapture(video_path)
if not cap.isOpened():
    print(f"Error: Could not open video at {video_path}")
    exit()
pickle_path = os.path.join(current_dir, 'park_positions', 'positions.pkl')
try:
    with open(pickle_path, 'rb') as f:
        park_positions = pickle.load(f)
except FileNotFoundError:
    print("Error: Parking positions file not found.")
    print("Please run 'parking_space_picker.py' first to define parking spaces.")
    exit()
except Exception as e:
    print(f"Error loading parking positions: {e}")
    exit()
settings_path = os.path.join(current_dir, 'park_positions', 'settings.pkl')
try:
    if os.path.exists(settings_path):
        with open(settings_path, 'rb') as sf:
            settings = pickle.load(sf)
            w_h = settings.get('size') if isinstance(settings, dict) else None
            if w_h and isinstance(w_h, (list, tuple)) and len(w_h) == 2:
                width, height = int(w_h[0]), int(w_h[1])
                full = width * height
except Exception:
    pass
for i, pos in enumerate(list(park_positions)):
    if isinstance(pos, tuple) and len(pos) == 2:
        park_positions[i] = (pos[0], pos[1], 0)
width, height = 40, 23
full = width * height
empty = 0.22
font = cv2.FONT_HERSHEY_COMPLEX_SMALL
def parking_space_counter(img_processed):
    global counter
    counter = 0
    for position in park_positions:
        angle = 0
        if len(position) >= 5:
            x, y, w, h, angle = position[:5]
        elif len(position) == 4:
            if position[2] <= 1 and position[3] <= 360:
                x, y, orient, angle = position
                w = width if orient == 0 else height
                h = height if orient == 0 else width
            else:
                x, y, w, h = position
        else:
            x, y = position[0], position[1]
            orient = position[2] if len(position) > 2 else 0
            w = width if orient == 0 else height
            h = height if orient == 0 else width

        area = w * h
        if area == 0:
            area = 1

        if angle == 0:
            margin = 3
            if w > 2*margin and h > 2*margin:
                img_crop = img_processed[y+margin : y+h-margin, x+margin : x+w-margin]
                area_crop = (w - 2*margin) * (h - 2*margin)
            else:
                img_crop = img_processed[y:y + h, x:x + w]
                area_crop = area
                
            count = cv2.countNonZero(img_crop)
            pts = np.array([[(x, y), (x + w, y), (x + w, y + h), (x, y + h)]], dtype=np.int32)
        else:
            rect = ((x + w/2, y + h/2), (w, h), angle)
            box = cv2.boxPoints(rect)
            pts = np.int32(box)
            
            bx, by, bw, bh = cv2.boundingRect(pts)
            bx = max(0, bx)
            by = max(0, by)
            
            img_crop = img_processed[by:by+bh, bx:bx+bw]
            mask = np.zeros((img_crop.shape[0], img_crop.shape[1]), dtype=np.uint8)
            pts_shifted = pts - [bx, by]
            cv2.fillPoly(mask, [pts_shifted], 255)
            
            kernel_margin = np.ones((7, 7), np.uint8)
            mask_margin = cv2.erode(mask, kernel_margin, iterations=1)
            
            if img_crop.size > 0:
                img_masked = cv2.bitwise_and(img_crop, mask_margin)
                count = cv2.countNonZero(img_masked)
                area_crop = cv2.countNonZero(mask_margin)
                if area_crop <= 0: area_crop = 1
            else:
                count = 0
                area_crop = 1
        
        ratio = count / area_crop
        if ratio < empty:
            color = (0, 255, 0)
            counter += 1
        else:
            color = (0, 0, 255)
        cv2.fillPoly(overlay, [pts], color)
        cv2.putText(overlay, "{:.2f}".format(ratio), (x + 4, y + h - 4), font, 0.7, (255, 255, 255), 1, cv2.LINE_AA)

while True:
    if cap.get(cv2.CAP_PROP_POS_FRAMES) == cap.get(cv2.CAP_PROP_FRAME_COUNT):
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    _, frame = cap.read()
    overlay = frame.copy()
    img_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    img_blur = cv2.GaussianBlur(img_gray, (3, 3), 1)
    img_thresh = cv2.adaptiveThreshold(img_blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 105, 16)
    img_median = cv2.medianBlur(img_thresh, 5)
    kernel = np.ones((3, 3), np.uint8)
    img_dilate = cv2.dilate(img_median, kernel, iterations=1)
    
    parking_space_counter(img_dilate)
    alpha = 0.7
    frame_new = cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0)
    w, h = 220, 60
    cv2.rectangle(frame_new, (0, 0), (w, h), (255, 0, 255), -1)
    cv2.putText(frame_new, f"{counter}/{len(park_positions)}", (int(w / 10), int(h * 3 / 4)), font, 2, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.namedWindow('frame', cv2.WINDOW_NORMAL)
    cv2.setWindowProperty('frame', cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)
    cv2.imshow('frame', frame_new)
    if cv2.waitKey(1) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()
