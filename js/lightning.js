// Lightning functionality for Deluge
// Blitzortung USA lightning data from placefile

const LIGHTNING_PLACEFILE_URL = 'https://corsproxy.io/?https://saratoga-weather.org/USA-blitzortung/placefile-nobCT.txt';
let lightningData = [];
let lightningSource = null;
let lightningLayer = null;
let lightningPopup = null;
let lightningUpdateInterval = null;

// Initialize lightning layer
function initLightningLayer() {
    if (!map.getSource('lightning-source')) {
        map.addSource('lightning-source', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
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
    lightningLayer = map.getLayer('lightning-layer');
}

// Parse Blitzortung placefile
function parsePlacefile(text) {
    const lines = text.split('\n');
    const strikes = [];
    
    for (const line of lines) {
        if (line.startsWith('Icon:')) {
            // Format: Icon: lat,lon,0,1,9,Blitzortung @ HH:MM:SSpm CDT
            const parts = line.substring(5).split(',');
            if (parts.length >= 6) {
                const lat = parseFloat(parts[0]);
                const lon = parseFloat(parts[1]);
                const timeStr = parts[5].trim();
                
                // Parse time string: "Blitzortung @ 5:05:02pm CDT"
                const timeMatch = timeStr.match(/(\d+):(\d+):(\d+)(am|pm)/);
                if (timeMatch) {
                    let hours = parseInt(timeMatch[1]);
                    const minutes = parseInt(timeMatch[2]);
                    const seconds = parseInt(timeMatch[3]);
                    const ampm = timeMatch[4];
                    
                    if (ampm === 'pm' && hours !== 12) hours += 12;
                    if (ampm === 'am' && hours === 12) hours = 0;
                    
                    // Create timestamp in Central Time
                    const now = new Date();
                    const centralOffset = 5; // CDT is UTC-5 (adjust for DST)
                    const utcNow = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
                    const centralNow = new Date(utcNow.getTime() - (centralOffset * 3600000));
                    
                    const strikeTime = new Date(centralNow);
                    strikeTime.setHours(hours, minutes, seconds, 0);
                    
                    // If strike time is in the future, it's from yesterday
                    if (strikeTime > centralNow) {
                        strikeTime.setDate(strikeTime.getDate() - 1);
                    }
                    
                    strikes.push({
                        lat,
                        lon,
                        time: strikeTime,
                        timeStr: timeMatch[0]
                    });
                }
            }
        }
    }
    
    return strikes;
}

// Calculate opacity基于age (in minutes)
function calculateOpacity(strikeTime) {
    const now = new Date();
    const centralOffset = 5; // CDT is UTC-5
    const utcNow = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
    const centralNow = new Date(utcNow.getTime() - (centralOffset * 3600000));
    
    const ageMinutes = (centralNow - strikeTime) / 60000;
    
    // Fade out over 30 minutes
    const maxAge = 30;
    const opacity = Math.max(0, 1 - (ageMinutes / maxAge));
    
    return opacity;
}

// Convert lightning strikes to GeoJSON
function lightningToGeoJSON(strikes) {
    const features = strikes.map(strike => ({
        type: 'Feature',
        geometry: {
            type: 'Point',
            coordinates: [strike.lon, strike.lat]
        },
        properties: {
            time: strike.time.toISOString(),
            timeStr: strike.timeStr,
            opacity: calculateOpacity(strike.time)
        }
    }));
    
    return {
        type: 'FeatureCollection',
        features
    };
}

// Fetch and update lightning data
async function fetchLightningData() {
    try {
        const response = await fetch(LIGHTNING_PLACEFILE_URL);
        if (!response.ok) throw new Error('Failed to fetch lightning data');
        
        const text = await response.text();
        lightningData = parsePlacefile(text);
        
        if (lightningSource) {
            lightningSource.setData(lightningToGeoJSON(lightningData));
        }
        
        console.log(`[Deluge] Updated lightning data: ${lightningData.length} strikes`);
    } catch (error) {
        console.error('[Deluge] Error fetching lightning data:', error);
    }
}

// Update lightning opacity based on age
function updateLightningOpacity() {
    if (!lightningSource || lightningData.length === 0) return;
    
    const features = lightningData.map(strike => ({
        type: 'Feature',
        geometry: {
            type: 'Point',
            coordinates: [strike.lon, strike.lat]
        },
        properties: {
            time: strike.time.toISOString(),
            timeStr: strike.timeStr,
            opacity: calculateOpacity(strike.time)
        }
    }));
    
    lightningSource.setData({
        type: 'FeatureCollection',
        features
    });
}

// Format age as mm:ss
function formatAge(strikeTime) {
    const now = new Date();
    const centralOffset = 5;
    const utcNow = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
    const centralNow = new Date(utcNow.getTime() - (centralOffset * 3600000));
    
    const ageMs = centralNow - strikeTime;
    const ageSeconds = Math.floor(ageMs / 1000);
    const minutes = Math.floor(ageSeconds / 60);
    const seconds = ageSeconds % 60;
    
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Format time for display
function formatTime(strikeTime) {
    const hours = strikeTime.getHours();
    const minutes = String(strikeTime.getMinutes()).padStart(2, '0');
    const seconds = String(strikeTime.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    
    return `${displayHours}:${minutes}:${seconds} ${ampm} CDT`;
}

// Show lightning popup
function showLightningPopup(lngLat, properties) {
    const strikeTime = new Date(properties.time);
    
    if (lightningPopup) {
        lightningPopup.remove();
    }
    
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
    
    // Update age every second
    const updateInterval = setInterval(() => {
        const ageEl = document.getElementById('lightningAge');
        if (ageEl) {
            ageEl.textContent = formatAge(strikeTime);
        } else {
            clearInterval(updateInterval);
        }
    }, 1000);
    
    // Clear interval when popup closes
    lightningPopup.on('close', () => {
        clearInterval(updateInterval);
    });
}

// Setup lightning click handler
function setupLightningClickHandler() {
    map.on('click', 'lightning-layer', (e) => {
        if (e.features.length > 0) {
            const properties = e.features[0].properties;
            showLightningPopup(e.lngLat, properties);
        }
    });
}

// Start lightning updates
function startLightningUpdates() {
    // Fetch immediately
    fetchLightningData();
    
    // Update opacity every 10 seconds
    lightningUpdateInterval = setInterval(updateLightningOpacity, 10000);
    
    // Fetch new data every 5 minutes (300 seconds as per placefile)
    setInterval(fetchLightningData, 300000);
}

// Initialize lightning when map is loaded
map.on('load', () => {
    initLightningLayer();
    setupLightningClickHandler();
    startLightningUpdates();
});

// Reinitialize lightning when map style changes
window.registerLayerReinit(() => {
    initLightningLayer();
    setupLightningClickHandler();
    if (lightningData.length > 0) {
        lightningSource.setData(lightningToGeoJSON(lightningData));
    }
});


setInterval(fetchLightningData, 30000);