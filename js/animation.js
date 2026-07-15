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
const productsMenu = document.getElementById('productsMenu');
const productRows = document.querySelectorAll('.productRow');
const selectedProductDisplay = document.getElementById('selectedProduct');

let currentSelectedProduct = null;
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

// Handle product selection
productRows.forEach(row => {
    row.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Remove selected class from all rows
        productRows.forEach(r => r.classList.remove('selected'));
        
        // Add selected class to clicked row
        row.classList.add('selected');
        
        // Update the selected product display
        const productId = row.dataset.productId;
        const productName = row.dataset.productName;
        currentSelectedProduct = productId;
        window.currentSelectedProduct = productId;
        selectedProductDisplay.textContent = productName;
        
        // Collapse the drawer
        isExpanded = false;
        productDrawer.classList.remove('expanded');
        expandToggle.style.transform = 'rotate(0deg)';
        
        // Clear the previous product's WebGL/IEM layer before loading the
        // new one so a stale frame never lingers on screen.
        if (typeof window.clearRadarLayers === 'function') {
            window.clearRadarLayers();
        }

        // Trigger update in map if available
        if (typeof updateRadarProduct === 'function') {
            updateRadarProduct(productId);
        } else if (typeof window.tryRenderNexradWebGL === 'function' && window.currentRadarId) {
            window.tryRenderNexradWebGL(window.currentRadarId, productId);
        }
    });
});
/* ----------------------- Outlook Day Buttons (visual only) ----------------------- */

const outlookButtons = document.querySelectorAll('.outlookButton');

outlookButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        outlookButtons.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
s    });
});