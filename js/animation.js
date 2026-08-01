// ------------------------- Top UI Mode Switching -------------------------

const topUi = document.getElementById("topUi");
const topUiContents = topUi ? Array.from(topUi.querySelectorAll(':scope > div')) : [];
const topUiButtons = topUiContents.filter((content) => content.classList.contains('button-container'));

function setTopUiSelection(mode) {
    topUiButtons.forEach((buttonContainer) => {
        buttonContainer.classList.toggle('selected', buttonContainer.dataset.mode === mode);
        buttonContainer.style.opacity = '1';
        buttonContainer.style.display = 'flex';
    });

    const outlookNav = document.getElementById('outlookNav');
    if (outlookNav) outlookNav.style.display = mode === 'outlooks' ? 'flex' : 'none';

    const outlookPanel = document.getElementById('outlookPanel');
    if (outlookPanel) outlookPanel.style.display = mode === 'outlooks' ? 'block' : 'none';
}

function topUiOpen() {
    setTopUiSelection('radar');
    topUiContents.forEach((content) => { content.style.opacity = '1'; });

    // Reveal contents after the opening animation completes (0.6s)
    setTimeout(() => {
        topUiContents.forEach((content) => {
            content.style.animation = 'revealContents 0.4s ease forwards';
        });
    }, 600);
}

function buttonClicks() {
    topUiButtons.forEach((element) => {
        element.addEventListener("click", () => {
            setTopUiSelection(element.dataset.mode);

            const activeButton = element.querySelector('button');
            if (activeButton) {
                activeButton.style.animation = "none";
                activeButton.offsetHeight;
                activeButton.style.animation = "bounce 0.35s ease-out";
            }
        });
    });
}

function modeRadar() {
    setTopUiSelection('radar');
    if (typeof window.showRadarMode === 'function') window.showRadarMode();
}

function modeOutlooks() {
    setTopUiSelection('outlooks');
    if (typeof window.showOutlookMode === 'function') window.showOutlookMode();
}

function modeNavigation() {
    setTopUiSelection('navigation');
}

window.modeRadar = modeRadar;
window.modeOutlooks = modeOutlooks;
window.modeNavigation = modeNavigation;

buttonClicks();

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    topUiOpen();
} else {
    window.addEventListener('load', topUiOpen);
}

// ------------------------- Product Drawer Expansion -------------------------

const productDrawer = document.getElementById('productDrawer');
const expandToggle = document.getElementById('expandToggle');

let isExpanded = false;

function toggleDrawer() {
    isExpanded = !isExpanded;
    productDrawer.classList.toggle('expanded', isExpanded);
    expandToggle.style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
}

productDrawer.addEventListener('click', (e) => {
    if (e.target.classList.contains('productRow')) return;
    toggleDrawer();
});

// Called from map.js after a product row selection so the drawer collapses
// without leaving isExpanded out of sync with the DOM.
function collapseProductDrawer() {
    isExpanded = false;
    productDrawer.classList.remove('expanded');
    expandToggle.style.transform = 'rotate(0deg)';
}
window.collapseProductDrawer = collapseProductDrawer;

// Product row clicks are handled in map.js via a listener on #productsMenu,
// since that container survives selectRadarSite() rebuilding its rows.

// ------------------------- Outlook Day Buttons (visual only) -------------------------

const outlookButtons = document.querySelectorAll('.outlookButton');
outlookButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
        outlookButtons.forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
    });
});

// ------------------------- Timeline Slider -------------------------
// timelineSlider, timelineTicks, and timelineLabel are declared in map.js

let timelineDebounceTimer = null;

function updateLoadingProgress(loaded, total) {
    const progressBar = document.getElementById('timelineProgressBar');
    const progressText = document.getElementById('timelineProgressText');
    const progressContainer = document.getElementById('timelineProgress');
    if (!progressBar || !progressText || !progressContainer) return;

    const percentage = total > 0 ? (loaded / total) * 100 : 0;
    progressBar.style.width = `${percentage}%`;

    if (loaded < total) {
        progressText.textContent = `Loading frames: ${loaded}/${total}`;
        progressContainer.style.display = 'block';
    } else {
        progressText.textContent = '';
        progressContainer.style.display = 'none';
    }
}
window.updateLoadingProgress = updateLoadingProgress;

function getSortedLoadedFrameIndices() {
    const frames = window.preloadedRadarFrames;
    if (!frames || frames.size === 0) return [];
    return Array.from(frames.keys()).sort((a, b) => a - b);
}

function updateTimelineTicks() {
    if (!timelineTicks) return;

    const loadedFrameIndices = getSortedLoadedFrameIndices();
    const frameCount = loadedFrameIndices.length;

    timelineTicks.innerHTML = '';

    if (frameCount === 0) {
        if (timelineSlider) {
            timelineSlider.max = 0;
            timelineSlider.value = 0;
        }
        return;
    }

    if (timelineSlider) {
        timelineSlider.max = frameCount - 1;
        timelineSlider.value = frameCount - 1; // Default to latest
    }

    const frames = window.preloadedRadarFrames;
    const numTicks = Math.min(5, Math.max(4, frameCount));

    for (let i = 0; i < numTicks; i++) {
        const frameIndex = Math.floor((i / (numTicks - 1)) * (frameCount - 1));
        const frame = frames.get(loadedFrameIndices[frameIndex]);
        if (!frame || !frame.timestamp) continue;

        const tick = document.createElement('div');
        tick.className = 'timeline-tick';
        tick.style.position = 'absolute';
        tick.style.left = `${(i / (numTicks - 1)) * 100}%`;
        tick.style.transform = 'translateX(-50%)';
        tick.style.fontSize = '10px';
        tick.style.color = 'rgba(255, 255, 255, 0.7)';
        tick.style.whiteSpace = 'nowrap';

        if (i === numTicks - 1) {
            tick.textContent = 'Now';
        } else {
            const hh = String(frame.timestamp.getHours()).padStart(2, '0');
            const mm = String(frame.timestamp.getMinutes()).padStart(2, '0');
            tick.textContent = `${hh}:${mm}`;
        }

        timelineTicks.appendChild(tick);
    }
}
window.updateTimelineTicks = updateTimelineTicks;

function handleTimelineChange(e) {
    const sliderIndex = parseInt(e.target.value);
    const loadedFrameIndices = getSortedLoadedFrameIndices();

    if (sliderIndex < 0 || sliderIndex >= loadedFrameIndices.length) return;

    const actualFrameIndex = loadedFrameIndices[sliderIndex];
    const frame = window.preloadedRadarFrames.get(actualFrameIndex);

    if (!frame || !frame.loaded) {
        // Frame not ready yet — reset to the last loaded frame
        const lastLoadedIndex = loadedFrameIndices.length - 1;
        if (lastLoadedIndex >= 0 && timelineSlider) {
            timelineSlider.value = lastLoadedIndex;
        }
        return;
    }

    if (timelineLabel && frame.timestamp) {
        const isLatest = sliderIndex === loadedFrameIndices.length - 1;
        if (isLatest) {
            timelineLabel.textContent = 'Now';
        } else {
            const hh = String(frame.timestamp.getUTCHours()).padStart(2, '0');
            const mm = String(frame.timestamp.getUTCMinutes()).padStart(2, '0');
            timelineLabel.textContent = `${hh}:${mm}`;
        }
    }

    // Debounce rendering to reduce lag when scrubbing fast
    clearTimeout(timelineDebounceTimer);
    timelineDebounceTimer = setTimeout(() => {
        if (typeof window.renderPreloadedFrame === 'function') {
            window.renderPreloadedFrame(actualFrameIndex);
        }
    }, 50);
}

if (timelineSlider) {
    timelineSlider.addEventListener('input', handleTimelineChange);
}
