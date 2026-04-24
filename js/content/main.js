// js/content/main.js

if (window.hasRun) {
    // Prevent multiple injections
} else {
    window.hasRun = true;

    // Listen for messages from popup or background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'START_INSPECTOR_FOR_FIELD') {
            if (window.startInspector) window.startInspector(message.fieldId, message.mode);
            sendResponse({ status: 'inspector_started' });
        }
        else if (message.action === 'EXTRACT_DATA') {
            const data = window.executeExtraction ? window.executeExtraction(message.blueprint) : null;
            sendResponse(data);
        }
        else if (message.action === 'SCROLL_BOTTOM') {
            const blueprint = message.blueprint || {};
            let scrollTarget = window;
            let currentScrollHeight = document.body.scrollHeight;

            if (blueprint.singlePageOptions && blueprint.singlePageOptions.scrollContainerSelector) {
                const container = document.querySelector(blueprint.singlePageOptions.scrollContainerSelector);
                if (container) {
                    scrollTarget = container;
                    currentScrollHeight = container.scrollHeight;
                } else {
                    console.warn("Scroll container not found, falling back to window.");
                }
            }

            if (scrollTarget === window) {
                window.scrollBy(0, window.innerHeight);
            } else {
                scrollTarget.scrollBy(0, scrollTarget.clientHeight || 800);
            }

            setTimeout(() => sendResponse({ status: 'scrolled' }), 100);
            return true;
        }
        else if (message.action === 'START_AUTO_DETECT') {
            if (window.startAutoDetect) window.startAutoDetect();
            sendResponse({ status: 'started' });
        }
        else if (message.action === 'WAIT_FOR_ELEMENT') {
            if (window.waitForElement) {
                window.waitForElement(message.selector, 15000).then(found => {
                    sendResponse({ status: found ? 'found' : 'timeout' });
                });
            } else {
                sendResponse({ status: 'failed', error: 'Extractor not loaded' });
            }
            return true; // async
        }
        else if (message.action === 'CLICK_NEXT') {
            console.log("AI-Digger: CLICK_NEXT received for selector:", message.selector);
            const selectors = window.resolveSelectorArray ? window.resolveSelectorArray(message.selector) : [{type:'css', val: message.selector}];
            let el = null;
            for (let selObj of selectors) {
                let sel = selObj.val;
                try {
                    if (selObj.type === 'xpath' || sel.startsWith('//') || sel.startsWith('(')) {
                        el = document.evaluate(sel, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                    } else {
                        el = document.querySelector(sel);
                    }
                } catch(e) {}
                if (el) break;
            }

            if (el) {
                console.log("AI-Digger: Found next button, preparing to click...", el);
                el.scrollIntoView({ behavior: 'instant', block: 'center' });
                
                // Add highlight for visual feedback if user is watching
                const oldOutline = el.style.outline;
                el.style.outline = '3px solid #10b981';
                el.style.outlineOffset = '2px';

                setTimeout(() => {
                    try {
                        // Attempt multiple click methods for maximum compatibility
                        el.click();
                        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                        el.dispatchEvent(new PointerEvent('click', { bubbles: true }));
                        
                        console.log("AI-Digger: Click dispatched to:", el);
                        el.style.outline = oldOutline;
                        sendResponse({ status: 'clicked' });
                    } catch (err) {
                        console.error("AI-Digger: Click failed", err);
                        sendResponse({ status: 'error', message: err.message });
                    }
                }, 300);
            } else {
                console.warn("AI-Digger: Next button not found for selector:", message.selector);
                sendResponse({ status: 'not_found' });
            }
            return true; // async
        }
        else if (message.action === 'TEST_SELECTOR') {
            const result = window.extractFieldData ? window.extractFieldData(message.field) : "EXTRACTOR_NOT_LOADED";
            sendResponse({ result: result });
        }
        else if (message.action === 'GET_PAGE_TEXT') {
            try {
                const clone = document.body.cloneNode(true);
                clone.querySelectorAll('script, style, noscript, svg, iframe, path, meta, link').forEach(s => s.remove());
                const textNodes = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT, null, false);
                let node;
                while (node = textNodes.nextNode()) {
                    if (node.nodeValue.trim().length > 200) {
                        node.nodeValue = node.nodeValue.substring(0, 200) + '...';
                    }
                }
                sendResponse({ text: clone.innerHTML });
            } catch (e) {
                sendResponse({ text: document.body.innerText });
            }
        }
        else if (message.action === 'TOGGLE_MACRO_RECORDING') {
            if (message.isRecording) {
                if (window.startMacroRecording) window.startMacroRecording();
            } else {
                if (window.stopMacroRecording) window.stopMacroRecording();
            }
            sendResponse({ status: 'toggled' });
        }
        else if (message.action === 'EXECUTE_ACTION') {
            if (window.executeAction) {
                window.executeAction(message.actionData).then(result => {
                    sendResponse({ status: result ? 'success' : 'failed' });
                });
            } else {
                sendResponse({ status: 'failed' });
            }
            return true;
        }
        else if (message.action === 'SIMULATE_STEALTH') {
            if (window.StealthHelper) {
                window.StealthHelper.simulateHuman(message.level || 'advanced').then(() => {
                    sendResponse({ status: 'stealth_complete' });
                });
            } else {
                sendResponse({ status: 'failed', error: 'StealthHelper not loaded' });
            }
            return true;
        }
        return true;
    });
}