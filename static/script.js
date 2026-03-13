document.addEventListener('DOMContentLoaded', () => {
    // Theme Toggle Logic
    const themeToggleBtn = document.getElementById('theme-toggle');
    const currentTheme = localStorage.getItem('theme') || 'light';
    
    if (currentTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }

    themeToggleBtn.addEventListener('click', () => {
        let theme = document.documentElement.getAttribute('data-theme');
        if (theme === 'dark') {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        }
    });

    // Custom File Inputs
    const videoUploadInput = document.getElementById('video-upload');
    const videoFileName = document.getElementById('video-file-name');
    if (videoUploadInput && videoFileName) {
        videoUploadInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                videoFileName.textContent = e.target.files[0].name;
            } else {
                videoFileName.textContent = 'No file chosen';
            }
        });
    }

    const positionsUploadInput = document.getElementById('positions-upload');
    const positionsFileName = document.getElementById('positions-file-name');
    if (positionsUploadInput && positionsFileName) {
        positionsUploadInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                positionsFileName.textContent = e.target.files[0].name;
            } else {
                positionsFileName.textContent = 'No file chosen';
            }
        });
    }

    // Status Polling
    const updateStatus = async () => {
        try {
            const response = await fetch('/status');
            const data = await response.json();
            document.getElementById('available-count').textContent = data.available;
            document.getElementById('occupied-count').textContent = data.occupied;
            document.getElementById('total-count').textContent = data.total;
        } catch (error) {
            console.error('Error fetching status:', error);
        }
    };

    setInterval(updateStatus, 1000);
    updateStatus();

    // Source Configuration
    document.getElementById('update-source-btn').addEventListener('click', async () => {
        const url = document.getElementById('stream-url').value;
        if (!url) return;

        try {
            const response = await fetch('/set_source', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: url })
            });
            const data = await response.json();
            if (data.status === 'success') {
                alert('Source updated successfully!');
                const img = document.getElementById('video-stream');
                img.src = '/video_feed?' + new Date().getTime();
                img.style.display = 'block';
                document.getElementById('no-video-text').style.display = 'none';
            }
        } catch (error) {
            alert('Error updating source');
        }
    });

    // Video Upload
    document.getElementById('upload-video-btn').addEventListener('click', async () => {
        const fileInput = document.getElementById('video-upload');
        if (!fileInput.files || fileInput.files.length === 0) {
            alert('Please select a video file to upload.');
            return;
        }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);

        try {
            const response = await fetch('/upload_video', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (data.status === 'success') {
                alert('Video uploaded successfully!');
                const img = document.getElementById('video-stream');
                img.src = '/video_feed?' + new Date().getTime();
                img.style.display = 'block';
                document.getElementById('no-video-text').style.display = 'none';
                videoFileName.textContent = 'No file chosen';
                fileInput.value = '';
            } else {
                alert('Error uploading video: ' + data.message);
            }
        } catch (error) {
            alert('Error uploading video');
        }
    });

    // Positions file upload
    document.getElementById('upload-positions-btn').addEventListener('click', async () => {
        const fileInput = document.getElementById('positions-upload');
        if (!fileInput.files || fileInput.files.length === 0) {
            alert('Please select a positions.pkl file to upload.');
            return;
        }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);

        try {
            const response = await fetch('/upload_positions', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (data.status === 'success') {
                alert('Positions imported successfully!');
                positionsFileName.textContent = 'No file chosen';
                fileInput.value = '';
            } else {
                alert('Error importing positions: ' + data.message);
            }
        } catch (error) {
            alert('Error importing positions');
        }
    });

    // Picker Logic
    const modal = document.getElementById('picker-modal');
    const openBtn = document.getElementById('open-picker-btn');
    const closeBtn = document.getElementById('close-picker-btn');
    const canvas = document.getElementById('picker-canvas');
    const ctx = canvas.getContext('2d');
    
    let positions = [];
    let lastDeletedPositions = []; // for undo
    let boxWidth = 40;
    let boxHeight = 23;
    let backgroundImage = new Image();
    
    let isDragging = false;
    let dragStart = null;
    let isRightClick = false;
    
    // For moving existing boxes
    let movingBoxIndex = -1;
    let movingBoxOffset = null;

    const decodePos = (pos) => {
        let px, py, pw, ph, pangle = 0;
        if (pos.length >= 5) {
            [px, py, pw, ph, pangle] = pos;
        } else if (pos.length === 4) {
            if (pos[2] <= 1 && pos[3] <= 360) {
                px = pos[0]; py = pos[1];
                const orient = pos[2];
                pw = orient === 0 ? boxWidth : boxHeight;
                ph = orient === 0 ? boxHeight : boxWidth;
                pangle = pos[3];
            } else {
                [px, py, pw, ph] = pos;
            }
        } else {
            px = pos[0]; py = pos[1];
            const orient = pos[2] || 0;
            pw = orient === 0 ? boxWidth : boxHeight;
            ph = orient === 0 ? boxHeight : boxWidth;
        }
        return { x: px, y: py, w: pw, h: ph, angle: pangle };
    };

    const loadPositions = async () => {
        const response = await fetch('/get_positions');
        const data = await response.json();
        positions = data.positions;
        boxWidth = data.width || 40;
        boxHeight = data.height || 23;
        
        let emptyThreshold = data.empty || 0.22;
        document.getElementById('empty-threshold').value = emptyThreshold;
        document.getElementById('empty-threshold-val').textContent = emptyThreshold;
        
        document.getElementById('box-width').value = boxWidth;
        document.getElementById('box-height').value = boxHeight;
    };

    document.getElementById('empty-threshold').addEventListener('input', (e) => {
        document.getElementById('empty-threshold-val').textContent = e.target.value;
    });

    const redrawCanvas = () => {
        if (!backgroundImage.src) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 2;
        
        boxWidth = parseInt(document.getElementById('box-width').value) || boxWidth;
        boxHeight = parseInt(document.getElementById('box-height').value) || boxHeight;

        positions.forEach((pos, idx) => {
            if (idx === movingBoxIndex) return; // Don't draw the one we're currently moving
            const decoded = decodePos(pos);
            ctx.save();
            ctx.translate(decoded.x + decoded.w/2, decoded.y + decoded.h/2);
            ctx.rotate(decoded.angle * Math.PI / 180);
            ctx.strokeRect(-decoded.w/2, -decoded.h/2, decoded.w, decoded.h);
            ctx.restore();
        });
    };

    const initPicker = async () => {
        await loadPositions();
        
        backgroundImage.onload = () => {
            canvas.width = backgroundImage.width;
            canvas.height = backgroundImage.height;
            redrawCanvas();
        };
        backgroundImage.onerror = () => {
            alert('Cannot load frame. Make sure a video source is configured.');
            modal.classList.remove('active');
        }
        backgroundImage.src = '/get_frame?' + new Date().getTime();
        modal.classList.add('active');
    };

    openBtn.addEventListener('click', initPicker);
    closeBtn.addEventListener('click', () => modal.classList.remove('active'));

    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        boxWidth = parseInt(document.getElementById('box-width').value) || boxWidth;
        boxHeight = parseInt(document.getElementById('box-height').value) || boxHeight;

        if (e.ctrlKey) {
            // Hit test to find a box to move
            movingBoxIndex = positions.findIndex(pos => {
                const decoded = decodePos(pos);
                const dx = x - (decoded.x + decoded.w/2);
                const dy = y - (decoded.y + decoded.h/2);
                const rad = -decoded.angle * Math.PI / 180;
                const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
                const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
                return (rx > -decoded.w/2 && rx < decoded.w/2 && ry > -decoded.h/2 && ry < decoded.h/2);
            });
            
            if (movingBoxIndex !== -1) {
                const decoded = decodePos(positions[movingBoxIndex]);
                movingBoxOffset = { dx: x - decoded.x, dy: y - decoded.y };
                isDragging = true;
                return;
            }
        }

        dragStart = { x, y };
        isDragging = true;
        isRightClick = e.button === 2;
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        if (movingBoxIndex !== -1) {
            redrawCanvas();
            const decoded = decodePos(positions[movingBoxIndex]);
            
            ctx.strokeStyle = '#ffff00'; // Yellow while moving
            ctx.lineWidth = 2;
            ctx.save();
            ctx.translate(x - movingBoxOffset.dx + decoded.w/2, y - movingBoxOffset.dy + decoded.h/2);
            ctx.rotate(decoded.angle * Math.PI / 180);
            ctx.strokeRect(-decoded.w/2, -decoded.h/2, decoded.w, decoded.h);
            ctx.restore();
            return;
        }

        const currentMode = document.getElementById('select-orientation').value;
        if (currentMode !== 'draw') return;
        
        redrawCanvas();
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            Math.min(dragStart.x, x), 
            Math.min(dragStart.y, y), 
            Math.abs(x - dragStart.x), 
            Math.abs(y - dragStart.y)
        );
    });

    canvas.addEventListener('mouseup', (e) => {
        if (!isDragging) return;
        isDragging = false;
        
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        if (movingBoxIndex !== -1) {
            const pos = positions[movingBoxIndex];
            pos[0] = Math.round(x - movingBoxOffset.dx);
            pos[1] = Math.round(y - movingBoxOffset.dy);
            movingBoxIndex = -1;
            movingBoxOffset = null;
            redrawCanvas();
            return;
        }
        
        boxWidth = parseInt(document.getElementById('box-width').value) || boxWidth;
        boxHeight = parseInt(document.getElementById('box-height').value) || boxHeight;

        if (isRightClick) {
            let removedAny = false;
            let tempDeleted = [];
            const newPositions = positions.filter(pos => {
                const decoded = decodePos(pos);
                const dx = x - (decoded.x + decoded.w/2);
                const dy = y - (decoded.y + decoded.h/2);
                const rad = -decoded.angle * Math.PI / 180;
                const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
                const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
                const intersects = (rx > -decoded.w/2 && rx < decoded.w/2 && ry > -decoded.h/2 && ry < decoded.h/2);
                
                if (intersects) {
                    tempDeleted.push(pos);
                    removedAny = true;
                    return false;
                }
                return true;
            });
            if (removedAny) {
                 lastDeletedPositions.push(...tempDeleted);
            }
            positions = newPositions;
        } else {
            const currentAngle = parseFloat(document.getElementById('box-angle').value) || 0;
            const currentMode = document.getElementById('select-orientation').value;
            if (currentMode === 'draw') {
                const px = Math.round(Math.min(dragStart.x, x));
                const py = Math.round(Math.min(dragStart.y, y));
                const pw = Math.round(Math.abs(x - dragStart.x));
                const ph = Math.round(Math.abs(y - dragStart.y));
                
                if (pw > 5 && ph > 5) {
                    positions.push([px, py, pw, ph, currentAngle]);
                }
            } else {
                const currentOrient = parseInt(currentMode);
                const dx = x - dragStart.x;
                const dy = y - dragStart.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const step = currentOrient === 0 ? boxHeight : boxWidth; 
                
                const numBoxes = Math.max(1, Math.floor(dist / step));
                const ww = currentOrient === 0 ? boxWidth : boxHeight;
                const hh = currentOrient === 0 ? boxHeight : boxWidth;
                
                if (numBoxes === 1) {
                    positions.push([Math.round(dragStart.x), Math.round(dragStart.y), ww, hh, currentAngle]);
                } else {
                    for(let i=0; i<numBoxes; i++) {
                        if (currentOrient === 0) {
                            positions.push([Math.round(dragStart.x), Math.round(dragStart.y + i * boxHeight), ww, hh, currentAngle]);
                        } else {
                            positions.push([Math.round(dragStart.x + i * boxWidth), Math.round(dragStart.y), ww, hh, currentAngle]);
                        }
                    }
                }
            }
        }
        redrawCanvas();
    });
    
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    document.getElementById('btn-undo').addEventListener('click', () => {
        if (lastDeletedPositions.length > 0) {
            positions.push(lastDeletedPositions.pop());
            redrawCanvas();
        }
    });

    document.getElementById('btn-clear-all').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all positions?')) {
            lastDeletedPositions = [...positions];
            positions = [];
            redrawCanvas();
        }
    });

    const duplicateLastBox = () => {
        if (positions.length === 0) return;
        const lastBox = positions[positions.length - 1];
        const decoded = decodePos(lastBox);
        const dupSpacing = parseFloat(document.getElementById('dup-spacing').value) || 5;
        
        const angleRad = decoded.angle * Math.PI / 180;
        const dx = (decoded.w + dupSpacing) * Math.cos(angleRad);
        const dy = (decoded.w + dupSpacing) * Math.sin(angleRad);

        const newBox = [Math.round(decoded.x + dx), Math.round(decoded.y + dy), decoded.w, decoded.h, decoded.angle];
        
        positions.push(newBox);
        redrawCanvas();
    };

    document.getElementById('btn-duplicate').addEventListener('click', duplicateLastBox);

    document.addEventListener('keydown', (e) => {
        if (!modal.classList.contains('active')) return;
        if (e.key === 'd' || e.key === 'D') {
            duplicateLastBox();
        }
    });

    document.getElementById('btn-save-positions').addEventListener('click', async () => {
        boxWidth = parseInt(document.getElementById('box-width').value) || 40;
        boxHeight = parseInt(document.getElementById('box-height').value) || 23;
        const emptyThresh = parseFloat(document.getElementById('empty-threshold').value) || 0.22;

        try {
            const response = await fetch('/save_positions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ positions, width: boxWidth, height: boxHeight, empty: emptyThresh })
            });
            const data = await response.json();
            if(data.status === 'success') {
                alert('Positions saved successfully!');
                modal.classList.remove('active');
            }
        } catch (error) {
            alert('Error saving positions');
        }
    });
});
