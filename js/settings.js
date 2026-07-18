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
    velocity: 'IEM',
    cc: 'Default',
    df: 'Default',
    dta: 'Default'
};

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