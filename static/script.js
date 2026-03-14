document.addEventListener('DOMContentLoaded', () => {
    // Clear localStorage values on page load
    localStorage.removeItem("slots");
    localStorage.removeItem("videoSource");

    // Solid Reset
    fetch('/reset', { method: 'POST' }).then(() => {
        const img = document.getElementById('video-stream');
        if (img) {
            img.style.display = 'none';
            img.src = '';
        }
        const noVideoText = document.getElementById('no-video-text');
        if (noVideoText) {
            noVideoText.style.display = 'block';
        }
        const overlay = document.getElementById('camera-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
        const sourceLabel = document.getElementById('camera-source-text');
        if (sourceLabel) {
            sourceLabel.textContent = 'Source: Not Active';
        }
        const videoFileName = document.getElementById('video-file-name');
        if (videoFileName) {
            videoFileName.textContent = 'No file chosen';
        }
    }).catch(err => console.error(err));

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
            
            const available = data.available || 0;
            const occupied = data.occupied || 0;
            const total = data.total || 0;
            
            document.getElementById('available-count').textContent = available;
            document.getElementById('occupied-count').textContent = occupied;
            document.getElementById('total-count').textContent = total;
            
            // Calculate Occupancy Percentage
            let occupancyPercent = 0;
            if (total > 0) {
                occupancyPercent = Math.round((occupied / total) * 100);
            }
            document.getElementById('occupancy-percent').textContent = occupancyPercent + '%';
            
            const progressFill = document.getElementById('occupancy-progress');
            if (progressFill) {
                progressFill.style.width = occupancyPercent + '%';
            }

            // Update Parking Status Banner
            const statusTextEl = document.getElementById('status-text');
            const percentFree = 100 - occupancyPercent;
            
            // Clear existing status classes
            statusTextEl.classList.remove('status-available', 'status-moderate', 'status-full');

            if (total === 0) {
                statusTextEl.textContent = 'No video source active. Configure a source to begin.';
            } else if (percentFree > 50) {
                statusTextEl.textContent = 'Parking Available';
                statusTextEl.classList.add('status-available');
            } else if (percentFree >= 20 && percentFree <= 50) {
                statusTextEl.textContent = 'Moderate Occupancy';
                statusTextEl.classList.add('status-moderate');
            } else {
                statusTextEl.textContent = 'Almost Full';
                statusTextEl.classList.add('status-full');
            }
            
        } catch (error) {
            console.error('Error fetching status:', error);
        }
    };

    setInterval(updateStatus, 1000);
    updateStatus();

    // Live Camera Time Overlay
    const updateCameraTime = () => {
        const timeEl = document.getElementById('camera-time');
        if (timeEl) {
            const now = new Date();
            const timeString = now.toLocaleTimeString('en-US', { hour12: false });
            timeEl.textContent = `LIVE • ${timeString}`;
        }
    };
    setInterval(updateCameraTime, 1000);
    updateCameraTime();

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
                
                // Show floating overlay
                const overlay = document.getElementById('camera-overlay');
                if (overlay) overlay.style.display = 'flex';
                
                // Update Source Text
                const sourceLabel = document.getElementById('camera-source-text');
                if (sourceLabel) sourceLabel.textContent = `Source: ${url}`;
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
                
                // Show floating overlay
                const overlay = document.getElementById('camera-overlay');
                if (overlay) overlay.style.display = 'flex';
                
                // Update Source Text
                const sourceLabel = document.getElementById('camera-source-text');
                if (sourceLabel) sourceLabel.textContent = `Source: Local Upload (${fileInput.files[0].name})`;

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
    const maximizeBtn = document.getElementById('maximize-modal-btn');
    const canvas = document.getElementById('picker-canvas');
    const ctx = canvas.getContext('2d');
    
    // Maximize logic
    if (maximizeBtn) {
        maximizeBtn.addEventListener('click', () => {
            const modalContent = document.querySelector('.modal-content');
            modalContent.classList.toggle('maximized');
            if (modalContent.classList.contains('maximized')) {
                // shrink icon
                maximizeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path></svg>';
            } else {
                // expand icon
                maximizeBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>';
            }
        });
    }

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
    let hoverBoxIndex = -1;
    let selectedBoxIndex = -1;
    
    // For live preview
    let currentMouseX = null;
    let currentMouseY = null;
    let isSelecting = false;

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

    const isPointInsideSlot = (x, y, pos) => {
        const decoded = decodePos(pos);
        const dx = x - (decoded.x + decoded.w/2);
        const dy = y - (decoded.y + decoded.h/2);
        const rad = -decoded.angle * Math.PI / 180;
        const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
        return (rx > -decoded.w/2 && rx < decoded.w/2 && ry > -decoded.h/2 && ry < decoded.h/2);
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

    const angleInput = document.getElementById('box-angle');
    const angleVal = document.getElementById('box-angle-val');
    
    document.getElementById('box-width').addEventListener('input', (e) => {
        boxWidth = parseInt(e.target.value) || 40;
        if (selectedBoxIndex !== -1 && selectedBoxIndex < positions.length) {
            positions[selectedBoxIndex][2] = boxWidth;
        }
        redrawCanvas();
    });

    document.getElementById('box-height').addEventListener('input', (e) => {
        boxHeight = parseInt(e.target.value) || 23;
        if (selectedBoxIndex !== -1 && selectedBoxIndex < positions.length) {
            positions[selectedBoxIndex][3] = boxHeight;
        }
        redrawCanvas();
    });

    angleInput.addEventListener('input', (e) => {
        angleVal.textContent = e.target.value + '°';
        if (selectedBoxIndex !== -1 && selectedBoxIndex < positions.length) {
            positions[selectedBoxIndex][4] = parseFloat(e.target.value);
        }
        redrawCanvas();
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

            if (idx === hoverBoxIndex && idx !== selectedBoxIndex) {
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 3;
            } else if (idx === selectedBoxIndex) {
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 3;
            } else {
                ctx.strokeStyle = '#ff00ff';
                ctx.lineWidth = 2;
            }

            ctx.strokeRect(-decoded.w/2, -decoded.h/2, decoded.w, decoded.h);
            
            if (idx === hoverBoxIndex || idx === selectedBoxIndex) {
               ctx.fillStyle = '#ffffff';
               ctx.font = 'bold 14px Arial';
               ctx.textAlign = 'center';
               ctx.textBaseline = 'middle';
               ctx.shadowColor = "rgba(0,0,0,0.8)";
               ctx.shadowBlur = 4;
               ctx.fillText('Slot #' + (idx + 1), 0, 0);
               ctx.shadowBlur = 0;
            }
            
            ctx.restore();
        });
        
        // Draw live preview for the new box
        if (currentMouseX !== null && currentMouseY !== null && hoverBoxIndex === -1 && !isDragging) {
            const currentMode = document.getElementById('select-orientation').value;
            if (currentMode !== 'draw') {
                const currentAngle = parseFloat(document.getElementById('box-angle').value) || 0;
                const currentOrient = parseInt(currentMode);
                const ww = currentOrient === 0 ? boxWidth : boxHeight;
                const hh = currentOrient === 0 ? boxHeight : boxWidth;
                
                ctx.save();
                ctx.translate(currentMouseX + ww/2, currentMouseY + hh/2);
                ctx.rotate(currentAngle * Math.PI / 180);
                
                ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)'; // Cyan ghost
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]);
                ctx.strokeRect(-ww/2, -hh/2, ww, hh);
                
                ctx.restore();
            }
        }
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

        isSelecting = false;
        
        let clickedBoxIndex = -1;
        for (let i = positions.length - 1; i >= 0; i--) {
            if (isPointInsideSlot(x, y, positions[i])) {
                clickedBoxIndex = i;
                break;
            }
        }

        // Selection logic on left click
        if (e.button === 0 && !e.ctrlKey) {
            selectedBoxIndex = clickedBoxIndex;
            if (selectedBoxIndex !== -1 && selectedBoxIndex < positions.length) {
                const decoded = decodePos(positions[selectedBoxIndex]);
                angleInput.value = decoded.angle;
                angleVal.textContent = decoded.angle + '°';
                document.getElementById('box-width').value = decoded.w;
                document.getElementById('box-height').value = decoded.h;
                isSelecting = true;
            }
            redrawCanvas();
        }

        if (e.ctrlKey) {
            // Hit test to find a box to move
            movingBoxIndex = clickedBoxIndex;
            
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
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        currentMouseX = x;
        currentMouseY = y;

        if (!isDragging) {
            let foundHover = -1;
            // Iterate backwards to hover the top-most box
            for (let i = positions.length - 1; i >= 0; i--) {
                if (isPointInsideSlot(x, y, positions[i])) {
                    foundHover = i;
                    break;
                }
            }
            hoverBoxIndex = foundHover;
            redrawCanvas(); // Always redraw for the live preview to track mouse cursor
            return;
        }
        
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

        if (isSelecting) return;

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
                const intersects = isPointInsideSlot(x, y, pos);
                
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
        } else if (!isSelecting) {
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
    
    canvas.addEventListener('mouseleave', () => {
        currentMouseX = null;
        currentMouseY = null;
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
        
        if (e.key === 'Escape') {
            const modalContent = document.querySelector('.modal-content');
            if (modalContent.classList.contains('maximized')) {
                maximizeBtn.click();
            } else {
                closeBtn.click();
            }
            return;
        }

        if (e.key === 'd' || e.key === 'D') {
            duplicateLastBox();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            if (selectedBoxIndex !== -1 && selectedBoxIndex < positions.length) {
                lastDeletedPositions.push(positions[selectedBoxIndex]);
                positions.splice(selectedBoxIndex, 1);
                selectedBoxIndex = -1;
                hoverBoxIndex = -1;
                redrawCanvas();
            }
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
