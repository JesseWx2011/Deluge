// https://api.weather.gov/alerts/active?code=TOR,SVR,SVA,TOA,FFW,SPS

const unix = Math.floor(Date.now() / 1000);

const weatherWiseAPI = 'https://data2.weatherwise.app/warnings/USA.geojson';
const nwsAPI = `https://api.weather.gov/alerts/active?code=TOR,SVR,SVA,TOA,FFW,SPS`
const alertFilters = ['TOR', 'SVR', 'SVA', 'TOA', 'FFW', 'SPS'];
const supportedAlertEvents = new Set([
    'Tornado Warning',
    'Severe Thunderstorm Warning',
    'Flash Flood Warning',
    'Tornado Watch',
    'Severe Thunderstorm Watch',
    'Special Weather Statement'
]);

// Color mapping for alert types
const alertColors = {
    'Tornado Warning': '#f0002c',
    'Severe Thunderstorm Warning': '#e49b0f',
    'Flash Flood Warning': '#00c537',
    'Tornado Watch': '#FFFF00',
    'Severe Thunderstorm Watch': '#FF8C00',
    'Special Weather Statement': '#566573',
};


// Mutable opacity state, tuned live from the Settings panel (see settings.js)
let alertFillOpacity = 0.6;
let alertLineOpacity = 1;

// Builds the Mapbox "case" expression used for both fill-color and line-color.
// Pulling this out (instead of writing the case expression twice, inline) means
// changing a color in alertColors just needs a fresh call to this + setPaintProperty.
function buildAlertColorExpression() {
    return [
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
        alertColors['Tornado Warning'],
        // Other events
        ['==', ['get', 'event'], 'Severe Thunderstorm Warning'],
        alertColors['Severe Thunderstorm Warning'],
        ['==', ['get', 'event'], 'Flash Flood Warning'],
        alertColors['Flash Flood Warning'],
        ['==', ['get', 'event'], 'Tornado Watch'],
        alertColors['Tornado Watch'],
        ['==', ['get', 'event'], 'Severe Thunderstorm Watch'],
        alertColors['Severe Thunderstorm Watch'],
        ['==', ['get', 'event'], 'Special Weather Statement'],
        alertColors['Special Weather Statement'],
        '#666666' // Default gray
    ];
}

// Called from the Settings panel whenever a color swatch or the opacity
// slider changes. Updates the live map paint properties immediately.
function applyAlertColorSettings(colors, opacityPercent) {
    if (colors) {
        Object.assign(alertColors, colors);
    }
    if (opacityPercent !== undefined && opacityPercent !== null) {
        alertFillOpacity = Math.max(0, Math.min(100, Number(opacityPercent))) / 100;
        alertLineOpacity = Math.min(1, alertFillOpacity + 0.3);
    }

    if (map.getLayer('alerts-layer')) {
        map.setPaintProperty('alerts-layer', 'fill-color', buildAlertColorExpression());
        map.setPaintProperty('alerts-layer', 'fill-opacity', alertFillOpacity);
    }
    if (map.getLayer('alerts-outline')) {
        map.setPaintProperty('alerts-outline', 'line-color', buildAlertColorExpression());
        map.setPaintProperty('alerts-outline', 'line-opacity', alertLineOpacity);
    }
}
window.applyAlertColorSettings = applyAlertColorSettings;

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

function normalizeAlertFeature(feature) {
    if (!feature || !feature.properties) return null;

    const props = feature.properties;
    const rawEvent = normalizeEvent(props.event || props.title || props.product || props.event_type || props.type);
    let event = rawEvent;

    if (!event) {
        const title = String(props.title || props.summary || '').toUpperCase();
        if (title.includes('TORNADO EMERGENCY') || title.includes('TORNADO WARNING')) {
            event = 'Tornado Warning';
        } else if (title.includes('SEVERE THUNDERSTORM WARNING')) {
            event = 'Severe Thunderstorm Warning';
        } else if (title.includes('FLASH FLOOD WARNING')) {
            event = 'Flash Flood Warning';
        } else if (title.includes('TORNADO WATCH')) {
            event = 'Tornado Watch';
        } else if (title.includes('SEVERE THUNDERSTORM WATCH')) {
            event = 'Severe Thunderstorm Watch';
        } else if (title.includes('SPECIAL WEATHER STATEMENT')) {
            event = 'Special Weather Statement';
        }
    }

    if (!event || !supportedAlertEvents.has(event)) {
        return null;
    }

    return {
        ...feature,
        properties: {
            ...props,
            event,
            description: props.description || props.text || props.summary || props.details || '',
            expires: props.expires || props.expires_at || props.expiresAt || props.valid_until || null,
            areaDesc: props.areaDesc || props.area_desc || props.area || (Array.isArray(props.states) ? props.states.map(state => state.name).join(', ') : null),
            geocode: props.geocode || (Array.isArray(props.ugcs) ? { UGC: props.ugcs } : null),
            NWSHeadline: props.NWSHeadline || props.title || props.event || '',
            tornadoDetection: props.tornadoDetection || props.tornado_detection || null,
            tornadoDamageThreat: props.tornadoDamageThreat || props.tornado_damage_threat || null,
            flashFloodDamageThreat: props.flashFloodDamageThreat || props.flash_flood_damage_threat || null,
            alertSource: props.alertSource || 'WeatherWise'
        }
    };
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
    if (/penny/.test(lower)) {
        return '0.25"';
    } if (/small\s*-?\s*hail/.test(lower)) {
        return '< 0.25"'
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
    const rawArea = properties.areaDesc ?? properties.area_desc ?? properties.area ?? properties.location ?? null;
    let areaText = '';

    if (Array.isArray(rawArea)) {
        areaText = rawArea.filter(Boolean).map(item => String(item)).join('; ');
    } else if (typeof rawArea === 'string') {
        areaText = rawArea;
    } else if (rawArea && typeof rawArea === 'object') {
        areaText = rawArea.name || rawArea.title || rawArea.label || JSON.stringify(rawArea);
    }

    const areaParts = String(areaText || '')
        .split(';')
        .map(s => String(s).trim())
        .filter(Boolean);

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

// Shared by the map popup and the alert modal: builds the ordered list of
// label/value chips (Source, Hail, Wind, RR, Expires...) for a given alert.
function computeAlertDetails(properties) {
    const normalizedEvent = normalizeEvent(properties.event);
    const expiresDate = new Date(properties.expires);
    const totalMinutesLeft = Math.max(0, Math.round((expiresDate.getTime() - Date.now()) / 60000));
    const hoursLeft = Math.floor(totalMinutesLeft / 60);
    const minutesLeft = totalMinutesLeft % 60;
    const hoursDisplay = hoursLeft > 0 ? `${hoursLeft}h ` : '';

    const tornadoSource = getTornadoSourceText(properties);
    const hailThreat = String(getParameterValue(properties, 'hailThreat') || '').trim();
    const windThreat = String(getParameterValue(properties, 'windThreat') || '').trim();
    const hailText = getHailInfo(properties);
    const windText = getWindInfo(properties);
    const flashSource = extractFlashFloodSource(properties.description);
    const rainfallRate = getRainfallRateText(properties);

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

    details.push({
        label: 'Expires',
        value: `${hoursDisplay}${minutesLeft} min`
    });

    return details;
}

// Lightens a "#rrggbb" hex color by the given percent (0-100), used to build
// the alert modal's header gradient from the alert's base color.
function lightenHexColor(hex, percent) {
    const clean = String(hex || '#666666').replace('#', '');
    const num = parseInt(clean.length === 3
        ? clean.split('').map(c => c + c).join('')
        : clean, 16);
    if (Number.isNaN(num)) return hex;

    const amount = Math.round(2.55 * percent);
    const r = Math.min(255, (num >> 16) + amount);
    const g = Math.min(255, ((num >> 8) & 0x00FF) + amount);
    const b = Math.min(255, (num & 0x0000FF) + amount);

    return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
}

// Builds the big alert modal (name at top, feature chips, raw bulletin text)
function buildAlertModalContent(properties) {
    const normalizedEvent = normalizeEvent(properties.event);
    const baseColor = getAlertColor(normalizedEvent, properties);
    const bannerText = normalizedEvent === 'Tornado Warning'
        ? getTornadoBannerText(properties)
        : normalizedEvent === 'Severe Thunderstorm Warning'
            ? getSvrBannerText(properties)
            : normalizedEvent === 'Flash Flood Warning'
                ? getFlashFloodBannerText(properties)
                : null;

    const title = bannerText || getAlertDisplayName(normalizedEvent, properties);
    const details = computeAlertDetails(properties);
    const bodyText = String(properties.description || properties.text || 'No bulletin text available.');

    return {
        title,
        headerGradient: `linear-gradient(135deg, ${baseColor} 0%, ${lightenHexColor(baseColor, 22)} 100%)`,
        chips: details,
        bodyText
    };
}

function openAlertModal(properties) {
    const container = document.getElementById('alertModalContainer');
    const titleEl = document.getElementById('alertModalTitle');
    const headerEl = document.getElementById('alertModalHeader');
    const chipsEl = document.getElementById('alertModalChips');
    const bodyEl = document.getElementById('alertModalBody');

    if (!container || !titleEl || !headerEl || !chipsEl || !bodyEl) return;

    const content = buildAlertModalContent(properties);

    titleEl.textContent = content.title;
    headerEl.style.background = content.headerGradient;
    chipsEl.innerHTML = content.chips.map(chip =>
        `<div class="alertModalChip">${chip.label}: ${chip.value}</div>`
    ).join('');
    bodyEl.textContent = content.bodyText;

    container.style.display = 'flex';
}

function closeAlertModal() {
    const container = document.getElementById('alertModalContainer');
    if (container) container.style.display = 'none';
}

window.openAlertModal = openAlertModal;
window.closeAlertModal = closeAlertModal;

function buildAlertPopup(properties) {
    const normalizedEvent = normalizeEvent(properties.event);
    const barColor = alertColors[normalizedEvent] || getAlertColor(normalizedEvent, properties);
    const locationText = getLocationText(properties);

    const bannerText = normalizedEvent === 'Tornado Warning'
        ? getTornadoBannerText(properties)
        : normalizedEvent === 'Severe Thunderstorm Warning'
            ? getSvrBannerText(properties)
            : normalizedEvent === 'Flash Flood Warning'
                ? getFlashFloodBannerText(properties)
                : null;

    const bannerColor = getBannerColor(normalizedEvent);
    const details = computeAlertDetails(properties);
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
        const weatherWiseResponse = await fetch(weatherWiseAPI, {
            cache: 'no-store'
        });

        if (weatherWiseResponse.ok) {
            const weatherWiseData = await weatherWiseResponse.json();
            const filteredFeatures = (weatherWiseData?.features || [])
                .map(normalizeAlertFeature)
                .filter(Boolean);

            if (filteredFeatures.length > 0) {
                addAlertsToMap({
                    type: 'FeatureCollection',
                    features: filteredFeatures
                });
                return;
            }
        }
    } catch (error) {
        console.warn('WeatherWise alerts failed, falling back to NWS:', error);
    }

    try {
        const response = await fetch(nwsAPI, {
            cache: 'no-store'
        });
        
        const data = await response.json();
        const filteredFeatures = (data?.features || [])
            .map(normalizeAlertFeature)
            .filter(Boolean);

        console.log('Alerts data:', data);
        
        // Add alerts to map if available
        if (filteredFeatures.length > 0) {
            addAlertsToMap({
                type: 'FeatureCollection',
                features: filteredFeatures
            });
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

function ensureRadarLayerOrder() {
    if (typeof map.getLayer !== 'function') return;

    const hasAlertsLayer = !!map.getLayer('alerts-layer');
    const hasAlertsOutline = !!map.getLayer('alerts-outline');
    if (!hasAlertsLayer || !hasAlertsOutline) return;

    const radarLayerId = map.getLayer('nexrad-webgl-layer')
        ? 'nexrad-webgl-layer'
        : (map.getLayer('radar-image-layer') ? 'radar-image-layer' : null);

    if (!radarLayerId) return;

    map.moveLayer(radarLayerId, 'alerts-outline');
}

window.ensureRadarLayerOrder = ensureRadarLayerOrder;

function addAlertsLayer(alertData) {

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
            'fill-color': buildAlertColorExpression(),
            'fill-opacity': alertFillOpacity
        }
    }, 'road-minor');

    // Add outline layer for polygons
    map.addLayer({
        'id': 'alerts-outline',
        'type': 'line',
        'source': 'alerts',
        'paint': {
            'line-color': buildAlertColorExpression(),
            'line-width': 3.5,
            'line-opacity': alertLineOpacity
        }
    }, 'road-minor');

    ensureRadarLayerOrder();

    // Handle alert polygon clicks — open the full alert modal
    map.on('click', 'alerts-layer', (e) => {
        if (e.features.length > 0) {
            openAlertModal(e.features[0].properties);
        }
    });

    // Handle alert outline clicks as well
    map.on('click', 'alerts-outline', (e) => {
        if (e.features.length > 0) {
            openAlertModal(e.features[0].properties);
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
setInterval(fetchAlerts, 10000);

// Switching the base map style (Settings panel) wipes every custom layer,
// so re-fetching (which rebuilds the source + layers from scratch) is enough
// to restore alerts afterward.
if (typeof window.registerLayerReinit === 'function') {
    window.registerLayerReinit(fetchAlerts);
}