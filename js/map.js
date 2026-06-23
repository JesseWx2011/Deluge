// API's
const nwsRadars = "https://api.weather.gov/radar/stations";
const excludedRadars = ["HWPA2", "TLKA2", "RKJK", "RKSG", "RODN", 'ROCO2'];
let filteredRadarData;

// Product tracking
let selectedProduct = "N0B"; // Default to reflectivity
let currentRadarId = null;
let currentTrimmedId = null;
let currentFirstLetter = null;

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

const elN0B = document.getElementById("N0B");
const elN0S = document.getElementById("N0S");
const elTZL = document.getElementById("TZL");
const elTV0 = document.getElementById("TV0");

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
        'TV0': 'TDWR Velocity'
    };
    return productMap[productId] || '----';
}

function selectRadarSite(radarId) {
    // FIXED: Removed "window." so it accurately targets the top-level let variable
    if (!radarId || !filteredRadarData?.features) return;
    
    const feature = filteredRadarData.features.find(f => f.properties?.id === radarId);
    if (!feature) return;

    const trimmedId = radarId.substring(1);
    const firstLetter = radarId.charAt(0);

    currentRadarId = radarId;
    currentTrimmedId = trimmedId;
    currentFirstLetter = firstLetter;

    if (elSelectedRadarSite) elSelectedRadarSite.textContent = radarId;

    if (firstLetter === 'K' || firstLetter === 'P') {
        selectedProduct = 'N0B';
    } else {
        selectedProduct = 'TZL';
    }

    if (elSelectedProduct) elSelectedProduct.textContent = getProductName(selectedProduct);
    loadRadarImage();

    if (map.getLayer('radar')) {
        map.setPaintProperty('radar', 'circle-color', [
            'case',
            ['==', ['get', 'id'], radarId],
            'green',
            'black'
        ]);
    }
    }


// Function to load radar image with current product
function loadRadarImage() {
    if (!currentTrimmedId || !selectedProduct) return;

    if (map.getSource('radar-image')) {
        map.removeLayer('radar-image-layer');
        map.removeSource('radar-image');
    }

    // Create the radar image URL with the selected product
    const radarImageUrl = `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::${currentTrimmedId}-${selectedProduct}-0/{z}/{x}/{y}.png`;

    // Add new image source with opacity 1
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

// Function to update radar product (called from animation.js when product is selected)
function updateRadarProduct(productId) {
    selectedProduct = productId;
    if (elSelectedProduct) elSelectedProduct.textContent = getProductName(productId);
    loadRadarImage();
}
