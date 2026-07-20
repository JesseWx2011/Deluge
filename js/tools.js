// Tools functionality for Deluge
let measureMode = false;
let drawMode = false;
let measurePoints = [];
let drawPoints = [];
let measureMarker = null;
let measureLine = null;
let measurePopup = null;
let drawSource = null;
let drawLayer = null;
let drawColor = '#ff6b35';
let drawThickness = 3;

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
}

// Toggle measure tool
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
        map.on('click', handleMeasureClick);
    } else {
        map.getCanvas().style.cursor = '';
        map.off('click', handleMeasureClick);
        clearMeasurement();
    }
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
        map.on('click', handleDrawClick);
    } else {
        map.getCanvas().style.cursor = '';
        map.dragPan.enable();
        map.scrollZoom.enable();
        map.doubleClickZoom.enable();
        map.off('click', handleDrawClick);
    }
}

// Handle measure click
function handleMeasureClick(e) {
    if (!measureMode) return;
    
    const point = e.lngLat;
    measurePoints.push(point);
    
    if (measurePoints.length === 1) {
        // First point - add marker
        measureMarker = new mapboxgl.Marker({
            color: '#2229ff'
        })
        .setLngLat(point)
        .addTo(map);
    } else if (measurePoints.length === 2) {
        // Second point - draw line and show distance
        const start = measurePoints[0];
        const end = measurePoints[1];
        
        // Calculate distance
        const distance = calculateDistance(start.lat, start.lng, end.lat, end.lng);
        
        // Draw line
        if (map.getSource('measure-line')) {
            map.getSource('measure-line').setData({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [[start.lng, start.lat], [end.lng, end.lat]]
                }
            });
        } else {
            map.addSource('measure-line', {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: [[start.lng, start.lat], [end.lng, end.lat]]
                    }
                }
            });
            
            map.addLayer({
                id: 'measure-line',
                type: 'line',
                source: 'measure-line',
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': '#2229ff',
                    'line-width': 3,
                    'line-opacity': 0.8
                }
            });
        }
        
        // Show popup with distance
        const midpoint = [(start.lng + end.lng) / 2, (start.lat + end.lat) / 2];
        measurePopup = new mapboxgl.Popup({ closeButton: true, closeOnClick: false })
            .setLngLat(midpoint)
            .setHTML(`
                <div style="padding: 8px; font-family: 'Rubik', sans-serif;">
                    <div style="font-weight: 600; color: white;">Distance</div>
                    <div style="color: rgba(255,255,255,0.8); font-size: 14px;">
                        ${distance.miles.toFixed(2)} mi<br>
                        ${distance.km.toFixed(2)} km
                    </div>
                </div>
            `)
            .addTo(map);
        
        // Add end marker
        new mapboxgl.Marker({
            color: '#2229ff'
        })
        .setLngLat(end)
        .addTo(map);
        
        // Reset for new measurement
        measurePoints = [];
        measureMarker = null;
    }
}

// Handle draw click
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
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: []
                }
            }
        });
        
        map.addLayer({
            id: 'draw-layer',
            type: 'line',
            source: 'draw-source',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': drawColor,
                'line-width': drawThickness,
                'line-opacity': 0.8
            }
        });
    }
    
    drawSource = map.getSource('draw-source');
    drawLayer = map.getLayer('draw-layer');
    
    // Update paint properties with current settings
    if (drawLayer) {
        map.setPaintProperty('draw-layer', 'line-color', drawColor);
        map.setPaintProperty('draw-layer', 'line-width', drawThickness);
    }
}

// Clear measurement
function clearMeasurement() {
    measurePoints = [];
    
    if (measureMarker) {
        measureMarker.remove();
        measureMarker = null;
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
    
    if (drawSource) {
        drawSource.setData({
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: []
            }
        });
    }
}

// Update draw color
function updateDrawColor(color) {
    drawColor = color;
    if (drawLayer) {
        map.setPaintProperty('draw-layer', 'line-color', drawColor);
    }
}

// Update draw thickness
function updateDrawThickness(thickness) {
    drawThickness = parseInt(thickness);
    if (drawLayer) {
        map.setPaintProperty('draw-layer', 'line-width', drawThickness);
    }
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

// Initialize tools when DOM is ready
document.addEventListener('DOMContentLoaded', initTools);
