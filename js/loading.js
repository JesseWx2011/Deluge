const weatherFacts = [
    "Jesus is a very nice guy :)",
    "There are an average of ~1,200 tornadoes per year in the United States.",
    "0.08% of all tornadoes since 1950 were rated F5 or EF5.",
    "The Tri-State Tornado was the deadliest tornado in USA History, clocking in at 695 fatalities.",
    "On Radar, keep a lookout for a hook echo!"
];

const LoadIcons = [
    "https://basmilius.github.io/meteocons/production/fill/svg/tornado.svg",
    "https://basmilius.github.io/meteocons/production/fill/svg/mist.svg",
    "https://basmilius.github.io/meteocons/production/fill/svg/hurricane.svg",
];

let loadingFactIndex = 0;
let iconNum = 1;

function getNextFact() {
    const fact = weatherFacts[loadingFactIndex % weatherFacts.length];
    loadingFactIndex++;
    return fact;
}

function getNextIcon() {
    const icon = LoadIcons[iconNum % LoadIcons.length];
    iconNum++;
    return icon;
}

function updateLoadingFact() {
    const factElement = document.getElementById('loadingFact');
    if (factElement) {
        factElement.innerHTML = `
            <div style="display: flex; flex-direction: column;">
                <span>Did you know? ${getNextFact()}</span>
                <span style="color: white; font-style: italic;">Romans 5:8</span>
            </div>
        `;
    }
}

function updateIcon() {
    const iconEl = document.querySelector("#loadingIcon");
    if (iconEl) iconEl.src = getNextIcon();
}

function updateLoadingProgress(percent, status) {
    const progressBar = document.getElementById('loadingProgressBar');
    const statusElement = document.getElementById('loadingStatus');

    if (progressBar) progressBar.style.width = `${percent}%`;
    if (statusElement && status) statusElement.textContent = status;
}
window.updateLoadingProgress = updateLoadingProgress;

async function testRadarConnection() {
    const radarSites = ['KMOB', 'KLNX'];

    updateLoadingProgress(25, 'Testing radar connection...');

    for (const site of radarSites) {
        try {
            updateLoadingProgress(40, `Testing if the radars work...`);

            const url = `https://mesonet.agron.iastate.edu/json/radarserver.py?station=${site}&ts=2024-01-01T00:00:00Z&product=N0B`;

            await Promise.race([
                fetch(url, { method: 'HEAD', mode: 'no-cors' }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
            ]);

            console.log(`[Deluge] Radar connection successful: ${site}`);
            return true;
        } catch (error) {
            console.warn(`[Deluge] Radar test failed for ${site}:`, error);
        }
    }

    console.warn('[Deluge] All radar connection tests failed, proceeding anyway');
    return false;
}

async function waitForMapTiles() {
    updateLoadingProgress(60, 'Waiting for the map to load.');

    return new Promise((resolve) => {
        const checkMapLoaded = () => {
            if (window.map && typeof window.map.loaded === 'function' && window.map.loaded()) {
                updateLoadingProgress(85, 'Map tiles loaded!');
                resolve();
            } else {
                setTimeout(checkMapLoaded, 500);
            }
        };

        checkMapLoaded();
        setTimeout(resolve, 15000);
    });
}

async function initializeLoading() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (!loadingOverlay) return;

    updateLoadingProgress(10, 'Initializing application...');
    updateLoadingFact();

    const factInterval = setInterval(updateLoadingFact, 2500);
    const iconInterval = setInterval(updateIcon, 1500);

    const hideOverlay = (delayMs) => {
        setTimeout(() => {
            loadingOverlay.style.transition = 'opacity 0.6s ease-out';
            loadingOverlay.style.opacity = '0';
            loadingOverlay.style.pointerEvents = 'none';
            setTimeout(() => { loadingOverlay.style.display = 'none'; }, 600);
        }, delayMs);
    };

    try {
        await testRadarConnection();
        await waitForMapTiles();

        updateLoadingProgress(100, `Let's gooooo!`);
        clearInterval(factInterval);
        clearInterval(iconInterval);
        hideOverlay(500);
    } catch (error) {
        console.error('[Deluge] Loading initialization error:', error);
        clearInterval(factInterval);
        clearInterval(iconInterval);
        updateLoadingProgress(100, 'Proceeding with partial initialization...');
        setTimeout(() => { loadingOverlay.style.display = 'none'; }, 2000);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeLoading);
} else {
    initializeLoading();
}
