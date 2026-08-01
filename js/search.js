const searchBar = document.getElementById('searchBar');
const searchResults = document.getElementById('searchResults');

let searchDebounceTimer = null;

if (searchBar) {
    searchBar.addEventListener('input', handleSearchInput);
    searchBar.addEventListener('keydown', handleSearchKeydown);
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.search') && searchResults) {
        searchResults.style.display = 'none';
    }
});

function handleSearchKeydown(event) {
    if (event.key === 'Escape' && searchResults) {
        searchResults.style.display = 'none';
    }
}

function handleSearchInput(event) {
    const query = event.target.value.trim();

    clearTimeout(searchDebounceTimer);

    if (!query || query.length < 2) {
        if (searchResults) searchResults.style.display = 'none';
        return;
    }

    searchDebounceTimer = setTimeout(() => performSearch(query), 300);
}

async function performSearch(query) {
    if (!searchResults || !window.map) return;

    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=8`,
            { headers: { 'User-Agent': 'Deluge-WeatherRadar/1.0' } }
        );

        if (!response.ok) throw new Error(`Search failed: ${response.status}`);

        const results = await response.json();

        if (!results || results.length === 0) {
            searchResults.innerHTML = '<div class="searchResultItem" style="opacity: 0.6; padding: 12px; text-align: center;">No results found</div>';
            searchResults.style.display = 'block';
            return;
        }

        renderSearchResults(results);
    } catch (error) {
        console.error('[Deluge] Search error:', error);
        searchResults.innerHTML = '<div class="searchResultItem" style="opacity: 0.6; padding: 12px; text-align: center;">Search unavailable</div>';
        searchResults.style.display = 'block';
    }
}

function renderSearchResults(results) {
    if (!searchResults) return;

    searchResults.innerHTML = results.map((result) => {
        const displayName = result.display_name.split(',').slice(0, 2).join(',').trim();

        return `
            <div class="searchResultItem" onclick="selectSearchResult('${result.lat}', '${result.lon}', '${displayName.replace(/'/g, "\\'")}')">
                <i class="fa-solid fa-location-dot" style="margin-right: 8px; color: #4F46E5;"></i>
                <span>${displayName}</span>
            </div>
        `;
    }).join('');

    searchResults.style.display = 'block';
}

function selectSearchResult(lat, lon, name) {
    const mapInstance = window.map;
    if (!mapInstance || typeof mapInstance.flyTo !== 'function') {
        console.warn('[Deluge] Map not ready for navigation');
        return;
    }

    try {
        mapInstance.flyTo({
            center: [parseFloat(lon), parseFloat(lat)],
            zoom: 10,
            duration: 1200,
            curve: 1
        });

        if (searchBar) searchBar.value = name;
        if (searchResults) searchResults.style.display = 'none';

        console.log(`[Deluge] Flew to location: ${name} (${lat}, ${lon})`);

        // Give the flyTo animation a moment before switching radar sites
        setTimeout(() => loadNearestRadar(parseFloat(lat), parseFloat(lon)), 1500);
    } catch (error) {
        console.error('[Deluge] Error flying to location:', error);
    }
}
window.selectSearchResult = selectSearchResult;

function loadNearestRadar(lat, lon) {
    if (!window.filteredRadarData || !Array.isArray(window.filteredRadarData.features)) {
        console.warn('[Deluge] Radar data not available for nearest radar selection');
        return;
    }

    const closestRadar = window.filteredRadarData.features
        .map((feature) => {
            const [radarLon, radarLat] = feature.geometry.coordinates;
            return { id: feature.properties.id, distanceKm: haversineDistanceKm(lat, lon, radarLat, radarLon) };
        })
        .sort((a, b) => a.distanceKm - b.distanceKm)[0];

    if (!closestRadar) {
        console.warn('[Deluge] No radar sites found');
        return;
    }

    console.log(`[Deluge] Loading nearest radar: ${closestRadar.id} (${closestRadar.distanceKm.toFixed(1)} km away)`);

    // Switch out of outlook mode first, if needed
    const outlookButton = document.querySelector('.button-container[data-mode="outlooks"]');
    if (outlookButton && outlookButton.classList.contains('selected') && typeof window.modeRadar === 'function') {
        window.modeRadar();
    }

    if (typeof window.selectRadarSite === 'function') {
        window.selectRadarSite(closestRadar.id);
    }
}

// haversineDistanceKm is shared globally with context-menu.js; only defined
// here as a fallback in case that script hasn't loaded first.
if (typeof window.haversineDistanceKm !== 'function') {
    window.haversineDistanceKm = function (lat1, lon1, lat2, lon2) {
        const R = 6371; // km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(a));
    };
}
var haversineDistanceKm = window.haversineDistanceKm;
