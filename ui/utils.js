/**
 * ui/utils.js
 * Common UI helper functions.
 */

export function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;

    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (container.contains(toast)) container.removeChild(toast);
        }, 300);
    }, 3000);
}

export async function ensureScripts(tabId) {
    await chrome.scripting.executeScript({
        target: { tabId },
        files: ['turndown.js', 'js/content/inspector.js', 'js/content/macros.js', 'js/content/auto-detect.js', 'js/content/extractor.js', 'js/content/main.js']
    }).catch(() => null);
}

export function updateSubtitle(id, text, active = false) {
    const subtitle = document.getElementById(id);
    if (!subtitle) return;
    subtitle.innerText = text;
    subtitle.style.color = active ? '#10b981' : '';
}
