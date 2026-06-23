const nwsAPI = "https://api.weather.gov/alerts/active?code=TOR,SVR,SVA,TOA,FFW,SPS";
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

// Fetch and display alerts
async function fetchAlerts() {
    try {
        const response = await fetch(nwsAPI);
        const data = await response.json();
        
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
            const feature = e.features[0];
            const properties = feature.properties;
            const alertName = getAlertDisplayName(properties.event, properties);
            const isTornadoEmergency = properties.event === 'Tornado Warning' && 
                (properties.description || '').toUpperCase().includes('TORNADO EMERGENCY');

            // Create popup content
                        const popupHTML = `
                <div style="font-family: Arial, sans-serif; max-width: 300px;">
                    <div style="background: ${getAlertColor(properties.event, properties)}; color: white; padding: 8px; border-radius: 4px 4px 0 0; font-weight: bold; margin: -12px -12px 8px -12px;">
                        ${alertName}
                    </div>
                    <div style="padding: 8px;">
                        <p style="margin: 0 0 8px 0; font-weight: bold; font-size: 14px; ${isTornadoEmergency ? 'font-style: italic;' : ''}">
                        </p>
                        <p style="margin: 0 0 8px 0; font-size: 12px; color: #555;">
                            <strong>Issued:</strong> ${new Date(properties.effective).toLocaleString("en-US", {hour: "numeric", minute: "numeric", month: "short", day: "numeric"})}<br>
                            <strong>Expires:</strong> ${new Date(properties.expires).toLocaleString("en-US", {hour: "numeric", minute: "numeric", month: "short", day: "numeric"})} (${new Date(properties.expires).toLocaleString("en-US", {hour: "numeric", minute: "numeric", month: "short", day: "numeric"})} (${Math.round((new Date(properties.expires).getTime() - Date.now()) / 60000)} min from now.)
                        </p>
                        <p style="margin: 0; font-size: 12px; line-height: 1.4; color: #333;">
                            ${properties.instruction || (properties.description ? properties.description.substring(0, 150) + '...' : 'No details')}
                        </p>
                    </div>
                </div>
            `;

            // Create and show popup
            new mapboxgl.Popup({ offset: 25 })
                .setLngLat(e.lngLat)
                .setHTML(popupHTML)
                .addTo(map);
        }
    });

    // Handle alert outline clicks as well
    map.on('click', 'alerts-outline', (e) => {
        if (e.features.length > 0) {
            const feature = e.features[0];
            const properties = feature.properties;
            const alertName = getAlertDisplayName(properties.event, properties);
            const isTornadoEmergency = properties.event === 'Tornado Warning' && 
                (properties.description || '').toUpperCase().includes('TORNADO EMERGENCY');

            // Create popup content
            const popupHTML = `
                <div style="font-family: Arial, sans-serif; max-width: 300px;">
                    <div style="background: ${getAlertColor(properties.event, properties)}; color: white; padding: 8px; border-radius: 4px 4px 0 0; font-weight: bold; margin: -12px -12px 8px -12px;">
                        ${alertName}
                    </div>
                    <div style="padding: 8px;">
                        <p style="margin: 0 0 8px 0; font-weight: bold; font-size: 14px; ${isTornadoEmergency ? 'font-style: italic;' : ''}">
                            ${properties.headline || 'No headline'}
                        </p>
                        <p style="margin: 0 0 8px 0; font-size: 12px; color: #555;">
                            <strong>Effective:</strong> ${new Date(properties.effective).toLocaleString()}<br>
                            <strong>Expires:</strong> ${new Date(properties.expires).toLocaleString()}
                        </p>
                        <p style="margin: 0; font-size: 12px; line-height: 1.4; color: #333;">
                            ${properties.instruction || (properties.description ? properties.description.substring(0, 150) + '...' : 'No details')}
                        </p>
                    </div>
                </div>
            `;

            // Create and show popup
            new mapboxgl.Popup({ offset: 25 })
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
