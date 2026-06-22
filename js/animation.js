const topUi = document.getElementById("topUi");
const topUiContents = topUi.querySelectorAll(':scope > div');
const selectedButtons = Array.from(topUiContents).filter(btn => btn.classList.contains('selected'));

topUiContents.forEach(content => {
        content.style.opacity = '0';
    });

function topUiOpen() {
    // After the opening animation completes (0.6s), reveal the contents
    setTimeout(() => {
        topUiContents.forEach(content => {
            content.style.animation = 'revealContents 0.4s ease forwards';
        });
    }, 600);
}

// Call topUiOpen when the page loads
window.addEventListener('load', topUiOpen);

function buttonClicks() {
    topUiContents.forEach(function(element) {
        element.addEventListener("click", function(event) {
            
            elementId = element.id;
            elementClass = element.className;

            // Remove 'selected' class from all buttons
            topUiContents.forEach(btn => btn.classList.remove('selected'));
            
            // Add 'selected' class to clicked button
            element.classList.add('selected');
            
            // Apply bounce animation to the newly selected button
            element.style.animation = "none";
            // Trigger reflow to reset animation
            element.offsetHeight;
            element.style.animation = "bounce 0.35s ease-out";
            element.style.display = "flex";
            element.style.opacity = "1"
        });
    });
}

buttonClicks();

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
        selectedProductDisplay.textContent = productName;
        
        // Collapse the drawer
        isExpanded = false;
        productDrawer.classList.remove('expanded');
        expandToggle.style.transform = 'rotate(0deg)';
        
        // Trigger update in map if available
        if (typeof updateRadarProduct === 'function') {
            updateRadarProduct(productId);
        }
    });
});