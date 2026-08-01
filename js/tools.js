// Tools functionality for Deluge
let measureMode = false;
let drawMode = false;
let measurePoints = [];
let drawPoints = [];
let measureStartMarker = null;
let measureEndMarker = null;
let measureLine = null;
let measurePopup = null;
let measureToolbar = null;
let measureStartPoint = null;
let measureCurrentPoint = null;
let measureIsDragging = false;
let measureLockMap = true;
let measureUnits = 'mi';
let drawSource = null;
let drawLayer = null;
let drawColor = '#ff6b35';
let drawThickness = 3;
let isDrawing = false;
let currentStroke = [];
let allStrokes = []; // Store multiple strokes with their colors

// Initialize tools
function initTools() {
    const measureTool = document.getElementById('measureTool');
    const drawTool = document.getElementById('drawTool');
    const drawColorPicker = document.getElementById('drawColorPicker');
    const drawThicknessSlider = document.getElementById('drawThicknessSlider');
    const drawClearButton = document.getElementById('drawClearButton');
    const drawThicknessValue = document.getElementById('drawThicknessValue');
    
    if (measureTool) {
        measureTool.addEventListener('click', toggleMeasureTool);
    }

    createMeasureToolbar();
    
    if (drawTool) {
        drawTool.addEventListener('click', toggleDrawTool);
    }
    
    if (drawColorPicker) {
        drawColorPicker.addEventListener('input', (e) => {
            updateDrawColor(e.target.value);
        });
    }
    
    if (drawThicknessSlider) {
        drawThicknessSlider.addEventListener('input', (e) => {
            const thickness = e.target.value;
            updateDrawThickness(thickness);
            if (drawThicknessValue) {
                drawThicknessValue.textContent = thickness + 'px';
            }
        });
    }
    
    if (drawClearButton) {
        drawClearButton.addEventListener('click', clearDrawing);
    }
    
    // Initialize color palette
    const colorPaletteItems = document.querySelectorAll('.colorPaletteItem');
    colorPaletteItems.forEach(item => {
        item.addEventListener('click', () => {
            const color = item.dataset.color;
            updateDrawColor(color);
            drawColorPicker.value = color;
            
            // Update active state
            colorPaletteItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        });
    });
    
    // Set initial active color
    const initialColor = drawColorPicker.value;
    const initialItem = document.querySelector(`.colorPaletteItem[data-color="${initialColor}"]`);
    if (initialItem) {
        initialItem.classList.add('active');
    }
}

function createMeasureToolbar() {
    if (document.getElementById('measureToolbar')) return;

    const toolbar = document.createElement('div');
    toolbar.id = 'measureToolbar';
    toolbar.className = 'measureToolbar';
    toolbar.innerHTML = `
        <label class="measureToolbarLabel">
            <span>Units</span>
            <select id="measureUnitsSelect" class="measureToolbarSelect">
                <option value="mi">Miles</option>
                <option value="km">Kilometers</option>
                <option value="ft">Feet</option>
                <option value="m">Meters</option>
            </select>
        </label>
        <label class="measureToolbarToggle">
            <input id="measureLockToggle" type="checkbox" checked>
            <span>Lock mode</span>
        </label>
        <button id="measureCopyButton" class="measureToolbarButton" type="button">Copy</button>
    `;

    document.body.appendChild(toolbar);
    measureToolbar = toolbar;

    const unitsSelect = document.getElementById('measureUnitsSelect');
    const lockToggle = document.getElementById('measureLockToggle');
    const copyButton = document.getElementById('measureCopyButton');

    unitsSelect?.addEventListener('change', (e) => {
        measureUnits = e.target.value;
        updateMeasureDisplay();
    });

    lockToggle?.addEventListener('change', (e) => {
        measureLockMap = e.target.checked;
        if (!measureMode) return;
        if (measureLockMap) {
            map.dragPan.disable();
            map.scrollZoom.disable();
            map.doubleClickZoom.disable();
        } else {
            map.dragPan.enable();
            map.scrollZoom.enable();
            map.doubleClickZoom.enable();
        }
    });

    copyButton?.addEventListener('click', () => {
        if (measurePopup && measureCurrentPoint) {
            const text = measurePopup.getElement()?.textContent || '';
            navigator.clipboard?.writeText(text.replace(/\s+/g, ' ').trim());
        }
    });
}

function showMeasureToolbar(show) {
    if (!measureToolbar) return;
    measureToolbar.style.display = show ? 'flex' : 'none';
}

function toggleMeasureTool() {
    measureMode = !measureMode;
    
    // Disable draw mode if measure mode is enabled
    if (measureMode && drawMode) {
        drawMode = false;
        document.getElementById('drawTool')?.classList.remove('active');
        clearDrawing();
    }
    
    const measureBtn = document.getElementById('measureTool');
    measureBtn?.classList.toggle('active', measureMode);
    
    if (measureMode) {
        map.getCanvas().style.cursor = 'crosshair';
        showMeasureToolbar(true);
        if (measureLockMap) {
            map.dragPan.disable();
            map.scrollZoom.disable();
            map.doubleClickZoom.disable();
        }
        map.on('mousedown', handleMeasureStart);
        map.on('mousemove', handleMeasureMove);
        map.on('mouseup', handleMeasureEnd);
        map.on('touchstart', handleMeasureStart);
        map.on('touchmove', handleMeasureMove);
        map.on('touchend', handleMeasureEnd);
    } else {
        map.getCanvas().style.cursor = '';
        showMeasureToolbar(false);
        map.dragPan.enable();
        map.scrollZoom.enable();
        map.doubleClickZoom.enable();
        map.off('mousedown', handleMeasureStart);
        map.off('mousemove', handleMeasureMove);
        map.off('mouseup', handleMeasureEnd);
        map.off('touchstart', handleMeasureStart);
        map.off('touchmove', handleMeasureMove);
        map.off('touchend', handleMeasureEnd);
        clearMeasurement();
    }
}

function handleMeasureStart(e) {
    if (!measureMode) return;

    if (e.type === 'touchstart') {
        e.preventDefault();
    }

    const point = e.lngLat || (e.touches && e.touches[0] ? map.unproject(e.touches[0]) : null);
    if (!point) return;

    measureIsDragging = true;
    measureStartPoint = { lat: point.lat, lng: point.lng };
    measureCurrentPoint = { lat: point.lat, lng: point.lng };
    measurePoints = [measureStartPoint];

    if (measureStartMarker) {
        measureStartMarker.remove();
    }
    if (measureEndMarker) {
        measureEndMarker.remove();
    }

    measureStartMarker = createCircularMeasureMarker([measureStartPoint.lng, measureStartPoint.lat], '#2563eb');
    measureEndMarker = createCircularMeasureMarker([measureCurrentPoint.lng, measureCurrentPoint.lat], '#f59e0b');

    updateMeasurementPopup(measureStartPoint, measureCurrentPoint);
}

function handleMeasureMove(e) {
    if (!measureMode || !measureIsDragging) return;

    if (e.type === 'touchmove') {
        e.preventDefault();
    }

    const point = e.lngLat || (e.touches && e.touches[0] ? map.unproject(e.touches[0]) : null);
    if (!point) return;

    measureCurrentPoint = { lat: point.lat, lng: point.lng };
    updateMeasurementPopup(measureStartPoint, measureCurrentPoint);
}

function handleMeasureEnd(e) {
    if (!measureMode || !measureIsDragging) return;

    measureIsDragging = false;

    const point = e.lngLat || (e.touches && e.touches[0] ? map.unproject(e.touches[0]) : null);
    if (point) {
        measureCurrentPoint = { lat: point.lat, lng: point.lng };
    }

    if (measureStartPoint && measureCurrentPoint) {
        updateMeasurementPopup(measureStartPoint, measureCurrentPoint);
    }
}

function createCircularMeasureMarker(lngLat, color) {
    const element = document.createElement('div');
    element.className = 'measureMarkerDot';
    element.style.background = color;
    element.style.borderColor = color;
    return new mapboxgl.Marker({ element }).setLngLat(lngLat).addTo(map);
}

function updateMeasurementPopup(startPoint, endPoint) {
    const distance = calculateDistance(startPoint.lat, startPoint.lng, endPoint.lat, endPoint.lng);
    const value = formatDistance(distance);
    const midpoint = [(startPoint.lng + endPoint.lng) / 2, (startPoint.lat + endPoint.lat) / 2];

    if (measurePopup) {
        measurePopup.remove();
    }

    measurePopup = new mapboxgl.Popup({ closeButton: true, closeOnClick: false, offset: [0, -10] })
        .setLngLat(midpoint)
        .setHTML(`
            <div style="padding: 8px; font-family: 'Rubik', sans-serif; min-width: 170px;">
                <div style="font-weight: 700; color: white; margin-bottom: 4px;">Measurement</div>
                <div id="measureValue" style="color: rgba(255,255,255,0.9); font-size: 14px;">${value}</div>
            </div>
        `)
        .addTo(map);

    if (measureStartMarker) {
        measureStartMarker.remove();
    }
    if (measureEndMarker) {
        measureEndMarker.remove();
    }

    measureStartMarker = createCircularMeasureMarker([startPoint.lng, startPoint.lat], '#2563eb');
    measureEndMarker = createCircularMeasureMarker([endPoint.lng, endPoint.lat], '#f59e0b');

    updateMeasureDisplay();
}

function updateMeasureDisplay() {
    if (!measurePopup || !measureStartPoint || !measureCurrentPoint) return;
    const distance = calculateDistance(measureStartPoint.lat, measureStartPoint.lng, measureCurrentPoint.lat, measureCurrentPoint.lng);
    const value = formatDistance(distance);
    const valueEl = measurePopup.getElement()?.querySelector('#measureValue');
    if (valueEl) {
        valueEl.textContent = value;
    }
}

function formatDistance(distance) {
    const unitValue = (() => {
        switch (measureUnits) {
            case 'km': return distance.km;
            case 'ft': return distance.km * 3280.84;
            case 'm': return distance.km * 1000;
            default: return distance.miles;
        }
    })();

    const unitLabel = (() => {
        switch (measureUnits) {
            case 'km': return 'km';
            case 'ft': return 'ft';
            case 'm': return 'm';
            default: return 'mi';
        }
    })();

    return `${unitValue.toFixed(2)} ${unitLabel}`;
}

// Toggle draw tool
function toggleDrawTool() {
    drawMode = !drawMode;
    
    // Disable measure mode if draw mode is enabled
    if (drawMode && measureMode) {
        measureMode = false;
        document.getElementById('measureTool')?.classList.remove('active');
        clearMeasurement();
    }
    
    const drawBtn = document.getElementById('drawTool');
    drawBtn?.classList.toggle('active', drawMode);
    
    // Show/hide draw controls
    const drawControls = document.getElementById('drawControls');
    if (drawControls) {
        drawControls.style.display = drawMode ? 'flex' : 'none';
    }
    
    if (drawMode) {
        map.getCanvas().style.cursor = 'crosshair';
        map.dragPan.disable();
        map.scrollZoom.disable();
        map.doubleClickZoom.disable();
        initDrawLayer();
        map.on('mousedown', handleDrawStart);
        map.on('mousemove', handleDrawMove);
        map.on('mouseup', handleDrawEnd);
        map.on('touchstart', handleDrawStart);
        map.on('touchmove', handleDrawMove);
        map.on('touchend', handleDrawEnd);
    } else {
        map.getCanvas().style.cursor = '';
        map.dragPan.enable();
        map.scrollZoom.enable();
        map.doubleClickZoom.enable();
        map.off('mousedown', handleDrawStart);
        map.off('mousemove', handleDrawMove);
        map.off('mouseup', handleDrawEnd);
        map.off('touchstart', handleDrawStart);
        map.off('touchmove', handleDrawMove);
        map.off('touchend', handleDrawEnd);
    }
}


// Handle draw start
function handleDrawStart(e) {
    if (!drawMode) return;
    
    // Prevent default touch behavior
    if (e.type === 'touchstart') {
        e.preventDefault();
    }
    
    isDrawing = true;
    
    const point = e.lngLat || (e.touches && e.touches[0] ? map.unproject(e.touches[0]) : null);
    if (!point) return;
    
    currentStroke = {
        center: [point.lng, point.lat],
        radius: Math.max(6, drawThickness * 2),
        color: drawColor,
        thickness: drawThickness
    };

    updateDrawLayer();
}

// Handle draw move
function handleDrawMove(e) {
    if (!drawMode || !isDrawing || !currentStroke) return;
    
    // Prevent default touch behavior
    if (e.type === 'touchmove') {
        e.preventDefault();
    }
    
    const point = e.lngLat || (e.touches && e.touches[0] ? map.unproject(e.touches[0]) : null);
    if (!point) return;

    const distance = calculateDistance(currentStroke.center[1], currentStroke.center[0], point.lat, point.lng);
    currentStroke.radius = Math.max(6, Math.min(120, distance.km * 1000 / 10));
    updateDrawLayer();
}

// Handle draw end
function handleDrawEnd(e) {
    if (!drawMode || !isDrawing || !currentStroke) return;
    
    isDrawing = false;
    
    if (currentStroke.radius && currentStroke.radius > 0) {
        allStrokes.push({
            center: [...currentStroke.center],
            radius: currentStroke.radius,
            color: currentStroke.color,
            thickness: currentStroke.thickness
        });
    }
    
    currentStroke = null;
    updateDrawLayer();
}

// Handle draw click (legacy, kept for compatibility)
function handleDrawClick(e) {
    if (!drawMode) return;
    
    const point = [e.lngLat.lng, e.lngLat.lat];
    drawPoints.push(point);
    
    // Update draw layer
    if (drawSource) {
        drawSource.setData({
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: drawPoints
            }
        });
    }
}

// Initialize draw layer
function initDrawLayer() {
    if (!map.getSource('draw-source')) {
        map.addSource('draw-source', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });
        
        map.addLayer({
            id: 'draw-layer',
            type: 'circle',
            source: 'draw-source',
            paint: {
                'circle-color': ['get', 'color'],
                'circle-radius': ['get', 'radius'],
                'circle-opacity': 0.8,
                'circle-stroke-width': 1,
                'circle-stroke-color': ['get', 'color']
            }
        });
    }
    
    drawSource = map.getSource('draw-source');
    drawLayer = map.getLayer('draw-layer');
}

// Update draw layer with all strokes
function updateDrawLayer() {
    if (!drawSource) return;
    
    const features = [];
    
    // Add all completed strokes
    allStrokes.forEach(stroke => {
        if (stroke.center && stroke.radius) {
            features.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: stroke.center
                },
                properties: {
                    color: stroke.color,
                    radius: stroke.radius,
                    thickness: stroke.thickness
                }
            });
        }
    });
    
    // Add current stroke being drawn
    if (currentStroke && currentStroke.center && currentStroke.radius) {
        features.push({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: currentStroke.center
            },
            properties: {
                color: currentStroke.color,
                radius: currentStroke.radius,
                thickness: currentStroke.thickness
            }
        });
    }
    
    drawSource.setData({
        type: 'FeatureCollection',
        features: features
    });
}

// Clear measurement
function clearMeasurement() {
    measurePoints = [];
    
    if (measureStartMarker) {
        measureStartMarker.remove();
        measureStartMarker = null;
    }
    if (measureEndMarker) {
        measureEndMarker.remove();
        measureEndMarker = null;
    }
    
    if (measurePopup) {
        measurePopup.remove();
        measurePopup = null;
    }
    
    if (map.getLayer('measure-line')) {
        map.removeLayer('measure-line');
    }
    
    if (map.getSource('measure-line')) {
        map.removeSource('measure-line');
    }
}

// Clear drawing
function clearDrawing() {
    drawPoints = [];
    currentStroke = null;
    allStrokes = [];
    
    if (drawSource) {
        drawSource.setData({
            type: 'FeatureCollection',
            features: []
        });
    }
}

// Update draw color
function updateDrawColor(color) {
    drawColor = color;
    // Color will apply to new strokes, existing strokes keep their colors
}

// Update draw thickness
function updateDrawThickness(thickness) {
    drawThickness = parseInt(thickness);
    // Thickness will apply to new strokes, existing strokes keep their thickness
}

// Calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const km = R * c;
    const miles = km * 0.621371;
    
    return { km, miles };
}

// ---------------------------------------------------------------------
// Context Menu
// ---------------------------------------------------------------------
// The standalone context-menu script now owns this behavior.
// Keep tools.js focused on the tool UI and handlers.
