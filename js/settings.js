// User Settings for the application.
/*  --- MAPS ---

Styles

Default: mapbox://styles/hastytube/cman7qzdk00al01sddqg54u7d
Satellite: mapbox://styles/mapbox/satellite-streets-v12
Light: mapbox://styles/mapbox/light-v11
Dark: mapbox://styles/mapbox/dark-v11
*/

const mapStyleSelect = document.getElementById("mapStyleSelect");
const radarOpacityRange = document.getElementById("radarOpacityRange");
const radarOpacityValue = document.getElementById("radarOpacityValue");
const colorTableReflectivity = document.getElementById("colorTableReflectivity");
const colorTableVelocity = document.getElementById("colorTableVelocity");
const colorTableCC = document.getElementById("colorTableCC");
const colorTableDF = document.getElementById("colorTableDF");
const colorTableDTA = document.getElementById("colorTableDTA");
const outlookBorderWidthRange = document.getElementById("outlookBorderWidthRange");
const outlookBorderWidthValue = document.getElementById("outlookBorderWidthValue");
const outlookBorderOpacityRange = document.getElementById("outlookBorderOpacityRange");
const outlookBorderOpacityValue = document.getElementById("outlookBorderOpacityValue");
const alertOpacityRange = document.getElementById("alertOpacityRange");
const alertOpacityValue = document.getElementById("alertOpacityValue");

window.radarOpacity = 1;
window.selectedColorTable = 'Default';

// Per-product color table selections
window.colorTables = {
    reflectivity: 'Radarscope',
    velocity: 'Default',
    cc: 'Default',
    df: 'Default',
    dta: 'Default'
};

// Product-specific value ranges for colorbar ticks
const productValueRanges = {
    'N0B': { min: -20, max: 90, unit: 'dBZ' },
    'NAB': { min: -20, max: 90, unit: 'dBZ' },
    'N1B': { min: -20, max: 90, unit: 'dBZ' },
    'NBB': { min: -20, max: 90, unit: 'dBZ' },
    'N2B': { min: -20, max: 90, unit: 'dBZ' },
    'N3B': { min: -20, max: 90, unit: 'dBZ' },
    'N0G': { min: -140, max: 140, unit: 'kts' },
    'NAG': { min: -140, max: 140, unit: 'kts' },
    'N1G': { min: -140, max: 140, unit: 'kts' },
    'NBU': { min: -140, max: 140, unit: 'kts' },
    'N2U': { min: -140, max: 140, unit: 'kts' },
    'N3U': { min: -140, max: 140, unit: 'kts' },
    'N0C': { min: 0, max: 100, unit: '%' },
    'N0K': { min: -5, max: 10, unit: 'dB' },
    'N0H': { min: 0, max: 10, unit: 'HC' },
    'SW0': { min: 0, max: 63, unit: 'm/s' },
    'EEH': { min: 0, max: 70000, unit: 'ft' },
    'TZ0': { min: -20, max: 75, unit: 'dBZ' },
    'TZ1': { min: -20, max: 75, unit: 'dBZ' },
    'TZ2': { min: -20, max: 75, unit: 'dBZ' },
    'TZL': { min: -20, max: 75, unit: 'dBZ' },
    'TV0': { min: -50, max: 50, unit: 'm/s' },
    'TV1': { min: -50, max: 50, unit: 'm/s' },
    'TV2': { min: -50, max: 50, unit: 'm/s' }
};

// Color table gradients for different products
const colorTableGradients = {
    reflectivity: 'linear-gradient(to top, #969153, #cacdaa, #919ab4, #415b9e, #21c034, #0da212, #ffe200, #ff0000, #ffffff, #b200ff, #05ecf0, #012020)',
    velocity: 'linear-gradient(to top, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
    correlation: 'linear-gradient(to top, #000000, #0000ff, #00ff00, #ffff00, #ff0000)',
    differential: 'linear-gradient(to top, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000)',
    hydrometer: 'linear-gradient(to top, #000000, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000, #ffff00)',
    spectrum: 'linear-gradient(to top, #000000, #0000ff, #00ff00, #ffff00, #ff0000)',
    echoTops: 'linear-gradient(to top, #000000, #0000ff, #00ff00, #ffff00, #ff0000, #ffffff)',
    default: 'linear-gradient(to top, #969153, #cacdaa, #919ab4, #415b9e, #21c034, #0da212, #ffe200, #ff0000, #ffffff, #b200ff, #05ecf0, #012020)'
};

// Tilt configurations for products that support multiple tilts
const tiltConfigs = {
    'N0B': [
        { id: 'N0B', name: 'Tilt 1' },
        { id: 'NAB', name: 'Tilt 2' },
        { id: 'N1B', name: 'Tilt 3' },
        { id: 'NBB', name: 'Tilt 4' },
        { id: 'N2B', name: 'Tilt 5' },
        { id: 'N3B', name: 'Tilt 6' }
    ],
    'N0G': [
        { id: 'N0G', name: 'Tilt 1' },
        { id: 'NAG', name: 'Tilt 2' },
        { id: 'N1G', name: 'Tilt 3' },
        { id: 'NBU', name: 'Tilt 4' },
        { id: 'N2U', name: 'Tilt 5' },
        { id: 'N3U', name: 'Tilt 6' }
    ]
};

// Update colorbar based on selected product
async function updateColorbar(productId) {
    const colortable = document.getElementById('colortable');
    const ticks = document.getElementById('ticks');
    const tooltip = document.getElementById('colortableTooltip');
    
    if (!colortable || !ticks) return;
    
    const range = productValueRanges[productId] || { min: -20, max: 75, unit: 'dBZ' };
    
    // Try to load the actual color table for this product
    let gradient = colorTableGradients.default;
    
    try {
        // Map products to their colortable subdirectories
        const productToSubdir = {
            'N0B': 'Reflectivity', 'NAB': 'Reflectivity', 'N1B': 'Reflectivity', 'NBB': 'Reflectivity', 'N2B': 'Reflectivity', 'N3B': 'Reflectivity',
            'TZ0': 'Reflectivity', 'TZ1': 'Reflectivity', 'TZ2': 'Reflectivity', 'TZL': 'Reflectivity',
            'N0G': 'Velocity', 'NAG': 'Velocity', 'N1G': 'Velocity', 'NBU': 'Velocity', 'N2U': 'Velocity', 'N3U': 'Velocity',
            'TV0': 'Velocity', 'TV1': 'Velocity', 'TV2': 'Velocity',
            'N0C': 'CC',
            'N0K': 'DF',
            'DTA': 'DTA'
        };
        
        const subdir = productToSubdir[productId] || 'Reflectivity';
        
        // Get color table for this specific product type
        let selectedTable = 'IEM';
        if (typeof window.getColorTableForProduct === 'function') {
            selectedTable = window.getColorTableForProduct(productId);
        } else if (window.selectedColorTable) {
            selectedTable = window.selectedColorTable;
        }
        
        // Map color table names to file extensions
        const tableExtensions = {
            'IEM': '.json',
            'Base': '.pal',
            'Jesse': '.pal',
            'Radarscope': '.pal',
            'Default': '.pal',
            'DefaultI': '.pal',
            'VelocityI': '.pal',
        };
        
        const extension = tableExtensions[selectedTable] || '.json';
        const filename = selectedTable + extension;
        
        // Cache color table gradients to avoid repeated fetches
        const cacheKey = `${subdir}_${filename}`;
        if (window.colorTableGradientCache && window.colorTableGradientCache[cacheKey]) {
            gradient = window.colorTableGradientCache[cacheKey];
        } else {
            const response = await fetch(`../json/colortables/${subdir}/${filename}`);
            if (response.ok) {
                const text = await response.text();
                let stops = [];
                
                if (extension === '.json') {
                    const json = JSON.parse(text);
                    if (Array.isArray(json)) {
                        if (Array.isArray(json[0])) {
                            stops = json.map(([value, color]) => [value, normalizeColor(color)]);
                        } else if (json[0] && typeof json[0] === 'object') {
                            stops = json.map((entry) => [entry.value, normalizeColor(entry.color)]);
                        }
                    } else if (json && typeof json === 'object') {
                        stops = Object.entries(json).map(([value, color]) => [Number(value), normalizeColor(color)]);
                    }
                } else if (extension === '.pal') {
                    const lines = text.split('\n');
                    for (const line of lines) {
                        const match = line.match(/^(?:color(?:\d+)?|SolidColor):\s*(-?\d+(?:\.\d+)?)\s+(\d+)\s+(\d+)\s+(\d+)/);
                        if (match) {
                            const value = parseFloat(match[1]);
                            const r = parseInt(match[2], 10);
                            const g = parseInt(match[3], 10);
                            const b = parseInt(match[4], 10);
                            stops.push([value, [r, g, b, 255]]);
                        }
                    }
                }
                
                // Convert stops to CSS gradient
                if (stops.length > 0) {
                    // Sort stops by value
                    stops.sort((a, b) => a[0] - b[0]);
                    
                    // Normalize values to 0-100% range
                    const minValue = Math.min(...stops.map(s => s[0]));
                    const maxValue = Math.max(...stops.map(s => s[0]));
                    const valueRange = maxValue - minValue || 1;
                    
                    const gradientStops = stops.map(([value, color]) => {
                        const percentage = ((value - minValue) / valueRange) * 100;
                        const [r, g, b, a] = color;
                        return `rgba(${r}, ${g}, ${b}, ${a / 255}) ${percentage}%`;
                    }).join(', ');
                    
                    gradient = `linear-gradient(to top, ${gradientStops})`;
                    
                    // Cache the gradient
                    if (!window.colorTableGradientCache) {
                        window.colorTableGradientCache = {};
                    }
                    window.colorTableGradientCache[cacheKey] = gradient;
                }
            }
        }
    } catch (error) {
        console.warn('Failed to load color table for gradient:', error);
        // Fall back to default gradient logic
        if (productId.includes('G') || productId.includes('U') || productId.includes('V')) {
            gradient = colorTableGradients.velocity;
        } else if (productId.includes('B') || productId.includes('Z')) {
            gradient = colorTableGradients.reflectivity;
        } else if (productId.includes('C')) {
            gradient = colorTableGradients.correlation;
        } else if (productId.includes('K')) {
            gradient = colorTableGradients.differential;
        } else if (productId.includes('H')) {
            gradient = colorTableGradients.hydrometer;
        } else if (productId.includes('SW')) {
            gradient = colorTableGradients.spectrum;
        } else if (productId.includes('EE')) {
            gradient = colorTableGradients.echoTops;
        }
    }
    
    colortable.style.backgroundImage = gradient;
    
    // Calculate proper tick increments - always count by 10
    const rangeSpan = range.max - range.min;
    const tickCount = 6;
    
    // Always use increments of 10
    const niceStep = 10;
    
    // Calculate the first tick that aligns with 10
    const firstTick = Math.ceil(range.min / 10) * 10;
    
    // Generate ticks
    let tickHtml = '';
    let currentTick = firstTick;
    let tickIndex = 0;
    
    while (currentTick <= range.max && tickIndex < tickCount) {
        tickHtml += `<ul>${Math.round(currentTick)}</ul>`;
        currentTick += niceStep;
        tickIndex++;
    }
    
    // If we didn't get enough ticks, fill in from the end
    if (tickIndex < tickCount) {
        tickHtml = '';
        for (let i = 0; i < tickCount; i++) {
            const value = range.min + (rangeSpan * i / (tickCount - 1));
            tickHtml += `<ul>${Math.round(value)}</ul>`;
        }
    }
    
    ticks.innerHTML = tickHtml;
    
    // Store current range for hover calculations
    window.currentColorbarRange = range;
}

// Helper function to normalize color (from nexrad.js)
function normalizeColor(color) {
    if (Array.isArray(color)) {
        // Already [r, g, b, a]
        return color;
    }
    if (typeof color === 'string') {
        // Hex color like "#ff0000" or "#ff0000ff"
        const hex = color.replace('#', '');
        if (hex.length === 6) {
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);
            return [r, g, b, 255];
        } else if (hex.length === 8) {
            const r = parseInt(hex.substr(0, 2), 16);
            const g = parseInt(hex.substr(2, 2), 16);
            const b = parseInt(hex.substr(4, 2), 16);
            const a = parseInt(hex.substr(6, 2), 16);
            return [r, g, b, a];
        }
    }
    return [255, 255, 255, 255]; // Default white
}

// Initialize colorbar hover functionality
function initColorbarHover() {
    const colortable = document.getElementById('colortable');
    const tooltip = document.getElementById('colortableTooltip');
    
    if (!colortable || !tooltip) return;
    
    colortable.addEventListener('mousemove', (e) => {
        const rect = colortable.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const percentage = 1 - (y / rect.height); // Invert because gradient goes bottom to top
        
        const range = window.currentColorbarRange || { min: -20, max: 75, unit: 'dBZ' };
        const value = range.min + (percentage * (range.max - range.min));
        
        tooltip.textContent = `${value.toFixed(1)} ${range.unit}`;
        tooltip.style.top = `${y}px`;
    });
    
    colortable.addEventListener('mouseleave', () => {
        tooltip.textContent = '--';
    });
}

// Initialize colorbar when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initColorbarHover();
});

window.updateColorbar = updateColorbar;
window.tiltConfigs = tiltConfigs;

// ----- Settings Persistence -----

function saveSettings() {
    const settings = {
        mapStyle: mapStyleSelect ? mapStyleSelect.value : 'mapbox://styles/hastytube/cman7qzdk00al01sddqg54u7d',
        radarOpacity: radarOpacityRange ? radarOpacityRange.value : 100,
        colorTable: window.selectedColorTable || 'IEM',
        colorTables: window.colorTables || { reflectivity: 'IEM', velocity: 'IEM', cc: 'Default', df: 'Default' },
        outlookBorderWidth: outlookBorderWidthRange ? outlookBorderWidthRange.value : 2,
        outlookBorderOpacity: outlookBorderOpacityRange ? outlookBorderOpacityRange.value : 100,
        alertOpacity: alertOpacityRange ? alertOpacityRange.value : 100,
        alertColors: {}
    };
    
    // Save alert colors
    Object.entries(alertColorInputIds).forEach(([id, eventName]) => {
        const input = document.getElementById(id);
        if (input) settings.alertColors[eventName] = input.value;
    });
    
    localStorage.setItem('delugeSettings', JSON.stringify(settings));
}

function loadSettings() {
    const saved = localStorage.getItem('delugeSettings');
    if (!saved) return;
    
    try {
        const settings = JSON.parse(saved);
        
        // Load map style
        if (mapStyleSelect && settings.mapStyle) {
            mapStyleSelect.value = settings.mapStyle;
        }
        
        // Load radar opacity
        if (radarOpacityRange && settings.radarOpacity) {
            radarOpacityRange.value = settings.radarOpacity;
            applyRadarOpacity(settings.radarOpacity);
        }
        
        // Load color tables (per-product)
        if (settings.colorTables) {
            window.colorTables = settings.colorTables;
            
            if (colorTableReflectivity && settings.colorTables.reflectivity) {
                colorTableReflectivity.value = settings.colorTables.reflectivity;
            }
            if (colorTableVelocity && settings.colorTables.velocity) {
                colorTableVelocity.value = settings.colorTables.velocity;
            }
            if (colorTableCC && settings.colorTables.cc) {
                colorTableCC.value = settings.colorTables.cc;
            }
            if (colorTableDF && settings.colorTables.df) {
                colorTableDF.value = settings.colorTables.df;
            }
            if (colorTableDTA && settings.colorTables.dta) {
                colorTableDTA.value = settings.colorTables.dta;
            }
        }
        
        // Load legacy color table for backward compatibility
        if (settings.colorTable) {
            window.selectedColorTable = settings.colorTable;
        }
        
        // Load outlook border width
        if (outlookBorderWidthRange && settings.outlookBorderWidth) {
            outlookBorderWidthRange.value = settings.outlookBorderWidth;
            applyOutlookBorderWidth(settings.outlookBorderWidth);
        }
        
        // Load outlook border opacity
        if (outlookBorderOpacityRange && settings.outlookBorderOpacity) {
            outlookBorderOpacityRange.value = settings.outlookBorderOpacity;
            applyOutlookBorderOpacity(settings.outlookBorderOpacity);
        }
        
        // Load alert opacity
        if (alertOpacityRange && settings.alertOpacity) {
            alertOpacityRange.value = settings.alertOpacity;
        }
        
        // Load alert colors
        if (settings.alertColors) {
            Object.entries(alertColorInputIds).forEach(([id, eventName]) => {
                const input = document.getElementById(id);
                if (input && settings.alertColors[eventName]) {
                    input.value = settings.alertColors[eventName];
                }
            });
            pushAlertSettings();
        }
    } catch (error) {
        console.warn('Failed to load settings:', error);
    }
}

// Load settings on page load
document.addEventListener('DOMContentLoaded', loadSettings);

// ----- Tab Navigation -----
function initSettingsTabs() {
    const tabs = document.querySelectorAll('.settingsTab');
    const tabContents = document.querySelectorAll('.settingsTabContent');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            
            // Remove active class from all tabs and contents
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked tab and corresponding content
            tab.classList.add('active');
            document.getElementById(`tab-${targetTab}`).classList.add('active');
        });
    });
}

initSettingsTabs();

// ----- Map Styling -----
if (mapStyleSelect) {
    mapStyleSelect.addEventListener("change", (event) => {
        const styleUrl = event.target.value;
        saveSettings();

        map.once("style.load", () => {
            (window.layerReinitializers || []).forEach((reinit) => {
                try {
                    reinit();
                } catch (error) {
                    console.warn("Layer reinitializer failed:", error);
                }
            });

            applyRadarOpacity(radarOpacityRange ? radarOpacityRange.value : 100);
            applyOutlookBorderWidth(outlookBorderWidthRange ? outlookBorderWidthRange.value : 2);
            applyOutlookBorderOpacity(outlookBorderOpacityRange ? outlookBorderOpacityRange.value : 100);
            pushAlertSettings();

            if (typeof currentTrimmedId !== "undefined" && currentTrimmedId && typeof loadRadarFrame === "function") {
                const index = timelineSlider ? Number(timelineSlider.value) : (TIMELINE_DATA.length - 1);
                const frame = TIMELINE_DATA[index];
                loadRadarFrame(frame ? frame.apiValue : undefined);
            }
        });

        map.setStyle(styleUrl);
    });
}

// ----- Radar Opacity -----
function applyRadarOpacity(percent) {
    const value = Math.max(0, Math.min(100, Number(percent))) / 100;
    window.radarOpacity = value;
    if (radarOpacityValue) radarOpacityValue.textContent = `${Math.round(value * 100)}%`;
    if (map.getLayer("radar-image-layer")) {
        map.setPaintProperty("radar-image-layer", "raster-opacity", value);
    }
}

if (radarOpacityRange) {
    radarOpacityRange.addEventListener("input", (event) => {
        applyRadarOpacity(event.target.value);
        saveSettings();
    });
}

// ----- Color Table Selection -----
function getColorTableForProduct(product) {
    const productType = getProductType(product);
    return window.colorTables[productType] || 'IEM';
}

function getProductType(product) {
    // Map products to their type categories
    if (['N0B', 'TZ0', 'TZ1', 'TZ2', 'TZL'].includes(product)) return 'reflectivity';
    if (['N0G', 'TV0', 'TV1', 'TV2'].includes(product)) return 'velocity';
    if (product === 'N0C') return 'cc';
    if (product === 'N0K') return 'df';
    if (product === 'DTA') return 'dta';
    return 'reflectivity'; // Default
}

if (colorTableReflectivity) {
    colorTableReflectivity.addEventListener("change", (event) => {
        window.colorTables.reflectivity = event.target.value;
        window.selectedColorTable = event.target.value; // For backward compatibility
        saveSettings();
        // Reload radar with new color table if a radar site is selected
        if (typeof currentTrimmedId !== "undefined" && currentTrimmedId && typeof loadRadarFrame === "function") {
            loadRadarFrame('0');
        }
    });
}

if (colorTableVelocity) {
    colorTableVelocity.addEventListener("change", (event) => {
        window.colorTables.velocity = event.target.value;
        saveSettings();
        // Reload radar with new color table if a radar site is selected
        if (typeof currentTrimmedId !== "undefined" && currentTrimmedId && typeof loadRadarFrame === "function") {
            loadRadarFrame('0');
        }
    });
}

if (colorTableCC) {
    colorTableCC.addEventListener("change", (event) => {
        window.colorTables.cc = event.target.value;
        saveSettings();
        // Reload radar with new color table if a radar site is selected
        if (typeof currentTrimmedId !== "undefined" && currentTrimmedId && typeof loadRadarFrame === "function") {
            loadRadarFrame('0');
        }
    });
}

if (colorTableDF) {
    colorTableDF.addEventListener("change", (event) => {
        window.colorTables.df = event.target.value;
        saveSettings();
        // Reload radar with new color table if a radar site is selected
        if (typeof currentTrimmedId !== "undefined" && currentTrimmedId && typeof loadRadarFrame === "function") {
            loadRadarFrame('0');
        }
    });
}

if (colorTableDTA) {
    colorTableDTA.addEventListener("change", (event) => {
        window.colorTables.dta = event.target.value;
        saveSettings();
        // Reload radar with new color table if a radar site is selected
        if (typeof currentTrimmedId !== "undefined" && currentTrimmedId && typeof loadRadarFrame === "function") {
            loadRadarFrame('0');
        }
    });
}

// ----- Outlook Border Thickness / Opacity -----
function applyOutlookBorderWidth(px) {
    const value = Number(px);
    if (outlookBorderWidthValue) outlookBorderWidthValue.textContent = `${value}px`;
    if (map.getLayer("outlook-outline-layer")) {
        map.setPaintProperty("outlook-outline-layer", "line-width", value);
    }
}

function applyOutlookBorderOpacity(percent) {
    const value = Math.max(0, Math.min(100, Number(percent))) / 100;
    if (outlookBorderOpacityValue) outlookBorderOpacityValue.textContent = `${Math.round(value * 100)}%`;
    if (map.getLayer("outlook-outline-layer")) {
        // Overrides the per-feature stroke-opacity expression with a single,
        // user-controlled value.
        map.setPaintProperty("outlook-outline-layer", "line-opacity", value);
    }
}

if (outlookBorderWidthRange) {
    outlookBorderWidthRange.addEventListener("input", (event) => {
        applyOutlookBorderWidth(event.target.value);
        saveSettings();
    });
}

if (outlookBorderOpacityRange) {
    outlookBorderOpacityRange.addEventListener("input", (event) => {
        applyOutlookBorderOpacity(event.target.value);
        saveSettings();
    });
}

// ----- Alert Colors and Opacity -----
const alertColorInputIds = {
    "alertColor-tor": "Tornado Warning",
    "alertColor-svr": "Severe Thunderstorm Warning",
    "alertColor-ffw": "Flash Flood Warning",
    "alertColor-tow": "Tornado Watch",
    "alertColor-svw": "Severe Thunderstorm Watch",
    "alertColor-sws": "Special Weather Statement"
};

function pushAlertSettings() {
    if (typeof window.applyAlertColorSettings !== "function") return;

    const colors = {};
    Object.entries(alertColorInputIds).forEach(([id, eventName]) => {
        const input = document.getElementById(id);
        if (input) colors[eventName] = input.value;
    });

    const opacityPercent = alertOpacityRange ? Number(alertOpacityRange.value) : 100;
    if (alertOpacityValue) alertOpacityValue.textContent = `${opacityPercent}%`;

    window.applyAlertColorSettings(colors, opacityPercent);
}

Object.keys(alertColorInputIds).forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.addEventListener("input", () => {
        pushAlertSettings();
        saveSettings();
    });
});

if (alertOpacityRange) {
    alertOpacityRange.addEventListener("input", () => {
        pushAlertSettings();
        saveSettings();
    });
}