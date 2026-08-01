// For handling layers.

/*

  The Following Layers are:

  

  - Storm Reports

  - Cameras

  - NEXRAD Radar

  - Alerts (Borders Above Radar)

  - Lightning (Blitzortung USA)

  - Mesoscale Discussions (SPC)

  - LSR Reports (IEM)

  - NHC Cone



*/

// Additional map overlays: SPC Mesoscale Discussions, Storm Reports (LSR /
// Storm-Based Warning polygons), and the NHC forecast cone.
//
// Relies on a couple of helpers already defined globally by map.js:
//   fetchAndParseKmz(url)      - KMZ -> GeoJSON (Polygon features only)
//   fetchWithCorsFallback(url) - fetch() with a chain of CORS proxy fallbacks
// and on window.registerLayerReinit(fn), also from map.js, to survive a
// base-style switch in the Settings panel.

const MESOSCALE_KMZ_URL = 'https://www.spc.noaa.gov/products/md/ActiveMD.kmz';
const LSR_BASE_URL = 'https://mesonet.agron.iastate.edu/geojson/sbw.geojson';
const NHC_CURRENT_STORMS_URL = 'https://www.nhc.noaa.gov/CurrentStorms.json';

// Lightning functionality for Deluge
// Blitzortung USA lightning data from placefile

const LIGHTNING_PLACEFILE_URL = 'https://saratoga-weather.org/USA-blitzortung/placefile-nobCT.txt';
const CORS_PROXY_URL = 'https://api.allorigins.win/raw?url=';

let mesoscaleLoaded = false;
let lsrLoaded = false;
let nhcConeLoaded = false;

let mesoscaleRefreshTimer = null;
let lsrRefreshTimer = null;
let nhcConeRefreshTimer = null;

let lightningData = [];
let lightningSource = null;
let lightningLayer = null;
let lightningPopup = null;
let lightningUpdateInterval = null;
let lightningFetchInterval = null;

function extraLayersBeforeId() {
    if (typeof map.getLayer !== 'function') return undefined;
    return map.getLayer('alerts-outline') ? 'alerts-outline' : (map.getLayer('road-minor') ? 'road-minor' : undefined);
}

// Adds a geojson source + matching fill/outline layer pair if they don't
// already exist. Layers start hidden — visibility is driven entirely by
// the Map Layers toggle switches in menu.js.
function ensureFillOutlineLayer(sourceId, fillLayerId, outlineLayerId, defaultFill, defaultStroke, fillOpacity) {
    if (!map.getSource(sourceId)) {
        map.addSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    }

    const beforeLayer = extraLayersBeforeId();

    if (!map.getLayer(fillLayerId)) {
        map.addLayer({
            id: fillLayerId,
            type: 'fill',
            source: sourceId,
            layout: { visibility: 'none' },
            paint: {
                'fill-color': ['coalesce', ['to-color', ['get', 'fill']], defaultFill],
                'fill-opacity': fillOpacity
            }
        }, beforeLayer);
    }

    if (!map.getLayer(outlineLayerId)) {
        map.addLayer({
            id: outlineLayerId,
            type: 'line',
            source: sourceId,
            layout: { visibility: 'none' },
            paint: {
                'line-color': ['coalesce', ['to-color', ['get', 'stroke']], defaultStroke],
                'line-width': 2
            }
        }, beforeLayer);
    }
}

function setPairVisibility(fillLayerId, outlineLayerId, visible) {
    [fillLayerId, outlineLayerId].forEach((id) => {
        if (map.getLayer(id)) {
            map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
        }
    });
}

function buildSimplePopupHtml(barColor, title, bodyHtml) {
    return `
        <div class="outlookPopup">
            <div class="outlookPopupBar" style="background-color:${barColor};"></div>
            <div class="outlookPopupBody">
                <div class="outlookPopupTitle">${title}</div>
                ${bodyHtml || ''}
            </div>
        </div>`;
}

// ---------------------------------------------------------------------
// Mesoscale Discussions
// ---------------------------------------------------------------------

async function fetchMesoscaleDiscussions() {
    try {
        const data = await fetchAndParseKmz(MESOSCALE_KMZ_URL);
        if (map.getSource('mesoscale-source')) {
            map.getSource('mesoscale-source').setData(data);
        }
        mesoscaleLoaded = true;
    } catch (error) {
        console.warn('[Deluge] Unable to load Mesoscale Discussions:', error);
    }
}

function initMesoscaleLayer() {
    ensureFillOutlineLayer('mesoscale-source', 'mesoscale-fill-layer', 'mesoscale-outline-layer', '#ffb703', '#e08e00', 0.3);

    map.on('click', 'mesoscale-fill-layer', (e) => {
        if (!e.features.length) return;
        const props = e.features[0].properties || {};
        const text = String(props.description || 'No discussion text available.')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 1500);

        new mapboxgl.Popup({ closeButton: true, className: 'outlookMapboxPopup', maxWidth: '360px' })
            .setLngLat(e.lngLat)
            .setHTML(buildSimplePopupHtml('#ffb703', props.LABEL || 'Mesoscale Discussion',
                `<div style="font-size:12px; color:#d9e2f5; line-height:1.5; max-height:260px; overflow-y:auto; margin-top:8px;">${text}</div>`))
            .addTo(map);
    });

    map.on('mouseenter', 'mesoscale-fill-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'mesoscale-fill-layer', () => { map.getCanvas().style.cursor = ''; });
}

function setMesoscaleVisibility(visible) {
    setPairVisibility('mesoscale-fill-layer', 'mesoscale-outline-layer', visible);

    if (visible) {
        if (!mesoscaleLoaded) fetchMesoscaleDiscussions();
        if (!mesoscaleRefreshTimer) mesoscaleRefreshTimer = setInterval(fetchMesoscaleDiscussions, 5 * 60000);
    } else if (mesoscaleRefreshTimer) {
        clearInterval(mesoscaleRefreshTimer);
        mesoscaleRefreshTimer = null;
    }
}
window.setMesoscaleVisibility = setMesoscaleVisibility;

// ---------------------------------------------------------------------
// Storm Reports (IEM's Storm-Based Warning polygons, rolling 24h window)
// ---------------------------------------------------------------------

// sts = 24 hours ago, ets = now, both as UTC ISO timestamps matching the
// "2026-07-20T18:22:00.000Z" style the mesonet API expects.
function getLsrTimeRange() {
    const ets = new Date();
    const sts = new Date(ets.getTime() - 24 * 60 * 60 * 1000);
    return { stsISO: sts.toISOString(), etsISO: ets.toISOString() };
}

async function fetchLsrReports() {
    try {
        const { stsISO, etsISO } = getLsrTimeRange();
        const url = `${LSR_BASE_URL}?sts=${encodeURIComponent(stsISO)}&ets=${encodeURIComponent(etsISO)}&wfos=`;

        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (map.getSource('lsr-source')) {
            map.getSource('lsr-source').setData(data);
        }
        lsrLoaded = true;
    } catch (error) {
        console.warn('[Deluge] Unable to load Storm Reports:', error);
    }
}

function initLsrLayer() {
    ensureFillOutlineLayer('lsr-source', 'lsr-fill-layer', 'lsr-outline-layer', '#3ea2ff', '#1c6fd9', 0.25);

    map.on('click', 'lsr-fill-layer', (e) => {
        if (!e.features.length) return;
        const props = e.features[0].properties || {};
        const title = [props.phenomena, props.significance].filter(Boolean).join(' ') || 'Storm Report';

        new mapboxgl.Popup({ closeButton: true, className: 'outlookMapboxPopup', maxWidth: '300px' })
            .setLngLat(e.lngLat)
            .setHTML(buildSimplePopupHtml('#3ea2ff', title, `
                <div class="outlookPopupRow"><span class="outlookPopupLabel">WFO</span><span class="outlookPopupValue">${props.wfo || 'N/A'}</span></div>
                <div class="outlookPopupRow"><span class="outlookPopupLabel">Issued</span><span class="outlookPopupValue">${props.issue || 'N/A'}</span></div>
                <div class="outlookPopupRow"><span class="outlookPopupLabel">Expires</span><span class="outlookPopupValue">${props.expire || 'N/A'}</span></div>
            `))
            .addTo(map);
    });

    map.on('mouseenter', 'lsr-fill-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'lsr-fill-layer', () => { map.getCanvas().style.cursor = ''; });
}

function setLsrVisibility(visible) {
    setPairVisibility('lsr-fill-layer', 'lsr-outline-layer', visible);

    if (visible) {
        if (!lsrLoaded) fetchLsrReports();
        if (!lsrRefreshTimer) lsrRefreshTimer = setInterval(fetchLsrReports, 5 * 60000);
    } else if (lsrRefreshTimer) {
        clearInterval(lsrRefreshTimer);
        lsrRefreshTimer = null;
    }
}
window.setLsrVisibility = setLsrVisibility;

// ---------------------------------------------------------------------
// NHC Forecast Cone
// ---------------------------------------------------------------------
// NHC doesn't publish a single stable "give me the cone KMZ" endpoint with
// a documented field name in CurrentStorms.json, and the per-storm file
// naming has shifted over past seasons. Rather than hardcode a URL pattern
// that may silently go stale, this walks the JSON looking for any string
// value that looks like a forecast-cone KMZ link and parses whatever it
// finds. If NHC's schema changes and nothing matches, the layer is simply
// left empty rather than throwing.
function findConeKmzUrls(node, found = []) {
    if (!node) return found;

    if (typeof node === 'string') {
        if (/cone/i.test(node) && /\.kmz(\?|$)/i.test(node)) {
            found.push(node);
        }
        return found;
    }

    if (Array.isArray(node)) {
        node.forEach((item) => findConeKmzUrls(item, found));
        return found;
    }

    if (typeof node === 'object') {
        Object.values(node).forEach((value) => findConeKmzUrls(value, found));
    }

    return found;
}

async function fetchNhcCone() {
    try {
        let response;
        try {
            response = await fetch(NHC_CURRENT_STORMS_URL, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
        } catch (directError) {
            response = await fetchWithCorsFallback(NHC_CURRENT_STORMS_URL);
        }

        const json = await response.json();
        const coneUrls = Array.from(new Set(findConeKmzUrls(json)));

        if (!coneUrls.length) {
            if (map.getSource('nhc-cone-source')) {
                map.getSource('nhc-cone-source').setData({ type: 'FeatureCollection', features: [] });
            }
            nhcConeLoaded = true;
            return;
        }

        const parsedCollections = await Promise.all(coneUrls.map((url) =>
            fetchAndParseKmz(url).catch((error) => {
                console.warn('[Deluge] Failed to parse NHC cone KMZ:', url, error);
                return null;
            })
        ));

        const features = parsedCollections
            .filter(Boolean)
            .flatMap((collection) => collection.features || []);

        if (map.getSource('nhc-cone-source')) {
            map.getSource('nhc-cone-source').setData({ type: 'FeatureCollection', features });
        }
        nhcConeLoaded = true;
    } catch (error) {
        console.warn('[Deluge] Unable to load NHC forecast cone (no active storms, or NHC is unreachable):', error);
    }
}

function initNhcConeLayer() {
    ensureFillOutlineLayer('nhc-cone-source', 'nhc-cone-fill-layer', 'nhc-cone-outline-layer', 'rgba(255,255,255,0.35)', '#ffffff', 0.22);

    map.on('click', 'nhc-cone-fill-layer', (e) => {
        if (!e.features.length) return;
        const props = e.features[0].properties || {};
        new mapboxgl.Popup({ closeButton: true, className: 'outlookMapboxPopup', maxWidth: '300px' })
            .setLngLat(e.lngLat)
            .setHTML(buildSimplePopupHtml('#ffffff', props.LABEL || props.name || 'Forecast Cone'))
            .addTo(map);
    });

    map.on('mouseenter', 'nhc-cone-fill-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'nhc-cone-fill-layer', () => { map.getCanvas().style.cursor = ''; });
}

function setNhcConeVisibility(visible) {
    setPairVisibility('nhc-cone-fill-layer', 'nhc-cone-outline-layer', visible);

    if (visible) {
        if (!nhcConeLoaded) fetchNhcCone();
        if (!nhcConeRefreshTimer) nhcConeRefreshTimer = setInterval(fetchNhcCone, 10 * 60000);
    } else if (nhcConeRefreshTimer) {
        clearInterval(nhcConeRefreshTimer);
        nhcConeRefreshTimer = null;
    }
}
window.setNhcConeVisibility = setNhcConeVisibility;

// ---------------------------------------------------------------------
// Lightning Functions
// ---------------------------------------------------------------------

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

// Calculate opacity based on age (in minutes)
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
        // Always use CORS proxy to avoid CORS issues
        const proxyUrl = CORS_PROXY_URL + encodeURIComponent(LIGHTNING_PLACEFILE_URL);
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`CORS proxy fetch failed with status: ${response.status}`);
        }
        
        const text = await response.text();
        
        // Limit data size to prevent performance issues
        const maxLines = 5000;
        const lines = text.split('\n');
        const limitedText = lines.slice(0, maxLines).join('\n');
        
        lightningData = parsePlacefile(limitedText);
        
        if (lightningSource) {
            lightningSource.setData(lightningToGeoJSON(lightningData));
        }
        
        console.log(`[Deluge] Updated lightning data: ${lightningData.length} strikes`);
    } catch (error) {
        console.error('[Deluge] Error fetching lightning data:', error);
        // Don't spam the console with repeated errors
        if (lightningData.length === 0) {
            console.warn('[Deluge] Lightning data unavailable - layer will remain empty');
        }
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
    // Clear any existing intervals
    if (lightningUpdateInterval) clearInterval(lightningUpdateInterval);
    if (lightningFetchInterval) clearInterval(lightningFetchInterval);
    
    // Fetch immediately
    fetchLightningData();
    
    // Update opacity every 10 seconds
    lightningUpdateInterval = setInterval(updateLightningOpacity, 10000);
    
    // Fetch new data every 5 minutes (300 seconds as per placefile)
    lightningFetchInterval = setInterval(fetchLightningData, 300000);
}

// Toggle lightning visibility
function toggleLightning() {
    if (!lightningLayer) {
        initLightningLayer();
        setupLightningClickHandler();
        startLightningUpdates();
    }
    
    const isVisible = map.getLayoutProperty('lightning-layer', 'visibility') === 'visible';
    map.setLayoutProperty('lightning-layer', 'visibility', isVisible ? 'none' : 'visible');
    
    if (!isVisible && lightningData.length === 0) {
        startLightningUpdates();
    }
}
window.toggleLightning = toggleLightning;

// ---------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------

function initExtraLayers() {
    initMesoscaleLayer();
    initLsrLayer();
    initNhcConeLayer();
}

if (map.loaded()) {
    initExtraLayers();
    initLightningLayer();
    setupLightningClickHandler();
    startLightningUpdates();
} else {
    map.on('load', () => {
        initExtraLayers();
        initLightningLayer();
        setupLightningClickHandler();
        startLightningUpdates();
    });
}

// A base-style switch (Settings panel) wipes every custom source/layer, so
// rebuild the layer shells and re-fetch anything that was actively toggled
// on before the switch.
if (typeof window.registerLayerReinit === 'function') {
    window.registerLayerReinit(() => {
        initExtraLayers();
        initLightningLayer();
        setupLightningClickHandler();
        if (mesoscaleLoaded) fetchMesoscaleDiscussions();
        if (lsrLoaded) fetchLsrReports();
        if (nhcConeLoaded) fetchNhcCone();
        if (lightningData.length > 0) {
            lightningSource.setData(lightningToGeoJSON(lightningData));
        }
    });
}

// Layer state

let mesoscaleLayer = null;

let mesoscaleSource = null;

let lsrLayer = null;

let lsrSource = null;

let stormDataLayer = null;

let stormDataSource = null;



// Toggle states

let mesoscaleEnabled = false;

let lsrEnabled = false;

let stormDataEnabled = false;



// Initialize layer toggles

function initLayerToggles() {

    const mesoscaleToggle = document.getElementById('mesoscaleToggle');

    const lsrToggle = document.getElementById('lsrToggle');

    const stormDataToggle = document.getElementById('stormDataToggle');

    const camerasToggle = document.getElementById('camerasToggle');

    const alertsToggle = document.getElementById('alertsToggle');

    const stormTracksToggle = document.getElementById('stormTracksToggle');

    const lightningToggle = document.getElementById('lightningToggle');

    

    if (mesoscaleToggle) {

        mesoscaleToggle.addEventListener('click', () => {

            mesoscaleEnabled = !mesoscaleEnabled;

            mesoscaleToggle.classList.toggle('active', mesoscaleEnabled);

            if (mesoscaleEnabled) {

                loadMesoscaleDiscussions();

            } else {

                removeMesoscaleDiscussions();

            }

        });

    }

    

    if (lsrToggle) {

        lsrToggle.addEventListener('click', () => {

            lsrEnabled = !lsrEnabled;

            lsrToggle.classList.toggle('active', lsrEnabled);

            if (lsrEnabled) {

                loadLSRReports();

            } else {

                removeLSRReports();

            }

        });

    }

    

    if (stormDataToggle) {

        stormDataToggle.addEventListener('click', () => {

            stormDataEnabled = !stormDataEnabled;

            stormDataToggle.classList.toggle('active', stormDataEnabled);

            if (stormDataEnabled) {

                loadStormData();

            } else {

                removeStormData();

            }

        });

    }

    

    // Existing layer toggles - these should call existing functions

    if (camerasToggle) {

        camerasToggle.addEventListener('click', () => {

            camerasToggle.classList.toggle('active');

            // Call existing camera toggle function if it exists

            if (typeof window.toggleCameras === 'function') {

                window.toggleCameras();

            }

        });

    }

    

    if (alertsToggle) {

        alertsToggle.addEventListener('click', () => {

            alertsToggle.classList.toggle('active');

            // Call existing alerts toggle function if it exists

            if (typeof window.toggleAlerts === 'function') {

                window.toggleAlerts();

            }

        });

    }

    

    if (stormTracksToggle) {

        stormTracksToggle.addEventListener('click', () => {

            stormTracksToggle.classList.toggle('active');

            // Call existing storm tracks toggle function if it exists

            if (typeof window.toggleStormTracks === 'function') {

                window.toggleStormTracks();

            }

        });

    }

    

    if (lightningToggle) {

        lightningToggle.addEventListener('click', () => {

            lightningToggle.classList.toggle('active');

            // Call existing lightning toggle function if it exists

            if (typeof window.toggleLightning === 'function') {

                window.toggleLightning();

            }

        });

    }

}



// Mesoscale Discussions (KMZ parsing)

async function loadMesoscaleDiscussions() {

    try {

        const response = await fetch('https://www.spc.noaa.gov/products/md/ActiveMD.kmz');

        if (!response.ok) throw new Error('Failed to fetch Mesoscale Discussions');

        

        const arrayBuffer = await response.arrayBuffer();

        const zip = await JSZip.loadAsync(arrayBuffer);

        

        // Find the KML file in the KMZ

        const kmlFile = Object.keys(zip.files).find(name => name.endsWith('.kml'));

        if (!kmlFile) throw new Error('No KML file found in KMZ');

        

        const kmlContent = await zip.file(kmlFile).async('string');

        const geojson = kmlToGeoJSON(kmlContent);

        

        if (map.getSource('mesoscale-source')) {

            map.getSource('mesoscale-source').setData(geojson);

        } else {

            map.addSource('mesoscale-source', {

                type: 'geojson',

                data: geojson

            });

            

            map.addLayer({

                id: 'mesoscale-layer',

                type: 'fill',

                source: 'mesoscale-source',

                paint: {

                    'fill-color': '#ff6b35',

                    'fill-opacity': 0.5,

                    'fill-outline-color': '#ff6b35'

                }

            });

            

            map.addLayer({

                id: 'mesoscale-outline',

                type: 'line',

                source: 'mesoscale-source',

                paint: {

                    'line-color': '#ff6b35',

                    'line-width': 3,

                    'line-opacity': 1

                }

            });

            

            // Move layers to top to ensure visibility

            map.moveLayer('mesoscale-layer');

            map.moveLayer('mesoscale-outline');

        }

        

        mesoscaleLayer = map.getLayer('mesoscale-layer');

        mesoscaleSource = map.getSource('mesoscale-source');

        

        console.log('[Layers] Mesoscale Discussions loaded with', geojson.features.length, 'features');

    } catch (error) {

        console.error('[Layers] Failed to load Mesoscale Discussions:', error);

    }

}



function removeMesoscaleDiscussions() {

    if (map.getLayer('mesoscale-layer')) {

        map.removeLayer('mesoscale-layer');

    }

    if (map.getLayer('mesoscale-outline')) {

        map.removeLayer('mesoscale-outline');

    }

    if (map.getSource('mesoscale-source')) {

        map.removeSource('mesoscale-source');

    }

    mesoscaleLayer = null;

    mesoscaleSource = null;

}



// Simple KML to GeoJSON converter

function kmlToGeoJSON(kmlString) {

    const parser = new DOMParser();

    const xmlDoc = parser.parseFromString(kmlString, 'text/xml');

    

    const features = [];

    const placemarks = xmlDoc.getElementsByTagName('Placemark');

    

    for (let i = 0; i < placemarks.length; i++) {

        const placemark = placemarks[i];

        const name = placemark.getElementsByTagName('name')[0]?.textContent || '';

        const description = placemark.getElementsByTagName('description')[0]?.textContent || '';

        

        const polygon = placemark.getElementsByTagName('Polygon')[0];

        const coordinates = polygon?.getElementsByTagName('coordinates')[0]?.textContent;

        

        if (coordinates) {

            const coords = coordinates.trim().split(/\s+/).map(coord => {

                const [lng, lat] = coord.split(',').map(Number);

                return [lng, lat];

            });

            

            features.push({

                type: 'Feature',

                properties: {

                    name: name,

                    description: description

                },

                geometry: {

                    type: 'Polygon',

                    coordinates: [coords]

                }

            });

        }

    }

    

    return {

        type: 'FeatureCollection',

        features: features

    };

}



// LSR Reports

async function loadLSRReports() {

    try {

        // Calculate time parameters (24 hours ago to now in UTC)

        const now = new Date();

        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        

        const sts = twentyFourHoursAgo.toISOString();

        const ets = now.toISOString();

        

        const url = `https://mesonet.agron.iastate.edu/geojson/sbw.geojson?sts=${encodeURIComponent(sts)}&ets=${encodeURIComponent(ets)}`;

        

        const response = await fetch(url);

        if (!response.ok) throw new Error('Failed to fetch LSR Reports');

        

        const geojson = await response.json();

        

        if (map.getSource('lsr-source')) {

            map.getSource('lsr-source').setData(geojson);

        } else {

            map.addSource('lsr-source', {

                type: 'geojson',

                data: geojson

            });

            

            map.addLayer({

                id: 'lsr-layer',

                type: 'circle',

                source: 'lsr-source',

                paint: {

                    'circle-radius': 3,

                    'circle-color': '#00ff00',

                    'circle-stroke-width': 3,

                    'circle-stroke-color': '#ffffff',

                    'circle-opacity': 1

                }

            });

            

            // Move layer to top to ensure visibility

            map.moveLayer('lsr-layer');

        }

        

        lsrLayer = map.getLayer('lsr-layer');

        lsrSource = map.getSource('lsr-source');

        

        console.log('[Layers] LSR Reports loaded with', geojson.features.length, 'features');

    } catch (error) {

        console.error('[Layers] Failed to load LSR Reports:', error);

    }

}



function removeLSRReports() {

    if (map.getLayer('lsr-layer')) {

        map.removeLayer('lsr-layer');

    }

    if (map.getSource('lsr-source')) {

        map.removeSource('lsr-source');

    }

    lsrLayer = null;

    lsrSource = null;

}



// Storm/Tropical Cyclone layer (using local AerisWeather data)

async function loadStormData() {

    try {

        const response = await fetch('./json/WeatherWise/AerisWeather.geojson');

        if (!response.ok) throw new Error('Failed to fetch storm data');

        

        const data = await response.json();

        

        // Extract storm track and position from AerisWeather format

        const features = [];

        

        if (data.response && data.response.length > 0) {

            const storm = data.response[0];

            

            // Add current position marker

            if (storm.position && storm.position.location) {

                features.push({

                    type: 'Feature',

                    properties: {

                        name: storm.profile.stormName || 'Storm',

                        type: 'current',

                        windSpeed: storm.position.details.windSpeedMPH,

                        pressure: storm.position.details.pressureMB

                    },

                    geometry: storm.position.location

                });

            }

            

            // Add track points

            if (storm.track && storm.track.length > 0) {

                const trackCoords = storm.track.map(point => point.location.coordinates);

                

                features.push({

                    type: 'Feature',

                    properties: {

                        name: storm.profile.stormName + ' Track',

                        type: 'track'

                    },

                    geometry: {

                        type: 'LineString',

                        coordinates: trackCoords

                    }

                });

            }

            

            // Add wind radii polygons if available

            if (storm.position.details.windRadii && storm.position.details.windRadii.length > 0) {

                storm.position.details.windRadii.forEach(radius => {

                    if (radius.quadrants) {

                        const coords = [

                            radius.quadrants.ne.loc,

                            radius.quadrants.se.loc,

                            radius.quadrants.sw.loc,

                            radius.quadrants.nw.loc,

                            radius.quadrants.ne.loc

                        ];

                        

                        features.push({

                            type: 'Feature',

                            properties: {

                                name: `${radius.windSpeedKTS}KT Wind Field`,

                                type: 'wind-field',

                                windSpeed: radius.windSpeedKTS

                            },

                            geometry: {

                                type: 'Polygon',

                                coordinates: [coords]

                            }

                        });

                    }

                });

            }

        }

        

        const geojson = {

            type: 'FeatureCollection',

            features: features

        };

        

        if (map.getSource('storm-data-source')) {

            map.getSource('storm-data-source').setData(geojson);

        } else {

            map.addSource('storm-data-source', {

                type: 'geojson',

                data: geojson

            });

            

            // Current position marker

            map.addLayer({

                id: 'storm-position-layer',

                type: 'circle',

                source: 'storm-data-source',

                filter: ['==', ['get', 'type'], 'current'],

                paint: {

                    'circle-radius': 10,

                    'circle-color': '#ff0000',

                    'circle-stroke-width': 3,

                    'circle-stroke-color': '#ffffff',

                    'circle-opacity': 1

                }

            });

            

            // Track line

            map.addLayer({

                id: 'storm-track-layer',

                type: 'line',

                source: 'storm-data-source',

                filter: ['==', ['get', 'type'], 'track'],

                paint: {

                    'line-color': '#ff6600',

                    'line-width': 3,

                    'line-opacity': 0.8

                }

            });

            

            // Wind field polygons

            map.addLayer({

                id: 'storm-wind-field-layer',

                type: 'fill',

                source: 'storm-data-source',

                filter: ['==', ['get', 'type'], 'wind-field'],

                paint: {

                    'fill-color': '#ffcc00',

                    'fill-opacity': 0.2,

                    'fill-outline-color': '#ffcc00'

                }

            });

            

            map.addLayer({

                id: 'storm-wind-field-outline',

                type: 'line',

                source: 'storm-data-source',

                filter: ['==', ['get', 'type'], 'wind-field'],

                paint: {

                    'line-color': '#ffcc00',

                    'line-width': 2,

                    'line-opacity': 0.8,

                    'line-dasharray': [4, 4]

                }

            });

        }

        

        stormDataLayer = map.getLayer('storm-position-layer');

        stormDataSource = map.getSource('storm-data-source');

        

        console.log('[Layers] Storm data loaded');

    } catch (error) {

        console.error('[Layers] Failed to load storm data:', error);

    }

}



function removeStormData() {

    if (map.getLayer('storm-position-layer')) {

        map.removeLayer('storm-position-layer');

    }

    if (map.getLayer('storm-track-layer')) {

        map.removeLayer('storm-track-layer');

    }

    if (map.getLayer('storm-wind-field-layer')) {

        map.removeLayer('storm-wind-field-layer');

    }

    if (map.getLayer('storm-wind-field-outline')) {

        map.removeLayer('storm-wind-field-outline');

    }

    if (map.getSource('storm-data-source')) {

        map.removeSource('storm-data-source');

    }

    stormDataLayer = null;

    stormDataSource = null;

}



// Initialize when map is ready

if (typeof map !== 'undefined') {

    map.on('load', () => {

        initLayerToggles();

    });

} else {

    // Wait for map to be initialized

    window.addEventListener('map-initialized', initLayerToggles);

}