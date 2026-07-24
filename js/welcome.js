// First-visit welcome modal.

const WELCOME_STORAGE_KEY = 'delugeWelcomeSeen';

function openWelcomeModal() {
    const container = document.getElementById('welcomeModalContainer');
    if (!container) return;

    container.style.display = 'flex';
    container.classList.add('isOpening');
    setTimeout(() => container.classList.remove('isOpening'), 250);
}

function closeWelcomeModal() {
    const container = document.getElementById('welcomeModalContainer');
    if (!container) return;

    container.classList.add('isClosing');
    setTimeout(() => {
        container.classList.remove('isClosing');
        container.style.display = 'none';
    }, 220);

    try {
        localStorage.setItem(WELCOME_STORAGE_KEY, 'true');
    } catch (error) {
        console.warn('[Deluge] Could not persist welcome modal state:', error);
    }
}

function hasSeenWelcome() {
    try {
        return localStorage.getItem(WELCOME_STORAGE_KEY) === 'true';
    } catch (error) {
        return false;
    }
}

function initWelcomeModal() {
    if (hasSeenWelcome()) return;

    // Wait for the loading overlay to finish so the greeting isn't hidden behind it.
    const overlay = document.getElementById('loadingOverlay');
    const overlayHidden = () => !overlay ||
        overlay.classList.contains('hidden') ||
        overlay.style.display === 'none' ||
        getComputedStyle(overlay).opacity === '0';

    if (overlayHidden()) {
        openWelcomeModal();
        return;
    }

    const poll = setInterval(() => {
        if (!overlayHidden()) return;
        clearInterval(poll);
        openWelcomeModal();
    }, 300);

    // Never keep the greeting waiting on a stalled overlay.
    setTimeout(() => {
        clearInterval(poll);
        const container = document.getElementById('welcomeModalContainer');
        if (container && container.style.display !== 'flex' && !hasSeenWelcome()) {
            openWelcomeModal();
        }
    }, 12000);
}

document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const container = document.getElementById('welcomeModalContainer');
    if (container && container.style.display === 'flex') closeWelcomeModal();
});

document.addEventListener('DOMContentLoaded', initWelcomeModal);

window.openWelcomeModal = openWelcomeModal;
window.closeWelcomeModal = closeWelcomeModal;
