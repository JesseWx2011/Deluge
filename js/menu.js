// Top-right settings menu + top-left layers dropdown (camera overlay / alerts / storm tracks toggles)

const settingsButton = document.getElementById("settingsButton");
const settingsModalContainer = document.getElementById("settingsModalContainer");

const layersButton = document.getElementById("layersButton");
const layersDropdown = document.getElementById("layersDropdown");

let camerasVisible = true;
let alertsVisible = true;
let stormTracksVisible = true;

function openSettingsModal() {
    if (settingsModalContainer) {
        settingsModalContainer.style.display = "flex";
    }
}

function closeSettingsModal() {
    if (settingsModalContainer) {
        settingsModalContainer.style.display = "none";
    }
}

window.closeSettingsModal = closeSettingsModal;

function toggleLayersDropdown() {
    layersDropdown.classList.toggle("open");
}

function closeMenusOnOutsideClick(event) {
    if (layersDropdown && layersButton &&
        !layersDropdown.contains(event.target) && !layersButton.contains(event.target)) {
        layersDropdown.classList.remove("open");
    }
}

document.addEventListener("click", closeMenusOnOutsideClick);

if (settingsButton) {
    settingsButton.addEventListener("click", (e) => {
        e.stopPropagation();
        openSettingsModal();
    });
}

if (layersButton) {
    layersButton.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleLayersDropdown();
    });
}

// Cameras toggle
function toggleCameras() {
    camerasVisible = !camerasVisible;

    const toggle = document.getElementById("camerasToggle");
    if (toggle) toggle.classList.toggle("active", camerasVisible);

    if (map.getLayer("isuCamsLayer")) {
        map.setLayoutProperty("isuCamsLayer", "visibility", camerasVisible ? "visible" : "none");
    }
}

// Alerts toggle
function toggleAlertsLayer() {
    alertsVisible = !alertsVisible;

    const toggle = document.getElementById("alertsToggle");
    if (toggle) toggle.classList.toggle("active", alertsVisible);

    ["alerts-layer", "alerts-outline"].forEach(layerId => {
        if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, "visibility", alertsVisible ? "visible" : "none");
        }
    });
}

function toggleStormTracksLayer() {
    stormTracksVisible = !stormTracksVisible;

    const toggle = document.getElementById("stormTracksToggle");
    if (toggle) toggle.classList.toggle("active", stormTracksVisible);

    ["storm-track-lines-layer", "storm-track-ticks-layer", "storm-track-points-layer"].forEach(layerId => {
        if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, "visibility", stormTracksVisible ? "visible" : "none");
        }
    });
}

function menuClicks() {
    const camerasToggle = document.getElementById("camerasToggle");
    const alertsToggle = document.getElementById("alertsToggle");
    const stormTracksToggle = document.getElementById("stormTracksToggle");

    if (camerasToggle) {
        camerasToggle.classList.add("active");
        camerasToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleCameras();
        });
    }

    if (alertsToggle) {
        alertsToggle.classList.add("active");
        alertsToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleAlertsLayer();
        });
    }

    if (stormTracksToggle) {
        stormTracksToggle.classList.add("active");
        stormTracksToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleStormTracksLayer();
        });
    }
}

menuClicks();