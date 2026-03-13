import cv2
import pickle
import os
import threading
from flask import Flask, render_template, Response, jsonify, request, session, redirect, url_for
import time
import hashlib
import numpy as np

app = Flask(__name__)
app.secret_key = "super_secret_openpark_key_for_prototype"

current_dir = os.path.dirname(os.path.abspath(__file__))
video_path = os.path.join(current_dir, 'input', 'parking.mp4')
park_positions_dir = os.path.join(current_dir, 'park_positions')
pickle_path = os.path.join(park_positions_dir, 'positions.pkl')
settings_path = os.path.join(park_positions_dir, 'settings.pkl')

width, height = 40, 23
full = width * height
empty = 0.22

# Global state
park_positions = []
latest_status = {
    "total": 0,
    "available": 0,
    "occupied": 0
}
current_video_source = None
latest_frame = None
UPLOAD_FOLDER = os.path.join(current_dir, 'input')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def get_pickle_paths():
    if current_video_source is None:
        return pickle_path, settings_path
    
    source_hash = hashlib.md5(str(current_video_source).encode()).hexdigest()
    p_path = os.path.join(park_positions_dir, f'positions_{source_hash}.pkl')
    s_path = os.path.join(park_positions_dir, f'settings_{source_hash}.pkl')
    return p_path, s_path

def load_positions():
    global park_positions, width, height, full
    p_path, s_path = get_pickle_paths()
    try:
        if os.path.exists(p_path):
            with open(p_path, 'rb') as f:
                park_positions = pickle.load(f)
                # fix tuples
                for i, pos in enumerate(list(park_positions)):
                    if isinstance(pos, tuple) and len(pos) == 2:
                        park_positions[i] = (pos[0], pos[1], 0)
        else:
            park_positions = []
    except:
        park_positions = []
        
    try:
        if os.path.exists(s_path):
            with open(s_path, 'rb') as sf:
                settings = pickle.load(sf)
                w_h = settings.get('size') if isinstance(settings, dict) else None
                if w_h and isinstance(w_h, (list, tuple)) and len(w_h) == 2:
                    width, height = int(w_h[0]), int(w_h[1])
                    full = width * height
                if isinstance(settings, dict) and 'empty' in settings:
                    empty = float(settings['empty'])
    except Exception:
        pass

load_positions()

def generate_frames():
    global latest_status, current_video_source, latest_frame
    font = cv2.FONT_HERSHEY_COMPLEX_SMALL
    cap = None
    
    while True:
        try:
            if current_video_source is None:
                time.sleep(1)
                continue
                
            if cap is None or not cap.isOpened():
                cap = cv2.VideoCapture(current_video_source)
                time.sleep(1)
                continue
            # Reopen if disconnected
            if not cap.isOpened():
                cap = cv2.VideoCapture(current_video_source)
                time.sleep(1)
                continue
                
            if cap.get(cv2.CAP_PROP_POS_FRAMES) == cap.get(cv2.CAP_PROP_FRAME_COUNT) and cap.get(cv2.CAP_PROP_FRAME_COUNT) > 0:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                
            success, frame = cap.read()
            if not success:
                time.sleep(1)
                cap = cv2.VideoCapture(current_video_source)
                continue
                
            overlay = frame.copy()
            img_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            img_blur = cv2.GaussianBlur(img_gray, (3, 3), 1)
            img_thresh = cv2.adaptiveThreshold(img_blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 105, 16)
            img_median = cv2.medianBlur(img_thresh, 5)
            kernel = np.ones((3, 3), np.uint8)
            img_dilate = cv2.dilate(img_median, kernel, iterations=1)
            
            counter = 0
            total = len(park_positions)
            
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
                        img_crop = img_dilate[y+margin : y+h-margin, x+margin : x+w-margin]
                        area_crop = (w - 2*margin) * (h - 2*margin)
                    else:
                        img_crop = img_dilate[y:y + h, x:x + w]
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
                    
                    img_crop = img_dilate[by:by+bh, bx:bx+bw]
                    mask = np.zeros((img_crop.shape[0], img_crop.shape[1]), dtype=np.uint8)
                    pts_shifted = pts - [bx, by]
                    cv2.fillPoly(mask, [pts_shifted], 255)
                    
                    kernel_margin = np.ones((7, 7), np.uint8)
                    mask_margin = cv2.erode(mask, kernel_margin, iterations=1)
                    
                    if img_crop.size > 0:
                        img_masked = cv2.bitwise_and(img_crop, mask_margin)
                        count = cv2.countNonZero(img_masked)
                        area_crop = cv2.countNonZero(mask_margin)
                        if area_crop == 0: area_crop = 1
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
                # Text with thin, clear line
                cv2.putText(overlay, "{:.2f}".format(ratio), (x + 4, y + h - 4), font, 0.7, (255, 255, 255), 1, cv2.LINE_AA)
                
            latest_status["total"] = total
            latest_status["available"] = counter
            latest_status["occupied"] = total - counter

            latest_frame = frame.copy()

            alpha = 0.7
            frame_new = cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0)
            
            ret, buffer = cv2.imencode('.jpg', frame_new)
            frame_bytes = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        except Exception as e:
            print(f"Error processing frame: {e}")
            time.sleep(1)

@app.route('/')
def index():
    if session.get("logged_in"):
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        if username == 'admin' and password == 'admin123':
            session['logged_in'] = True
            return redirect(url_for('dashboard'))
        else:
            return render_template('login.html', error="Invalid username or password")
    
    # GET request
    if session.get("logged_in"):
        return redirect(url_for('dashboard'))
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('logged_in', None)
    return redirect(url_for('login'))

@app.route('/dashboard')
def dashboard():
    if not session.get("logged_in"):
        return redirect(url_for('login'))
        
    global current_video_source, latest_frame, park_positions, latest_status, width, height, empty, full
    current_video_source = None
    latest_frame = None
    park_positions = []
    latest_status = {
        "total": 0,
        "available": 0,
        "occupied": 0
    }
    width, height = 40, 23
    full = width * height
    empty = 0.22

    return render_template('index.html')

@app.route('/reset', methods=['POST'])
def reset_state():
    global current_video_source, latest_frame, park_positions, latest_status, width, height, empty, full
    current_video_source = None
    latest_frame = None
    park_positions = []
    latest_status = {
        "total": 0,
        "available": 0,
        "occupied": 0
    }
    width, height = 40, 23
    full = width * height
    empty = 0.22
    return jsonify({"status": "success"})

@app.route('/video_feed')
def video_feed():
    if not session.get("logged_in"):
        return Response("Unauthorized", status=401)
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/status')
def status():
    return jsonify(latest_status)

@app.route('/get_positions')
def get_positions():
    return jsonify({
        "positions": park_positions,
        "width": width,
        "height": height,
        "empty": empty
    })

@app.route('/save_positions', methods=['POST'])
def save_positions_route():
    global park_positions, width, height, full, empty
    data = request.json
    positions = data.get('positions', [])
    park_positions = [tuple(p) for p in positions]
    
    new_width = data.get('width', width)
    new_height = data.get('height', height)
    width = int(new_width)
    height = int(new_height)
    full = width * height

    # Update empty threshold
    if 'empty' in data:
        empty = float(data['empty'])
    
    p_path, s_path = get_pickle_paths()
    try:
        os.makedirs(park_positions_dir, exist_ok=True)
        with open(p_path, 'wb') as f:
            pickle.dump(park_positions, f)
        with open(s_path, 'wb') as sf:
            pickle.dump({'size': (width, height), 'empty': empty}, sf)
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/set_source', methods=['POST'])
def set_source():
    global current_video_source, latest_frame
    data = request.json
    source = data.get('source')
    if source:
        if source.isdigit():
            current_video_source = int(source)
        else:
            current_video_source = source
        latest_frame = None
        load_positions()
        return jsonify({"status": "success", "source": current_video_source})
    return jsonify({"status": "error"}), 400

@app.route('/upload_video', methods=['POST'])
def upload_video():
    global current_video_source, latest_frame
    if 'file' not in request.files:
        return jsonify({"status": "error", "message": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"status": "error", "message": "No selected file"}), 400
    if file:
        filename = file.filename
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)
        current_video_source = filepath
        latest_frame = None
        load_positions()
        return jsonify({"status": "success", "source": current_video_source})

@app.route('/upload_positions', methods=['POST'])
def upload_positions():
    global park_positions
    if current_video_source is None:
        return jsonify({"status": "error", "message": "Configure a video source first"}), 400
        
    if 'file' not in request.files:
        return jsonify({"status": "error", "message": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"status": "error", "message": "No selected file"}), 400
    
    if file:
        p_path, s_path = get_pickle_paths()
        os.makedirs(park_positions_dir, exist_ok=True)
        file.save(p_path)
        load_positions()
        return jsonify({"status": "success"})

@app.route('/get_frame')
def get_frame():
    global latest_frame
    if latest_frame is not None:
        ret, buffer = cv2.imencode('.jpg', latest_frame)
        return Response(buffer.tobytes(), mimetype='image/jpeg')
    
    if current_video_source is None:
        return "No video source configured.", 404

    # Fallback to reading from source directly if generator hasn't started
    cap = cv2.VideoCapture(current_video_source)
    success, frame = cap.read()
    cap.release()
    if success:
        ret, buffer = cv2.imencode('.jpg', frame)
        return Response(buffer.tobytes(), mimetype='image/jpeg')
    return "Error getting frame", 500

if __name__ == '__main__':
    os.makedirs(os.path.join(current_dir, 'templates'), exist_ok=True)
    os.makedirs(os.path.join(current_dir, 'static'), exist_ok=True)
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)
