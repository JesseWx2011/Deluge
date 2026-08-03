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

// Priority rules for choosing the product banner gradient color.
// The array is ordered from highest -> lowest priority.
const alertPriorityRules = [
    {
        name: 'Tornado Emergency',
        color: '#8B00FF', // Violet
        test: (f) => {
            const desc = String((f.properties && f.properties.description) || '').toUpperCase();
            return desc.includes('TORNADO EMERGENCY') || getTornadoWarningCategory(f.properties) === 'tor-e';
        }
    },
    {
        name: 'PDS Tornado Warning',
        color: '#DDA0DD', // Light Purple
        test: (f) => getTornadoWarningCategory(f.properties) === 'pds'
    },
    {
        name: 'Flash Flood Emergency',
        color: '#7A00FF', // Purple
        test: (f) => {
            const desc = String((f.properties && f.properties.description) || '').toUpperCase();
            return (f.properties && f.properties.event === 'Flash Flood Warning' && desc.includes('EMERGENCY')) || desc.includes('FLASH FLOOD EMERGENCY');
        }
    },
    {
        name: 'PDS Severe Thunderstorm Warning',
        color: '#C75A00', // Dark Orange
        test: (f) => {
            const desc = String((f.properties && f.properties.description) || '').toUpperCase();
            return f.properties && f.properties.event === 'Severe Thunderstorm Warning' && desc.includes('PARTICULARLY DANGEROUS SITUATION');
        }
    },
    {
        name: 'Confirmed Tornado Warning',
        color: '#8B0000', // Dark Red
        test: (f) => getTornadoWarningCategory(f.properties) === 'confirmed'
    },
    {
        name: 'Tornado Warning',
        color: '#f0002c', // Red
        test: (f) => f.properties && f.properties.event === 'Tornado Warning'
    },
    {
        name: 'Considerable Severe Thunderstorm Warning',
        color: '#8B4513', // Brown
        test: (f) => f.properties && f.properties.event === 'Severe Thunderstorm Warning' && String(f.properties.severity || '').toLowerCase() === 'considerable'
    },
    {
        name: 'Considerable Flash Flood Warning',
        color: '#006b2c', // Dark Green
        test: (f) => f.properties && f.properties.event === 'Flash Flood Warning' && String(f.properties.severity || '').toLowerCase() === 'considerable'
    },
    {
        name: 'Severe Thunderstorm Warning',
        color: '#e49b0f', // Orange
        test: (f) => f.properties && f.properties.event === 'Severe Thunderstorm Warning'
    },
    {
        name: 'Flash Flood Warning',
        color: '#00c537', // Lime (base)
        test: (f) => f.properties && f.properties.event === 'Flash Flood Warning'
    },
    {
        name: 'Special Weather Statement',
        color: '#566573', // Grey
        test: (f) => f.properties && f.properties.event === 'Special Weather Statement'
    }
];

// Determine the highest-priority alert from an array of normalized features.
function determineTopAlert(features = []) {
    for (const rule of alertPriorityRules) {
        for (const f of features) {
            try {
                if (rule.test(f)) return rule;
            } catch (e) {
                // ignore errors in predicates for malformed features
            }
        }
    }
    return null;
}

// Build and set the CSS gradient variable for the product banner based on active alerts.
function updateProductBannerGradient(features = []) {
    const top = determineTopAlert(features);
    try {
        if (!top) {
            // Restore the original default gradient if no priority alert is active
            const defaultGradient = getComputedStyle(document.documentElement).getPropertyValue('--product-banner-default-border-gradient') || 'linear-gradient(90deg, #64b5f6, #7c9dff, #4fd1ff)';
            document.documentElement.style.setProperty('--product-banner-border-gradient', defaultGradient.trim());
            return;
        }

        const mainColor = top.color;
        const secondary = lightenHexColor(mainColor.trim() || '#7c9dff', 28);
        const gradient = `linear-gradient(90deg, ${mainColor.trim()}, ${secondary})`;
        document.documentElement.style.setProperty('--product-banner-border-gradient', gradient);
    } catch (e) {
        // Not in a browser environment or DOM unavailable
    }
}




// Mutable opacity state, tuned live from the Settings panel (see settings.js)

let alertFillOpacity = 0.45;

let alertLineOpacity = 1;



// Track previous alerts for flash effect

let previousAlertFeatures = new Map();



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

    if (map.getLayer('alerts-outline-white')) {

        map.setPaintProperty('alerts-outline-white', 'line-opacity', alertLineOpacity);

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



    const populationData = props.population || {};

    const homes = typeof populationData === 'object' ? populationData.homes : null;

    const people = typeof populationData === 'object' ? populationData.people : null;



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

            alertSource: props.alertSource || 'WeatherWise',

            issuedTime: props.issuedTime || props.issued_at || props.issued_at_ms || null,

            population: people,

            homes: homes

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

        return '1.00"';

    }

    if (/nickel/.test(lower)) {

        return '0.50"';

    }

    if (/penny/.test(lower)) {

        return '0.25"';

    } if (/small\s*-?\s*hail/.test(lower)) {

        return '< 0.25"'

    } else {

        return 'None'

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

    

    // Check for PDS flag in tags

    const tags = properties.tags || {};

    if (tags.PDS === true) {

        return 'PDS TORNADO WARNING';

    }



    if (damageThreat === 'CATASTROPHIC' || headline.includes('TORNADO EMERGENCY') || description.includes('TORNADO EMERGENCY')) {

        return 'TORNADO EMERGENCY';

    }

    

    // Check for PDS text in description regardless of detection method

    if (description.includes('THIS IS A PARTICULARLY DANGEROUS SITUATION') || headline.includes('PARTICULARLY DANGEROUS SITUATION')) {

        return 'PDS TORNADO WARNING';

    }

    

    if (tornadoDetection === 'OBSERVED' && description.includes('THIS IS A PARTICULARLY DANGEROUS SITUATION')) {

        return 'PDS TORNADO WARNING';

    }

    return null;

}



// Converts raw NWS tornado detection values into the category shown in chips

function getTornadoSourceText(properties) {

    const raw = Array.isArray(properties.tornadoDetection) ? properties.tornadoDetection[0] : properties.tornadoDetection;

    if (!raw) {
        const description = String(properties.description || '').toUpperCase();
        
        if (description.includes('RADAR CONFIRMED')) return 'Radar Confirmed';
        if (description.includes('RADAR INDICATED')) return 'Radar Indicated';
        if (description.includes('EMERGENCY MANAGEMENT')) return 'Emergency Management';
        if (description.includes('LAW ENFORCEMENT')) return 'Law Enforcement';
        if (description.includes('BROADCAST MEDIA')) return 'Broadcast Media';
        if (description.includes('PUBLIC')) return 'Public';
        if (description.includes('TRAINED WEATHER SPOTTERS') || description.includes('SKYWARN')) return 'Trained Weather Spotters';
        
        return null;
    }

    const upper = String(raw).toUpperCase();

    if (upper.includes('OBSERVED')) return 'Radar Confirmed';
    if (upper.includes('RADAR')) return 'Radar Indicated';
    if (upper.includes('EMERGENCY MANAGEMENT')) return 'Emergency Management';
    if (upper.includes('LAW ENFORCEMENT')) return 'Law Enforcement';
    if (upper.includes('BROADCAST')) return 'Broadcast Media';
    if (upper.includes('PUBLIC')) return 'Public';
    if (upper.includes('TRAINED') || upper.includes('SPOTTER')) return 'Trained Weather Spotters';

    return String(raw).replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.substr(1).toLowerCase());

}



// Extracts the Flash Flood source category from description

function extractFlashFloodSourceCategory(description) {

    if (!description) return null;

    const upper = String(description).toUpperCase();

    if (upper.includes('RADAR') && upper.includes('GAUGE')) return 'Radar and Gauges';

    if (upper.includes('EMERGENCY MANAGEMENT')) return 'Emergency Management';

    if (upper.includes('LAW ENFORCEMENT')) return 'Law Enforcement';

    if (upper.includes('RADAR')) return 'Radar';

    if (upper.includes('BROADCAST MEDIA') || upper.includes('LIVESTREAM')) return 'Broadcast Media';

    if (upper.includes('PUBLIC')) return 'Public';

    return null;

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

    console.log("Counties: "+ counties)

    const suffix = areaParts.length > 2 ? '...' : '';

    const countyText = counties.join(', ') + suffix;



    return state ? `(${state}) ${countyText}` : countyText;

}



function getCountiesInvolved(properties) {

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

    const counties = areaParts.map(name => name.replace(/\s*(County|Parish)$/i, '').trim());

    return counties.join(', ');

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

    const flashSourceRaw = extractFlashFloodSource(properties.description);

    const flashSourceCategory = extractFlashFloodSourceCategory(properties.description);

    const rainfallRate = getRainfallRateText(properties);



    const details = [];



    if (normalizedEvent === 'Tornado Warning') {

        if (tornadoSource) details.push({ label: 'Source', value: tornadoSource, isSource: true });

        if (hailText) details.push({ label: 'Hail', value: hailText });

        if (properties.population) details.push({ label: 'Population', value: properties.population.toLocaleString() });

        if (properties.homes) details.push({ label: 'Homes', value: properties.homes.toLocaleString() });

    } else if (normalizedEvent === 'Severe Thunderstorm Warning') {

        if (windText) {

            const windValue = parseNumericValue(windText);

            details.push({ 

                label: 'Wind', 

                value: `${windText}`,

                chart: windValue !== null ? generateWindChart(windValue) : null

            });

        } else if (windThreat) {

            details.push({ label: 'Wind Threat', value: windThreat });

        }

        if (hailText !== null) {

            const hailValue = parseNumericValue(hailText);

            details.push({ 

                label: 'Hail', 

                value: hailText,

                chart: hailValue !== null ? generateHailChart(hailValue) : null

            });

        } else if (hailThreat) {

            details.push({ label: 'Hail Threat', value: hailThreat });

        }

        if (properties.population) details.push({ label: 'Population', value: properties.population.toLocaleString() });

        if (properties.homes) details.push({ label: 'Homes', value: properties.homes.toLocaleString() });

    } else if (normalizedEvent === 'Flash Flood Warning') {

        if (flashSourceCategory) details.push({ label: 'Source', value: flashSourceCategory, isSource: true });

        if (rainfallRate) details.push({ label: 'RR', value: rainfallRate });

        if (properties.population) details.push({ label: 'Population', value: properties.population.toLocaleString() });

        if (properties.homes) details.push({ label: 'Homes', value: properties.homes.toLocaleString() });

    } else if (normalizedEvent === 'Special Weather Statement') {

        if (windText) {

            const windValue = parseNumericValue(windText);

            details.push({ 

                label: 'Wind Gusts', 

                value: `${windText}`,

                chart: windValue !== null ? generateWindChart(windValue) : null

            });

        }

        if (hailText !== null && hailText !== 'None') {

            const hailValue = parseNumericValue(hailText);

            details.push({ 

                label: 'Hail Size', 

                value: hailText,

                chart: hailValue !== null ? generateHailChart(hailValue) : null

            });

        }

    }



    details.push({

        label: 'Expires',

        value: `${hoursDisplay}${minutesLeft} min`

    });



    return details;

}



// Generate wind speed scale chart (58-100+ MPH)

function generateWindChart(windMph) {

    const minWind = 40;

    const maxWind = 100;

    const percentage = Math.min(100, Math.max(0, ((windMph - minWind) / (maxWind - minWind)) * 100));

    

    let color = '#22c55e'; // Green for lower end

    if (percentage >= 60) color = '#eab308'; // Yellow for middle

    if (percentage >= 75) color = '#f97316'; // Orange for high

    if (percentage >= 90) color = '#ef4444'; // Red for extreme

    

    return {

        percentage,

        color,

        label: `${windMph} MPH`

    };

}



// Generate hail size scale chart (0.25"-4"+)

function generateHailChart(hailInches) {

    const minHail = 0.25;

    const maxHail = 4;

    const percentage = Math.min(100, Math.max(0, ((hailInches - minHail) / (maxHail - minHail)) * 100));

    

    let color = '#22c55e'; // Green for smaller hail

    if (percentage >= 40) color = '#eab308'; // Yellow for medium

    if (percentage >= 70) color = '#f97316'; // Orange for large

    if (percentage >= 85) color = '#ef4444'; // Red for very large

    

    return {

        percentage,

        color,

        label: `${hailInches}"`

    };

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



// Source explanation tooltips - maps category to description

const sourceExplanations = {
    'Tornado Warning': {
        'Radar Indicated': 'A Radar Indicated Tornado Warning is the most common type. Meteorologists at the National Weather Service spotted an area of rotation on the radar, typically using tools like Reflectivity and Velocity. This does not verify if a tornado is on the ground.',
        'Radar Confirmed': 'NWS Meteorologists have verified the presence of a tornado via radar. This comes usually by a combination of radar tools including Reflectivity, Velocity, Correlation Coefficient, and sometimes Differential Reflectivity.',
        'Emergency Management': 'Emergency Management patrols have reported a tornado on the ground.',
        'Law Enforcement': 'A sheriff personnel or active duty officer has reported a tornado that is actively on the ground progressing.',
        'Broadcast Media': 'Broadcast Media (e.g. a Live stream or webcam) indicates a tornado on the ground.',
        'Public': 'The public, via Social Media or direct report to the National Weather Service via call or email has reported a tornado on the ground.',
        'Trained Weather Spotters': 'Trained Weather Spotters typically associated with <a href="https://www.weather.gov/skywarn/" target="_blank">SKYWARN</a> have verified the presence of a tornado.'
    },
    'Flash Flood Warning': {
        'Radar': 'NEXRAD Doppler Radar has indicated that heavy rain is falling for a prolonged period over a specific location. Products like Storm Total Accumulation and Reflectivity are the most common products in this case.',
        'Radar and Gauges': 'NEXRAD Radar and Gauges (typically a CoCoRaHS station, PWS, or a USGS River Gauge) indicates heavy rain is falling over a location for a prolonged period of time.',
        'Emergency Management': 'Emergency Management or Law Enforcement has reported that flash flooding is actively occurring in a location.',
        'Public': 'Public reports via Social Media directed to the National Weather Service has indicated flash flooding.',
        'Broadcast Media': 'Broadcast Media (e.g. a Livestream) has indicated flooding is occurring in a warned area at a specific location.'
    }
};



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

    

    let issuedTime = 'N/A';

    if (properties.issuedTime) {

        try {

            const date = new Date(properties.issuedTime);

            issuedTime = date.toLocaleString('en-US', {

                month: 'short',

                day: 'numeric',

                year: 'numeric',

                hour: 'numeric',

                minute: '2-digit',

                second: '2-digit',

                hour12: true

            });

        } catch (e) {

            issuedTime = 'N/A';

        }

    }

    

    const counties = getCountiesInvolved(properties);



    return {

        title,

        headerGradient: `linear-gradient(135deg, ${baseColor} 0%, ${lightenHexColor(baseColor, 22)} 100%)`,

        chips: details,

        bodyText,

        issuedTime,

        counties,

        normalizedEvent

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

    chipsEl.innerHTML = content.chips.map(chip => {

        let chartHtml = '';

        if (chip.chart) {

            chartHtml = `

                    <div class="alertPropertyChart">

                        <div class="alertPropertyChartBar" style="width: ${chip.chart.percentage}%; background: ${chip.chart.color};">

                            <span class="alertPropertyChartLabel">${chip.chart.label}</span>

                        </div>

                    </div>`;

        }

        

        const isSource = chip.isSource === true;

        const sourceHtml = isSource ? 'data-is-source="true"' : '';

        const onClickHandler = isSource ? `onclick="window.showSourceExplanation(event, '${content.normalizedEvent}')"` : '';

        

        return `

                    <div class="alertModalChip" style="display: flex; flex-direction: column; gap: 4px;" ${sourceHtml} ${onClickHandler}>

                        <span class="chipLabel">${chip.label}: ${chip.value}</span>

                        ${chartHtml}

                    </div>`;

    }).join('');

    

    const detailsHtml = [];
    
    if (content.counties) {
        detailsHtml.push(`
            <div class="detailRow">
                <span class="detailLabel">Counties:</span>
                <span class="detailValue">${content.counties}</span>
            </div>
        `);
    }
    
    if (content.issuedTime && content.issuedTime !== 'N/A') {
        detailsHtml.push(`
            <div class="detailRow">
                <span class="detailLabel">Issued:</span>
                <span class="detailValue">${content.issuedTime}</span>
            </div>
        `);
    }
    
    bodyEl.innerHTML = `
        ${detailsHtml.length > 0 ? `<div class="alertModalDetails">${detailsHtml.join('')}</div>` : ''}
        <div class="alertBulletinText">${content.bodyText}</div>
    `;



    container.style.display = 'flex';

}



function closeAlertModal() {

    const container = document.getElementById('alertModalContainer');

    if (container) container.style.display = 'none';

}



window.openAlertModal = openAlertModal;

window.closeAlertModal = closeAlertModal;



// Function to open alert modal from popup click

window.openAlertModalFromPopup = function(alertId) {

    const properties = window.alertPopupData && window.alertPopupData[alertId];

    if (properties) {

        openAlertModal(properties);

    }

};



// Show source explanation tooltip

window.showSourceExplanation = function(event, alertType) {

    event.stopPropagation();

    const chip = event.currentTarget;

    let tooltip = chip.querySelector('.sourceTooltip');

    

    if (tooltip) {

        tooltip.remove();

        return;

    }

    

    const sourceValue = chip.querySelector('.chipLabel').textContent.split(': ')[1].trim();

    const explanations = sourceExplanations[alertType];

    const description = explanations ? explanations[sourceValue] : null;

    

    if (!description) {

        tooltip = document.createElement('div');

        tooltip.className = 'sourceTooltip';

        tooltip.innerHTML = '<div class="sourceExplanationText">Source information not available.</div>';

        chip.appendChild(tooltip);

        return;

    }

    

    tooltip = document.createElement('div');

    tooltip.className = 'sourceTooltip';

    tooltip.innerHTML = `
        <div class="sourceExplanationSection">
            <div class="sourceExplanationTitle">${sourceValue}</div>
            <div class="sourceExplanationText">${description}</div>
        </div>
    `;

    

    chip.appendChild(tooltip);

    

    document.addEventListener('click', function hideTooltip(clickEvent) {

        if (tooltip && !chip.contains(clickEvent.target)) {

            if (tooltip.parentNode) {

                tooltip.remove();

            }

            document.removeEventListener('click', hideTooltip);

        }

    });

};



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

    const detailRows = details.map(detail => {

        let chartHtml = '';

        if (detail.chart) {

            chartHtml = `

                    <div class="alertPropertyChart">

                        <div class="alertPropertyChartBar" style="width: ${detail.chart.percentage}%; background: ${detail.chart.color};">

                            <span class="alertPropertyChartLabel">${detail.chart.label}</span>

                        </div>

                    </div>`;

        }

        return `

                    <div class="alertPopupRow">

                        <span class="alertPopupLabel">${detail.label}:</span>

                        <span class="alertPopupValue">${detail.value}</span>

                    </div>

                    ${chartHtml}`;

    }).join('');



    // Store properties globally for the modal to access

    const alertId = 'alert-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    window.alertPopupData = window.alertPopupData || {};

    window.alertPopupData[alertId] = properties;



    return `

        <div class="alertPopup">

            <div class="alertPopupBar" style="background: ${barColor};"></div>

            <div class="alertPopupBody">

                <div class="alertPopupHeader">

                    <div>

                        <div class="alertPopupTitle">${normalizedEvent}</div>

                        ${locationText ? `<div class="alertPopupLocation">${locationText}</div>` : ''}

                    </div>

                    <div class="alertPopupInfo" onclick="window.openAlertModalFromPopup('${alertId}')"><i class="fa-solid fa-circle-info"></i></div>

                </div>

                ${bannerText ? `<div class="alertPopupBanner" style="background: ${bannerColor};">${bannerText}</div>` : ''}

                <div class="alertPopupDetails">${detailRows}

                </div>

            </div>

        </div>

    `;

}

function formatAlertBannerClock(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '--:-- --';

    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;

    let tzAbbr = 'LT';
    try {
        const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(date);
        const tzPart = parts.find((part) => part.type === 'timeZoneName');
        if (tzPart && tzPart.value) tzAbbr = tzPart.value;
    } catch (e) {
        // ignore Intl limitations
    }

    return `${displayHours}:${minutes} ${ampm} ${tzAbbr}`;
}

function getAlertStateText(properties = {}) {
    const stateList = Array.isArray(properties.states) ? properties.states : [];
    const stateLabels = stateList
        .map((entry) => {
            if (!entry) return null;
            if (typeof entry === 'string') return entry.trim();
            const name = String(entry.name || '').trim();
            if (name) return name;
            const code = String(entry.code || '').trim();
            return code || null;
        })
        .filter(Boolean);

    if (stateLabels.length > 0) {
        return [...new Set(stateLabels)].join(', ');
    }

    const geocode = properties.geocode || {};
    const ugcList = geocode.UGC || geocode.SAME;
    if (Array.isArray(ugcList) && ugcList.length > 0) {
        return [...new Set(ugcList.map((code) => String(code).slice(0, 2).toUpperCase()))].join(', ');
    }

    return null;
}

function setAlertBannerOverride(properties) {
    if (!properties) {
        window.activeAlertBannerOverride = null;
        if (typeof window.refreshProductBanner === 'function') {
            window.refreshProductBanner();
        }
        return;
    }

    const normalizedEvent = normalizeEvent(properties.event);
    const stateText = getAlertStateText(properties);
    const expires = properties.expires ? new Date(properties.expires) : null;
    const subtitle = stateText ? `${normalizedEvent} in ${stateText}` : normalizedEvent;

    window.activeAlertBannerOverride = {
        title: normalizedEvent.toUpperCase(),
        subtitle: subtitle.toUpperCase(),
        clock: formatAlertBannerClock(expires),
        date: 'Expires'
    };

    if (typeof window.refreshProductBanner === 'function') {
        window.refreshProductBanner();
    }
}

window.setAlertBannerOverride = setAlertBannerOverride;
window.clearAlertBannerOverride = () => setAlertBannerOverride(null);

function showAlertPopup(feature, lngLat) {
    const properties = feature && feature.properties ? feature.properties : feature;
    if (!properties) return;

    setAlertBannerOverride(properties);

    const popupHtml = buildAlertPopup(properties);
    const popup = new mapboxgl.Popup({
        closeButton: true,
        className: 'alertMapboxPopup',
        maxWidth: '320px'
    })
        .setLngLat(lngLat)
        .setHTML(popupHtml)
        .addTo(map);

    popup.on('close', () => {
        if (typeof window.clearAlertBannerOverride === 'function') {
            window.clearAlertBannerOverride();
        }
    });
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

    // Compute normalized features and update the product banner gradient
    const normalizedFeatures = (alertData && Array.isArray(alertData.features))
        ? alertData.features.map(normalizeAlertFeature).filter(Boolean)
        : [];
    updateProductBannerGradient(normalizedFeatures);
    // Populate the top-right Alerts menu
    try { renderActiveAlertsMenu(normalizedFeatures); } catch (e) { /* noop when DOM missing */ }

    // Wait for map to load and add layers as before
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

    const hasAlertsOutlineWhite = !!map.getLayer('alerts-outline-white');

    if (!hasAlertsLayer || !hasAlertsOutline || !hasAlertsOutlineWhite) return;



    const radarLayerId = map.getLayer('nexrad-webgl-layer')

        ? 'nexrad-webgl-layer'

        : (map.getLayer('radar-image-layer') ? 'radar-image-layer' : null);



    if (!radarLayerId) return;



    map.moveLayer(radarLayerId, 'alerts-outline');

}



window.ensureRadarLayerOrder = ensureRadarLayerOrder;



function addAlertsLayer(alertData) {

    // Detect updated/new alerts for flash effect

    const newAlertFeatures = new Map();

    const updatedAlertIds = new Set();

    

    alertData.features.forEach(feature => {

        const id = feature.properties.id || feature.id;

        if (id) {

            newAlertFeatures.set(id, feature);

            

            // Check if this alert is new or updated

            const previousFeature = previousAlertFeatures.get(id);

            if (!previousFeature || JSON.stringify(previousFeature) !== JSON.stringify(feature)) {

                updatedAlertIds.add(id);

            }

        }

    });

    

    // Update previous alerts

    previousAlertFeatures = newAlertFeatures;



    if (map.getSource('alerts')) {

        if (map.getLayer('alerts-layer')) {

            map.removeLayer('alerts-layer');

        }

        if (map.getLayer('alerts-outline')) {

            map.removeLayer('alerts-outline');

        }

        if (map.getLayer('alerts-outline-white')) {

            map.removeLayer('alerts-outline-white');

        }

        map.removeSource('alerts');

    }



    // Add alerts source with flash property for updated alerts

    const alertDataWithFlash = {

        ...alertData,

        features: alertData.features.map(feature => {

            const id = feature.properties.id || feature.id;

            return {

                ...feature,

                properties: {

                    ...feature.properties,

                    _flash: updatedAlertIds.has(id) ? 1 : 0

                }

            };

        })

    };

    

    map.addSource('alerts', {

        'type': 'geojson',

        'data': alertDataWithFlash

    });



    // Add alerts layer with color based on event type and flash effect

    map.addLayer({

        'id': 'alerts-layer',

        'type': 'fill',

        'source': 'alerts',

        'paint': {

            'fill-color': [

                'case',

                ['==', ['get', '_flash'], 1],

                '#ffffff',

                buildAlertColorExpression()

            ],

            'fill-opacity': [

                'case',

                ['==', ['get', '_flash'], 1],

                0.8,

                alertFillOpacity

            ]

        }

    }, 'road-minor');



    // Add white accent outline layer (wider, behind colored outline)

    map.addLayer({

        'id': 'alerts-outline-white',

        'type': 'line',

        'source': 'alerts',

        'paint': {

            'line-color': '#ffffff',

            'line-width': 10,

            'line-opacity': alertLineOpacity

        }

    }, 'road-minor');

    // Add colored outline layer for polygons with flash effect

    map.addLayer({

        'id': 'alerts-outline',

        'type': 'line',

        'source': 'alerts',

        'paint': {

            'line-color': buildAlertColorExpression(),

            'line-width': 5,

            'line-opacity': [

                'case',

                ['==', ['get', '_flash'], 1],

                1,

                alertLineOpacity

            ]

        }

    }, 'road-minor');



    ensureRadarLayerOrder();

    

    // Remove flash effect after 1 second by resetting paint properties

    if (updatedAlertIds.size > 0) {

        setTimeout(() => {

            if (map.getLayer('alerts-layer')) {

                map.setPaintProperty('alerts-layer', 'fill-color', buildAlertColorExpression());

                map.setPaintProperty('alerts-layer', 'fill-opacity', alertFillOpacity);

            }

            if (map.getLayer('alerts-outline')) {

                map.setPaintProperty('alerts-outline', 'line-color', buildAlertColorExpression());

                map.setPaintProperty('alerts-outline', 'line-opacity', alertLineOpacity);

            }

            if (map.getLayer('alerts-outline-white')) {

                map.setPaintProperty('alerts-outline-white', 'line-opacity', alertLineOpacity);

            }

        }, 1000);

    }



    // Handle alert polygon clicks — show popup first, click info icon for full modal

    map.on('click', 'alerts-layer', (e) => {

        if (e.features.length > 0) {

            const feature = e.features[0];
            const properties = feature.properties;

            showAlertPopup(feature, e.lngLat);

        }

    });



    // Handle alert outline clicks as well

    map.on('click', 'alerts-outline', (e) => {

        if (e.features.length > 0) {

            // Trigger the same popup as the layer click
            const feature = e.features[0];

            showAlertPopup(feature, e.lngLat);

        }

    });

    map.on('click', 'alerts-outline-white', (e) => {

        if (e.features.length > 0) {

            // Trigger the same popup as the layer click
            const feature = e.features[0];

            showAlertPopup(feature, e.lngLat);

        }

    });

    map.on('mouseenter', 'alerts-outline', () => {

        map.getCanvas().style.cursor = 'pointer';

    });

    map.on('mouseenter', 'alerts-outline-white', () => {

        map.getCanvas().style.cursor = 'pointer';

    });

    map.on('mouseleave', 'alerts-outline', () => {

        map.getCanvas().style.cursor = '';

    });

    map.on('mouseleave', 'alerts-outline-white', () => {

        map.getCanvas().style.cursor = '';

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

setInterval(fetchAlerts, 30000);



// Switching the base map style (Settings panel) wipes every custom layer,

// so re-fetching (which rebuilds the source + layers from scratch) is enough

// to restore alerts afterward.

if (typeof window.registerLayerReinit === 'function') {

    window.registerLayerReinit(fetchAlerts);

}

function getAlertPriorityRank(feature) {
    const rules = Array.isArray(alertPriorityRules) ? alertPriorityRules : [];
    for (let index = 0; index < rules.length; index += 1) {
        const rule = rules[index];
        if (rule && typeof rule.test === 'function') {
            try {
                if (rule.test(feature)) return index;
            } catch (e) {
                // ignore malformed alert entries
            }
        }
    }
    return alertPriorityRules.length;
}

function sortAlertFeaturesByPriority(features = []) {
    if (!Array.isArray(features) || features.length < 2) return features;

    return [...features].sort((a, b) => {
        const aRank = getAlertPriorityRank(a);
        const bRank = getAlertPriorityRank(b);
        if (aRank !== bRank) return aRank - bRank;

        const aTitle = String((a && a.properties && a.properties.event) || '').toLowerCase();
        const bTitle = String((b && b.properties && b.properties.event) || '').toLowerCase();
        return aTitle.localeCompare(bTitle);
    });
}

// Render active alerts into the top-right menu list
function renderActiveAlertsMenu(features = []) {
    const container = document.getElementById('alertsMenuList');
    if (!container) return;

    const orderedFeatures = sortAlertFeaturesByPriority(features || []);
    window.activeAlerts = orderedFeatures;
    if (!orderedFeatures || orderedFeatures.length === 0) {
        container.innerHTML = '<div class="alertsEmpty">No active alerts</div>';
        return;
    }

    container.innerHTML = orderedFeatures.map((f, i) => {
        const ev = normalizeEvent(f.properties.event);
        const title = getAlertDisplayName(ev, f.properties);
        const details = computeAlertDetails(f.properties) || [];
        const summary = details.slice(0, 2).map(d => `${d.label}: ${d.value}`).join(' • ');
        const locText = getLocationText(f.properties) || '';
        const stateMatch = locText.match(/^\(([^)]+)\)/);
        const state = stateMatch ? stateMatch[1] : '';
        return `
            <div class="alertsItem" data-alert-idx="${i}">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                    <div class="alertsItemTitle" style="color: ${getAlertColor(ev, f.properties)}">${title}</div>
                    <div style="font-size:0.78rem; color:rgba(255,255,255,0.8);">${state}</div>
                </div>
                <div class="alertsItemSummary">${summary}</div>
            </div>`;
    }).join('');

    // attach click handlers
    Array.from(container.querySelectorAll('.alertsItem')).forEach(el => {
        el.addEventListener('click', (evnt) => {
            const clicked = evnt.currentTarget || el;
            const idx = Number(clicked.getAttribute('data-alert-idx'));
            const feature = window.activeAlerts && window.activeAlerts[idx];
            if (!feature) return;

            // Try to compute a center; if missing, try to find the same feature in the map source
            let center = getFeatureCenter(feature);
            if (!center) {
                try {
                    const src = (typeof map === 'object' && map && map.getSource) ? map.getSource('alerts') : null;
                    const srcData = src && (src._data || src._options && src._options.data || src.data || src._data);
                    const found = srcData && Array.isArray(srcData.features) && srcData.features.find(f => (f.id || (f.properties && f.properties.id)) === (feature.id || (feature.properties && feature.properties.id)));
                    if (found) center = getFeatureCenter(found);
                } catch (e) {
                    // ignore
                }
            }

            if (center) {
                try {
                    map && map.flyTo && map.flyTo({ center: center, zoom: 9, speed: 0.9 });
                } catch (e) {}
            } else {
                // As a last resort, try to open the alert modal so user can interact
                if (feature.properties) openAlertModal(feature.properties);
            }

            // close menu after action
            const menu = document.getElementById('layersMenuDropdown');
            if (menu) menu.classList.remove('open');
        });
    });
}

// Wire up hamburger/menu interactions on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('layersHamburger');
    const menu = document.getElementById('layersMenuDropdown');
    if (btn && menu) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('open');
        });

        // close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && !btn.contains(e.target)) {
                menu.classList.remove('open');
            }
        });
    }
});

// Helper: compute a simple center for a GeoJSON feature (point or polygon)
function getFeatureCenter(feature) {
    if (!feature || !feature.geometry) return null;
    const geom = feature.geometry;
    if (geom.type === 'Point') {
        return geom.coordinates; // [lon, lat]
    }
    // For Polygon / MultiPolygon / LineString: flatten coordinates and average
    const coords = [];
    const gather = (arr) => {
        if (!Array.isArray(arr)) return;
        if (typeof arr[0] === 'number' && arr.length >= 2) {
            coords.push(arr);
            return;
        }
        arr.forEach(gather);
    };
    gather(geom.coordinates);
    if (coords.length === 0) return null;
    let sumX = 0, sumY = 0;
    coords.forEach(c => { sumX += c[0]; sumY += c[1]; });
    return [sumX / coords.length, sumY / coords.length];
}

// Fly the map to a feature's approximate center
function flyToFeature(feature) {
    if (typeof map !== 'object' || !map || !map.flyTo) return;
    const center = getFeatureCenter(feature);
    if (!center) return;
    try {
        map.flyTo({ center: center, zoom: 9, speed: 0.9 });
    } catch (e) {
        // ignore
    }
}