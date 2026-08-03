// Top-right settings menu + Map Layers menu (camera overlay / alerts / storm
// tracks / lightning / mesoscale discussions / storm reports / NHC cone).

const settingsButton = document.getElementById("settingsButton");
const settingsModalContainer = document.getElementById("settingsModalContainer");

const layersButton = document.getElementById("layersButton");
const layersRow = document.getElementById("layersRow");
const layersDropdown = document.getElementById("layersDropdown");

function openSettingsModal() {
    if (settingsModalContainer) settingsModalContainer.style.display = "flex";
}

function closeSettingsModal() {
    if (settingsModalContainer) settingsModalContainer.style.display = "none";
}
window.closeSettingsModal = closeSettingsModal;

function toggleLayersDropdown() {
    layersDropdown.classList.toggle("open");
}

document.addEventListener("click", (event) => {
    if (layersDropdown && layersRow &&
        !layersDropdown.contains(event.target) && !layersRow.contains(event.target)) {
        layersDropdown.classList.remove("open");
    }
});

if (settingsButton) {
    settingsButton.addEventListener("click", (e) => {
        e.stopPropagation();
        layersDropdown?.classList.remove("open");
        openSettingsModal();
    });
}

if (layersButton) {
    layersButton.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleLayersDropdown();
    });
}

// Clicking anywhere else on the row (e.g. the label) also toggles the
// dropdown; the button above stops propagation so this never double-fires.
if (layersRow) {
    layersRow.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleLayersDropdown();
    });
}

// ------------------------- Layer Toggles -------------------------
// Each entry describes one Map Layers switch: its toggle id, whether it
// starts active, the map layer ids it controls directly (if any), and an
// optional external setter (for layers whose fetch/visibility logic lives
// in another file, e.g. extra-layers.js).

const LAYER_TOGGLES = {
    cameras: { toggleId: 'camerasToggle', layerIds: ['isuCamsLayer'], defaultActive: true },
    alerts: { toggleId: 'alertsToggle', layerIds: ['alerts-layer', 'alerts-outline'], defaultActive: true },
    stormTracks: { toggleId: 'stormTracksToggle', layerIds: ['storm-track-lines-layer', 'storm-track-ticks-layer', 'storm-track-points-layer'], defaultActive: true },
    lightning: { toggleId: 'lightningToggle', layerIds: ['lightning-layer'], defaultActive: true },
    mesoscale: { toggleId: 'mesoscaleToggle', setVisible: (v) => window.setMesoscaleVisibility && window.setMesoscaleVisibility(v), defaultActive: false },
    lsr: { toggleId: 'lsrToggle', setVisible: (v) => window.setLsrVisibility && window.setLsrVisibility(v), defaultActive: false },
    nhcCone: { toggleId: 'nhcConeToggle', setVisible: (v) => window.setNhcConeVisibility && window.setNhcConeVisibility(v), defaultActive: false }
};

const layerVisibility = {};

function applyLayerVisibility(key) {
    const config = LAYER_TOGGLES[key];
    const visible = layerVisibility[key];

    if (config.layerIds) {
        config.layerIds.forEach((layerId) => {
            if (map.getLayer(layerId)) {
                map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
            }
        });
    }

    if (config.setVisible) config.setVisible(visible);
}

function toggleLayer(key) {
    const config = LAYER_TOGGLES[key];
    layerVisibility[key] = !layerVisibility[key];

    const toggle = document.getElementById(config.toggleId);
    if (toggle) toggle.classList.toggle("active", layerVisibility[key]);

    applyLayerVisibility(key);
}

// Named wrappers kept for external callers (e.g. layers.js calls
// window.toggleCameras() directly).
function toggleCameras() { toggleLayer('cameras'); }
function toggleAlertsLayer() { toggleLayer('alerts'); }
function toggleStormTracksLayer() { toggleLayer('stormTracks'); }
function toggleLightningLayer() { toggleLayer('lightning'); }
function toggleMesoscaleLayer() { toggleLayer('mesoscale'); }
function toggleLsrLayer() { toggleLayer('lsr'); }
function toggleNhcConeLayer() { toggleLayer('nhcCone'); }

window.toggleCameras = toggleCameras;
window.toggleAlertsLayer = toggleAlertsLayer;
window.toggleStormTracksLayer = toggleStormTracksLayer;
window.toggleLightningLayer = toggleLightningLayer;
window.toggleMesoscaleLayer = toggleMesoscaleLayer;
window.toggleLsrLayer = toggleLsrLayer;
window.toggleNhcConeLayer = toggleNhcConeLayer;

function menuClicks() {
    Object.entries(LAYER_TOGGLES).forEach(([key, config]) => {
        layerVisibility[key] = config.defaultActive;

        const toggle = document.getElementById(config.toggleId);
        if (!toggle) return;

        toggle.classList.toggle("active", config.defaultActive);
        toggle.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleLayer(key);
        });
    });
}

menuClicks();
