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

/**
 * Injects content scripts into the target tab.
 * Returns true if injection succeeded, false otherwise.
 * Shows a user-visible toast on failure instead of silently swallowing.
 */
export async function ensureScripts(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.url && (
            tab.url.startsWith('chrome://') || 
            tab.url.startsWith('edge://') || 
            tab.url.startsWith('about:') || 
            tab.url.startsWith('chrome-extension://') || 
            tab.url.startsWith('https://chrome.google.com/webstore')
        )) {
            showToast("Cannot run on Chrome internal or restricted pages.", "error");
            return false;
        }

        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['turndown.js', 'js/content/inspector.js', 'js/content/macros.js', 'js/content/auto-detect.js', 'js/content/extractor.js', 'js/content/main.js']
        });
        return true;
    } catch (err) {
        console.warn('AI-Digger: Script injection failed for tab', tabId, err?.message);
        showToast("Cannot interact with this page. Try refreshing it.", "error");
        return false;
    }
}

/**
 * Send a message to a tab's content script with built-in lastError handling.
 * Resets the provided button element on failure and shows an error toast.
 * @param {number} tabId - Tab to message
 * @param {object} message - Message payload
 * @param {function} onSuccess - Callback with response when successful
 * @param {object} [opts] - Options
 * @param {HTMLElement} [opts.resetBtn] - Button to reset icon on failure
 * @param {string} [opts.resetIcon] - Icon to set on the button (default: original innerText)
 */
export function safeSendTab(tabId, message, onSuccess, opts = {}) {
    chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
            console.warn('AI-Digger: sendMessage failed:', chrome.runtime.lastError.message);
            showToast("Page not responding. Try refreshing the tab.", "error");
            if (opts.resetBtn && opts.resetIcon) {
                opts.resetBtn.innerText = opts.resetIcon;
                opts.resetBtn.style.backgroundColor = '';
            }
            return;
        }
        onSuccess(response);
    });
}

export function updateSubtitle(id, text, active = false) {
    const subtitle = document.getElementById(id);
    if (!subtitle) return;
    subtitle.innerText = text;
    subtitle.style.color = active ? '#10b981' : '';
}
