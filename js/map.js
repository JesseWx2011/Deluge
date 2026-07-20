// Changing the base map style (Settings panel) wipes every custom source/layer,
// so any module that adds its own layers should register a small "rebuild
// everything" function here. They all get replayed once the new style loads.
window.layerReinitializers = window.layerReinitializers || [];
window.registerLayerReinit = function registerLayerReinit(fn) {
    window.layerReinitializers.push(fn);
};

// Loading system
let pageFullyLoaded = false;

// Wait for page to fully load
window.addEventListener('load', () => {
    pageFullyLoaded = true;
    
    // Hide loading overlay
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.classList.add('hidden');
    }
});

// API's
const nwsRadars = "https://api.weather.gov/radar/stations";
const excludedRadars = ["HWPA2", "TLKA2", "RKJK", "RKSG", "RODN", 'ROCO2'];
let filteredRadarData;

// TDWR site IDs are 4-letter codes starting with "T" (TATL, TMCO, TOKC...);
// every other NEXRAD site (K***, P***, etc.) is treated as standard NEXRAD.
// This mirrors nexrad.js's isTdwrSite(), duplicated locally so map.js doesn't
// depend on load order against the deferred nexrad.js module.
function isTdwrStationId(radarId) {
    return /^T[A-Z]{3}$/.test((radarId || '').toUpperCase());
}

// Indicator colors for the "radar" circle layer on the map.
const RADAR_DOT_COLOR_TDWR = '#ffd400';
const RADAR_DOT_COLOR_NEXRAD = '#111318';

// Product tracking
let selectedProduct = "N0B"; // Default to reflectivity
let lastSelectedProduct = "N0B"; // Remember last selected product for auto-loading
let currentRadarId = null;
let currentTrimmedId = null;
let currentFirstLetter = null;
window.currentRadarId = null;

const timelineSlider = document.getElementById("timelineSlider");
const timelineTicks = document.getElementById("timelineTicks");
const timelineLabel = document.getElementById("timelineLabel");

const map = new mapboxgl.Map({
    accessToken: 'pk.eyJ1IjoiaGFzdHl0dWJlIiwiYSI6ImNsa2hkZTh6bzAwazQzZHFyNmF5aTRsZGwifQ.5QJvYIHo0odZ5jCFApV7yw',
    container: 'map',
    style: 'mapbox://styles/hastytube/cman7qzdk00al01sddqg54u7d',
    projection: 'mercator',
    maxZoom: 13.45,
    center: [-96.35, 36.91],
    zoom: 3.2
});
window.map = map;

const elSelectedRadarSite = document.getElementById("radarSite");
const elSelectedProduct = document.getElementById("selectedProduct");
const elProductsList = document.getElementById("productsMenu");
const outlookSelect = document.getElementById("outlookSelect");
const outlookCityList = document.getElementById("outlookCityList");
const outlookPanel = document.getElementById("outlookPanel");

// Each option carries its own "day" group so the select can render grouped
// optgroups (Day 1, Day 2, ...) instead of relying on separate nav buttons.
const outlookDayLabels = {
    day1: "Day 1",
    day2: "Day 2",
    day3: "Day 3",
    day4: "Day 4",
    day5: "Day 5",
    day6: "Day 6",
    day7: "Day 7",
    day8: "Day 8",
    nhc: "NHC Tropical Outlooks"
};

const outlookOptions = [
    { value: "day1-categorical", day: "day1", label: "Categorical", file: "https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson" },
    { value: "day1-tornado", day: "day1", label: "Tornado", file: "https://www.spc.noaa.gov/products/outlook/day1otlk_torn.nolyr.geojson" },
    { value: "day1-wind", day: "day1", label: "Wind", file: "https://www.spc.noaa.gov/products/outlook/day1otlk_wind.nolyr.geojson" },
    { value: "day1-hail", day: "day1", label: "Hail", file: "https://www.spc.noaa.gov/products/outlook/day1otlk_hail.nolyr.geojson" },
    { value: "day2-categorical", day: "day2", label: "Categorical", file: "https://www.spc.noaa.gov/products/outlook/day2otlk_cat.nolyr.geojson" },
    { value: "day2-tornado", day: "day2", label: "Tornado", file: "https://www.spc.noaa.gov/products/outlook/day2otlk_torn.nolyr.geojson" },
    { value: "day2-wind", day: "day2", label: "Wind", file: "https://www.spc.noaa.gov/products/outlook/day2otlk_wind.nolyr.geojson" },
    { value: "day2-hail", day: "day2", label: "Hail", file: "https://www.spc.noaa.gov/products/outlook/day2otlk_hail.nolyr.geojson" },
    { value: "day3-categorical", day: "day3", label: "Categorical", file: "https://www.spc.noaa.gov/products/outlook/day3otlk_cat.nolyr.geojson" },
    { value: "day3-probabilistic", day: "day3", label: "Probabilistic", file: "https://www.spc.noaa.gov/products/outlook/day3otlk_prob.nolyr.geojson" },
    { value: "day4-severe-probability", day: "day4", label: "Severe Probability (Day 4)", file: "https://www.spc.noaa.gov/products/exper/day4-8/day4prob.nolyr.geojson" },
    { value: "day5-severe-probability", day: "day5", label: "Severe Probability (Day 5)", file: "https://www.spc.noaa.gov/products/exper/day4-8/day5prob.nolyr.geojson" },
    { value: "day6-severe-probability", day: "day6", label: "Severe Probability (Day 6)", file: "https://www.spc.noaa.gov/products/exper/day4-8/day6prob.nolyr.geojson" },
    { value: "day7-severe-probability", day: "day7", label: "Severe Probability (Day 7)", file: "https://www.spc.noaa.gov/products/exper/day4-8/day7prob.nolyr.geojson" },
    { value: "day8-severe-probability", day: "day8", label: "Severe Probability (Day 8)", file: "https://www.spc.noaa.gov/products/exper/day4-8/day8prob.nolyr.geojson" },
    // NHC Tropical Outlooks
    { value: "nhc-atl-2day", day: "nhc", label: "Active Disturbances", file: "https://www.nhc.noaa.gov/gis/forecast/archive/gtwo_atl_2day.kmz", isKmz: true, discussionUrl: "https://tgftp.nws.noaa.gov/data/raw/ax/axnt20.knhc..txt" },
    { value: "nhc-atl-7day", day: "nhc", label: "Active Disturbances", file: "https://www.nhc.noaa.gov/gis/forecast/archive/gtwo_atl_7day.kmz", isKmz: true, discussionUrl: "https://tgftp.nws.noaa.gov/data/raw/ax/axnt20.knhc..txt" },
    { value: "nhc-epac-2day", day: "nhc", label: "Active Disturbances", file: "https://www.nhc.noaa.gov/gis/forecast/archive/gtwo_epac_2day.kmz", isKmz: true, discussionUrl: "https://tgftp.nws.noaa.gov/data/raw/ax/axpz20.knhc..txt" },
    { value: "nhc-epac-7day", day: "nhc", label: "Active Disturbances", file: "https://www.nhc.noaa.gov/gis/forecast/archive/gtwo_epac_7day.kmz", isKmz: true, discussionUrl: "https://tgftp.nws.noaa.gov/data/raw/ax/axpz20.knhc..txt" },
    { value: "nhc-combined", day: "nhc", label: "Active Disturbances", file: "combined", isKmz: true, isCombined: true },
    // Active Storms
    { value: "active-storms", day: "nhc", label: "Active Storms", file: "xweather", isXWeather: true }
];

let currentOutlookOption = null;

// Caches so switching between outlooks never re-fetches the same file twice,
// and an ever-incrementing request token so a slow, stale fetch can never
// clobber the UI after the user has already moved on to a different pick.
const outlookGeojsonCache = new Map();
let cityGeojsonPromise = null;
let outlookRequestToken = 0;

function setOutlookPanelVisibility(isVisible) {
    if (outlookPanel) {
        outlookPanel.style.display = isVisible ? 'block' : 'none';
    }
}

function setOutlookLayerVisibility(isVisible) {
    if (map.getLayer('outlook-fill-layer')) {
        map.setLayoutProperty('outlook-fill-layer', 'visibility', isVisible ? 'visible' : 'none');
    }
    if (map.getLayer('outlook-outline-layer')) {
        map.setLayoutProperty('outlook-outline-layer', 'visibility', isVisible ? 'visible' : 'none');
    }
}

function setRadarLayerVisibility(isVisible) {
    if (map.getLayer('radar')) {
        map.setLayoutProperty('radar', 'visibility', isVisible ? 'visible' : 'none');
    }
    if (map.getLayer('radar-image-layer')) {
        map.setLayoutProperty('radar-image-layer', 'visibility', isVisible ? 'visible' : 'none');
    }
    // Also hide/show the WebGL radar layer
    if (window.NexradRenderer && typeof window.NexradRenderer.setVisible === 'function') {
        window.NexradRenderer.setVisible(isVisible);
    }
    // Directly control the nexrad-webgl-layer visibility
    if (map.getLayer('nexrad-webgl-layer')) {
        map.setLayoutProperty('nexrad-webgl-layer', 'visibility', isVisible ? 'visible' : 'none');
    }
}

function populateOutlookSelect() {
    if (!outlookSelect) return;

    outlookSelect.innerHTML = '';

    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = 'Select outlook';
    outlookSelect.appendChild(placeholderOption);

    // Group options by day so the dropdown reads like "Day 1 > Categorical"
    // without needing separate Day 1/2/3 nav buttons alongside it.
    const dayGroups = new Map();
    outlookOptions.forEach((option) => {
        const group = dayGroups.get(option.day) || [];
        group.push(option);
        dayGroups.set(option.day, group);
    });

    dayGroups.forEach((options, day) => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = outlookDayLabels[day] || day;

        options.forEach((option) => {
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.textContent = option.label;
            optgroup.appendChild(opt);
        });

        outlookSelect.appendChild(optgroup);
    });

    if (currentOutlookOption) {
        outlookSelect.value = currentOutlookOption.value;
    } else if (outlookOptions.length > 0) {
        outlookSelect.value = outlookOptions[0].value;
    }

    outlookSelect.onchange = (event) => {
        loadOutlookSelection(event.target.value);
    };
}

function pointInPolygon(point, polygon) {
    const [x, y] = point;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        const intersects = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi) / (yj - yi) + xi));
        if (intersects) inside = !inside;
    }

    return inside;
}

function pointInGeometry(point, geometry) {
    if (!geometry) return false;

    switch (geometry.type) {
        case 'Point': {
            const [x, y] = geometry.coordinates || [];
            return x === point[0] && y === point[1];
        }
        case 'Polygon': {
            const rings = geometry.coordinates || [];
            if (!rings.length) return false;
            const outerRing = rings[0] || [];
            const hasHoles = rings.length > 1;
            return pointInPolygon(point, outerRing) && (!hasHoles || rings.slice(1).every((ring) => !pointInPolygon(point, ring)));
        }
        case 'MultiPolygon': {
            return (geometry.coordinates || []).some((polygon) => {
                const rings = polygon || [];
                if (!rings.length) return false;
                const outerRing = rings[0] || [];
                return pointInPolygon(point, outerRing) && rings.slice(1).every((ring) => !pointInPolygon(point, ring));
            });
        }
        case 'GeometryCollection': {
            return (geometry.geometries || []).some((childGeometry) => pointInGeometry(point, childGeometry));
        }
        default:
            return false;
    }
}

// The city boundaries never change between outlook picks, so fetch them once
// and reuse the same in-flight/resolved promise for every subsequent call.
function getCityGeojson() {
    if (!cityGeojsonPromise) {
        cityGeojsonPromise = fetch('./json/USACities/usa-cities.geojson').then((response) => {
            if (!response.ok) throw new Error('Unable to load city data');
            return response.json();
        }).catch((error) => {
            cityGeojsonPromise = null; // allow a retry on the next call
            throw error;
        });
    }
    return cityGeojsonPromise;
}

// Abbreviation -> full name, needed to build a Wikipedia-style "City, State"
// link (the geojson only stores the two-letter postal abbreviation).
const usStateNames = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
    CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
    HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
    KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
    MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
    NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
    OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
    VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
    DC: 'Washington, D.C.'
};

// Wikipedia article titles for US cities are conventionally "City, State"
// (with a redirect handling the cases where the canonical title drops the
// state, e.g. "Chicago, Illinois" -> "Chicago"), so this link works for the
// overwhelming majority of cities without needing a lookup table per city.
function buildCityWikipediaUrl(city, stateAbbr) {
    const stateName = usStateNames[(stateAbbr || '').toUpperCase()] || stateAbbr;
    const title = stateName ? `${city}, ${stateName}` : city;
    return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

const MAX_IMPACTED_CITIES = 4;

async function updateOutlookCityList(option, outlookGeojson, requestToken) {
    if (!outlookCityList) return;

    outlookCityList.innerHTML = '<div class="outlookCityItem state-loading"><div class="outlookCityName">Loading impacted cities...</div></div>';

    try {
        const cityGeojson = await getCityGeojson();

        // A newer selection came in while we were fetching city data — drop
        // this stale result instead of overwriting the panel.
        if (requestToken !== outlookRequestToken) return;


        const groups = new Map();

        (cityGeojson.features || []).forEach((feature) => {
            const props = feature.properties || {};
            const geometry = feature.geometry;
            if (!geometry || geometry.type !== 'Point') return;

            const point = geometry.coordinates || [];
            // A city can sit inside several cumulative risk contours at once
            // (e.g. also inside the larger MRGL shape while inside ENH), so
            // only the single most severe match actually applies to it.
            const bestFeature = findRiskAtPoint(outlookGeojson, point, option);
            if (!bestFeature) return;

            const riskProps = bestFeature.properties || {};
            const rawLabel = riskProps.LABEL2 || riskProps.LABEL || 'Risk Area';
            const rank = getOutlookImpactRank(bestFeature, option);

            if (!groups.has(rawLabel)) {
                const value = formatOutlookHazardValue(option, rawLabel) || rawLabel;
                const headerLabel = option.value.includes('categorical')
                    ? `${value}`
                    : `${option.label} ${value}`;
                groups.set(rawLabel, { rank, headerLabel, cities: [] });
            }

            groups.get(rawLabel).cities.push({
                name: `${props.city}, ${props.state}`,
                url: buildCityWikipediaUrl(props.city, props.state)
            });
        });

        if (!groups.size) {
            outlookCityList.innerHTML = '<div class="outlookCityItem state-empty"><div class="outlookCityName">No impacted cities listed</div></div>';
            return;
        }

        const orderedGroups = Array.from(groups.values()).sort((a, b) => b.rank - a.rank);

        outlookCityList.innerHTML = orderedGroups.map((group) => {
            const citiesHtml = group.cities.slice(0, MAX_IMPACTED_CITIES).map((city) => (
                `<a class="outlookCityLink" href="${city.url}" target="_blank" rel="noopener noreferrer">${city.name}</a>`
            )).join(' <span class="outlookCityDivider">|</span> ');

            return `
            <div class="outlookCityItem">
                <div class="outlookCityName">${group.headerLabel}</div>
                <div class="outlookCityMeta">${citiesHtml}</div>
            </div>`;
        }).join('');
    } catch (error) {
        if (requestToken !== outlookRequestToken) return;
        console.warn('Unable to load outlook impacted cities:', error);
        outlookCityList.innerHTML = '<div class="outlookCityItem state-error"><div class="outlookCityName">City list unavailable</div></div>';
    }
}

// SPC's outlook polygons are cumulative contours (e.g. the "Enhanced" shape
// sits entirely inside "Slight", which sits inside "Marginal"), so they must
// be drawn low-severity-first/high-severity-last for a solid fill to look
// right. Most SPC exports include a numeric "DN" field that already encodes
// this ordering; this map is the fallback for the categorical LABEL text
// when DN isn't present.
const categoricalRiskRank = { TSTM: 1, MRGL: 2, SLGT: 3, ENH: 4, MDT: 5, HIGH: 6 };
const categoricalRiskName = {
    TSTM: 'General Thunder',
    MRGL: 'Marginal',
    SLGT: 'Slight',
    ENH: 'Enhanced',
    MDT: 'Moderate',
    HIGH: 'High'
};


function isCigFeature(feature, option) {
    if (option && typeof option.value === 'string' && option.value.includes('-sig')) return true;

    const props = (feature && feature.properties) || {};
    const label = (props.LABEL || '').toString().trim().toUpperCase();
    if (label === 'SIGN' || label.includes('SIG')) return true;

    const label2 = (props.LABEL2 || '').toString().toUpperCase();
    return label2.includes('SIGNIFICANT');
}

function rankOutlookFeature(feature, option) {
    // Treat CIG/SIG features as highest-impact for drawing order so they
    // are rendered after other outlook contours (allowing them to overlap).
    if (isCigFeature(feature, option)) return Number.POSITIVE_INFINITY;

    const props = (feature && feature.properties) || {};

    const dn = Number(props.DN);
    if (!Number.isNaN(dn)) return dn;

    const label = (props.LABEL || props.LABEL2 || '').toString().trim().toUpperCase();
    if (label in categoricalRiskRank) return categoricalRiskRank[label];

    const numericLabel = parseFloat(label);
    return Number.isNaN(numericLabel) ? 0 : numericLabel;
}

function getOutlookImpactRank(feature, option) {
    if (isCigFeature(feature, option)) return Number.POSITIVE_INFINITY;
    return rankOutlookFeature(feature, option);
}

function sortOutlookFeaturesBySeverity(geojson, option) {
    if (!geojson || !Array.isArray(geojson.features)) return geojson;
    return {
        ...geojson,
        features: [...geojson.features].sort((a, b) => rankOutlookFeature(a, option) - rankOutlookFeature(b, option))
    };
}

async function fetchWithCorsFallback(url) {
    const corsProxies = [
        { prefix: 'https://proxy.corsfix.com/?', encode: false },
        { prefix: 'https://corsproxy.io/?', encode: true },
        { prefix: 'https://php-cors-proxy.herokuapp.com/?', encode: false}
    ];
    
    // Try direct fetch first
    try {
        const response = await fetch(url);
        if (response.ok) {
            return response;
        }
    } catch (error) {
        console.log('Direct fetch failed, trying CORS proxies:', error);
    }
    
    // Try CORS proxies with different encoding approaches
    for (const proxy of corsProxies) {
        try {
            const proxyUrl = proxy.encode ? proxy.prefix + encodeURIComponent(url) : proxy.prefix + url;
            const response = await fetch(proxyUrl);
            if (response.ok) {
                console.log('Successfully fetched via CORS proxy:', proxy.prefix);
                return response;
            }
        } catch (error) {
            console.log(`CORS proxy ${proxy.prefix} failed:`, error);
        }
    }
    
    throw new Error('Unable to fetch URL with any CORS proxy');
}

async function fetchAndParseKmz(url) {
    const response = await fetchWithCorsFallback(url);
    
    const arrayBuffer = await response.arrayBuffer();
    
    // Use JSZip to extract the KML file from the KMZ (ZIP format)
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    // Find the first .kml file in the archive
    let kmlContent = null;
    for (const filename of Object.keys(zip.files)) {
        if (filename.toLowerCase().endsWith('.kml') && !zip.files[filename].dir) {
            kmlContent = await zip.files[filename].async('string');
            break;
        }
    }
    
    if (!kmlContent) {
        throw new Error('No KML file found in KMZ archive');
    }
    
    // Parse the KML string to extract GeoJSON
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(kmlContent, 'text/xml');
    
    const features = [];
    const placemarks = xmlDoc.getElementsByTagName('Placemark');
    
    for (let i = 0; i < placemarks.length; i++) {
        const placemark = placemarks[i];
        const name = placemark.getElementsByTagName('name')[0]?.textContent || '';
        const description = placemark.getElementsByTagName('description')[0]?.textContent || '';
        const polygon = placemark.getElementsByTagName('Polygon')[0];
        
        if (polygon) {
            const outerBoundary = polygon.getElementsByTagName('outerBoundaryIs')[0];
            if (outerBoundary) {
                const linearRing = outerBoundary.getElementsByTagName('LinearRing')[0];
                if (linearRing) {
                    const coordinates = linearRing.getElementsByTagName('coordinates')[0]?.textContent;
                    if (coordinates) {
                        const coords = coordinates.trim().split(/\s+/).map(coord => {
                            const [lng, lat, alt] = coord.split(',').map(Number);
                            return [lng, lat];
                        });
                        
                        if (coords.length > 0) {
                            features.push({
                                type: 'Feature',
                                properties: {
                                    LABEL: name || 'Tropical Outlook Area',
                                    LABEL2: name || 'Tropical Outlook Area',
                                    fill: '#ff6b35',
                                    stroke: '#ff4500',
                                    _isNhc: true,
                                    description: description
                                },
                                geometry: {
                                    type: 'Polygon',
                                    coordinates: [coords]
                                }
                            });
                        }
                    }
                }
            }
        }
    }
    
    return {
        type: 'FeatureCollection',
        features: features
    };
}

async function fetchWeatherWiseBackup() {
    try {
        // Use local WeatherWise disturbances file
        const response = await fetch('./json/WeatherWise/Disturbances.geojson');
        if (response.ok) {
            const data = await response.json();
            if (data && data.features) {
                // Convert WeatherWise format to our standard format, preserving fill colors
                const features = data.features.map(feature => ({
                    type: 'Feature',
                    properties: {
                        LABEL: feature.properties?.storm_id || feature.properties?.id || 'Tropical Disturbance',
                        LABEL2: feature.properties?.storm_id || feature.properties?.id || 'Tropical Disturbance',
                        fill: feature.properties?.fill || '#ff6b35',
                        stroke: feature.properties?.stroke || '#ff4500',
                        _isNhc: true,
                        _discussionText: feature.properties?.discussion || null,
                        _day2Percentage: feature.properties?.day_2_percentage || null,
                        _day2Category: feature.properties?.day_2_category || null,
                        _day7Percentage: feature.properties?.day_7_percentage || null,
                        _day7Category: feature.properties?.day_7_category || null,
                        _ocean: feature.properties?.ocean || null
                    },
                    geometry: feature.geometry
                }));
                return { type: 'FeatureCollection', features };
            }
        }
    } catch (error) {
        console.log('Local WeatherWise disturbances failed:', error);
    }

    return null;
}

async function fetchXWeatherActiveStorms() {
    try {
        // Use local AerisWeather file
        const response = await fetch('./json/WeatherWise/AerisWeather.geojson');
        if (response.ok) {
            const data = await response.json();
            if (data && data.success && data.response && Array.isArray(data.response)) {
                // Convert AerisWeather format to GeoJSON for active storms
                const features = data.response.map(cyclone => {
                    const position = cyclone.position;
                    const details = position?.details || {};
                    const profile = cyclone.profile || {};
                    
                    // Determine fill color based on storm category
                    let fillColor = '#ff0000'; // Default red
                    if (details.stormCat === 'H1' || details.stormCat === 'H2' || details.stormCat === 'H3' || details.stormCat === 'H4' || details.stormCat === 'H5') {
                        fillColor = '#ff0000'; // Hurricane - red
                    } else if (details.stormCat === 'TS') {
                        fillColor = '#ff9200'; // Tropical Storm - orange
                    } else if (details.stormCat === 'TD') {
                        fillColor = '#ffff00'; // Tropical Depression - yellow
                    }
                    
                    return {
                        type: 'Feature',
                        properties: {
                            LABEL: details.stormName || profile.name || 'Tropical Cyclone',
                            LABEL2: details.stormName || profile.name || 'Tropical Cyclone',
                            fill: fillColor,
                            stroke: '#ff4500',
                            _isNhc: true,
                            _stormType: details.stormType || 'Tropical Cyclone',
                            _stormCat: details.stormCat || null,
                            _windSpeedKTS: details.windSpeedKTS || null,
                            _windSpeedMPH: details.windSpeedMPH || null,
                            _pressureMB: details.pressureMB || null,
                            _movement: details.movement?.direction || null,
                            _movementSpeed: details.movement?.speedKTS || null,
                            _basin: profile.basinCurrent || null,
                            _isActive: profile.isActive || false
                        },
                        geometry: position?.location ? {
                            type: 'Point',
                            coordinates: position.location.coordinates
                        } : null
                    };
                }).filter(f => f.geometry !== null);
                return { type: 'FeatureCollection', features };
            }
        }
    } catch (error) {
        console.log('XWeather active storms failed:', error);
    }

    return null;
}

async function fetchAerisWeatherBackup() {
    try {
        const response = await fetch('https://data.api.xweather.com/tropicalcyclones/?client_id=DZLMGEFxCvfbQRG7aSN3c&client_secret=N63dulcmKzQTrWjIrTe2aGKmOw5AhERWWUmjHQKt&units=e');
        if (response.ok) {
            const data = await response.json();
            if (data && Array.isArray(data)) {
                // Convert AerisWeather format to GeoJSON
                const features = data.map(cyclone => ({
                    type: 'Feature',
                    properties: {
                        LABEL: cyclone.name || 'Tropical Cyclone',
                        LABEL2: cyclone.name || 'Tropical Cyclone',
                        fill: '#ff6b35',
                        stroke: '#ff4500',
                        _isNhc: true
                    },
                    geometry: cyclone.position ? {
                        type: 'Point',
                        coordinates: [cyclone.position.lon, cyclone.position.lat]
                    } : null
                })).filter(f => f.geometry !== null);
                return { type: 'FeatureCollection', features };
            }
        }
    } catch (error) {
        console.log('AerisWeather backup failed:', error);
    }

    return null;
}

async function fetchOutlookGeojson(option) {
    if (outlookGeojsonCache.has(option.value)) {
        return outlookGeojsonCache.get(option.value);
    }

    let data;
    
    if (option.isXWeather) {
        // Fetch active storms from XWeather
        data = await fetchXWeatherActiveStorms();
        if (!data) {
            throw new Error('Unable to load active storms');
        }
    } else if (option.isCombined) {
        // Combined layer - fetch both Atlantic and Eastern Pacific
        const atlOption = outlookOptions.find(opt => opt.value === 'nhc-atl-2day');
        const epacOption = outlookOptions.find(opt => opt.value === 'nhc-epac-2day');
        
        try {
            const [atlData, epacData] = await Promise.all([
                fetchAndParseKmz(atlOption.file),
                fetchAndParseKmz(epacOption.file)
            ]);
            
            data = {
                type: 'FeatureCollection',
                features: [...atlData.features, ...epacData.features]
            };
        } catch (error) {
            console.log('Primary KMZ sources failed, trying WeatherWise backup:', error);
            const weatherWiseData = await fetchWeatherWiseBackup();
            if (weatherWiseData) {
                data = weatherWiseData;
            } else {
                console.log('WeatherWise failed, trying AerisWeather backup');
                const aerisData = await fetchAerisWeatherBackup();
                if (aerisData) {
                    data = aerisData;
                } else {
                    throw new Error('All data sources failed');
                }
            }
        }
    } else if (option.isKmz) {
        try {
            data = await fetchAndParseKmz(option.file);
        } catch (error) {
            console.log('Primary KMZ source failed, trying WeatherWise backup:', error);
            const weatherWiseData = await fetchWeatherWiseBackup();
            if (weatherWiseData) {
                data = weatherWiseData;
            } else {
                console.log('WeatherWise failed, trying AerisWeather backup');
                const aerisData = await fetchAerisWeatherBackup();
                if (aerisData) {
                    data = aerisData;
                } else {
                    throw new Error('All data sources failed');
                }
            }
        }
    } else {
        const response = await fetch(option.file);
        if (!response.ok) throw new Error(`Unable to load ${option.label}`);
        const rawData = await response.json();
        data = sortOutlookFeaturesBySeverity(rawData, option);
    }

    // Annotate features with a flag so the layer paint expression can
    // render CIG/SIG features with a lower opacity and allow overlap.
    if (data && Array.isArray(data.features)) {
        data.features.forEach((f) => {
            if (!f.properties) f.properties = {};
            f.properties._isCig = isCigFeature(f, option);
            if (option.discussionUrl) {
                f.properties._discussionUrl = option.discussionUrl;
            }
        });
    }

    outlookGeojsonCache.set(option.value, data);
    return data;
}

async function loadOutlookSelection(value) {
    const option = outlookOptions.find((item) => item.value === value) || outlookOptions[0];
    if (!option) return;

    const requestToken = ++outlookRequestToken;

    currentOutlookOption = option;
    if (outlookSelect) {
        outlookSelect.value = option.value;
    }

    let outlookGeojson = { type: 'FeatureCollection', features: [] };

    try {
        outlookGeojson = await fetchOutlookGeojson(option);
    } catch (error) {
        console.warn('Outlook GeoJSON failed to load:', error);
    }

    if (requestToken !== outlookRequestToken) return;

    if (map.getSource('outlook-source')) {
        map.getSource('outlook-source').setData(outlookGeojson);
    }

    await updateOutlookCityList(option, outlookGeojson, requestToken);
}

function formatOutlookHazardValue(option, rawLabel) {
    if (!rawLabel) return null;

    if (option.value.includes('categorical')) {
        const key = rawLabel.toString().trim().toUpperCase();
        return categoricalRiskName[key] || rawLabel;
    }

    const numeric = rawLabel.toString().match(/\d+/);
    return numeric ? `${numeric[0]}%` : rawLabel;
}

function findRiskAtPoint(geojson, point, option) {
    const matches = (geojson.features || []).filter((feature) => pointInGeometry(point, feature.geometry));
    if (!matches.length) return null;
    return matches.reduce((best, feature) => (
        getOutlookImpactRank(feature, option) > getOutlookImpactRank(best, option) ? feature : best
    ));
}

async function showNhcDiscussionTextPopup(lngLat, discussionText, title, props) {
    // Format the discussion text for display
    const formattedText = discussionText
        .replace(/\$\$/g, '')
        .replace(/\n/g, '<br>')
        .substring(0, 2000); // Limit length for display
    
    // Build additional info from WeatherWise properties
    let additionalInfo = '';
    if (props._day2Percentage || props._day2Category) {
        additionalInfo += `<div style="margin-top: 8px; font-size: 11px; color: #9eb4c8;">
            <strong>2-Day:</strong> ${props._day2Percentage || 'N/A'} (${props._day2Category || 'N/A'})
        </div>`;
    }
    if (props._day7Percentage || props._day7Category) {
        additionalInfo += `<div style="margin-top: 4px; font-size: 11px; color: #9eb4c8;">
            <strong>7-Day:</strong> ${props._day7Percentage || 'N/A'} (${props._day7Category || 'N/A'})
        </div>`;
    }
    if (props._ocean) {
        additionalInfo += `<div style="margin-top: 4px; font-size: 11px; color: #9eb4c8;">
            <strong>Ocean:</strong> ${props._ocean === 'AT' ? 'Atlantic' : props._ocean === 'EP' ? 'Eastern Pacific' : props._ocean}
        </div>`;
    }
    
    new mapboxgl.Popup({ closeButton: true, className: 'outlookMapboxPopup', maxWidth: '400px' })
        .setLngLat(lngLat)
        .setHTML(`
            <div class="outlookPopup">
                <div class="outlookPopupBar" style="background-color: ${props.fill || '#ff6b35'};"></div>
                <div class="outlookPopupBody">
                    <div class="outlookPopupTitle">${title}</div>
                    ${additionalInfo}
                    <div style="font-size: 12px; color: #d9e2f5; line-height: 1.5; max-height: 300px; overflow-y: auto; margin-top: 8px;">
                        ${formattedText}
                    </div>
                </div>
            </div>`)
        .addTo(map);
}

async function showActiveStormPopup(lngLat, props) {
    // Build storm information
    let stormInfo = '';
    if (props._stormCat) {
        stormInfo += `<div style="margin-top: 8px; font-size: 11px; color: #9eb4c8;">
            <strong>Category:</strong> ${props._stormCat}
        </div>`;
    }
    if (props._windSpeedMPH || props._windSpeedKTS) {
        stormInfo += `<div style="margin-top: 4px; font-size: 11px; color: #9eb4c8;">
            <strong>Wind:</strong> ${props._windSpeedMPH || 'N/A'} mph (${props._windSpeedKTS || 'N/A'} kts)
        </div>`;
    }
    if (props._pressureMB) {
        stormInfo += `<div style="margin-top: 4px; font-size: 11px; color: #9eb4c8;">
            <strong>Pressure:</strong> ${props._pressureMB} mb
        </div>`;
    }
    if (props._movement && props._movementSpeed) {
        stormInfo += `<div style="margin-top: 4px; font-size: 11px; color: #9eb4c8;">
            <strong>Movement:</strong> ${props._movement} at ${props._movementSpeed} kts
        </div>`;
    }
    if (props._basin) {
        stormInfo += `<div style="margin-top: 4px; font-size: 11px; color: #9eb4c8;">
            <strong>Basin:</strong> ${props._basin}
        </div>`;
    }
    if (props._isActive !== undefined) {
        stormInfo += `<div style="margin-top: 4px; font-size: 11px; color: ${props._isActive ? '#4fd1ff' : '#ff6b35'};">
            <strong>Status:</strong> ${props._isActive ? 'Active' : 'Inactive'}
        </div>`;
    }
    
    new mapboxgl.Popup({ closeButton: true, className: 'outlookMapboxPopup', maxWidth: '300px' })
        .setLngLat(lngLat)
        .setHTML(`
            <div class="outlookPopup">
                <div class="outlookPopupBar" style="background-color: ${props.fill || '#ff6b35'};"></div>
                <div class="outlookPopupBody">
                    <div class="outlookPopupTitle">${props.LABEL || 'Active Storm'}</div>
                    ${stormInfo}
                </div>
            </div>`)
        .addTo(map);
}

async function showNhcDiscussionPopup(lngLat, discussionUrl, title) {
    try {
        const response = await fetch(discussionUrl);
        if (!response.ok) throw new Error('Unable to fetch NHC discussion');
        
        const discussionText = await response.text();
        
        // Format the discussion text for display
        const formattedText = discussionText
            .replace(/\$\$/g, '')
            .replace(/\n/g, '<br>')
            .substring(0, 2000); // Limit length for display
        
        new mapboxgl.Popup({ closeButton: true, className: 'outlookMapboxPopup', maxWidth: '400px' })
            .setLngLat(lngLat)
            .setHTML(`
                <div class="outlookPopup">
                    <div class="outlookPopupBar" style="background-color: #ff6b35;"></div>
                    <div class="outlookPopupBody">
                        <div class="outlookPopupTitle">${title}</div>
                        <div style="font-size: 12px; color: #d9e2f5; line-height: 1.5; max-height: 300px; overflow-y: auto;">
                            ${formattedText}
                        </div>
                        <div style="margin-top: 10px;">
                            <a href="${discussionUrl}" target="_blank" style="color: #4fd1ff; font-size: 12px; text-decoration: none;">View Full Discussion →</a>
                        </div>
                    </div>
                </div>`)
            .addTo(map);
    } catch (error) {
        console.error('Error fetching NHC discussion:', error);
        new mapboxgl.Popup({ closeButton: true, className: 'outlookMapboxPopup', maxWidth: '280px' })
            .setLngLat(lngLat)
            .setHTML(`
                <div class="outlookPopup">
                    <div class="outlookPopupBar" style="background-color: #ff6b35;"></div>
                    <div class="outlookPopupBody">
                        <div class="outlookPopupTitle">${title}</div>
                        <div style="font-size: 12px; color: #d9e2f5;">
                            Unable to load discussion text.
                        </div>
                        <div style="margin-top: 10px;">
                            <a href="${discussionUrl}" target="_blank" style="color: #4fd1ff; font-size: 12px; text-decoration: none;">View Full Discussion →</a>
                        </div>
                    </div>
                </div>`)
            .addTo(map);
    }
}

async function showOutlookRiskPopup(lngLat) {
    if (!currentOutlookOption) return;

    const point = [lngLat.lng, lngLat.lat];
    const siblingOptions = outlookOptions.filter((option) => option.day === currentOutlookOption.day);

    const rows = (await Promise.all(siblingOptions.map(async (option) => {
        try {
            const geojson = await fetchOutlookGeojson(option);
            const feature = findRiskAtPoint(geojson, point, option);
            if (!feature) return null;

            const props = feature.properties || {};
            const rawLabel = props.LABEL2 || props.LABEL;
            const value = formatOutlookHazardValue(option, rawLabel);
            if (!value) return null;

            return {
                isCategorical: option.value.includes('categorical'),
                hazard: option.label,
                value,
                color: props.fill || props.COLOR || props.color || props.fillColor || '#5DADE2'
            };
        } catch (error) {
            console.warn(`Unable to read ${option.label} at this point:`, error);
            return null;
        }
    }))).filter(Boolean);

    if (!rows.length) return;

    const categoricalRow = rows.find((row) => row.isCategorical);
    const hazardRows = rows.filter((row) => !row.isCategorical);
    const accentColor = (categoricalRow || rows[0]).color;

    const rowsHtml = hazardRows.map((row) => `
        <div class="outlookPopupRow">
            <span class="outlookPopupLabel">${row.hazard}</span>
            <span class="outlookPopupValue">${row.value}</span>
        </div>`).join('');

    new mapboxgl.Popup({ closeButton: true, className: 'outlookMapboxPopup', maxWidth: '280px' })
        .setLngLat(lngLat)
        .setHTML(`
            <div class="outlookPopup">
                <div class="outlookPopupBar" style="background-color: ${accentColor};"></div>
                <div class="outlookPopupBody">
                    ${categoricalRow ? `<div class="outlookPopupTitle">${categoricalRow.value}</div>` : ''}
                    ${rowsHtml}
                </div>
            </div>`)
        .addTo(map);
}

async function showOutlookMode() {
    setOutlookLayerVisibility(true);
    setRadarLayerVisibility(false);
    setOutlookPanelVisibility(true);

    if (!currentOutlookOption && outlookOptions.length > 0) {
        currentOutlookOption = outlookOptions[0];
    }

    if (outlookSelect && currentOutlookOption) {
        outlookSelect.value = currentOutlookOption.value;
    }

    if (currentOutlookOption) {
        await loadOutlookSelection(currentOutlookOption.value);
    }
}

    function showRadarMode() {
        setOutlookLayerVisibility(false);
        setRadarLayerVisibility(true);
        setOutlookPanelVisibility(false);
    }

    window.showOutlookMode = showOutlookMode;
    window.showRadarMode = showRadarMode;
    window.modeOutlook = showOutlookMode;


    if (elProductsList) {
        elProductsList.addEventListener('click', (event) => {

            const clickedRow = event.target.closest('.productRow');
            
            if (!clickedRow) return;

            const newProductId = clickedRow.dataset.productId;
            
            updateRadarProduct(newProductId);
            
            elProductsList.querySelectorAll('.productRow').forEach(row => {
                row.classList.remove('selected');
            });
            clickedRow.classList.add('selected');

            if (typeof window.collapseProductDrawer === 'function') {
                window.collapseProductDrawer();
            }
        });
    }

async function radars() {
    try {
        const response = await fetch(nwsRadars);
        const data = await response.json();
        console.log(data);

        // Filter out excluded radars, and tag each remaining feature with
        // whether it's a TDWR site so the "radar" circle layer can color
        // TDWR indicators yellow and NEXRAD indicators black.
        filteredRadarData = {
            ...data,
            features: data.features
                .filter(feature => !excludedRadars.includes(feature.properties.id))
                .map(feature => ({
                    ...feature,
                    properties: {
                        ...feature.properties,
                        isTdwr: isTdwrStationId(feature.properties.id)
                    }
                }))
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

function setupBaseLayers() {
    // Safely handle if data is still fetching when the map finishes loading
    map.addSource("radars", {
        'type': 'geojson',
        'data': filteredRadarData || { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
        "id": "radar",
        'type': "circle",
        'source': 'radars',
        'layout': { 'visibility': 'visible' },
        "paint": {
            'circle-radius': 7,
            'circle-stroke-width': 2,
            'circle-color': ['case',
                ['boolean', ['get', 'isTdwr'], false],
                RADAR_DOT_COLOR_TDWR,
                RADAR_DOT_COLOR_NEXRAD
            ],
            'circle-stroke-color': 'white'
        }
    });

    map.addSource('outlook-source', {
        'type': 'geojson',
        'data': { type: 'FeatureCollection', features: [] }
    });

    const roadLayerCandidates = ['road-minor', 'roads-minor', 'road-primary', 'road-secondary', 'road-tertiary'];
    const beforeLayer = roadLayerCandidates.find((layerId) => map.getLayer(layerId)) || (map.getLayer('alerts-outline') ? 'alerts-outline' : undefined);
    map.addLayer({
        'id': 'outlook-fill-layer',
        'type': 'fill',
        'source': 'outlook-source',
        'layout': { 'visibility': 'none' },
        'paint': {
            'fill-color': ['coalesce',
                ['to-color', ['get', 'fill']],
                ['to-color', ['get', 'COLOR']],
                ['to-color', ['get', 'color']],
                ['to-color', ['get', 'fillColor']],
                '#5DADE2'
            ],
            // SPC's outlook polygons are cumulative (each contour includes the
            // ones nested inside it), so full opacity only looks right once
            // the features are drawn in severity order (see fetchOutlookGeojson's
            // sort-by-rank step below). Rendering them out of order at 1.0
            // opacity is what caused a lower/larger risk band to paint over a
            // smaller, more severe one nested inside it.
            // Render CIG/SIG features at 45% opacity so they can overlap
            // without completely obscuring underlying contours.
            'fill-opacity': ['case', ['boolean', ['get', '_isCig'], false], 0.45, 1],
            'fill-outline-color': ['coalesce',
                ['to-color', ['get', 'stroke']],
                ['to-color', ['get', 'STROKE']],
                ['to-color', ['get', 'strokeColor']],
                ['to-color', ['get', 'fill']],
                '#ffffff'
            ],
            'fill-antialias': true
        }
    }, beforeLayer);

    map.addLayer({
        'id': 'outlook-outline-layer',
        'type': 'line',
        'source': 'outlook-source',
        'layout': { 'visibility': 'none' },
        'paint': {
            'line-color': ['coalesce',
                ['to-color', ['get', 'stroke']],
                ['to-color', ['get', 'STROKE']],
                ['to-color', ['get', 'strokeColor']],
                ['to-color', ['get', 'fill']],
                '#ffffff'
            ],
            'line-width': 2,
            'line-opacity': ['coalesce', ['get', 'stroke-opacity'], ['get', 'opacity'], 1]
        }
    }, beforeLayer);

    populateOutlookSelect();

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

    // Handle outlook area clicks: build a single popup combining every
    // hazard product for the currently selected day (categorical + tornado/
    // wind/hail probabilities, or severe probability for Day 4-8) rather
    // than just whatever one product happens to be drawn on the map right now.
    map.on('click', 'outlook-fill-layer', (e) => {
        if (e.features.length > 0) {
            const feature = e.features[0];
            const props = feature.properties || {};
            
            // Check if this is an active storm
            if (props._stormType || props._stormCat) {
                showActiveStormPopup(e.lngLat, props);
            }
            // Check if this is an NHC outlook with discussion text
            else if (props._discussionText) {
                showNhcDiscussionTextPopup(e.lngLat, props._discussionText, props.LABEL || 'NHC Discussion', props);
            } else if (props._discussionUrl) {
                showNhcDiscussionPopup(e.lngLat, props._discussionUrl, props.LABEL || 'NHC Discussion');
            } else {
                showOutlookRiskPopup(e.lngLat);
            }
        }
    });

    map.on('mouseleave', 'outlook-fill-layer', () => {
        map.getCanvas().style.cursor = '';
    });

    map.on('mouseenter', 'outlook-fill-layer', () => {
        map.getCanvas().style.cursor = 'pointer';
    });

    showRadarMode();
}

map.on('load', setupBaseLayers);
window.registerLayerReinit(setupBaseLayers);

// Function to get product name from ID. Pulls from nexrad.js's
// RADAR_PRODUCT_MAP (the single source of truth for what the WebGL parser
// actually supports) first, falling back to products that are IEM-tile-only
// (never go through the WebGL path, e.g. Echo Tops).
const IEM_ONLY_PRODUCT_NAMES = {
    'NET': 'Echo Tops'
};

function getProductName(productId) {
    const productInfo = window.RADAR_PRODUCT_MAP && window.RADAR_PRODUCT_MAP[productId];
    if (productInfo && productInfo.desc) return productInfo.desc;
    return IEM_ONLY_PRODUCT_NAMES[productId] || '----';
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

    // Update URL with radar site parameter
    const url = new URL(window.location);
    url.searchParams.set('radSite', radarId);
    window.history.replaceState({}, '', url);

    if (typeof window.clearRadarLayers === 'function') {
        window.clearRadarLayers();
    }

    if (typeof radarMsg === 'function') {
        radarMsg();
    }

    if (typeof latestLevelIII === 'function') {
        latestLevelIII(radarId);
    }

    if (typeof loadStormTracks === 'function') {
        loadStormTracks(radarId);
    }

    if (elSelectedRadarSite) elSelectedRadarSite.textContent = radarId;

    const rad_config = {
        base: [
            { id: "N0B", name: "NEXRAD Super-Res Reflectivity", label: "Reflectivity", hasTilts: true, tiltBase: "N0B" },
            { id: "N0G", name: "NEXRAD Super-Res Velocity", label: "Base Velocity", hasTilts: true, tiltBase: "N0G" },
            { id: "N0C", name: "NEXRAD Correlation Coefficient", label: "Corr. Coefficient" },
            { id: "N0K", name: "NEXRAD Differential Reflectivity", label: "Diff. Reflectivity" },
            { id: "N0H", name: "NEXRAD Hydrometer Classification", label: "Hydrometer Class" },
            { id: "SW0", name: "NEXRAD Spectrum Width", label: "Spectrum Width" },
            { id: "EEH", name: "Enhanced Echo Tops", label: "Enhanced Echo Tops" },
            { id: "DTA", name: "Digital Precipitation", label: "Storm Accumulation"},
            // Not in nexrad.js's RADAR_PRODUCT_MAP, so this one always falls
            // straight through to the IEM raster tiles.
            { id: "NET", name: "Echo Tops", label: "Echo Tops" }
        ],
        tdwr: [
            { id: "TZ0", name: "TDWR Reflectivity (Tilt 1)", label: "Reflectivity (Tilt 1)" },
            { id: "TZ1", name: "TDWR Reflectivity (Tilt 2)", label: "Reflectivity (Tilt 2)" },
            { id: "TZ2", name: "TDWR Reflectivity (Tilt 3)", label: "Reflectivity (Tilt 3)" },
            { id: "TZL", name: "TDWR Long Range Reflectivity", label: "Reflectivity (Long Range)" },
            { id: "TV0", name: "TDWR Velocity (Tilt 1)", label: "Velocity (Tilt 1)" },
            { id: "TV1", name: "TDWR Velocity (Tilt 2)", label: "Velocity (Tilt 2)" },
            { id: "TV2", name: "TDWR Velocity (Tilt 3)", label: "Velocity (Tilt 3)" }
        ]
    }

    const isStandardRadar = firstLetter === "K" || firstLetter === "P";
    const availableProducts = isStandardRadar ? rad_config.base : rad_config.tdwr;

    // Auto-load last selected product if it's available for this radar type, otherwise default to first product
    const lastProductAvailable = availableProducts.find(p => p.id === lastSelectedProduct);
    selectedProduct = lastProductAvailable ? lastSelectedProduct : availableProducts[0].id;

    if (typeof latestLevelIII === 'function') {
        latestLevelIII(radarId, selectedProduct);
    }

    window.currentSelectedProduct = selectedProduct;

    if (elSelectedProduct) elSelectedProduct.textContent = getProductName(selectedProduct);

    // Render the new site's latest frame right away, so picking a radar
    // site always resets the view to "now" instead of leaving the old
    // site's frame on screen until the preload/timeline catches up.
    if (typeof window.tryRenderNexradWebGL === 'function') {
        window.tryRenderNexradWebGL(radarId, selectedProduct);
    }

    // Preload the last 5 radar frames for timeline functionality, now that
    // selectedProduct actually reflects the new site (not the previous one).
    if (window.preloadedRadarFrames) {
        window.preloadedRadarFrames.clear();
        if (timelineTicks) timelineTicks.innerHTML = '';
        if (timelineSlider) timelineSlider.value = 0;
        if (timelineLabel) timelineLabel.textContent = 'Latest';
    }
    if (typeof window.preloadRadarFrames === 'function') {
        window.preloadRadarFrames(radarId, selectedProduct).then(() => {
            if (typeof window.updateTimelineTicks === 'function') {
                window.updateTimelineTicks();
            }
        });
    }
    
    // Start auto-refresh for radar frames
    if (typeof window.startRadarAutoRefresh === 'function') {
        window.startRadarAutoRefresh(radarId, selectedProduct);
    }

    if (elProductsList) {
        elProductsList.innerHTML = ''; // Clear out the old list
        const fragment = document.createDocumentFragment();

        availableProducts.forEach(product => {
            const row = document.createElement('div');
            row.className = 'productRow';
            row.dataset.productId = product.id;
            row.dataset.productName = product.name;
            row.textContent = product.label;
            
            // Mark the selected product as active
            if (product.id === selectedProduct) {
                row.classList.add('selected');
            }
            
            fragment.appendChild(row);
        });

        elProductsList.appendChild(fragment);
    }

    if (map.getLayer('radar')) {
        // Keep the fill color driven by station type (TDWR = yellow, NEXRAD
        // = black); indicate the active selection with a highlighted stroke
        // instead so the type coloring is never lost.
        map.setPaintProperty('radar', 'circle-stroke-color', [
            'case',
            ['==', ['get', 'id'], radarId],
            '#00e676',
            'white'
        ]);
        map.setPaintProperty('radar', 'circle-stroke-width', [
            'case',
            ['==', ['get', 'id'], radarId],
            3,
            2
        ]);
    }
}

// IEM tileset loading removed - only WebGL rendering is supported
function loadRadarImage(apiTimestamp) {
    console.warn('[Deluge] IEM tileset loading removed - use WebGL rendering only');
}

if (timelineSlider) {
    timelineSlider.addEventListener('click', (e) => e.stopPropagation());
    timelineSlider.addEventListener('mousedown', (e) => e.stopPropagation());
}

// Function to update radar product (called when a product row is clicked).
// This is the single place product switches happen: it renders the new
// product's latest frame right away, then repopulates the preloaded-frame
// cache so the timeline slider has something to scrub through.
async function updateRadarProduct(productId) {
    selectedProduct = productId;
    lastSelectedProduct = productId; // Remember this for future radar selections
    window.currentSelectedProduct = productId;
    if (elSelectedProduct) elSelectedProduct.textContent = getProductName(productId);
    
    // Update colorbar based on selected product
    if (typeof window.updateColorbar === 'function') {
        await window.updateColorbar(productId);
    }
    
    // Update tilt dropdown visibility and options
    updateTiltDropdown(productId);
    
    // Restart auto-refresh with new product
    if (currentRadarId && typeof window.startRadarAutoRefresh === 'function') {
        window.startRadarAutoRefresh(currentRadarId, productId);
    }

    if (typeof window.clearRadarLayers === 'function') {
        window.clearRadarLayers();
    }

    if (window.preloadedRadarFrames) {
        window.preloadedRadarFrames.clear();
        if (timelineTicks) timelineTicks.innerHTML = '';
        if (timelineSlider) timelineSlider.value = 0;
        if (timelineLabel) timelineLabel.textContent = 'Latest';
    }

    if (!currentRadarId) return;

    if (typeof window.tryRenderNexradWebGL === 'function') {
        window.tryRenderNexradWebGL(currentRadarId, productId);
    }

    if (typeof window.preloadRadarFrames === 'function') {
        window.preloadRadarFrames(currentRadarId, productId).then(() => {
            if (typeof window.updateTimelineTicks === 'function') {
                window.updateTimelineTicks();
            }
        });
    }
}

// Update tilt dropdown based on selected product
function updateTiltDropdown(productId) {
    const tiltDropdown = document.getElementById('tiltDropdown');
    const tiltSelect = document.getElementById('tiltSelect');
    
    if (!tiltDropdown || !tiltSelect) return;
    
    // Check if the product has tilts configured
    const hasTilts = typeof window.tiltConfigs !== 'undefined' && window.tiltConfigs[productId];
    
    if (hasTilts) {
        // Show dropdown and populate with tilt options
        tiltDropdown.style.display = 'block';
        tiltSelect.innerHTML = '';
        
        window.tiltConfigs[productId].forEach(tilt => {
            const option = document.createElement('option');
            option.value = tilt.id;
            option.textContent = tilt.name;
            if (tilt.id === productId) {
                option.selected = true;
            }
            tiltSelect.appendChild(option);
        });
        
        // Add event listener for tilt changes - use a flag to prevent clearing
        tiltSelect.onchange = (e) => {
            const newTilt = e.target.value;
            switchTiltOnly(newTilt);
        };
    } else {
        // Hide dropdown for products without tilts
        tiltDropdown.style.display = 'none';
    }
}

// Switch tilt only without clearing everything
async function switchTiltOnly(newTilt) {
    selectedProduct = newTilt;
    lastSelectedProduct = newTilt;
    window.currentSelectedProduct = newTilt;
    if (elSelectedProduct) elSelectedProduct.textContent = getProductName(newTilt);
    
    // Update colorbar
    if (typeof window.updateColorbar === 'function') {
        await window.updateColorbar(newTilt);
    }
    
    // Render the new tilt immediately
    if (currentRadarId && typeof window.tryRenderNexradWebGL === 'function') {
        window.tryRenderNexradWebGL(currentRadarId, newTilt);
    }
    
    // Preload frames for the new tilt
    if (window.preloadedRadarFrames) {
        window.preloadedRadarFrames.clear();
        if (timelineTicks) timelineTicks.innerHTML = '';
        if (timelineSlider) timelineSlider.value = 0;
        if (timelineLabel) timelineLabel.textContent = 'Latest';
    }
    if (typeof window.preloadRadarFrames === 'function') {
        window.preloadRadarFrames(currentRadarId, newTilt).then(() => {
            if (typeof window.updateTimelineTicks === 'function') {
                window.updateTimelineTicks();
            }
        });
    }
    
    // Restart auto-refresh with new tilt
    if (currentRadarId && typeof window.startRadarAutoRefresh === 'function') {
        window.startRadarAutoRefresh(currentRadarId, newTilt);
    }
}

async function modeOutlook() {
// Outlooks

/* Here are the URL's for each day and their categories:
 
  Notes:

  * SIG means Significant (referred to as CIG in the SPC), and indicates the probability for significant severe weather to occur.

  * Days 4-8 have a different structuring layout compared to Days 1-3.

  * Days 4-8 have the same Probalistic layout as Day 3 Probalistic.

 ---- DAY 1 ----

 Categorial: https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson
 Tornado: https://www.spc.noaa.gov/products/outlook/day1otlk_torn.nolyr.geojson
 Tornado (SIG): https://www.spc.noaa.gov/products/outlook/day1otlk_cigtorn.nolyr.geojson
 Wind: https://www.spc.noaa.gov/products/outlook/day1otlk_wind.nolyr.geojson
 Wind (SIG): https://www.spc.noaa.gov/products/outlook/day1otlk_cigwind.nolyr.geojson
 Hail: https://www.spc.noaa.gov/products/outlook/day1otlk_hail.nolyr.geojson
 Hail (SIG): https://www.spc.noaa.gov/products/outlook/day1otlk_cigwind.lyr.geojson

 ---- DAY 2 ----

 Categorial: https://www.spc.noaa.gov/products/outlook/day2otlk_cat.nolyr.geojson
 Tornado: https://www.spc.noaa.gov/products/outlook/day2otlk_torn.nolyr.geojson
 Tornado (SIG): https://www.spc.noaa.gov/products/outlook/day2otlk_cigtorn.nolyr.geojson
 Wind: https://www.spc.noaa.gov/products/outlook/day2otlk_wind.nolyr.geojson
 Wind (SIG): https://www.spc.noaa.gov/products/outlook/day2otlk_cigwind.nolyr.geojson
 Hail: https://www.spc.noaa.gov/products/outlook/day2otlk_hail.nolyr.geojson
 Hail (SIG): https://www.spc.noaa.gov/products/outlook/day2otlk_cigwind.lyr.geojson

 ---- DAY 3 ----
 
 Categorial: https://www.spc.noaa.gov/products/outlook/day3otlk_cat.nolyr.geojson
 Probalistic: https://www.spc.noaa.gov/products/outlook/day3otlk_prob.nolyr.geojson
 Proalistic (SIG): https://www.spc.noaa.gov/products/outlook/day3otlk_cigprob.nolyr.geojson

 ---- DAY 4 ----

 Severe Probability: https://www.spc.noaa.gov/products/exper/day4-8/day4prob.nolyr.geojson

 ---- DAY 5 ----

 Severe Probability: https://www.spc.noaa.gov/products/exper/day4-8/day5prob.nolyr.geojson

 ---- DAY 6 -----

 Severe Probability: https://www.spc.noaa.gov/products/exper/day4-8/day6prob.nolyr.geojson


 ---- DAY 7 -----

 Severe Probability: https://www.spc.noaa.gov/products/exper/day4-8/day7prob.nolyr.geojson


 ---- DAY 8 -----
 
 Severe Probability: https://www.spc.noaa.gov/products/exper/day4-8/day8prob.nolyr.geojson

*/
}