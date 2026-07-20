const topUi = document.getElementById("topUi");
const topUiContents = topUi ? topUi.querySelectorAll(':scope > div') : [];
const topUiButtons = Array.from(topUiContents || []).filter((content) =>
    content.classList.contains('button-container')
);

function setTopUiSelection(mode) {
    topUiButtons.forEach((buttonContainer) => {
        const isSelected = buttonContainer.dataset.mode === mode;
        buttonContainer.classList.toggle('selected', isSelected);
        buttonContainer.style.opacity = '1';
        buttonContainer.style.display = 'flex';
    });

    const outlookNav = document.getElementById('outlookNav');
    if (outlookNav) {
        outlookNav.style.display = mode === 'outlooks' ? 'flex' : 'none';
    }

    const outlookPanel = document.getElementById('outlookPanel');
    if (outlookPanel) {
        outlookPanel.style.display = mode === 'outlooks' ? 'block' : 'none';
    }
}

function topUiOpen() {
    setTopUiSelection('radar');

    topUiContents.forEach((content) => {
        content.style.opacity = '1';
    });

    // After the opening animation completes (0.6s), reveal the contents
    setTimeout(() => {
        topUiContents.forEach((content) => {
            content.style.animation = 'revealContents 0.4s ease forwards';
        });
    }, 600);
}

function buttonClicks() {
    topUiButtons.forEach(function (element) {
        element.addEventListener("click", function () {
            const selectedMode = element.dataset.mode;
            setTopUiSelection(selectedMode);

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
    if (typeof window.showRadarMode === 'function') {
        window.showRadarMode();
    }
}

function modeOutlooks() {
    setTopUiSelection('outlooks');
    if (typeof window.showOutlookMode === 'function') {
        window.showOutlookMode();
    }
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

// Product Drawer Expansion
const productDrawer = document.getElementById('productDrawer');
const expandToggle = document.getElementById('expandToggle');

let isExpanded = false;

// Toggle drawer expansion
function toggleDrawer() {
    isExpanded = !isExpanded;
    productDrawer.classList.toggle('expanded', isExpanded);
    expandToggle.style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
}

productDrawer.addEventListener('click', (e) => {
    // Don't toggle if clicking on a product row
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

// Product row clicks (selection, drawer collapse, layer/frame refresh) are
// handled in map.js via a listener on the #productsMenu container itself,
// since that container survives selectRadarSite() rebuilding its rows.
/* ----------------------- Outlook Day Buttons (visual only) ----------------------- */

const outlookButtons = document.querySelectorAll('.outlookButton');

outlookButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        outlookButtons.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
    });
});

// Timeline Slider Functionality
// timelineSlider, timelineTicks, and timelineLabel are declared in map.js

// Debounce timer for timeline scrubbing to reduce lag
let timelineDebounceTimer = null;

// Track loading progress
let loadingProgress = 0;
let totalFramesToLoad = 0;

// Update loading progress bar
function updateLoadingProgress(loaded, total) {
    const progressBar = document.getElementById('timelineProgressBar');
    const progressText = document.getElementById('timelineProgressText');
    const progressContainer = document.getElementById('timelineProgress');
    
    if (!progressBar || !progressText || !progressContainer) return;
    
    loadingProgress = loaded;
    totalFramesToLoad = total;
    
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

// Update timeline ticks based on preloaded frames
function updateTimelineTicks() {
    if (!timelineTicks) return;
    
    const frames = window.preloadedRadarFrames;
    if (!frames || frames.size === 0) {
        console.warn('[Deluge] No preloaded frames for timeline ticks');
        timelineTicks.innerHTML = '';
        if (timelineSlider) {
            timelineSlider.max = 0;
            timelineSlider.value = 0;
        }
        return;
    }
    
    // Get the actual loaded frames (sorted by index)
    const loadedFrameIndices = Array.from(frames.keys()).sort((a, b) => a - b);
    const frameCount = loadedFrameIndices.length;
    
    if (frameCount === 0) {
        timelineTicks.innerHTML = '';
        if (timelineSlider) {
            timelineSlider.max = 0;
            timelineSlider.value = 0;
        }
        return;
    }
    
    // Update slider to use 0-based index for loaded frames only
    if (timelineSlider) {
        timelineSlider.max = frameCount - 1;
        timelineSlider.value = frameCount - 1; // Default to latest
    }
    
    // Always clear and rebuild ticks to ensure correct data for current radar site
    timelineTicks.innerHTML = '';
    
    // Always show 4-5 ticks regardless of frame count
    const numTicks = Math.min(5, Math.max(4, frameCount));
    
    // Calculate evenly spaced tick positions
    for (let i = 0; i < numTicks; i++) {
        // Calculate the 0-based frame index for this tick
        const frameIndex = Math.floor((i / (numTicks - 1)) * (frameCount - 1));
        const actualFrameIndex = loadedFrameIndices[frameIndex];
        const frame = frames.get(actualFrameIndex);
        
        if (!frame || !frame.timestamp) continue;
        
        const tick = document.createElement('div');
        tick.className = 'timeline-tick';
        tick.style.position = 'absolute';
        tick.style.left = `${(i / (numTicks - 1)) * 100}%`;
        tick.style.transform = 'translateX(-50%)';
        tick.style.fontSize = '10px';
        tick.style.color = 'rgba(255, 255, 255, 0.7)';
        tick.style.whiteSpace = 'nowrap';
        
        // Show "Now" for the latest frame, otherwise show HH:MM
        if (i === numTicks - 1) {
            tick.textContent = 'Now';
        } else if (frame.timestamp) {
            const hh = String(frame.timestamp.getHours()).padStart(2, '0');
            const mm = String(frame.timestamp.getMinutes()).padStart(2, '0');
            tick.textContent = `${hh}:${mm}`;
        }
        
        timelineTicks.appendChild(tick);
    }
    
    console.log('[Deluge] Updated timeline ticks with', numTicks, 'ticks for', frameCount, 'frames');
}

window.updateLoadingProgress = updateLoadingProgress;

// Handle timeline slider changes
function handleTimelineChange(e) {
    const sliderIndex = parseInt(e.target.value);
    
    // Check if preloaded frames exist
    if (!window.preloadedRadarFrames || window.preloadedRadarFrames.size === 0) {
        console.warn('[Deluge] No preloaded frames available for timeline');
        return;
    }
    
    // Get the actual loaded frame indices (sorted)
    const loadedFrameIndices = Array.from(window.preloadedRadarFrames.keys()).sort((a, b) => a - b);
    
    // Validate slider index is within bounds
    if (sliderIndex < 0 || sliderIndex >= loadedFrameIndices.length) {
        console.warn('[Deluge] Slider index out of bounds:', sliderIndex, 'Loaded frames:', loadedFrameIndices.length);
        return;
    }
    
    // Get the actual frame index from the loaded frame indices
    const actualFrameIndex = loadedFrameIndices[sliderIndex];
    const frame = window.preloadedRadarFrames.get(actualFrameIndex);
    
    // Check if the specific frame is loaded
    if (!frame || !frame.loaded) {
        console.warn('[Deluge] Frame not yet loaded at index:', actualFrameIndex);
        // Reset to the last loaded frame
        const lastLoadedIndex = loadedFrameIndices.length - 1;
        if (lastLoadedIndex >= 0 && timelineSlider) {
            timelineSlider.value = lastLoadedIndex;
        }
        return;
    }
    
    // Update label immediately for responsiveness
    if (timelineLabel) {
        const frameCount = loadedFrameIndices.length;
        
        if (frame && frame.timestamp) {
            // Show "Now" for the latest frame, otherwise show HH:MM
            if (sliderIndex === frameCount - 1) {
                timelineLabel.textContent = 'Now';
            } else {
                const hh = String(frame.timestamp.getUTCHours()).padStart(2, '0');
                const mm = String(frame.timestamp.getUTCMinutes()).padStart(2, '0');
                timelineLabel.textContent = `${hh}:${mm}`;
            }
        }
    }
    
    // Debounce rendering to reduce lag when scrubbing fast
    clearTimeout(timelineDebounceTimer);
    timelineDebounceTimer = setTimeout(() => {
        if (typeof window.renderPreloadedFrame === 'function') {
            window.renderPreloadedFrame(actualFrameIndex);
        }
    }, 50); // 50ms debounce delay
}

// Find the last loaded frame index
function findLastLoadedFrameIndex() {
    if (!window.preloadedRadarFrames || window.preloadedRadarFrames.size === 0) {
        return -1;
    }
    
    for (let i = window.preloadedRadarFrames.size - 1; i >= 0; i--) {
        const frame = window.preloadedRadarFrames.get(i);
        if (frame && frame.loaded) {
            return i;
        }
    }
    
    return -1;
}

// Initialize timeline slider
if (timelineSlider) {
    timelineSlider.addEventListener('input', handleTimelineChange);
}

window.updateTimelineTicks = updateTimelineTicks;