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
            properties: { cell_id: props.cell_id || "", tower: props.tower || "" }
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
        points: { type: "FeatureCollection", features: pointFeatures }
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
            return;
        }

        const { lines, ticks, points } = buildStormTrackLayers(scitGeojson);
        setStormTrackLayerData(lines, ticks, points);
    } catch (error) {
        console.warn(`Storm tracks unavailable for ${radarId}:`, error);
        setStormTrackLayerData(emptyFeatureCollection(), emptyFeatureCollection(), emptyFeatureCollection());
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
        const cellId = e.features[0].properties?.cell_id;
        if (cellId) console.log("Storm cell:", cellId);
    });

    map.on("mouseenter", "storm-track-points-layer", () => {
        map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "storm-track-points-layer", () => {
        map.getCanvas().style.cursor = "";
    });
}

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