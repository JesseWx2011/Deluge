// Storm Tracks — fetches SCIT (Storm Cell Identification & Tracking) data per
// radar site and draws each cell's motion vector, matching the look of the
// reference radar image: a white line running through the forecast points,
// small perpendicular tick marks at each forecast step, and a white circle
// marking the cell's current position.

const stormTrackBase = "https://data2.weatherwise.app/radar/processed";

// Half the length (in degrees) of each perpendicular tick mark drawn along
// the track line. Kept small and fixed so it reads as a subtle time marker
// rather than a bold shape.
const STORM_TRACK_TICK_HALF_LEN_DEG = 0.006;

let stormTracksCurrentRadar = null;
let stormTracksRefreshTimer = null;
let stormTracksMetadata = null; // Store metadata for popup
let stormTracksData = null; // Store full data for modal

function emptyFeatureCollection() {
    return { type: "FeatureCollection", features: [] };
}

// Fetches the dir.list for a radar site and returns the most recent filename
// (the names are timestamp-sortable, e.g. "2026_07_14_20_36.geojson").
async function fetchLatestStormTrackFilename(radarCode) {
    const listUrl = `${stormTrackBase}/${radarCode}/SCIT/dir.list`;
    const response = await fetch(listUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();
    const filenames = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (!filenames.length) return null;

    return filenames.sort().at(-1);
}

async function fetchStormTrackData(radarCode) {
    const filename = await fetchLatestStormTrackFilename(radarCode);
    if (!filename) return null;

    const dataUrl = `${stormTrackBase}/${radarCode}/SCIT/${filename}`;
    const response = await fetch(dataUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    return response.json();
}

// Rough planar bearing between two [lon, lat] points — accurate enough at the
// short (tens of km) distances a single storm's forecast track spans.
function bearingRadians(from, to) {
    const [lon1, lat1] = from;
    const [lon2, lat2] = to;
    return Math.atan2(lon2 - lon1, lat2 - lat1);
}

// Builds a short line segment perpendicular to `bearingRad`, centered on `point`.
function perpendicularTickSegment(point, bearingRad, halfLenDeg) {
    const perp = bearingRad + Math.PI / 2;
    const dLon = Math.cos(perp) * halfLenDeg;
    const dLat = Math.sin(perp) * halfLenDeg;

    // Correct for longitude compression away from the equator so the tick
    // doesn't visually stretch east-west at higher latitudes.
    const latRad = (point[1] * Math.PI) / 180;
    const lonScale = Math.cos(latRad) || 1;

    return [
        [point[0] - dLon / lonScale, point[1] - dLat],
        [point[0] + dLon / lonScale, point[1] + dLat]
    ];
}

// Converts a raw SCIT FeatureCollection into the three layers we render:
// the motion-vector lines, the perpendicular forecast ticks, and the
// current-position points.
function buildStormTrackLayers(scitGeojson) {
    const lineFeatures = [];
    const tickFeatures = [];
    const pointFeatures = [];

    (scitGeojson?.features || []).forEach((feature) => {
        const props = feature.properties || {};
        const current = feature.geometry?.coordinates;
        if (!Array.isArray(current) || current.length !== 2) return;

        pointFeatures.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: current },
            properties: props // Store all properties for popup
        });

        const track = props.track || {};
        const forecast = Array.isArray(track.forecast)
            ? track.forecast.filter(pt => Array.isArray(pt) && pt.length === 2)
            : [];

        if (!track.movement || forecast.length === 0) return;

        const linePoints = [current, ...forecast];
        lineFeatures.push({
            type: "Feature",
            geometry: { type: "LineString", coordinates: linePoints },
            properties: { cell_id: props.cell_id || "" }
        });

        for (let i = 0; i < forecast.length; i++) {
            const previousPoint = linePoints[i];
            const thisPoint = forecast[i];
            const bearing = bearingRadians(previousPoint, thisPoint);
            const [tickStart, tickEnd] = perpendicularTickSegment(thisPoint, bearing, STORM_TRACK_TICK_HALF_LEN_DEG);

            tickFeatures.push({
                type: "Feature",
                geometry: { type: "LineString", coordinates: [tickStart, tickEnd] },
                properties: { cell_id: props.cell_id || "" }
            });
        }
    });

    return {
        lines: { type: "FeatureCollection", features: lineFeatures },
        ticks: { type: "FeatureCollection", features: tickFeatures },
        points: { type: "FeatureCollection", features: pointFeatures },
        metadata: scitGeojson?.metadata || {}
    };
}

function setStormTrackLayerData(lines, ticks, points) {
    if (map.getSource("storm-track-lines")) map.getSource("storm-track-lines").setData(lines);
    if (map.getSource("storm-track-ticks")) map.getSource("storm-track-ticks").setData(ticks);
    if (map.getSource("storm-track-points")) map.getSource("storm-track-points").setData(points);
}

async function loadStormTracks(radarId) {
    if (!radarId) return;

    stormTracksCurrentRadar = radarId;

    try {
        const scitGeojson = await fetchStormTrackData(radarId);

        // A newer radar selection came in while this was fetching — drop it.
        if (stormTracksCurrentRadar !== radarId) return;

        if (!scitGeojson) {
            setStormTrackLayerData(emptyFeatureCollection(), emptyFeatureCollection(), emptyFeatureCollection());
            stormTracksMetadata = null;
            stormTracksData = null;
            return;
        }

        stormTracksData = scitGeojson; // Store full data for modal
        const { lines, ticks, points, metadata } = buildStormTrackLayers(scitGeojson);
        stormTracksMetadata = metadata;
        setStormTrackLayerData(lines, ticks, points);
    } catch (error) {
        console.warn(`Storm tracks unavailable for ${radarId}:`, error);
        setStormTrackLayerData(emptyFeatureCollection(), emptyFeatureCollection(), emptyFeatureCollection());
        stormTracksMetadata = null;
        stormTracksData = null;
    }
}
window.loadStormTracks = loadStormTracks;

function initStormTrackLayers() {
    if (map.getSource("storm-track-lines")) return; // already set up

    map.addSource("storm-track-lines", { type: "geojson", data: emptyFeatureCollection() });
    map.addSource("storm-track-ticks", { type: "geojson", data: emptyFeatureCollection() });
    map.addSource("storm-track-points", { type: "geojson", data: emptyFeatureCollection() });

    map.addLayer({
        id: "storm-track-lines-layer",
        type: "line",
        source: "storm-track-lines",
        paint: {
            "line-color": "#ffffff",
            "line-width": 1.5,
            "line-opacity": 0.9
        }
    });

    map.addLayer({
        id: "storm-track-ticks-layer",
        type: "line",
        source: "storm-track-ticks",
        paint: {
            "line-color": "#ffffff",
            "line-width": 1.5,
            "line-opacity": 0.9
        }
    });

    map.addLayer({
        id: "storm-track-points-layer",
        type: "circle",
        source: "storm-track-points",
        paint: {
            "circle-radius": 5,
            "circle-color": "#ffffff",
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#000000"
        }
    });

    // Re-fetch the current radar's tracks whenever this fires again, so a
    // click-to-open popup works right after a style change too.
    map.on("click", "storm-track-points-layer", (e) => {
        if (!e.features.length) return;
        const props = e.features[0].properties || {};
        const coords = e.features[0].geometry.coordinates;

        const cellId = props.cell_id || "Unknown";
        const tower = props.tower || "Unknown";
        const movement = props.track?.movement || {};
        const deg = movement.deg || 0;
        const kts = movement.kts || 0;

        // Convert elevation from meters to feet if available
        const elevationMeters = stormTracksMetadata?.elevation || 0;
        const elevationFeet = Math.round(elevationMeters * 3.28084);

        const popupHTML = `
            <div style="font-family: 'Inter', sans-serif; padding: 0; background: var(--glass-bg); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid var(--glass-border); border-radius: 12px; color: white; max-width: 320px; box-shadow: var(--shadow-lg), var(--shadow-glow);">
                <div style="padding: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <h3 style="margin: 0; color: #fff; font-size: 16px; font-weight: 600;">Storm Cell ${cellId}</h3>
                        <button onclick="openStormTrackModal('${cellId}')" style="background: rgba(34, 41, 255, 0.3); color: white; border: 1px solid rgba(34, 41, 255, 0.4); border-radius: 8px; width: 28px; height: 28px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;">
                            <i class="fa-solid fa-info" style="font-size: 13px;"></i>
                        </button>
                    </div>
                    <div style="font-size: 13px; color: rgba(255,255,255,0.85); line-height: 1.6;">
                        <div><strong>Tower:</strong> ${tower}</div>
                        <div><strong>Movement:</strong> ${deg}° at ${kts} kts</div>
                        <div><strong>Elevation:</strong> ${elevationFeet} ft</div>
                    </div>
                </div>
            </div>
        `;

        new mapboxgl.Popup({ 
            closeButton: true,
            className: 'alertMapboxPopup',
            maxWidth: '320px'
        })
            .setLngLat(coords)
            .setHTML(popupHTML)
            .addTo(map);
    });

    map.on("mouseenter", "storm-track-points-layer", () => {
        map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "storm-track-points-layer", () => {
        map.getCanvas().style.cursor = "";
    });
}

// Storm Track Modal Functions
function createSparkline(data, width, height, color, scanTime, trendId) {
    // Filter out -999 values
    const validData = data.filter(v => v !== -999);
    if (validData.length < 2) return '';

    const min = Math.min(...validData);
    const max = Math.max(...validData);
    const range = max - min || 1;

    // Scale data to fit the SVG
    const points = validData.map((value, index) => {
        const x = (index / (validData.length - 1)) * width ;
        const y = height - ((value - min) / range) * height;
        return `${x},${y}`;
    }).join(' ');

    // Parse scan time to calculate actual times
    let baseTime = new Date();
    if (scanTime) {
        // Parse datetime format like "2026-07-23 21:27:53"
        const parsedTime = new Date(scanTime.replace(' ', 'T'));
        if (!isNaN(parsedTime.getTime())) {
            baseTime = parsedTime;
        }
    }

    // Create time ticks (5-minute intervals) and interactive points
    const tickHeight = 6;
    const ticks = validData.map((_, index) => {
        const x = (index / (validData.length - 1)) * width;
        const minutesAgo = (validData.length - 1 - index) * 5;
        const pointTime = new Date(baseTime.getTime() - minutesAgo * 60000);
        
        // Format as HH:MM
        const hours = pointTime.getHours().toString().padStart(2, '0');
        const minutes = pointTime.getMinutes().toString().padStart(2, '0');
        const timeLabel = `${hours}:${minutes}`;
        
        return `
            <line
                x1="${x}"
                y1="${height}"
                x2="${x}"
                y2="${height + tickHeight}"
                stroke="rgba(255,255,255,0.3)"
                stroke-width="1"
            />
            <text
                x="${x}"
                y="${height + tickHeight + 12}"
                fill="rgba(255,255,255,0.5)"
                font-size="10"
                text-anchor="middle"
                font-family="Inter, sans-serif"
            >${timeLabel}</text>
        `;
    }).join('');

    // Create interactive circles at each data point
    const interactivePoints = validData.map((value, index) => {
        const x = (index / (validData.length - 1)) * width;
        const y = height - ((value - min) / range) * height;
        const minutesAgo = (validData.length - 1 - index) * 5;
        const pointTime = new Date(baseTime.getTime() - minutesAgo * 60000);
        
        const hours = pointTime.getHours().toString().padStart(2, '0');
        const minutes = pointTime.getMinutes().toString().padStart(2, '0');
        const timeLabel = `${hours}:${minutes}`;
        
        return `
            <circle
                cx="${x}"
                cy="${y}"
                r="8"
                fill="transparent"
                class="sparkline-point"
                data-value="${value}"
                data-time="${timeLabel}"
                data-trend-id="${trendId}"
                style="cursor: crosshair;"
            />
        `;
    }).join('');

    return `
        <svg width="${width}" height="${height + 20}" viewBox="0 0 ${width} ${height + 20}" style="display: block;" class="sparkline-svg">
            <polyline
                fill="none"
                stroke="${color}"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                points="${points}"
                style="animation: drawLine 0.8s ease-out forwards; stroke-dasharray: ${width * 2}; stroke-dashoffset: ${width * 2};"
            />
            ${ticks}
            ${interactivePoints}
        </svg>
    `;
}

function openStormTrackModal(cellId) {
    if (!stormTracksData || !stormTracksData.features) {
        console.warn("No storm track data available");
        return;
    }

    const feature = stormTracksData.features.find(f => f.properties?.cell_id === cellId);
    if (!feature) {
        console.warn("Storm cell not found:", cellId);
        return;
    }

    const props = feature.properties || {};
    const structure = props.structure || {};
    const trends = structure.trends || [];
    const track = props.track || {};
    const movement = track.movement || {};
    const forecast = track.forecast || [];
    const metadata = stormTracksData.metadata || {};

    // Convert elevation from meters to feet
    const elevationMeters = metadata.elevation || 0;
    const elevationFeet = Math.round(elevationMeters * 3.28084);

    // Build trends HTML with graphs
    let trendsHTML = '';
    const colors = ['#2229ff', '#00ff88', '#ff6b35', '#ff3366', '#9b59b6', '#f39c12'];
    trends.forEach((trend, index) => {
        const data = trend.data || [];
        const label = trend.type || '';
        const color = colors[index % colors.length];
        
        // Filter out -999 values (missing data)
        const validData = data.filter(v => v !== -999);
        
        if (validData.length > 0) {
            const latest = validData[validData.length - 1];
            const sparkline = createSparkline(validData, 280, 40, color, metadata.datetime, `trend-${index}`);
            
            trendsHTML += `
                <div style="margin-bottom: 20px;">
                    <div style="font-weight: 600; color: #fff; font-size: 14px; margin-bottom: 8px;">${label}</div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="color: rgba(255,255,255,0.85); font-size: 16px; font-weight: 600; min-width: 60px;">${latest}</div>
                        <div style="flex: 1;">${sparkline}</div>
                    </div>
                </div>
            `;
        }
    });


    const modalBody = document.getElementById('stormTrackModalBody');
    modalBody.innerHTML = `
        <div style="padding: 24px;">
            <div style="margin-bottom: 24px;">
                <div style="font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 16px;">Storm Cell ${props.cell_id || 'Unknown'}</div>
                <div style="font-size: 14px; color: rgba(255,255,255,0.85); line-height: 1.8;">
                    <div style="margin-bottom: 8px;"><strong style="color: rgba(255,255,255,0.6);">Tower:</strong> ${props.tower || 'Unknown'}</div>
                    <div style="margin-bottom: 8px;"><strong style="color: rgba(255,255,255,0.6);">Movement:</strong> ${movement.deg || 0}° at ${movement.kts || 0} kts</div>
                    <div style="margin-bottom: 8px;"><strong style="color: rgba(255,255,255,0.6);">Radar Elevation:</strong> ${elevationFeet} ft</div>
                    <div><strong style="color: rgba(255,255,255,0.6);">Scan Time:</strong> ${metadata.datetime || 'Unknown'}</div>
                </div>
            </div>

            <div style="border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 20px;">
                <div style="font-weight: 600; color: #fff; font-size: 15px; margin-bottom: 16px;">Storm Structure Trends</div>
                ${trendsHTML || '<div style="color: rgba(255,255,255,0.5); font-size: 14px;">No trend data available</div>'}
            </div>

        </div>
    `;

    document.getElementById('stormTrackModalContainer').style.display = 'flex';

    // Add hover event listeners to sparkline points
    setTimeout(() => {
        const sparklinePoints = document.querySelectorAll('.sparkline-point');
        sparklinePoints.forEach(point => {
            point.addEventListener('mouseenter', (e) => {
                const value = e.target.getAttribute('data-value');
                const time = e.target.getAttribute('data-time');
                
                // Create or update tooltip
                let tooltip = document.getElementById('sparkline-tooltip');
                if (!tooltip) {
                    tooltip = document.createElement('div');
                    tooltip.id = 'sparkline-tooltip';
                    tooltip.style.cssText = `
                        position: fixed;
                        background: rgba(0, 0, 0, 0.9);
                        color: white;
                        padding: 8px 12px;
                        border-radius: 6px;
                        font-size: 12px;
                        font-family: 'Inter', sans-serif;
                        pointer-events: none;
                        z-index: 10001;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                        border: 1px solid rgba(255,255,255,0.1);
                    `;
                    document.body.appendChild(tooltip);
                }
                
                tooltip.innerHTML = `<div><strong>Time:</strong> ${time}</div><div><strong>Value:</strong> ${value}</div>`;
                tooltip.style.display = 'block';
                
                // Position tooltip near cursor
                const rect = e.target.getBoundingClientRect();
                tooltip.style.left = (rect.left + window.scrollX - 60) + 'px';
                tooltip.style.top = (rect.top + window.scrollY - 50) + 'px';
            });
            
            point.addEventListener('mouseleave', () => {
                const tooltip = document.getElementById('sparkline-tooltip');
                if (tooltip) {
                    tooltip.style.display = 'none';
                }
            });
        });
    }, 100);
}

function closeStormTrackModal() {
    document.getElementById('stormTrackModalContainer').style.display = 'none';
}

window.openStormTrackModal = openStormTrackModal;
window.closeStormTrackModal = closeStormTrackModal;

if (map.loaded()) {
    initStormTrackLayers();
} else {
    map.on("load", initStormTrackLayers);
}

setInterval(() => {
    if (stormTracksCurrentRadar) loadStormTracks(stormTracksCurrentRadar);
}, 60000);

if (typeof window.registerLayerReinit === "function") {
    window.registerLayerReinit(() => {
        initStormTrackLayers();
        if (stormTracksCurrentRadar) loadStormTracks(stormTracksCurrentRadar);
    });
}