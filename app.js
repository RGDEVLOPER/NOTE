document.addEventListener('DOMContentLoaded', function() {
    // Initialize Quill editor
    const quill = new Quill('#editor', {
        theme: 'snow',
        modules: {
            toolbar: [
                [{ 'font': [] }, { 'size': [] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'color': [] }, { 'background': [] }],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                ['link', 'image'],
                ['clean']
            ]
        }
    });

    // Tool button functionality
    const toolButtons = {
        textBtn: document.getElementById('textBtn'),
        penBtn: document.getElementById('penBtn'),
        eraserBtn: document.getElementById('eraserBtn'),
        imageBtn: document.getElementById('imageBtn'),
        recordBtn: document.getElementById('recordBtn'),
        pdfBtn: document.getElementById('pdfBtn'),
        undoBtn: document.getElementById('undoBtn'),
        redoBtn: document.getElementById('redoBtn'),
        fullscreenBtn: document.getElementById('fullscreenBtn'),
        timerBtn: document.getElementById('timerBtn')
    };

    // PDF handling and drawing variables
    let pdfDoc = null;
    let pageNum = 1;
    let pdfCanvas = document.getElementById('pdfCanvas');
    let drawingCanvas = document.getElementById('drawingCanvas');
    let pdfCtx = pdfCanvas.getContext('2d');
    let drawCtx = drawingCanvas.getContext('2d');
    let scale = 1.5;
    let isDrawing = false;
    let currentTool = 'pen';
    let currentColor = '#000000';
    let drawings = new Map(); // Store drawings for each page
    let currentPath = [];
    let colorMenuTimeout;

    // Color picker functionality
    const penBtn = document.getElementById('penBtn');
    const colorMenu = document.getElementById('colorMenu');
    const colorOptions = document.querySelectorAll('.color-option');

    // Show color menu on pen button long press
    let pressTimer;
    penBtn.addEventListener('mousedown', () => {
        pressTimer = setTimeout(() => {
            colorMenu.classList.add('show');
        }, 500); // Show after 500ms hold
    });

    penBtn.addEventListener('mouseup', () => {
        clearTimeout(pressTimer);
    });

    penBtn.addEventListener('mouseleave', () => {
        clearTimeout(pressTimer);
    });

    penBtn.addEventListener('click', () => {
        currentTool = 'pen';
        drawingCanvas.style.cursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" height="12" width="12"><circle cx="6" cy="6" r="5" stroke="${currentColor}" fill="${currentColor}"/></svg>') 6 6, crosshair`;
    });

    penBtn.addEventListener('touchstart', () => {
        currentTool = 'pen';
        drawingCanvas.style.cursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" height="12" width="12"><circle cx="6" cy="6" r="5" stroke="${currentColor}" fill="${currentColor}"/></svg>') 6 6, crosshair`;
    });

    penBtn.addEventListener('touchend', () => {
        // No action needed
    });

    // Handle color selection
    colorOptions.forEach(option => {
        option.addEventListener('click', () => {
            const color = option.getAttribute('data-color');
            currentColor = color;
            // Remove active class from all options
            colorOptions.forEach(opt => opt.classList.remove('active'));
            // Add active class to selected option
            option.classList.add('active');
            // Update cursor color indicator
            if (currentTool === 'pen') {
                drawingCanvas.style.cursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" height="12" width="12"><circle cx="6" cy="6" r="5" stroke="${color}" fill="${color}"/></svg>') 6 6, crosshair`;
            }
            // Hide color menu after selection
            colorMenu.classList.remove('show');
        });
    });

    // Hide color menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!colorMenu.contains(e.target) && e.target !== penBtn) {
            colorMenu.classList.remove('show');
        }
    });

    // PDF navigation controls
    document.getElementById('prevPage').addEventListener('click', async () => {
        const currentTime = Date.now();
        if (currentTime - lastClickTime < CLICK_DELAY) return;
        lastClickTime = currentTime;

        if (pageNum > 1) {
            await renderPage(pageNum - 1);
        }
    });

    document.getElementById('nextPage').addEventListener('click', async () => {
        const currentTime = Date.now();
        if (currentTime - lastClickTime < CLICK_DELAY) return;
        lastClickTime = currentTime;

        if (pageNum < maxPageNum) {
            await renderPage(pageNum + 1);
        }
    });

    document.getElementById('addSlide').addEventListener('click', createNewSlide);

    // PDF rendering function
    async function renderPage(num) {
        if (isNavigating) return;
        isNavigating = true;

        try {
            await saveCurrentSlide();
            const previousPage = pageNum;
            
            // Clear both canvases
            clearDrawingCanvas();
            pdfCtx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);

            let renderSuccess = false;

            // Initialize drawings for this page if not exists
            if (!drawings.has(num)) {
                drawings.set(num, []);
            }

            // First try to render PDF page if within PDF range
            if (pdfDoc && num <= pdfDoc.numPages) {
                try {
                    const page = await pdfDoc.getPage(num);
                    const viewport = page.getViewport({ scale });

                    // Set canvas dimensions
                    pdfCanvas.width = viewport.width;
                    pdfCanvas.height = viewport.height;
                    drawingCanvas.width = viewport.width;
                    drawingCanvas.height = viewport.height;

                    // Render PDF page
                    await page.render({
                        canvasContext: pdfCtx,
                        viewport: viewport
                    }).promise;

                    // Save the PDF page as a slide if not already saved
                    if (!slides.has(num)) {
                        const imageData = pdfCanvas.toDataURL('image/png');
                        slides.set(num, {
                            type: 'pdf',
                            content: imageData,
                            width: viewport.width,
                            height: viewport.height,
                            drawings: drawings.get(num) || []
                        });
                        saveAllSlides(); // Save immediately after creating new slide
                    }

                    renderSuccess = true;
                } catch (error) {
                    console.error('Error rendering PDF page:', error);
                }
            }

            // If PDF render failed or it's a custom slide, try loading from slides
            if (!renderSuccess) {
                const slide = slides.get(num);
                if (slide) {
                    try {
                        // Set canvas dimensions
                        pdfCanvas.width = slide.width || 800;
                        pdfCanvas.height = slide.height || 600;
                        drawingCanvas.width = pdfCanvas.width;
                        drawingCanvas.height = pdfCanvas.height;

                        // Load the slide content
                        await new Promise((resolve, reject) => {
                            const img = new Image();
                            img.onload = () => {
                                pdfCtx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
                                pdfCtx.drawImage(img, 0, 0, pdfCanvas.width, pdfCanvas.height);
                                
                                // Restore drawings
                                if (slide.drawings) {
                                    drawings.set(num, slide.drawings);
                                }
                                redrawCurrentPage();
                                renderSuccess = true;
                                resolve();
                            };
                            img.onerror = () => {
                                reject(new Error('Failed to load slide image'));
                            };
                            img.src = slide.content;
                        });
                    } catch (error) {
                        console.error('Error loading slide:', error);
                    }
                }
            }

            // Update page number and UI if render was successful
            if (renderSuccess) {
                pageNum = num;
                document.getElementById('currentPage').textContent = pageNum;
                redrawCurrentPage();
                updateNavigation();
            } else {
                // Create a new blank slide if render failed
                console.log('Creating new blank slide for page', num);
                const canvas = document.createElement('canvas');
                canvas.width = pdfCanvas.width || 800;
                canvas.height = pdfCanvas.height || 600;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                const imageData = canvas.toDataURL('image/png');
                slides.set(num, {
                    type: 'blank',
                    content: imageData,
                    width: canvas.width,
                    height: canvas.height,
                    drawings: []
                });
                
                pdfCtx.drawImage(canvas, 0, 0);
                renderSuccess = true;
                pageNum = num;
                document.getElementById('currentPage').textContent = pageNum;
                updateNavigation();
                saveAllSlides();
            }

        } catch (error) {
            console.error('Error in renderPage:', error);
            // Revert to previous page on error
            pageNum = previousPage;
            await renderPage(previousPage);
        } finally {
            isNavigating = false;
        }
    }

    // Modified saveCurrentSlide function
    async function saveCurrentSlide() {
        if (!pageNum) return;

        try {
            // Create a temporary canvas to combine PDF and drawings
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = pdfCanvas.width;
            tempCanvas.height = pdfCanvas.height;
            const tempCtx = tempCanvas.getContext('2d');

            // Draw the PDF/base content
            tempCtx.drawImage(pdfCanvas, 0, 0);
            // Draw the annotations
            tempCtx.drawImage(drawingCanvas, 0, 0);

            // Save as slide
            const imageData = tempCanvas.toDataURL('image/png');
            const currentSlide = slides.get(pageNum) || {
                type: 'blank',
                width: pdfCanvas.width,
                height: pdfCanvas.height,
                drawings: []
            };

            slides.set(pageNum, {
                ...currentSlide,
                content: imageData,
                drawings: drawings.get(pageNum) || [],
                lastModified: Date.now()
            });

            // Save to localStorage
            await saveAllSlides();
        } catch (error) {
            console.error('Error saving slide:', error);
        }
    }

    // Modified saveAllSlides function
    async function saveAllSlides() {
        try {
            const slidesData = {};
            for (const [key, value] of slides.entries()) {
                slidesData[key] = value;
            }
            localStorage.setItem('noteTakingAppSlides', JSON.stringify(slidesData));
        } catch (error) {
            console.error('Error saving slides to localStorage:', error);
        }
    }

    // Load slides from localStorage on startup
    function loadSavedSlides() {
        try {
            const savedSlides = localStorage.getItem('noteTakingAppSlides');
            if (savedSlides) {
                const slidesData = JSON.parse(savedSlides);
                slides = new Map(Object.entries(slidesData));
                
                // Restore drawings from slides
                for (const [num, slide] of slides.entries()) {
                    if (slide.drawings) {
                        drawings.set(parseInt(num), slide.drawings);
                    }
                }
            }
        } catch (error) {
            console.error('Error loading saved slides:', error);
        }
    }

    // Navigation state to prevent double clicks
    let isNavigating = false;

    // Modified next/prev page handlers with debouncing
    let lastClickTime = 0;
    const CLICK_DELAY = 300; // Minimum time between clicks in milliseconds

    // Drawing state management
    function initializeDrawingsForPage(pageNum) {
        if (!drawings.has(pageNum)) {
            drawings.set(pageNum, []);
        }
        return drawings.get(pageNum);
    }

    // Clear drawing canvas
    function clearDrawingCanvas() {
        drawCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    }

    // Redraw all paths for current page
    function redrawCurrentPage() {
        clearDrawingCanvas();
        const pageDrawings = drawings.get(pageNum) || [];
        pageDrawings.forEach(path => drawPath(path));
    }

    // Modified drawing functions to handle color properly
    function startDrawing(event) {
        if (!isDrawing) {
            isDrawing = true;
            const coords = getDrawingCoordinates(event);
            currentPath = [{
                x: coords.x,
                y: coords.y,
                type: currentTool,
                color: currentColor,
                size: currentTool === 'eraser' ? eraserSettings.size : 2,
                opacity: currentTool === 'eraser' ? eraserSettings.opacity : 1
            }];

            drawCtx.beginPath();
            drawCtx.moveTo(coords.x, coords.y);
            
            // Set drawing styles
            if (currentTool === 'eraser') {
                drawCtx.globalCompositeOperation = 'destination-out';
                drawCtx.lineWidth = eraserSettings.size;
                drawCtx.globalAlpha = eraserSettings.opacity;
            } else {
                drawCtx.globalCompositeOperation = 'source-over';
                drawCtx.strokeStyle = currentColor;
                drawCtx.lineWidth = 2;
                drawCtx.globalAlpha = 1;
            }
            
            drawCtx.lineCap = 'round';
            drawCtx.lineJoin = 'round';
            event.preventDefault();
        }
    }

    function draw(event) {
        if (isDrawing) {
            const coords = getDrawingCoordinates(event);
            currentPath.push({
                x: coords.x,
                y: coords.y,
                type: currentTool,
                color: currentColor,
                size: currentTool === 'eraser' ? eraserSettings.size : penSettings.size,
                opacity: currentTool === 'eraser' ? eraserSettings.opacity : penSettings.opacity
            });
            
            drawCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
            redrawCurrentPage();
            
            // Draw current stroke
            drawCtx.beginPath();
            
            // Set drawing styles again to ensure they're maintained
            if (currentTool === 'eraser') {
                drawCtx.globalCompositeOperation = 'destination-out';
                drawCtx.lineWidth = eraserSettings.size;
                drawCtx.globalAlpha = eraserSettings.opacity;
            } else {
                drawCtx.globalCompositeOperation = 'source-over';
                drawCtx.strokeStyle = currentColor;
                drawCtx.lineWidth = penSettings.size;
                drawCtx.globalAlpha = penSettings.opacity;
            }
            
            drawCtx.lineCap = 'round';
            drawCtx.lineJoin = 'round';
            
            // Draw the path
            drawCtx.moveTo(currentPath[0].x, currentPath[0].y);
            for (let i = 1; i < currentPath.length; i++) {
                drawCtx.lineTo(currentPath[i].x, currentPath[i].y);
            }
            drawCtx.stroke();
            event.preventDefault();
        }
    }

    function stopDrawing() {
        if (!isDrawing) return;
        isDrawing = false;
        
        // Save the current path to the page's drawings
        if (currentPath.length > 0) {
            const pageDrawings = drawings.get(pageNum);
            pageDrawings.push(currentPath);
            drawings.set(pageNum, pageDrawings);
            saveCurrentSlide();
        }
        
        drawCtx.beginPath(); // Reset the current path
        currentPath = [];
    }

    // Modified redrawCurrentPage function to handle colors properly
    function redrawCurrentPage() {
        drawCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
        
        const pageDrawings = drawings.get(pageNum) || [];
        
        for (const path of pageDrawings) {
            if (path.length > 0) {
                drawCtx.beginPath();
                
                // Set styles based on the path properties
                const firstPoint = path[0];
                if (firstPoint.type === 'eraser') {
                    drawCtx.globalCompositeOperation = 'destination-out';
                    drawCtx.lineWidth = firstPoint.size;
                    drawCtx.globalAlpha = firstPoint.opacity;
                } else {
                    drawCtx.globalCompositeOperation = 'source-over';
                    drawCtx.strokeStyle = firstPoint.color;
                    drawCtx.lineWidth = firstPoint.size;
                    drawCtx.globalAlpha = firstPoint.opacity;
                }
                
                drawCtx.lineCap = 'round';
                drawCtx.lineJoin = 'round';
                
                // Draw the path
                drawCtx.moveTo(path[0].x, path[0].y);
                for (let i = 1; i < path.length; i++) {
                    drawCtx.lineTo(path[i].x, path[i].y);
                }
                drawCtx.stroke();
            }
        }
        
        // Reset context properties
        drawCtx.globalCompositeOperation = 'source-over';
        drawCtx.globalAlpha = 1;
    }

    // Drawing functions
    function drawPath(path) {
        const points = path;
        if (!points || points.length < 1) return;

        if (path[0].type === 'eraser') {
            points.forEach(point => {
                drawCtx.save();
                drawCtx.globalCompositeOperation = 'destination-out';
                drawCtx.globalAlpha = point.opacity;
                drawCtx.beginPath();
                drawCtx.arc(point.x, point.y, point.size/2, 0, Math.PI * 2);
                drawCtx.fill();
                drawCtx.restore();
            });
        } else {
            drawCtx.beginPath();
            drawCtx.moveTo(points[0].x, points[0].y);
            drawCtx.lineWidth = points[0].size;
            drawCtx.strokeStyle = points[0].color;
            drawCtx.lineCap = 'round';
            
            for (let i = 1; i < points.length; i++) {
                drawCtx.lineTo(points[i].x, points[i].y);
            }
            drawCtx.stroke();
        }
    }

    // Modified drawing coordinates calculation for better fullscreen support
    function getDrawingCoordinates(event) {
        const rect = drawingCanvas.getBoundingClientRect();
        const canvasWidth = drawingCanvas.width;
        const canvasHeight = drawingCanvas.height;
        const displayWidth = rect.width;
        const displayHeight = rect.height;
        
        // Get the raw coordinates
        let clientX, clientY;
        if (event.touches && event.touches[0]) {
            clientX = event.touches[0].clientX;
            clientY = event.touches[0].clientY;
        } else {
            clientX = event.clientX;
            clientY = event.clientY;
        }

        // Calculate the scaling factors
        const scaleX = canvasWidth / displayWidth;
        const scaleY = canvasHeight / displayHeight;

        // Get the canvas position relative to the viewport
        const canvasRect = drawingCanvas.getBoundingClientRect();
        
        // Calculate the offset from the canvas edges
        const offsetX = clientX - canvasRect.left;
        const offsetY = clientY - canvasRect.top;

        // Scale the coordinates
        const x = offsetX * scaleX;
        const y = offsetY * scaleY;

        return { x, y };
    }

    // Drawing event listeners
    drawingCanvas.addEventListener('mousedown', startDrawing);
    drawingCanvas.addEventListener('mousemove', draw);
    drawingCanvas.addEventListener('mouseup', stopDrawing);
    drawingCanvas.addEventListener('mouseout', stopDrawing);
    drawingCanvas.addEventListener('touchstart', startDrawing);
    drawingCanvas.addEventListener('touchmove', draw);
    drawingCanvas.addEventListener('touchend', stopDrawing);

    // Pen settings
    let penSettings = {
        size: 2,
        opacity: 1,
        color: '#000000'
    };

    // Pen controls
    const penMenu = document.getElementById('penMenu');
    const penOpacity = document.getElementById('penOpacity');
    const penSize = document.getElementById('penSize');
    const penOpacityValue = document.getElementById('penOpacityValue');
    const penSizeValue = document.getElementById('penSizeValue');

    // Show pen menu on long press
    let penPressTimer;
    penBtn.addEventListener('mousedown', () => {
        penPressTimer = setTimeout(() => {
            penMenu.classList.add('show');
        }, 500); // Show after 500ms hold
    });

    penBtn.addEventListener('mouseup', () => {
        clearTimeout(penPressTimer);
    });

    penBtn.addEventListener('mouseleave', () => {
        clearTimeout(penPressTimer);
    });

    penBtn.addEventListener('touchstart', () => {
        penPressTimer = setTimeout(() => {
            penMenu.classList.add('show');
        }, 500); // Show after 500ms hold
    });

    penBtn.addEventListener('touchend', () => {
        clearTimeout(penPressTimer);
    });

    // Handle pen controls
    penOpacity.addEventListener('input', (e) => {
        penSettings.opacity = e.target.value / 100;
        penOpacityValue.textContent = e.target.value;
    });

    penSize.addEventListener('input', (e) => {
        penSettings.size = parseInt(e.target.value);
        penSizeValue.textContent = e.target.value;
    });

    // Hide pen menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!penMenu.contains(e.target) && e.target !== penBtn) {
            penMenu.classList.remove('show');
        }
    });

    // Tool selection
    toolButtons.penBtn.addEventListener('click', () => {
        currentTool = 'pen';
        drawingCanvas.style.cursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" height="12" width="12"><circle cx="6" cy="6" r="5" stroke="${currentColor}" fill="${currentColor}"/></svg>') 6 6, crosshair`;
    });

    toolButtons.eraserBtn.addEventListener('click', () => {
        currentTool = 'eraser';
        drawingCanvas.style.cursor = 'cell';
    });

    toolButtons.eraserBtn.addEventListener('touchstart', () => {
        currentTool = 'eraser';
        drawingCanvas.style.cursor = 'cell';
    });

    toolButtons.eraserBtn.addEventListener('touchend', () => {
        // No action needed
    });

    // Eraser controls
    const eraserBtn = document.getElementById('eraserBtn');
    const eraserMenu = document.getElementById('eraserMenu');
    const eraserOpacity = document.getElementById('eraserOpacity');
    const eraserSize = document.getElementById('eraserSize');
    const eraserOpacityValue = document.getElementById('eraserOpacityValue');
    const eraserSizeValue = document.getElementById('eraserSizeValue');
    
    let eraserSettings = {
        opacity: 1,
        size: 20
    };

    // Show eraser menu on long press
    let eraserPressTimer;
    eraserBtn.addEventListener('mousedown', () => {
        eraserPressTimer = setTimeout(() => {
            eraserMenu.classList.add('show');
        }, 500); // Show after 500ms hold
    });

    eraserBtn.addEventListener('mouseup', () => {
        clearTimeout(eraserPressTimer);
    });

    eraserBtn.addEventListener('mouseleave', () => {
        clearTimeout(eraserPressTimer);
    });

    eraserBtn.addEventListener('touchstart', () => {
        eraserPressTimer = setTimeout(() => {
            eraserMenu.classList.add('show');
        }, 500); // Show after 500ms hold
    });

    eraserBtn.addEventListener('touchend', () => {
        clearTimeout(eraserPressTimer);
    });

    // Handle eraser controls
    eraserOpacity.addEventListener('input', (e) => {
        eraserSettings.opacity = e.target.value / 100;
        eraserOpacityValue.textContent = e.target.value;
    });

    eraserSize.addEventListener('input', (e) => {
        eraserSettings.size = parseInt(e.target.value);
        eraserSizeValue.textContent = e.target.value;
    });

    // Hide eraser menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!eraserMenu.contains(e.target) && e.target !== eraserBtn) {
            eraserMenu.classList.remove('show');
        }
    });

    // PDF file handling
    toolButtons.pdfBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf';
        input.onchange = async function(event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async function(e) {
                    const typedarray = new Uint8Array(e.target.result);
                    pdfDoc = await pdfjsLib.getDocument(typedarray).promise;
                    
                    // Save PDF data for later use
                    localStorage.setItem('lastPdfData', e.target.result);
                    
                    // Show PDF container
                    document.getElementById('pdfContainer').style.display = 'block';
                    
                    // Initialize with first page
                    pageNum = 1;
                    await renderPage(pageNum);
                    updateNavigation();
                };
                reader.readAsArrayBuffer(file);
            }
        };
        input.click();
    });

    // File handling
    toolButtons.imageBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const range = quill.getSelection(true);
                    quill.insertEmbed(range.index, 'image', event.target.result);
                };
                reader.readAsDataURL(file);
            }
        };
        input.click();
    });

    // Voice recording
    let mediaRecorder;
    let audioChunks = [];

    toolButtons.recordBtn.addEventListener('click', async () => {
        try {
            if (!mediaRecorder || mediaRecorder.state === 'inactive') {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                
                mediaRecorder.ondataavailable = (event) => {
                    audioChunks.push(event.data);
                };

                mediaRecorder.onstop = () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                    const audioUrl = URL.createObjectURL(audioBlob);
                    const audio = document.createElement('audio');
                    audio.src = audioUrl;
                    audio.controls = true;
                    
                    const range = quill.getSelection(true);
                    quill.insertEmbed(range.index, 'audio', audioUrl);
                    
                    audioChunks = [];
                };

                mediaRecorder.start();
                toolButtons.recordBtn.style.color = 'red';
            } else {
                mediaRecorder.stop();
                toolButtons.recordBtn.style.color = '';
            }
        } catch (err) {
            console.error('Error accessing microphone:', err);
        }
    });

    // Undo/Redo functionality
    toolButtons.undoBtn.addEventListener('click', () => {
        if (drawings.has(pageNum)) {
            const pageDrawings = drawings.get(pageNum);
            if (pageDrawings.length > 0) {
                pageDrawings.pop();
                redrawCurrentPage();
            }
        }
    });

    toolButtons.redoBtn.addEventListener('click', () => {
        // Implement redo functionality if needed
    });

    // Save functionality
    function saveNote() {
        const content = quill.getContents();
        localStorage.setItem('note-' + Date.now(), JSON.stringify(content));
    }

    // Auto-save every 30 seconds
    setInterval(saveNote, 30000);

    // Slide management
    let slides = new Map(); // Store all slides
    let currentSlideData = null;

    async function createNewSlide() {
        if (isNavigating) return;
        isNavigating = true;

        try {
            await saveCurrentSlide();
            
            const canvas = document.createElement('canvas');
            canvas.width = pdfCanvas.width || 800;
            canvas.height = pdfCanvas.height || 600;
            const ctx = canvas.getContext('2d');
            
            // Fill with white background
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            const imageData = canvas.toDataURL('image/png');
            const newPageNum = maxPageNum + 1;
            
            // Create new slide
            slides.set(newPageNum, {
                type: 'blank',
                content: imageData,
                width: canvas.width,
                height: canvas.height,
                drawings: []
            });
            
            // Render the new slide
            await renderPage(newPageNum);
            
            // Save to localStorage
            saveAllSlides();
            
        } catch (error) {
            console.error('Error creating new slide:', error);
        } finally {
            isNavigating = false;
        }
    }

    // Save current slide function
    async function saveCurrentSlide() {
        if (!pageNum) return;
        
        // Combine both canvases
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = pdfCanvas.width;
        tempCanvas.height = pdfCanvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Draw the PDF/base content
        tempCtx.drawImage(pdfCanvas, 0, 0);
        // Draw the annotations
        tempCtx.drawImage(drawingCanvas, 0, 0);
        
        // Save combined image
        const imageData = tempCanvas.toDataURL('image/png');
        slides.set(pageNum, {
            type: slides.get(pageNum)?.type || 'blank',
            content: imageData,
            drawings: drawings.get(pageNum) || []
        });
        
        // Save to localStorage
        saveAllSlides();
    }

    // Save all slides to localStorage
    async function saveAllSlides() {
        const slidesData = {};
        slides.forEach((value, key) => {
            slidesData[key] = value;
        });
        localStorage.setItem('noteTakingAppSlides', JSON.stringify(slidesData));
    }

    // Load slides from localStorage
    function loadSavedSlides() {
        const savedSlides = localStorage.getItem('noteTakingAppSlides');
        if (savedSlides) {
            const slidesData = JSON.parse(savedSlides);
            Object.entries(slidesData).forEach(([key, value]) => {
                slides.set(parseInt(key), value);
            });
        }
    }

    // Load last used PDF if available
    async function loadLastPdf() {
        const lastPdfData = localStorage.getItem('lastPdfData');
        if (lastPdfData) {
            try {
                const typedarray = new Uint8Array(JSON.parse(lastPdfData));
                pdfDoc = await pdfjsLib.getDocument(typedarray).promise;
                document.getElementById('pdfContainer').style.display = 'block';
                pageNum = 1;
                await renderPage(pageNum);
            } catch (error) {
                console.log('Error loading last PDF:', error);
                localStorage.removeItem('lastPdfData');
            }
        }
    }

    // Initialize the app
    async function initializeApp() {
        loadSavedSlides();
        await loadLastPdf();
    }

    // Start the app
    initializeApp();

    // Navigation and exit handling
    let maxPageNum = 1;
    const exitSaveDialog = document.getElementById('exitSaveDialog');
    const saveToExistingPdfBtn = document.getElementById('saveToExistingPdf');
    const saveAsNewPdfBtn = document.getElementById('saveAsNewPdf');
    const discardChangesBtn = document.getElementById('discardChanges');
    const cancelExitBtn = document.getElementById('cancelExit');

    // Update navigation function
    function updateNavigation() {
        // Get the maximum page number including both PDF and custom slides
        const pdfPages = pdfDoc ? pdfDoc.numPages : 0;
        const customSlideNumbers = Array.from(slides.keys()).map(k => parseInt(k));
        
        // Calculate true maximum including both PDF pages and custom slides
        maxPageNum = Math.max(
            pdfPages,
            customSlideNumbers.length > 0 ? Math.max(...customSlideNumbers) : 0
        );

        // Update UI
        document.getElementById('currentPage').textContent = pageNum;
        document.getElementById('totalPages').textContent = maxPageNum;
        
        // Enable/disable navigation buttons
        document.getElementById('prevPage').disabled = pageNum <= 1;
        document.getElementById('nextPage').disabled = false; // Allow forward navigation for new slides
    }

    // Save PDF functions
    async function saveAsPdf(existingPdf = false) {
        const { PDFDocument } = PDFLib;
        let pdfDoc;

        if (existingPdf && window.originalPdfBytes) {
            // Modify existing PDF
            pdfDoc = await PDFDocument.load(window.originalPdfBytes);
        } else {
            // Create new PDF
            pdfDoc = await PDFDocument.create();
        }

        // Convert each slide to PDF page
        for (let i = 1; i <= maxPageNum; i++) {
            const slide = slides.get(i);
            if (slide) {
                // Create a new page
                const page = pdfDoc.addPage([
                    pdfCanvas.width,
                    pdfCanvas.height
                ]);

                // Convert slide content to image
                const slideImage = await pdfDoc.embedPng(slide.content);
                page.drawImage(slideImage, {
                    x: 0,
                    y: 0,
                    width: pdfCanvas.width,
                    height: pdfCanvas.height
                });
            }
        }

        // Save the PDF
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        
        // Create download link
        const link = document.createElement('a');
        link.href = url;
        link.download = existingPdf ? 'updated_document.pdf' : 'new_document.pdf';
        link.click();
        
        // Cleanup
        URL.revokeObjectURL(url);
    }

    // Handle window close/refresh
    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges()) {
            e.preventDefault();
            e.returnValue = '';
            showExitDialog();
        }
    });

    // Check for unsaved changes
    function hasUnsavedChanges() {
        return slides.size > 0 || drawings.size > 0;
    }

    // Show exit dialog
    function showExitDialog() {
        exitSaveDialog.classList.add('show');
    }

    // Exit dialog button handlers
    saveToExistingPdfBtn.addEventListener('click', async () => {
        await saveAsPdf(true);
        exitSaveDialog.classList.remove('show');
        clearAllData();
    });

    saveAsNewPdfBtn.addEventListener('click', async () => {
        await saveAsPdf(false);
        exitSaveDialog.classList.remove('show');
        clearAllData();
    });

    discardChangesBtn.addEventListener('click', () => {
        exitSaveDialog.classList.remove('show');
        clearAllData();
    });

    cancelExitBtn.addEventListener('click', () => {
        exitSaveDialog.classList.remove('show');
    });

    // Clear all data
    function clearAllData() {
        slides.clear();
        drawings.clear();
        localStorage.removeItem('noteTakingAppSlides');
        localStorage.removeItem('lastPdfData');
    }

    // Modified PDF file handling to store original PDF
    toolButtons.pdfBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf';
        input.onchange = async function(event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async function(e) {
                    const typedarray = new Uint8Array(e.target.result);
                    window.originalPdfBytes = e.target.result; // Store original PDF
                    pdfDoc = await pdfjsLib.getDocument(typedarray).promise;
                    
                    // Save PDF data for later use
                    localStorage.setItem('lastPdfData', e.target.result);
                    
                    // Show PDF container
                    document.getElementById('pdfContainer').style.display = 'block';
                    
                    // Initialize with first page
                    pageNum = 1;
                    await renderPage(pageNum);
                    updateNavigation();
                };
                reader.readAsArrayBuffer(file);
            }
        };
        input.click();
    });

    // Fullscreen functionality
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const pdfContainer = document.getElementById('pdfContainer');
    let isFullscreen = false;

    // Handle fullscreen changes
    function toggleFullscreen() {
        if (!isFullscreen) {
            // Enter fullscreen
            if (pdfContainer.requestFullscreen) {
                pdfContainer.requestFullscreen();
            } else if (pdfContainer.webkitRequestFullscreen) {
                pdfContainer.webkitRequestFullscreen();
            } else if (pdfContainer.msRequestFullscreen) {
                pdfContainer.msRequestFullscreen();
            }
        } else {
            // Exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    }

    // Update UI when entering/exiting fullscreen
    function updateFullscreenUI() {
        isFullscreen = document.fullscreenElement || 
                      document.webkitFullscreenElement || 
                      document.msFullscreenElement;
        
        pdfContainer.classList.toggle('fullscreen-mode', isFullscreen);
        fullscreenBtn.innerHTML = isFullscreen ? 
            '<i class="fas fa-compress"></i>' : 
            '<i class="fas fa-expand"></i>';
        
        if (isFullscreen) {
            const containerWidth = window.innerWidth;
            const containerHeight = window.innerHeight - 50; // Subtract controls height
            
            // Calculate the scale to fit while maintaining aspect ratio
            const originalWidth = pdfCanvas.width;
            const originalHeight = pdfCanvas.height;
            const scaleX = containerWidth / originalWidth;
            const scaleY = containerHeight / originalHeight;
            const scale = Math.min(scaleX, scaleY) * 0.95; // 95% of container
            
            const scaledWidth = Math.floor(originalWidth * scale);
            const scaledHeight = Math.floor(originalHeight * scale);
            
            // Center the canvases
            const leftOffset = Math.floor((containerWidth - scaledWidth) / 2);
            const topOffset = Math.floor((containerHeight - scaledHeight) / 2);
            
            // Apply styles to both canvases
            const canvasStyle = {
                position: 'absolute',
                width: `${scaledWidth}px`,
                height: `${scaledHeight}px`,
                left: `${leftOffset}px`,
                top: `${topOffset}px`,
                transform: 'none'
            };
            
            Object.assign(pdfCanvas.style, canvasStyle);
            Object.assign(drawingCanvas.style, canvasStyle);
            
            // Update PDF viewer container
            const pdfViewer = document.getElementById('pdfViewer');
            pdfViewer.style.position = 'relative';
            pdfViewer.style.width = '100vw';
            pdfViewer.style.height = `${containerHeight}px`;
            
        } else {
            // Reset styles when exiting fullscreen
            const resetStyle = {
                position: '',
                width: '',
                height: '',
                left: '',
                top: '',
                transform: ''
            };
            
            Object.assign(pdfCanvas.style, resetStyle);
            Object.assign(drawingCanvas.style, resetStyle);
            
            const pdfViewer = document.getElementById('pdfViewer');
            pdfViewer.style.position = '';
            pdfViewer.style.width = '';
            pdfViewer.style.height = '';
        }
        
        // Redraw current page
        redrawCurrentPage();
    }

    // Event listeners for fullscreen
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', updateFullscreenUI);
    document.addEventListener('webkitfullscreenchange', updateFullscreenUI);
    document.addEventListener('msfullscreenchange', updateFullscreenUI);

    // Timer functionality
    let timerInterval;
    let timerRunning = false;
    let timerSeconds = 0;
    
    function updateTimerDisplay() {
        const hours = Math.floor(timerSeconds / 3600);
        const minutes = Math.floor((timerSeconds % 3600) / 60);
        const seconds = timerSeconds % 60;
        
        const display = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        document.getElementById('timerBtn').innerHTML = `<i class="fas fa-clock"></i> ${display}`;
    }
    
    function startTimer() {
        if (!timerRunning) {
            timerInterval = setInterval(() => {
                timerSeconds++;
                updateTimerDisplay();
            }, 1000);
            timerRunning = true;
            document.getElementById('timerBtn').style.color = 'var(--primary-color)';
        } else {
            clearInterval(timerInterval);
            timerRunning = false;
            document.getElementById('timerBtn').style.color = '';
        }
    }
    
    function resetTimer() {
        clearInterval(timerInterval);
        timerRunning = false;
        timerSeconds = 0;
        updateTimerDisplay();
        document.getElementById('timerBtn').style.color = '';
    }
    
    // Add timer event listeners
    document.getElementById('timerBtn').addEventListener('click', startTimer);
    document.getElementById('timerBtn').addEventListener('contextmenu', (e) => {
        e.preventDefault();
        resetTimer();
    });

    // Clock functionality
    function updateClock() {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        document.getElementById('clockDisplay').textContent = `${hours}:${minutes}:${seconds}`;
    }

    // Update clock every second
    setInterval(updateClock, 1000);
    updateClock(); // Initial update
});