// Product / Outlook info banner (top-left overlay: title, subtitle, clock/date)

const PRODUCT_BANNER_POLL_MS = 500;

let productBannerLastTitle = null;
let productBannerLastSubtitle = null;

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
    const titleEl = document.getElementById('productBannerTitle');
    const subtitleEl = document.getElementById('productBannerSubtitle');
    if (!banner || !titleEl || !subtitleEl) return;

    if (isNavigationModeActiveForBanner()) {
        banner.classList.remove('visible');
        return;
    }

    const outlookMode = isOutlookModeActiveForBanner();
    const content = outlookMode ? getOutlookBannerContent() : getRadarBannerContent();

    if (!content) {
        banner.classList.remove('visible');
        return;
    }

    // Only touch DOM text nodes when something changed, to avoid reflow churn.
    if (content.title !== productBannerLastTitle) {
        titleEl.textContent = content.title;
        productBannerLastTitle = content.title;
    }
    if (content.subtitle !== productBannerLastSubtitle) {
        subtitleEl.textContent = content.subtitle || '';
        subtitleEl.style.display = content.subtitle ? 'block' : 'none';
        productBannerLastSubtitle = content.subtitle;
    }

    banner.classList.toggle('outlookVariant', outlookMode);
    banner.classList.add('visible');

    updateProductBannerClock();
}

function initProductBanner() {
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