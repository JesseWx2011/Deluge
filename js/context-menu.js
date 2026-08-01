// Map context menu — right-click on desktop, double-tap on mobile.
// Shows the 2 closest radar sites plus quick access to Draw/Measure tools.

const MAP_CONTEXT_MENU_ID = 'mapContextMenu';

let contextMenuLastTapTime = 0;
let contextMenuLastTapPoint = null;

function haversineDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}
window.haversineDistanceKm = haversineDistanceKm;

// filteredRadarData is populated by radars() in map.js (shared global scope)
function findClosestRadars(lngLat, count = 2) {
    if (!filteredRadarData || !Array.isArray(filteredRadarData.features)) return [];

    return filteredRadarData.features
        .map((feature) => {
            const [lon, lat] = feature.geometry.coordinates;
            return {
                id: feature.properties.id,
                isTdwr: !!feature.properties.isTdwr,
                distanceKm: haversineDistanceKm(lngLat.lat, lngLat.lng, lat, lon)
            };
        })
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, count);
}

function formatContextMenuCoords(lngLat) {
    const lat = Math.abs(lngLat.lat).toFixed(4);
    const lon = Math.abs(lngLat.lng).toFixed(4);
    const ns = lngLat.lat >= 0 ? 'N' : 'S';
    const ew = lngLat.lng >= 0 ? 'E' : 'W';
    return `${lat}°${ns}, ${lon}°${ew}`;
}

function isOutlookModeActive() {
    const outlookButton = document.querySelector('.button-container[data-mode="outlooks"]');
    return !!(outlookButton && outlookButton.classList.contains('selected'));
}

function selectRadarFromContextMenu(radarId) {
    if (isOutlookModeActive() && typeof window.modeRadar === 'function') {
        window.modeRadar();
    }
    if (typeof selectRadarSite === 'function') {
        selectRadarSite(radarId);
    }
    closeMapContextMenu();
}

function findClosestWebcam(lngLat) {
    const webcamFeatures = Array.isArray(window.webcamFeatureCatalog) ? window.webcamFeatureCatalog : [];
    if (!webcamFeatures.length) return null;

    const matches = webcamFeatures
        .map((feature) => {
            const geometry = feature?.geometry || {};
            const coordinates = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
            if (coordinates.length < 2) return null;
            const [lon, lat] = coordinates;
            return {
                feature,
                distanceMiles: haversineDistanceKm(lngLat.lat, lngLat.lng, lat, lon) * 0.621371
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.distanceMiles - b.distanceMiles);

    return matches[0] || null;
}

function buildMapContextMenuHtml(lngLat) {
    const closestRadars = findClosestRadars(lngLat, 2);
    const nearestCamera = findClosestWebcam(lngLat);

    const radarBadgesHtml = closestRadars.map((radar) => `
        <button class="mapContextRadarBadge" data-radar-id="${radar.id}">
            <i class="fa-solid fa-satellite-dish"></i> ${radar.id}
        </button>
    `).join('<div class="mapContextMenuDivider vertical"></div>');

    const nearestCameraHtml = nearestCamera ? `
        <div class="mapContextMenuItem" id="mapContextMenuNearestCamera">
            <i class="fa-solid fa-video"></i> Show nearest camera (${nearestCamera.distanceMiles.toFixed(1)} mi)
        </div>
    ` : '';

    return `
        ${closestRadars.length ? `<div class="mapContextMenuRadars">${radarBadgesHtml}</div><div class="mapContextMenuDivider"></div>` : ''}
        <div class="mapContextMenuCoords"><i class="fa-solid fa-location-crosshairs"></i> ${formatContextMenuCoords(lngLat)}</div>
        ${nearestCameraHtml ? `<div class="mapContextMenuDivider"></div>${nearestCameraHtml}` : ''}
        <div class="mapContextMenuDivider"></div>
        <div class="mapContextMenuItem" id="mapContextMenuDraw"><i class="fa-solid fa-pencil"></i> Draw</div>
        <div class="mapContextMenuItem" id="mapContextMenuMeasure"><i class="fa-solid fa-ruler"></i> Measure</div>
    `;
}

function positionMapContextMenu(menuEl, point) {
    const padding = 12;
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    const mapRect = mapEl.getBoundingClientRect();
    const menuRect = menuEl.getBoundingClientRect();

    let left = point.x;
    let top = point.y;

    if (left + menuRect.width + padding > mapRect.width) {
        left = Math.max(padding, mapRect.width - menuRect.width - padding);
    }
    if (top + menuRect.height + padding > mapRect.height) {
        top = Math.max(padding, mapRect.height - menuRect.height - padding);
    }

    menuEl.style.left = `${left}px`;
    menuEl.style.top = `${top}px`;
}

function openMapContextMenu(point, lngLat) {
    const menuEl = document.getElementById(MAP_CONTEXT_MENU_ID);
    if (!menuEl) return;

    menuEl.innerHTML = buildMapContextMenuHtml(lngLat);
    menuEl.style.display = 'flex';
    positionMapContextMenu(menuEl, point);

    menuEl.querySelectorAll('.mapContextRadarBadge').forEach((badge) => {
        badge.addEventListener('click', () => selectRadarFromContextMenu(badge.dataset.radarId));
    });

    const nearestCameraItem = document.getElementById('mapContextMenuNearestCamera');
    if (nearestCameraItem) {
        nearestCameraItem.addEventListener('click', () => {
            const nearestCamera = findClosestWebcam(lngLat);
            if (nearestCamera && typeof window.showWebcamModal === 'function') {
                window.showWebcamModal(nearestCamera.feature.properties);
            }
            closeMapContextMenu();
        });
    }

    const drawItem = document.getElementById('mapContextMenuDraw');
    if (drawItem) {
        drawItem.addEventListener('click', () => {
            if (typeof toggleDrawTool === 'function') toggleDrawTool();
            closeMapContextMenu();
        });
    }

    const measureItem = document.getElementById('mapContextMenuMeasure');
    if (measureItem) {
        measureItem.addEventListener('click', () => {
            if (typeof toggleMeasureTool === 'function') toggleMeasureTool();
            closeMapContextMenu();
        });
    }
}

function closeMapContextMenu() {
    const menuEl = document.getElementById(MAP_CONTEXT_MENU_ID);
    if (menuEl) menuEl.style.display = 'none';
}
window.closeMapContextMenu = closeMapContextMenu;

document.addEventListener('click', (event) => {
    const menuEl = document.getElementById(MAP_CONTEXT_MENU_ID);
    if (menuEl && menuEl.style.display !== 'none' && !menuEl.contains(event.target)) {
        closeMapContextMenu();
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMapContextMenu();
});

function initMapContextMenuHandlers() {
    map.on('contextmenu', (e) => {
        e.preventDefault();
        openMapContextMenu({ x: e.point.x, y: e.point.y }, e.lngLat);
    });

    // Mapbox GL doesn't fire `contextmenu` from a touch long-press
    // consistently across browsers, so double-tap is detected manually here.
    map.on('touchend', (e) => {
        if (!e.points || e.points.length !== 1) return;

        const now = Date.now();
        const point = e.point;
        const isDoubleTap = (now - contextMenuLastTapTime) < 350 &&
            contextMenuLastTapPoint &&
            Math.hypot(point.x - contextMenuLastTapPoint.x, point.y - contextMenuLastTapPoint.y) < 30;

        if (isDoubleTap) {
            e.preventDefault();
            openMapContextMenu({ x: point.x, y: point.y }, e.lngLat);
            contextMenuLastTapTime = 0;
            contextMenuLastTapPoint = null;
        } else {
            contextMenuLastTapTime = now;
            contextMenuLastTapPoint = point;
        }
    });
}

if (map.loaded()) {
    initMapContextMenuHandlers();
} else {
    map.on('load', initMapContextMenuHandlers);
}
