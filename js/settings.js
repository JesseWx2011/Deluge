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
const outlookBorderWidthRange = document.getElementById("outlookBorderWidthRange");
const outlookBorderWidthValue = document.getElementById("outlookBorderWidthValue");
const outlookBorderOpacityRange = document.getElementById("outlookBorderOpacityRange");
const outlookBorderOpacityValue = document.getElementById("outlookBorderOpacityValue");
const alertOpacityRange = document.getElementById("alertOpacityRange");
const alertOpacityValue = document.getElementById("alertOpacityValue");

window.radarOpacity = 1;

// ----- Map Styling -----
if (mapStyleSelect) {
    mapStyleSelect.addEventListener("change", (event) => {
        const styleUrl = event.target.value;

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
    radarOpacityRange.addEventListener("input", (event) => applyRadarOpacity(event.target.value));
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
    outlookBorderWidthRange.addEventListener("input", (event) => applyOutlookBorderWidth(event.target.value));
}

if (outlookBorderOpacityRange) {
    outlookBorderOpacityRange.addEventListener("input", (event) => applyOutlookBorderOpacity(event.target.value));
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
    if (input) input.addEventListener("input", pushAlertSettings);
});

if (alertOpacityRange) {
    alertOpacityRange.addEventListener("input", pushAlertSettings);
}