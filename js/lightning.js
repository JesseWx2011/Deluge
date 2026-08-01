// Lightning functionality for Deluge — Blitzortung USA data via placefile

const LIGHTNING_PLACEFILE_URL = 'https://saratoga-weather.org/USA-blitzortung/placefile-nobCT.txt';
const CORS_PROXY_URL = 'https://api.allorigins.win/raw?url=';
const LIGHTNING_FADE_MINUTES = 30;
const CENTRAL_OFFSET_HOURS = 5; // CDT is UTC-5 (adjust for DST)

let lightningData = [];
let lightningSource = null;
let lightningPopup = null;
let lightningUpdateInterval = null;
let lightningFetchInterval = null;

function getCentralNow() {
    const now = new Date();
    const utcNow = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
    return new Date(utcNow.getTime() - (CENTRAL_OFFSET_HOURS * 3600000));
}

function initLightningLayer() {
    if (!map.getSource('lightning-source')) {
        map.addSource('lightning-source', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });

        map.addLayer({
            id: 'lightning-layer',
            type: 'circle',
            source: 'lightning-source',
            paint: {
                'circle-radius': 4,
                'circle-color': '#ffff00',
                'circle-opacity': ['get', 'opacity'],
                'circle-stroke-color': '#ff6600',
                'circle-stroke-width': 1,
                'circle-stroke-opacity': ['get', 'opacity']
            }
        });
    }

    lightningSource = map.getSource('lightning-source');
}

// Parses Blitzortung placefile lines like:
//   Icon: lat,lon,0,1,9,Blitzortung @ 5:05:02pm CDT
function parsePlacefile(text) {
    const strikes = [];

    for (const line of text.split('\n')) {
        if (!line.startsWith('Icon:')) continue;

        const parts = line.substring(5).split(',');
        if (parts.length < 6) continue;

        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        const timeMatch = parts[5].trim().match(/(\d+):(\d+):(\d+)(am|pm)/);
        if (!timeMatch) continue;

        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const seconds = parseInt(timeMatch[3]);
        const ampm = timeMatch[4];

        if (ampm === 'pm' && hours !== 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;

        const centralNow = getCentralNow();
        const strikeTime = new Date(centralNow);
        strikeTime.setHours(hours, minutes, seconds, 0);

        // A strike time in the future must be from yesterday
        if (strikeTime > centralNow) strikeTime.setDate(strikeTime.getDate() - 1);

        strikes.push({ lat, lon, time: strikeTime, timeStr: timeMatch[0] });
    }

    return strikes;
}

function calculateOpacity(strikeTime) {
    const ageMinutes = (getCentralNow() - strikeTime) / 60000;
    return Math.max(0, 1 - (ageMinutes / LIGHTNING_FADE_MINUTES));
}

function lightningToGeoJSON(strikes) {
    return {
        type: 'FeatureCollection',
        features: strikes.map((strike) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [strike.lon, strike.lat] },
            properties: {
                time: strike.time.toISOString(),
                timeStr: strike.timeStr,
                opacity: calculateOpacity(strike.time)
            }
        }))
    };
}

async function fetchLightningData() {
    try {
        const proxyUrl = CORS_PROXY_URL + encodeURIComponent(LIGHTNING_PLACEFILE_URL);
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`CORS proxy fetch failed with status: ${response.status}`);

        const text = await response.text();

        // Limit data size to prevent performance issues
        const maxLines = 5000;
        const limitedText = text.split('\n').slice(0, maxLines).join('\n');

        lightningData = parsePlacefile(limitedText);
        if (lightningSource) lightningSource.setData(lightningToGeoJSON(lightningData));

        console.log(`[Deluge] Updated lightning data: ${lightningData.length} strikes`);
    } catch (error) {
        console.error('[Deluge] Error fetching lightning data:', error);
        if (lightningData.length === 0) {
            console.warn('[Deluge] Lightning data unavailable - layer will remain empty');
        }
    }
}

function updateLightningOpacity() {
    if (!lightningSource || lightningData.length === 0) return;
    lightningSource.setData(lightningToGeoJSON(lightningData));
}

function formatAge(strikeTime) {
    const ageSeconds = Math.floor((getCentralNow() - strikeTime) / 1000);
    const minutes = Math.floor(ageSeconds / 60);
    const seconds = ageSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatTime(strikeTime) {
    const hours = strikeTime.getHours();
    const minutes = String(strikeTime.getMinutes()).padStart(2, '0');
    const seconds = String(strikeTime.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes}:${seconds} ${ampm} CDT`;
}

function showLightningPopup(lngLat, properties) {
    const strikeTime = new Date(properties.time);

    if (lightningPopup) lightningPopup.remove();

    lightningPopup = new mapboxgl.Popup({
        closeButton: true,
        closeOnClick: true,
        className: 'lightningMapboxPopup',
        maxWidth: '250px'
    })
        .setLngLat(lngLat)
        .setHTML(`
        <div class="lightningPopup">
            <div class="lightningPopupHeader">
                <i class="fa-solid fa-bolt" style="color: #ffff00; margin-right: 8px;"></i>
                <span style="font-weight: 600; color: white;">Lightning Strike</span>
            </div>
            <div class="lightningPopupBody">
                <div class="lightningPopupRow">
                    <span class="lightningPopupLabel">Time:</span>
                    <span class="lightningPopupValue">${formatTime(strikeTime)}</span>
                </div>
                <div class="lightningPopupRow">
                    <span class="lightningPopupLabel">Age:</span>
                    <span class="lightningPopupValue" id="lightningAge">${formatAge(strikeTime)}</span>
                </div>
            </div>
        </div>
    `)
        .addTo(map);

    const updateInterval = setInterval(() => {
        const ageEl = document.getElementById('lightningAge');
        if (ageEl) {
            ageEl.textContent = formatAge(strikeTime);
        } else {
            clearInterval(updateInterval);
        }
    }, 1000);

    lightningPopup.on('close', () => clearInterval(updateInterval));
}

function setupLightningClickHandler() {
    map.on('click', 'lightning-layer', (e) => {
        if (e.features.length > 0) {
            showLightningPopup(e.lngLat, e.features[0].properties);
        }
    });
}

function startLightningUpdates() {
    if (lightningUpdateInterval) clearInterval(lightningUpdateInterval);
    if (lightningFetchInterval) clearInterval(lightningFetchInterval);

    fetchLightningData();

    lightningUpdateInterval = setInterval(updateLightningOpacity, 10000);
    lightningFetchInterval = setInterval(fetchLightningData, 300000); // 5 min, matches placefile refresh
}

map.on('load', () => {
    initLightningLayer();
    setupLightningClickHandler();
    startLightningUpdates();
});

// Reinitialize when map style changes (base-style switch wipes custom layers)
window.registerLayerReinit(() => {
    initLightningLayer();
    setupLightningClickHandler();
    if (lightningData.length > 0) {
        lightningSource.setData(lightningToGeoJSON(lightningData));
    }
});
