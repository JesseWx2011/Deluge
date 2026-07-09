// API's
const nwsRadars = "https://api.weather.gov/radar/stations";
const excludedRadars = ["HWPA2", "TLKA2", "RKJK", "RKSG", "RODN", 'ROCO2'];
let filteredRadarData;

// Product tracking
let selectedProduct = "N0B"; // Default to reflectivity
let currentRadarId = null;
let currentTrimmedId = null;
let currentFirstLetter = null;
window.currentRadarId = null;

const timelineSlider = document.getElementById("timelineSlider");
const timelineTicks = document.getElementById("timelineTicks");
const timelineLabel = document.getElementById("timelineLabel");
let TIMELINE_DATA = [];

const colortables = [
    {"product": "N0B", "source": "../json/colortables/N0B.json"},
    {"product": "N0S", "source": "../json/colortables/N0S.json"}
];

const map = new mapboxgl.Map({
    accessToken: 'pk.eyJ1IjoiaGFzdHl0dWJlIiwiYSI6ImNsa2hkZTh6bzAwazQzZHFyNmF5aTRsZGwifQ.5QJvYIHo0odZ5jCFApV7yw',
    container: 'map',
    style: 'mapbox://styles/hastytube/cman7qzdk00al01sddqg54u7d',
    projection: 'mercator',
    maxZoom: 13.45,
    center: [-96.35, 36.91],
    zoom: 3.2
});

const elSelectedRadarSite = document.getElementById("radarSite");
const elSelectedProduct = document.getElementById("selectedProduct");
const elProductsList = document.getElementById("productsMenu");

const elN0B = document.getElementById("N0B");
const elN0S = document.getElementById("N0S");
const elTZL = document.getElementById("TZL");
const elTV0 = document.getElementById("TV0");


if (elProductsList) {
    elProductsList.addEventListener('click', (event) => {

        const clickedRow = event.target.closest('.productRow');
        
        if (!clickedRow) return;

        const newProductId = clickedRow.dataset.productId;
        
        updateRadarProduct(newProductId);
        
        elProductsList.querySelectorAll('.productRow').forEach(row => {
            row.classList.remove('active');
        });
        clickedRow.classList.add('active');
    });
}

async function radars() {
    try {
        const response = await fetch(nwsRadars);
        const data = await response.json();
        console.log(data);

        // Filter out excluded radars
        filteredRadarData = {
            ...data,
            features: data.features.filter(feature => !excludedRadars.includes(feature.properties.id))
        };

        // If the map is already loaded by the time the API returns, update the source immediately
        if (map.isStyleLoaded() && map.getSource("radars")) {
            map.getSource("radars").setData(filteredRadarData);
        }
    } catch (error) {
        console.error("Error fetching radar data:", error);
    }
}
// Start fetching the data immediately
radars();

map.on('load', () => {
    // Safely handle if data is still fetching when the map finishes loading
    map.addSource("radars", {
        'type': 'geojson',
        'data': filteredRadarData || { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
        "id": "radar",
        'type': "circle",
        'source': 'radars',
        "paint": {
            'circle-radius': 7,
            'circle-stroke-width': 2,
            'circle-color': 'black',
            'circle-stroke-color': 'white'
        }
    });

    // Handle radar circle clicks
    map.on('click', 'radar', (e) => {
        if (e.features.length > 0) {
            const radarId = e.features[0].properties.id;
            selectRadarSite(radarId);
        }
    });

    map.on('mouseleave', 'radar', () => {
        map.getCanvas().style.cursor = '';
    });

    map.on('mouseenter', 'radar', () => {
        map.getCanvas().style.cursor = 'pointer';
    });
});

// Function to get product name from ID
function getProductName(productId) {
    const productMap = {
        'N0B': 'Reflectivity',
        'N0S': 'Velocity (SR)',
        'TZL': 'TDWR Reflectivity',
        'TV0': 'TDWR Velocity',
        'NET': 'Echo Tops'
    };
    return productMap[productId] || '----';
}

function selectRadarSite(radarId) {
    if (!radarId || !filteredRadarData?.features) return;
    
    const feature = filteredRadarData.features.find(f => f.properties?.id === radarId);
    if (!feature) return;

    const trimmedId = radarId.substring(1);
    const firstLetter = radarId.charAt(0);

    currentRadarId = radarId;
    currentTrimmedId = trimmedId;
    currentFirstLetter = firstLetter;
    window.currentRadarId = radarId;

    if (typeof radarMsg === 'function') {
        radarMsg();
    }

    if (elSelectedRadarSite) elSelectedRadarSite.textContent = radarId;

    const rad_config = {
        base: [
            { id: "N0B", name: "Reflectivity", label: "Reflectivity"},
            { id: "N0S", name: "Storm-Relative Velocity", label: "Velocity"},
            { id: "NET", name: "Echo Tops", label: "Echo Tops"}
        ],
        tdwr: [
            {id: "TZL", name: "TDWR Short Range Reflectivity", label: "Reflectivity"},
            {id: "TV0", name: "TDWR Velocity", label: "Velocity"}
        ]
    }

    const isStandardRadar = firstLetter === "K" || firstLetter === "P";
    const availableProducts = isStandardRadar ? rad_config.base : rad_config.tdwr;

    selectedProduct = availableProducts[0].id;

    if (elSelectedProduct) elSelectedProduct.textContent = getProductName(selectedProduct);

    if (elProductsList) {
        elProductsList.innerHTML = ''; // Clear out the old list
        const fragment = document.createDocumentFragment();

        availableProducts.forEach(product => {
            const row = document.createElement('div');
            row.className = 'productRow';
            row.dataset.productId = product.id;
            row.dataset.productName = product.name;
            row.textContent = product.label;
            
            fragment.appendChild(row);
        });

        elProductsList.appendChild(fragment);
    }

    initTimeline(trimmedId, selectedProduct);

    if (map.getLayer('radar')) {
        map.setPaintProperty('radar', 'circle-color', [
            'case',
            ['==', ['get', 'id'], radarId],
            'green',
            'black'
        ]);
    }
}

function formatDisplayTime(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return "00:00";
    return dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function getCDTApiString(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return "0";

    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Chicago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: 'numeric',
            minute: '2-digit',
            hour12: false
        });

        const parts = formatter.formatToParts(dateObj);
        const partMap = {};
        for (const part of parts) {
            if (part.type !== 'literal') {
                partMap[part.type] = part.value;
            }
        }

        let hour = partMap.hour || "0";
        if (hour === '24') hour = '0';
        if (hour.length === 2 && hour.startsWith('0')) {
            hour = hour.slice(1);
        }

        return `${partMap.year || "2026"}${partMap.month || "01"}${partMap.day || "01"}${hour}${partMap.minute || "00"}`;
    } catch (e) {
        return "0";
    }
}

async function verifyTileExists(radarCode, product, apiTimestamp) {
    if (!radarCode || !product || !apiTimestamp || apiTimestamp === "undefined") return false;

    const probeUrl = `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::${radarCode}-${product}-${apiTimestamp}/0/0/0.png`;

    try {
        const response = await fetch(probeUrl, { method: 'HEAD' });
        return response.ok;
    } catch (e) {
        return false;
    }
}

async function generateVerifiedFallbackTimeline(radarCode, product) {
    const candidateFrames = [];
    const now = new Date();
    now.setSeconds(0, 0);
    now.setMinutes(Math.floor(now.getMinutes() / 5) * 5);

    for (let i = 19; i >= 0; i--) {
        const minutesAgo = i * 5;
        const dateObj = new Date(now.getTime() - minutesAgo * 60000);
        const apiValue = getCDTApiString(dateObj);

        candidateFrames.push({
            apiValue,
            displayTime: formatDisplayTime(dateObj),
            labelDetail: i === 0 ? 'Latest' : `-${minutesAgo} min`
        });
    }

    const verificationPromises = candidateFrames.map(async (frame) => {
        const exists = await verifyTileExists(radarCode, product, frame.apiValue);
        return { ...frame, valid: exists };
    });

    const results = await Promise.all(verificationPromises);
    return results;
}

async function initTimeline(radarCode, product) {
    const activeRadar = radarCode || currentTrimmedId;
    const activeProduct = product || selectedProduct;

    if (!activeRadar || !activeProduct) {
        console.warn("initTimeline: Missing radar identifier or product parameters.");
        return;
    }

    const url = `https://mesonet.agron.iastate.edu/json/radar.py?operation=list&radar=${activeRadar}&product=${activeProduct}`;

    try {
        const response = await fetch(url);
        const json = await response.json();

        if (json && json.scans && json.scans.length > 0) {
            TIMELINE_DATA = json.scans.map((scan, index, arr) => {
                const timeString = scan.ts || scan.valid || scan.time || null;
                const dateObj = timeString ? new Date(timeString) : new Date();
                const isLatest = index === arr.length - 1;

                return {
                    apiValue: isLatest ? '0' : getCDTApiString(dateObj),
                    displayTime: formatDisplayTime(dateObj),
                    labelDetail: isLatest ? 'Latest' : formatDisplayTime(dateObj)
                };
            });
        } else {
            TIMELINE_DATA = await generateVerifiedFallbackTimeline(activeRadar, activeProduct);
        }
    } catch (error) {
        console.warn("Radar API metadata fetch failed. Triggering fallback validation system...", error);
        TIMELINE_DATA = await generateVerifiedFallbackTimeline(activeRadar, activeProduct);
    }

    setupTimelineUI();
}

function setupTimelineUI() {
    if (!timelineSlider || !TIMELINE_DATA || TIMELINE_DATA.length === 0) return;

    timelineSlider.max = TIMELINE_DATA.length - 1;
    buildTimelineTicks();

    const defaultIndex = TIMELINE_DATA.length - 1;
    updateTimelineDisplay(defaultIndex);

    if (TIMELINE_DATA[defaultIndex]) {
        loadRadarImage(TIMELINE_DATA[defaultIndex].apiValue);
    }
}

function buildTimelineTicks() {
    if (!timelineTicks || TIMELINE_DATA.length === 0) return;
    timelineTicks.innerHTML = '';

    const step = Math.max(1, Math.floor(TIMELINE_DATA.length / 4));

    for (let i = 0; i < TIMELINE_DATA.length; i += step) {
        const frame = TIMELINE_DATA[i];
        if (!frame) continue;
        const tick = document.createElement('span');
        tick.className = 'timelineTick';
        tick.textContent = frame.displayTime || "";
        timelineTicks.appendChild(tick);
    }
}

function updateTimelineDisplay(frameIndex) {
    const frame = TIMELINE_DATA[frameIndex];
    if (!frame) return;

    if (timelineLabel) {
        timelineLabel.textContent = frame.labelDetail === 'Latest'
            ? 'Latest'
            : `${frame.displayTime} (${frame.labelDetail})`;
    }

    if (timelineSlider) {
        timelineSlider.value = frameIndex;
    }
}

function loadRadarImage(apiTimestamp) {
    const radar = typeof currentTrimmedId !== 'undefined' ? currentTrimmedId : '';
    const product = typeof selectedProduct !== 'undefined' ? selectedProduct : '';
    const cleanTimestamp = (!apiTimestamp || apiTimestamp === "undefined") ? "0" : apiTimestamp;

    if (!radar || !product) return;

    if (map.getLayer('radar-image-layer')) {
        map.removeLayer('radar-image-layer');
    }

    if (map.getSource('radar-image')) {
        map.removeSource('radar-image');
    }

    const radarImageUrl = `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::${radar}-${product}-${cleanTimestamp}/{z}/{x}/{y}.png`;

    map.addSource('radar-image', {
        'type': 'raster',
        'tiles': [radarImageUrl],
        'tileSize': 256,
        'attribution': 'Iowa State University'
    }, 'road-minor');

    map.addLayer({
        'id': 'radar-image-layer',
        'type': 'raster',
        'source': 'radar-image',
        'paint': {
            'raster-opacity': 1
        }
    }, 'alerts-outline');
}

if (timelineSlider) {
    timelineSlider.addEventListener('click', (e) => e.stopPropagation());
    timelineSlider.addEventListener('mousedown', (e) => e.stopPropagation());

    timelineSlider.addEventListener('input', (e) => {
        const frameIndex = parseInt(e.target.value, 10);
        updateTimelineDisplay(frameIndex);

        const frame = TIMELINE_DATA[frameIndex];
        if (frame) {
            loadRadarImage(frame.apiValue);
        }
    });
}

// Function to update radar product (called from animation.js when product is selected)
function updateRadarProduct(productId) {
    selectedProduct = productId;
    if (elSelectedProduct) elSelectedProduct.textContent = getProductName(productId);

    if (currentTrimmedId) {
        initTimeline(currentTrimmedId, productId);
    } else {
        loadRadarImage();
    }
}
