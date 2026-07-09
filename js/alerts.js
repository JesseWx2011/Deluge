// https://api.weather.gov/alerts/active?code=TOR,SVR,SVA,TOA,FFW,SPS

const nwsAPI = "https://api.weather.gov/alerts/active?code=TOR,SVR,SVA,TOA,FFW,SPS"
const alertFilters = [];

// Color mapping for alert types
const alertColors = {
    'Tornado Warning': '#f0002c',
    'Severe Thunderstorm Warning': '#e49b0f',
    'Flash Flood Warning': '#00c537',
    'Tornado Watch': '#FFFF00',
    'Severe Thunderstorm Watch': '#FF8C00',
    'Special Weather Statement': '#566573',
};


// Function to categorize Tornado Warnings
function getTornadoWarningCategory(properties) {
    if (properties.event !== 'Tornado Warning') {
        return 'base';
    }

    const description = (properties.description || '').toUpperCase();
    const tornadoDetection = properties.tornadoDetection;

    // Check for TOR-E (Tornado Emergency) - highest priority
    if (description.includes('TORNADO EMERGENCY')) {
        return 'tor-e';
    }

    // Check for PDS (Particularly Dangerous Situation)
    if (description.includes('THIS IS A PARTICULARLY DANGEROUS SITUATION') && tornadoDetection === 'OBSERVED') {
        return 'pds';
    }

    // Check for Confirmed (Observed)
    if (tornadoDetection === 'OBSERVED') {
        return 'confirmed';
    }

    return 'base';
}

// Function to get alert display name
function getAlertDisplayName(event, properties) {
    if (event !== 'Tornado Warning') {
        return event;
    }

    const category = getTornadoWarningCategory(properties);
    const names = {
        'base': 'Tornado Warning',
        'confirmed': 'Confirmed Tornado Warning',
        'pds': 'PDS Tornado Warning',
        'tor-e': 'Tornado Emergency'
    };
    return names[category] || event;
}

function addCategories() {
   // For SVR's, show the wind speed and the hail size.


}

// Function to get color based on alert event type and properties
function getAlertColor(event, properties = {}) {
    if (event === 'Tornado Warning') {
        const category = getTornadoWarningCategory(properties);
        const tornadoColors = {
            'base': '#f0002c',      // Red
            'confirmed': '#8B0000', // Dark Red
            'pds': '#DDA0DD',       // Light Purple
            'tor-e': '#8B00FF'      // Violet
        };
        return tornadoColors[category] || '#f0002c';
    }
    return alertColors[event] || '#666666'; // Default gray for unknown types
}

function parseNumericValue(value) {
    if (!value) return null;
    const normalized = String(value).trim();
    const match = normalized.match(/([0-9]+(?:\.[0-9]+)?)/);
    return match ? parseFloat(match[1]) : null;
}

function getParameterValue(properties, key) {
    const rawValue = properties[key];
    const cleanValue = (value) => {
        if (value === undefined || value === null) return null;
        if (Array.isArray(value)) {
            const first = value[0];
            if (first === undefined || first === null) return null;
            return cleanValue(first);
        }
        if (typeof value === 'object') {
            if ('value' in value) return cleanValue(value.value);
            return JSON.stringify(value);
        }
        const text = String(value).trim();
        return text === '' ? null : text;
    };

    const topValue = cleanValue(rawValue);
    if (topValue !== null) {
        return topValue;
    }

    if (properties.parameters && properties.parameters[key] !== undefined && properties.parameters[key] !== null) {
        return cleanValue(properties.parameters[key]);
    }
    return null;
}

function normalizeEvent(event) {
    if (Array.isArray(event)) {
        event = event[0];
    }
    return String(event || '').trim();
}

function normalizeHailText(value) {
    if (!value) return null;
    const text = String(value).trim();
    const lower = text.toLowerCase();

    if (/^0+(?:\.0+)?$/.test(text)) {
        return 'None';
    }
    if (/softball/.test(lower)) {
        return '4"';
    }
    if (/baseball/.test(lower)) {
        return '2.75"';
    }
    if (/golf\s*ball/.test(lower)) {
        return '1.75"';
    }
    if (/ping\s*-?\s*pong\s*ball/.test(lower)) {
        return '1.50"';
    }
    if (/quarter/.test(lower)) {
        return '0.75"';
    }
    if (/nickel/.test(lower)) {
        return '0.50"';
    }
    if (/pea/.test(lower)) {
        return '0.25"';
    }
    const textInches = lower.match(/\b(two|three|four|five)\s*-?\s*inch(?:es)?\b/);
    if (textInches) {
        const map = { two: 2, three: 3, four: 4, five: 5 };
        return `${map[textInches[1]]}"`;
    }
    if (/up to\s*\.?0?\.75/i.test(text) || /up to\s*\.75/i.test(text)) {
        return '< 0.75';
    }
    const numeric = parseNumericValue(text);
    if (numeric !== null && /^\d+(?:\.\d+)?$/.test(text)) {
        return `${numeric}"`;
    }
    return text.replace(/\s*inch(es)?/gi, '"');
}

function parseHazardDescription(description) {
    const text = String(description || '');
    const match = text.match(/HAZARD\.*\.{3}\s*([^\r\n]+)/i);
    if (!match) {
        return { windText: null, hailText: null };
    }
    const hazardLine = match[1].trim();
    let windText = null;
    let hailText = null;

    const windMatch = hazardLine.match(/(\d+(?:\.\d+)?\s*(?:to\s*\d+(?:\.\d+)?\s*)?mph)/i);
    if (windMatch) {
        windText = windMatch[1].trim();
    }

    const hailMatch = hazardLine.match(/(\d+(?:\.\d+)?\s*(?:in(?:ch(?:es)?)?)?|pea|penny|quarter|half\s*dollar|golf\s*ball|tennis\s*ball|nickel|dime)\s*(?:size)?\s*hail/i);
    if (hailMatch) {
        hailText = hailMatch[1].trim();
    }

    if (!hailText && /hail/i.test(hazardLine)) {
        const hailLineMatch = hazardLine.match(/([^,;]+hail[^,;]*)/i);
        hailText = hailLineMatch ? hailLineMatch[1].trim() : null;
    }

    if (!windText && /wind/i.test(hazardLine)) {
        const fallbackWind = hazardLine.match(/([^,;]*wind[^,;]*)/i);
        windText = fallbackWind ? fallbackWind[1].trim() : null;
    }

    return { windText, hailText };
}

function extractFlashFloodSource(description) {
    if (!description) return null;
    const match = description.match(/SOURCE\.*?\s*([^\.\r\n]+)/i);
    if (!match) return null;
    return match[1].trim();
}

function getHailInfo(properties) {
    const hailValueRaw = getParameterValue(properties, 'maxHailSize') ?? getParameterValue(properties, 'hailSize');
    if (hailValueRaw !== null) {
        return normalizeHailText(hailValueRaw);
    }
    const hazardFallback = parseHazardDescription(properties.description);
    return normalizeHailText(hazardFallback.hailText);
}

function getWindInfo(properties) {
    const windValueRaw = getParameterValue(properties, 'maxWindGust') ?? getParameterValue(properties, 'windGust');
    if (windValueRaw !== null) {
        return String(windValueRaw).trim();
    }
    const hazardFallback = parseHazardDescription(properties.description);
    return hazardFallback.windText || null;
}

function getTornadoBannerText(properties) {
    const damageThreat = Array.isArray(properties.tornadoDamageThreat) ? properties.tornadoDamageThreat[0] : properties.tornadoDamageThreat;
    const headline = String(properties.NWSHeadline || '').toUpperCase();
    const description = String(properties.description || '').toUpperCase();
    const tornadoDetection = Array.isArray(properties.tornadoDetection) ? properties.tornadoDetection[0] : properties.tornadoDetection;

    if (damageThreat === 'CATASTROPHIC' || headline.includes('TORNADO EMERGENCY') || description.includes('TORNADO EMERGENCY')) {
        return 'TORNADO EMERGENCY';
    }
    if (tornadoDetection === 'OBSERVED' && description.includes('THIS IS A PARTICULARLY DANGEROUS SITUATION')) {
        return 'PDS TORNADO WARNING';
    }
    return null;
}

// Converts raw NWS tornado detection values into the short source label shown in the popup
function getTornadoSourceText(properties) {
    const raw = Array.isArray(properties.tornadoDetection) ? properties.tornadoDetection[0] : properties.tornadoDetection;
    if (!raw) return null;
    const upper = String(raw).toUpperCase();
    if (upper.includes('OBSERVED')) return 'Radar Confirmed';
    if (upper.includes('RADAR')) return 'Radar Indicated';
    return String(raw).replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.substr(1).toLowerCase());
}

// Shortens common Flash Flood "SOURCE..." text (e.g. "EMERGENCY MANAGEMENT" -> "Em. Management")
function formatFlashFloodSource(text) {
    if (!text) return null;
    const upper = String(text).toUpperCase();
    if (upper.includes('EMERGENCY MANAGEMENT')) return 'Em. Management';
    if (upper.includes('RADAR') && upper.includes('GAUGE')) return 'Radar & Gauges';
    if (upper.includes('RADAR')) return 'Radar';
    if (upper.includes('GAUGE')) return 'Gauges';
    return String(text).replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.substr(1).toLowerCase());
}

// Pulls an expected rainfall rate (e.g. "1-2"/1 hr") out of the hazard description
function getRainfallRateText(properties) {
    const description = String(properties.description || '');
    const match = description.match(/rainfall rates?\s*(?:of|up to)?\s*([\d.]+(?:\s*(?:to|-)\s*[\d.]+)?)\s*inch(?:es)?\s*(?:per|\/)\s*hour/i);
    if (match) {
        return `${match[1].replace(/\s+/g, '')}"/1 hr`;
    }
    return null;
}

// Builds a "(ST) County1, County2" style location string from areaDesc + UGC state code
function getLocationText(properties) {
    const areaParts = (properties.areaDesc || '').split(';').map(s => s.trim()).filter(Boolean);
    if (areaParts.length === 0) return null;

    let state = null;
    const ugcList = (properties.geocode && (properties.geocode.UGC || properties.geocode.SAME)) || null;
    if (Array.isArray(ugcList) && ugcList.length > 0) {
        state = String(ugcList[0]).substring(0, 2).toUpperCase();
    }

    const counties = areaParts.slice(0, 2).map(name => name.replace(/\s*(County|Parish)$/i, '').trim());
    const suffix = areaParts.length > 2 ? '...' : '';
    const countyText = counties.join(', ') + suffix;

    return state ? `(${state}) ${countyText}` : countyText;
}

// Picks the banner strip color for elevated-severity callouts, independent of the side bar color
function getBannerColor(normalizedEvent) {
    if (normalizedEvent === 'Tornado Warning') return '#d6006d';
    if (normalizedEvent === 'Severe Thunderstorm Warning') return '#d84315';
    if (normalizedEvent === 'Flash Flood Warning') return '#00913f';
    return alertColors[normalizedEvent] || '#666666';
}

function getSvrBannerText(properties) {
    const hailValueRaw = getParameterValue(properties, 'maxHailSize') ?? getParameterValue(properties, 'hailSize');
    const hailText = normalizeHailText(hailValueRaw || '');
    let hailValue = parseNumericValue(String(hailText || ''));
    const windString = String(getParameterValue(properties, 'maxWindGust') || '');
    let windValue = parseNumericValue(windString);

    if (hailValue === null || windValue === null) {
        const hazard = parseHazardDescription(properties.description);
        if (hailValue === null) {
            const hazardHailText = normalizeHailText(hazard.hailText || '');
            hailValue = parseNumericValue(String(hazardHailText || ''));
        }
        if (windValue === null) {
            windValue = parseNumericValue(String(hazard.windText || ''));
        }
    }

    if ((hailValue !== null && hailValue >= 4) || (windValue !== null && windValue >= 90)) {
        return 'EXTREMELY DANGEROUS SITUATION';
    }
    if ((hailValue !== null && hailValue >= 3) || (windValue !== null && windValue >= 80)) {
        return 'PARTICULARLY DANGEROUS SITUATION';
    }
    if ((hailValue !== null && hailValue >= 2) || (windValue !== null && windValue >= 70)) {
        return 'CONSIDERABLE SVR';
    }
    return null;
}

function getFlashFloodBannerText(properties) {
    const description = String(properties.description || '');
    const threat = Array.isArray(properties.flashFloodDamageThreat) ? properties.flashFloodDamageThreat[0] : properties.flashFloodDamageThreat;
    if (threat === 'CATASTROPHIC' || description.includes("FLASH FLOOD EMERGENCY")) {
        return 'FLASH FLOOD EMERGENCY';
    }
    if (/this is a PARTICULARLY DANGEROUS SITUATION\./i.test(description)) {
        return 'PARTICULARLY DANGEROUS SITUATION';
    }
    return null;
}

function buildAlertPopup(properties) {
    const normalizedEvent = normalizeEvent(properties.event);
    const barColor = alertColors[normalizedEvent] || getAlertColor(normalizedEvent, properties);
    const locationText = getLocationText(properties);
    const expiresDate = new Date(properties.expires);
    const minutesLeft = Math.max(0, Math.round((expiresDate.getTime() - Date.now()) / 60000));

    const tornadoSource = getTornadoSourceText(properties);
    const hailThreat = String(getParameterValue(properties, 'hailThreat') || '').trim();
    const windThreat = String(getParameterValue(properties, 'windThreat') || '').trim();
    const hailText = getHailInfo(properties);
    const windText = getWindInfo(properties);
    const flashSource = extractFlashFloodSource(properties.description);
    const rainfallRate = getRainfallRateText(properties);

    const bannerText = normalizedEvent === 'Tornado Warning'
        ? getTornadoBannerText(properties)
        : normalizedEvent === 'Severe Thunderstorm Warning'
            ? getSvrBannerText(properties)
            : normalizedEvent === 'Flash Flood Warning'
                ? getFlashFloodBannerText(properties)
                : null;

    const bannerColor = getBannerColor(normalizedEvent);

    const details = [];

    if (normalizedEvent === 'Tornado Warning') {
        if (tornadoSource) details.push({ label: 'Source', value: tornadoSource });
        if (hailText) details.push({ label: 'Hail', value: hailText });
    } else if (normalizedEvent === 'Severe Thunderstorm Warning') {
        if (windText) details.push({ label: 'Wind', value: `${windText}` });
        else if (windThreat) details.push({ label: 'Wind Threat', value: windThreat });
        if (hailText !== null) details.push({ label: 'Hail', value: hailText });
        else if (hailThreat) details.push({ label: 'Hail Threat', value: hailThreat });
    } else if (normalizedEvent === 'Flash Flood Warning') {
        if (flashSource) details.push({ label: 'Source', value: formatFlashFloodSource(flashSource) });
        if (rainfallRate) details.push({ label: 'RR', value: rainfallRate });
    }

    details.push({ label: 'Expires', value: `${minutesLeft} min` });

    const detailRows = details.map(detail => `
                    <div class="alertPopupRow">
                        <span class="alertPopupLabel">${detail.label}:</span>
                        <span class="alertPopupValue">${detail.value}</span>
                    </div>`).join('');

    return `
        <div class="alertPopup">
            <div class="alertPopupBar" style="background: ${barColor};"></div>
            <div class="alertPopupBody">
                <div class="alertPopupHeader">
                    <div>
                        <div class="alertPopupTitle">${normalizedEvent}</div>
                        ${locationText ? `<div class="alertPopupLocation">${locationText}</div>` : ''}
                    </div>
                    <div class="alertPopupInfo"><i class="fa-solid fa-circle-info"></i></div>
                </div>
                ${bannerText ? `<div class="alertPopupBanner" style="background: ${bannerColor};">${bannerText}</div>` : ''}
                <div class="alertPopupDetails">${detailRows}
                </div>
            </div>
        </div>
    `;
}

// Fetch and display alerts
async function fetchAlerts() {
    try {
        const response = await fetch(nwsAPI);
        const data = await response.json();

        console.log(data);
        
        // Add alerts to map if available
        if (data.features && data.features.length > 0) {
            addAlertsToMap(data);
        }
    } catch (error) {
        console.error("Error fetching alerts:", error);
    }
}

// Add alerts to map as a layer
function addAlertsToMap(alertData) {
    // Wait for map to load
    if (!map.isStyleLoaded()) {
        map.on('load', () => addAlertsLayer(alertData));
    } else {
        addAlertsLayer(alertData);
    }
}

function addAlertsLayer(alertData) {
    // Remove existing source if it exists
    if (map.getSource('alerts')) {
        if (map.getLayer('alerts-layer')) {
            map.removeLayer('alerts-layer');
        }
        if (map.getLayer('alerts-outline')) {
            map.removeLayer('alerts-outline');
        }
        map.removeSource('alerts');
    }

    // Add alerts source
    map.addSource('alerts', {
        'type': 'geojson',
        'data': alertData
    });

    // Add alerts layer with color based on event type
    map.addLayer({
        'id': 'alerts-layer',
        'type': 'fill',
        'source': 'alerts',
        'paint': {
            'fill-color': [
                'case',
                // Tornado Emergency (highest priority)
                ['in', 'TORNADO EMERGENCY', ['upcase', ['get', 'description']]],
                '#8B00FF', // Violet
                // PDS Tornado Warning (Particularly Dangerous Situation)
                ['all',
                    ['==', ['get', 'event'], 'Tornado Warning'],
                    ['==', ['get', 'tornadoDetection'], 'OBSERVED'],
                    ['in', 'THIS IS A PARTICULARLY DANGEROUS SITUATION', ['upcase', ['get', 'description']]]
                ],
                '#DDA0DD', // Light Purple
                // Confirmed Tornado Warning
                ['all',
                    ['==', ['get', 'event'], 'Tornado Warning'],
                    ['==', ['get', 'tornadoDetection'], 'OBSERVED']
                ],
                '#8B0000', // Dark Red
                // Regular Tornado Warning
                ['==', ['get', 'event'], 'Tornado Warning'],
                '#f0002c', // Red
                // Other events
                ['==', ['get', 'event'], 'Severe Thunderstorm Warning'],
                '#e49b0f',
                ['==', ['get', 'event'], 'Flash Flood Warning'],
                '#00c537',
                ['==', ['get', 'event'], 'Tornado Watch'],
                '#FFFF00',
                ['==', ['get', 'event'], 'Severe Thunderstorm Watch'],
                '#FF8C00',
                ['==', ['get', 'event'], 'Special Weather Statement'],
                '#566573',
                '#666666' // Default gray
            ],
            'fill-opacity': 0.6
        }
    }, 'road-minor');

    // Add outline layer for polygons
    map.addLayer({
        'id': 'alerts-outline',
        'type': 'line',
        'source': 'alerts',
        'paint': {
            'line-color': [
                'case',
                // Tornado Emergency (highest priority)
                ['in', 'TORNADO EMERGENCY', ['upcase', ['get', 'description']]],
                '#8B00FF', // Violet
                // PDS Tornado Warning (Particularly Dangerous Situation)
                ['all',
                    ['==', ['get', 'event'], 'Tornado Warning'],
                    ['==', ['get', 'tornadoDetection'], 'OBSERVED'],
                    ['in', 'THIS IS A PARTICULARLY DANGEROUS SITUATION', ['upcase', ['get', 'description']]]
                ],
                '#DDA0DD', // Light Purple
                // Confirmed Tornado Warning
                ['all',
                    ['==', ['get', 'event'], 'Tornado Warning'],
                    ['==', ['get', 'tornadoDetection'], 'OBSERVED']
                ],
                '#8B0000', // Dark Red
                // Regular Tornado Warning
                ['==', ['get', 'event'], 'Tornado Warning'],
                '#f0002c', // Red
                // Other events
                ['==', ['get', 'event'], 'Severe Thunderstorm Warning'],
                '#e49b0f',
                ['==', ['get', 'event'], 'Flash Flood Warning'],
                '#00c537',
                ['==', ['get', 'event'], 'Tornado Watch'],
                '#FFFF00',
                ['==', ['get', 'event'], 'Severe Thunderstorm Watch'],
                '#FF8C00',
                ['==', ['get', 'event'], 'Special Weather Statement'],
                '#566573',
                '#666666' // Default gray
            ],
            'line-width': 3.5,
            'line-opacity': 1
        }
    }, 'road-minor');

    // Handle alert polygon clicks to show popup
    map.on('click', 'alerts-layer', (e) => {
        if (e.features.length > 0) {
            const properties = e.features[0].properties;
            const popupHTML = buildAlertPopup(properties);

            new mapboxgl.Popup({ offset: 25, maxWidth: '340px' })
                .setLngLat(e.lngLat)
                .setHTML(popupHTML)
                .addTo(map);
        }
    });

    // Handle alert outline clicks as well
    map.on('click', 'alerts-outline', (e) => {
        if (e.features.length > 0) {
            const properties = e.features[0].properties;
            const popupHTML = buildAlertPopup(properties);

            new mapboxgl.Popup({ offset: 25, maxWidth: '340px' })
                .setLngLat(e.lngLat)
                .setHTML(popupHTML)
                .addTo(map);
        }
    });

    // Change cursor on hover
    map.on('mouseenter', 'alerts-layer', () => {
        map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'alerts-layer', () => {
        map.getCanvas().style.cursor = '';
    });

    map.on('mouseenter', 'alerts-outline', () => {
        map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'alerts-outline', () => {
        map.getCanvas().style.cursor = '';
    });
}

// Fetch alerts when the script loads
fetchAlerts();

// Optional: Refresh alerts every 5 minutes
setInterval(fetchAlerts, 300000);
