// Product / Outlook info banner (top-left overlay: title, subtitle, clock/date)

const PRODUCT_BANNER_POLL_MS = 500;

let productBannerLastTitle = null;
let productBannerLastSubtitle = null;
let dockFullscreenBannerLastTitle = null;
let dockFullscreenBannerLastSubtitle = null;

window.activeDockFullscreenBannerOverride = null;

function isPhoneDevice() {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
}

function isOutlookModeActiveForBanner() {
    const outlookButton = document.querySelector('.button-container[data-mode="outlooks"]');
    return !!(outlookButton && outlookButton.classList.contains('selected'));
}

function isNavigationModeActiveForBanner() {
    const navButton = document.querySelector('.button-container[data-mode="navigation"]');
    return !!(navButton && navButton.classList.contains('selected'));
}

function formatBannerClock(date) {
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;

    let tzAbbr = 'LT';
    try {
        const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(date);
        const tzPart = parts.find((part) => part.type === 'timeZoneName');
        if (tzPart && tzPart.value) tzAbbr = tzPart.value;
    } catch (error) {
        // Intl unsupported — keep fallback abbreviation
    }

    return `${displayHours}:${minutes} ${ampm} ${tzAbbr}`;
}

function formatBannerDate(date) {
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    return `${weekday} ${month} ${date.getDate()}`;
}

function getRadarBannerContent() {
    const productEl = document.getElementById('selectedProduct');
    const siteEl = document.getElementById('radarSite');

    const product = productEl ? productEl.textContent.trim() : '----';

    // The site variables are just what the AI wrote.
    const site = siteEl ? siteEl.textContent.trim() : '----';

    if (!product || product === '----') return null;

    return {
        title: product,
        subtitle: "LIVE SUPER-RES RADAR"
    };
}

function getOutlookBannerContent() {
    const outlookSelect = document.getElementById('outlookSelect');
    if (!outlookSelect || !outlookSelect.value) return null;

    const selectedOption = outlookSelect.options[outlookSelect.selectedIndex];
    if (!selectedOption) return null;

    const dayLabel = selectedOption.parentElement && selectedOption.parentElement.tagName === 'OPTGROUP'
        ? selectedOption.parentElement.label
        : null;

    return {
        title: selectedOption.textContent.trim(),
        subtitle: dayLabel ? `${dayLabel} Outlook` : 'SPC Outlook'
    };
}

// The displayed clock/date follows whatever moment the current banner content
// represents: the NEXRAD scan time in radar mode (window.currentScanDate, set
// by nexrad.js), or just "now" in outlook mode / as a fallback.
function getBannerDisplayDate(outlookMode) {
    if (!outlookMode && window.currentScanDate instanceof Date) {
        return window.currentScanDate;
    }
    return new Date();
}

function updateProductBannerClock() {
    const clockEl = document.getElementById('productBannerClock');
    const dateEl = document.getElementById('productBannerDate');
    if (!clockEl || !dateEl) return;

    const override = window.activeAlertBannerOverride;
    if (override) {
        clockEl.textContent = override.clock || '--:-- --';
        dateEl.textContent = override.date || 'Expires:';
        return;
    }

    const displayDate = getBannerDisplayDate(isOutlookModeActiveForBanner());
    clockEl.textContent = formatBannerClock(displayDate);
    dateEl.textContent = formatBannerDate(displayDate);
}

function refreshProductBanner() {
    if (isPhoneDevice()) {
        const banner = document.getElementById('productBanner');
        if (banner) banner.classList.remove('visible');
        return;
    }

    const banner = document.getElementById('productBanner');
    if (window.activeDockFullscreenBannerOverride) {
        banner.classList.remove('visible');
        return;
    }
    const titleEl = document.getElementById('productBannerTitle');
    const subtitleEl = document.getElementById('productBannerSubtitle');
    const clockEl = document.getElementById('productBannerClock');
    const dateEl = document.getElementById('productBannerDate');
    if (!banner || !titleEl || !subtitleEl || !clockEl || !dateEl) return;

    if (isNavigationModeActiveForBanner()) {
        banner.classList.remove('visible');
        return;
    }

    const override = window.activeAlertBannerOverride;
    const outlookMode = isOutlookModeActiveForBanner();
    const content = override
        ? {
            title: override.title || 'ALERT',
            subtitle: override.subtitle || '',
            clock: override.clock || '--:-- --',
            date: override.date || 'Expires'
          }
        : (outlookMode ? getOutlookBannerContent() : getRadarBannerContent());

    if (!content) {
        banner.classList.remove('visible');
        return;
    }

    if (content.title !== productBannerLastTitle) {
        titleEl.textContent = content.title;
        productBannerLastTitle = content.title;
    }
    if (content.subtitle !== productBannerLastSubtitle) {
        subtitleEl.textContent = content.subtitle || '';
        subtitleEl.style.display = content.subtitle ? 'block' : 'none';
        productBannerLastSubtitle = content.subtitle;
    }

    if (override) {
        clockEl.textContent = content.clock;
        dateEl.textContent = content.date;
    } else {
        updateProductBannerClock();
    }

    banner.classList.toggle('outlookVariant', outlookMode && !override);
    banner.classList.add('visible');
}

function updateDockFullscreenBannerClock() {
    const clockEl = document.getElementById('dockFullscreenBannerClock');
    const dateEl = document.getElementById('dockFullscreenBannerDate');
    if (!clockEl || !dateEl) return;

    const override = window.activeDockFullscreenBannerOverride;
    if (!override) {
        clockEl.textContent = '--:-- --';
        dateEl.textContent = '--- --/--/--';
        return;
    }

    clockEl.textContent = override.clock || '--:-- --';
    dateEl.textContent = override.date || formatBannerDate(new Date());
}

function refreshDockFullscreenBanner() {
    const banner = document.getElementById('dockFullscreenBanner');
    const titleEl = document.getElementById('dockFullscreenBannerTitle');
    const subtitleEl = document.getElementById('dockFullscreenBannerSubtitle');
    const clockEl = document.getElementById('dockFullscreenBannerClock');
    const dateEl = document.getElementById('dockFullscreenBannerDate');
    if (!banner || !titleEl || !subtitleEl || !clockEl || !dateEl) return;

    const override = window.activeDockFullscreenBannerOverride;
    if (!override) {
        banner.classList.remove('visible');
        return;
    }

    if (override.title !== dockFullscreenBannerLastTitle) {
        titleEl.textContent = override.title || 'Camera';
        dockFullscreenBannerLastTitle = override.title;
    }
    if (override.subtitle !== dockFullscreenBannerLastSubtitle) {
        subtitleEl.textContent = override.subtitle || 'Location unavailable';
        dockFullscreenBannerLastSubtitle = override.subtitle;
    }

    clockEl.textContent = override.clock || '--:-- --';
    dateEl.textContent = override.date || formatBannerDate(new Date());
    banner.classList.add('visible');
}

function initDockFullscreenBanner() {
    if (document.getElementById('dockFullscreenBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'dockFullscreenBanner';
    banner.className = 'dockFullscreenBanner';
    banner.innerHTML = `
        <div class="dockFullscreenBannerMain">
            <div class="dockFullscreenBannerTitle" id="dockFullscreenBannerTitle">Camera</div>
            <div class="dockFullscreenBannerSubtitle" id="dockFullscreenBannerSubtitle">Location unavailable</div>
        </div>
        <div class="dockFullscreenBannerDivider"></div>
        <div class="dockFullscreenBannerTimeWrap">
            <div class="dockFullscreenBannerClock" id="dockFullscreenBannerClock">--:-- --</div>
            <div class="dockFullscreenBannerDate" id="dockFullscreenBannerDate">--- --/--/--</div>
        </div>
    `;
    document.body.appendChild(banner);

    refreshDockFullscreenBanner();
    setInterval(refreshDockFullscreenBanner, PRODUCT_BANNER_POLL_MS);
    setInterval(updateDockFullscreenBannerClock, 1000);
}

function initProductBanner() {
    initDockFullscreenBanner();

    if (isPhoneDevice()) return;
    if (document.getElementById('productBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'productBanner';
    banner.className = 'productBanner';
    banner.innerHTML = `
        <div class="productBannerMain">
            <div class="productBannerTitle" id="productBannerTitle">----</div>
            <div class="productBannerSubtitle" id="productBannerSubtitle"></div>
        </div>
        <div class="productBannerDivider"></div>
        <div class="productBannerTimeWrap">
            <div class="productBannerClock" id="productBannerClock">--:-- --</div>
            <div class="productBannerDate" id="productBannerDate">--- --/--/--</div>
        </div>
    `;
    document.body.appendChild(banner);

    refreshProductBanner();
    setInterval(refreshProductBanner, PRODUCT_BANNER_POLL_MS);
    setInterval(updateProductBannerClock, 1000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProductBanner);
} else {
    initProductBanner();
}

window.refreshProductBanner = refreshProductBanner;
window.refreshDockFullscreenBanner = refreshDockFullscreenBanner;