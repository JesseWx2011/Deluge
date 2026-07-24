// Tools functionality for Deluge
//
// Both tools are drag driven: press (mouse or finger) and move across the map.
// Draw paints a freehand stroke, measure grows a circle from the press point
// and labels its radius, the way a range ring reads on a radar display.

let measureMode = false;
let drawMode = false;

// Finished strokes plus the one currently under the pointer.
let drawStrokes = [];
let activeStroke = null;
let drawSource = null;
let drawColor = '#ff6b35';
let drawThickness = 3;

let measureCenter = null;
let measureRadiusKm = 0;
let measureMarker = null;
let measureLabel = null;
let measureLabelEl = null;

const MEASURE_CIRCLE_STEPS = 128;
const MEASURE_SOURCE = 'measure-source';
const MEASURE_FILL_LAYER = 'measure-fill';
const MEASURE_OUTLINE_LAYER = 'measure-outline';
const MEASURE_RADIUS_LAYER = 'measure-radius-line';

// Initialize tools
function initTools() {
    const measureTool = document.getElementById('measureTool');
    const drawTool = document.getElementById('drawTool');
    const drawColorPicker = document.getElementById('drawColorPicker');
    const drawThicknessSlider = document.getElementById('drawThicknessSlider');
    const drawClearButton = document.getElementById('drawClearButton');
    const drawUndoButton = document.getElementById('drawUndoButton');
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

    if (drawUndoButton) {
        drawUndoButton.addEventListener('click', undoStroke);
    }
}

// Prevents the map from panning while a tool owns the drag gesture.
function setMapDragging(enabled) {
    if (enabled) {
        map.dragPan.enable();
        map.dragRotate.enable();
        map.touchZoomRotate.enable();
    } else {
        map.dragPan.disable();
        map.dragRotate.disable();
        map.touchZoomRotate.disable();
    }
}

// Toggle measure tool
function toggleMeasureTool() {
    measureMode = !measureMode;

    if (measureMode && drawMode) {
        drawMode = false;
        document.getElementById('drawTool')?.classList.remove('active');
        const drawControls = document.getElementById('drawControls');
        if (drawControls) drawControls.style.display = 'none';
        detachDrawHandlers();
    }

    const measureBtn = document.getElementById('measureTool');
    measureBtn?.classList.toggle('active', measureMode);

    if (measureMode) {
        map.getCanvas().style.cursor = 'crosshair';
        setMapDragging(false);
        initMeasureLayers();
        map.on('mousedown', startMeasure);
        map.on('touchstart', startMeasure);
    } else {
        map.getCanvas().style.cursor = '';
        setMapDragging(true);
        map.off('mousedown', startMeasure);
        map.off('touchstart', startMeasure);
        clearMeasurement();
    }
}

// Toggle draw tool
function toggleDrawTool() {
    drawMode = !drawMode;

    if (drawMode && measureMode) {
        measureMode = false;
        document.getElementById('measureTool')?.classList.remove('active');
        map.off('mousedown', startMeasure);
        map.off('touchstart', startMeasure);
        clearMeasurement();
    }

    const drawBtn = document.getElementById('drawTool');
    drawBtn?.classList.toggle('active', drawMode);

    const drawControls = document.getElementById('drawControls');
    if (drawControls) {
        drawControls.style.display = drawMode ? 'flex' : 'none';
    }

    if (drawMode) {
        map.getCanvas().style.cursor = 'crosshair';
        setMapDragging(false);
        initDrawLayer();
        map.on('mousedown', startStroke);
        map.on('touchstart', startStroke);
    } else {
        map.getCanvas().style.cursor = '';
        setMapDragging(true);
        detachDrawHandlers();
    }
}

function detachDrawHandlers() {
    map.off('mousedown', startStroke);
    map.off('touchstart', startStroke);
    map.off('mousemove', extendStroke);
    map.off('touchmove', extendStroke);
    map.off('mouseup', endStroke);
    map.off('touchend', endStroke);
    activeStroke = null;
}

/* ----------------------- Freehand drawing ----------------------- */

function startStroke(e) {
    if (!drawMode) return;
    e.preventDefault();

    activeStroke = [[e.lngLat.lng, e.lngLat.lat]];
    drawStrokes.push(activeStroke);

    map.on('mousemove', extendStroke);
    map.on('touchmove', extendStroke);
    map.once('mouseup', endStroke);
    map.once('touchend', endStroke);

    renderStrokes();
}

function extendStroke(e) {
    if (!activeStroke) return;
    e.preventDefault();

    const point = [e.lngLat.lng, e.lngLat.lat];
    const last = activeStroke[activeStroke.length - 1];

    // Skip sub-pixel jitter so the stroke stays light to render.
    if (last && Math.abs(last[0] - point[0]) < 1e-6 && Math.abs(last[1] - point[1]) < 1e-6) return;

    activeStroke.push(point);
    renderStrokes();
}

function endStroke() {
    map.off('mousemove', extendStroke);
    map.off('touchmove', extendStroke);

    // A tap without movement leaves a one-point line that renders as nothing.
    if (activeStroke && activeStroke.length < 2) {
        drawStrokes.pop();
        renderStrokes();
    }

    activeStroke = null;
}

function renderStrokes() {
    if (!drawSource) return;

    drawSource.setData({
        type: 'Feature',
        geometry: {
            type: 'MultiLineString',
            coordinates: drawStrokes.filter((stroke) => stroke.length > 1)
        }
    });
}

// Initialize draw layer
function initDrawLayer() {
    if (!map.getSource('draw-source')) {
        map.addSource('draw-source', {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: {
                    type: 'MultiLineString',
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
                'line-opacity': 0.9
            }
        });
    }

    drawSource = map.getSource('draw-source');

    if (map.getLayer('draw-layer')) {
        map.setPaintProperty('draw-layer', 'line-color', drawColor);
        map.setPaintProperty('draw-layer', 'line-width', drawThickness);
    }

    renderStrokes();
}

// Clear drawing
function clearDrawing() {
    drawStrokes = [];
    activeStroke = null;
    renderStrokes();
}

// Remove the most recent stroke
function undoStroke() {
    drawStrokes.pop();
    renderStrokes();
}

// Update draw color
function updateDrawColor(color) {
    drawColor = color;
    if (map.getLayer('draw-layer')) {
        map.setPaintProperty('draw-layer', 'line-color', drawColor);
    }
}

// Update draw thickness
function updateDrawThickness(thickness) {
    drawThickness = parseInt(thickness, 10);
    if (map.getLayer('draw-layer')) {
        map.setPaintProperty('draw-layer', 'line-width', drawThickness);
    }
}

/* ----------------------- Radius measuring ----------------------- */

function initMeasureLayers() {
    if (!map.getSource(MEASURE_SOURCE)) {
        map.addSource(MEASURE_SOURCE, {
            type: 'geojson',
            data: emptyMeasureData()
        });

        map.addLayer({
            id: MEASURE_FILL_LAYER,
            type: 'fill',
            source: MEASURE_SOURCE,
            filter: ['==', '$type', 'Polygon'],
            paint: {
                'fill-color': '#2229ff',
                'fill-opacity': 0.12
            }
        });

        map.addLayer({
            id: MEASURE_OUTLINE_LAYER,
            type: 'line',
            source: MEASURE_SOURCE,
            filter: ['==', '$type', 'Polygon'],
            paint: {
                'line-color': '#ffffff',
                'line-width': 2
            }
        });

        map.addLayer({
            id: MEASURE_RADIUS_LAYER,
            type: 'line',
            source: MEASURE_SOURCE,
            filter: ['==', '$type', 'LineString'],
            paint: {
                'line-color': '#ffffff',
                'line-width': 1.5,
                'line-dasharray': [2, 2]
            }
        });
    }
}

function emptyMeasureData() {
    return { type: 'FeatureCollection', features: [] };
}

function startMeasure(e) {
    if (!measureMode) return;
    e.preventDefault();

    clearMeasurement();
    initMeasureLayers();

    measureCenter = e.lngLat;
    measureRadiusKm = 0;

    measureMarker = new mapboxgl.Marker({ color: '#2229ff' })
        .setLngLat(measureCenter)
        .addTo(map);

    measureLabelEl = document.createElement('div');
    measureLabelEl.className = 'measureRadiusLabel';
    measureLabelEl.textContent = '0.0 mi';

    measureLabel = new mapboxgl.Marker({ element: measureLabelEl })
        .setLngLat(measureCenter)
        .addTo(map);

    map.on('mousemove', growMeasure);
    map.on('touchmove', growMeasure);
    map.once('mouseup', endMeasure);
    map.once('touchend', endMeasure);
}

function growMeasure(e) {
    if (!measureCenter) return;
    e.preventDefault();

    const edge = e.lngLat;
    const distance = calculateDistance(measureCenter.lat, measureCenter.lng, edge.lat, edge.lng);
    measureRadiusKm = distance.km;

    const circle = circlePolygon(measureCenter, measureRadiusKm);

    map.getSource(MEASURE_SOURCE)?.setData({
        type: 'FeatureCollection',
        features: [
            { type: 'Feature', geometry: { type: 'Polygon', coordinates: [circle] }, properties: {} },
            {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [[measureCenter.lng, measureCenter.lat], [edge.lng, edge.lat]]
                },
                properties: {}
            }
        ]
    });

    if (measureLabelEl) {
        measureLabelEl.textContent = `${distance.miles.toFixed(1)} mi`;
        measureLabelEl.title = `${distance.km.toFixed(1)} km`;
    }

    if (measureLabel) {
        // Sit the readout halfway along the radius, like a range ring callout.
        measureLabel.setLngLat([
            (measureCenter.lng + edge.lng) / 2,
            (measureCenter.lat + edge.lat) / 2
        ]);
    }
}

function endMeasure() {
    map.off('mousemove', growMeasure);
    map.off('touchmove', growMeasure);
}

// Builds a geodesic circle around `center` with the given radius in km.
function circlePolygon(center, radiusKm) {
    const coords = [];
    const latRadius = radiusKm / 110.574;
    const lngRadius = radiusKm / (111.32 * Math.cos(center.lat * Math.PI / 180));

    for (let i = 0; i <= MEASURE_CIRCLE_STEPS; i++) {
        const theta = (i / MEASURE_CIRCLE_STEPS) * (2 * Math.PI);
        coords.push([
            center.lng + lngRadius * Math.cos(theta),
            center.lat + latRadius * Math.sin(theta)
        ]);
    }

    return coords;
}

// Clear measurement
function clearMeasurement() {
    measureCenter = null;
    measureRadiusKm = 0;

    map.off('mousemove', growMeasure);
    map.off('touchmove', growMeasure);

    if (measureMarker) {
        measureMarker.remove();
        measureMarker = null;
    }

    if (measureLabel) {
        measureLabel.remove();
        measureLabel = null;
        measureLabelEl = null;
    }

    map.getSource(MEASURE_SOURCE)?.setData(emptyMeasureData());
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
