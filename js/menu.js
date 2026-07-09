// Top-right options menu (camera overlay / alerts toggles)

const menuButton = document.getElementById("menuButton");
const menuDropdown = document.getElementById("menuDropdown");

let camerasVisible = true;
let alertsVisible = true;

function toggleMenu() {
    menuDropdown.classList.toggle("open");
}

function closeMenuOnOutsideClick(event) {
    if (!menuDropdown.contains(event.target) && !menuButton.contains(event.target)) {
        menuDropdown.classList.remove("open");
    }
}

document.addEventListener("click", closeMenuOnOutsideClick);

if (menuButton) {
    menuButton.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleMenu();
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

function menuClicks() {
    const camerasToggle = document.getElementById("camerasToggle");
    const alertsToggle = document.getElementById("alertsToggle");

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
}

menuClicks();