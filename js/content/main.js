// js/content/main.js

if (window.hasRun) {
    // Prevent multiple injections
} else {
    window.hasRun = true;

    // Listen for messages from popup or background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'START_INSPECTOR_FOR_FIELD') {
            startInspector(message.fieldId, message.mode);
            sendResponse({ status: 'inspector_started' });
        }
        else if (message.action === 'EXTRACT_DATA') {
            const data = executeExtraction(message.blueprint);
            // Do not double-send data directly. Background script handles the return value of EXTRACT_DATA.
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

            // Wait briefly for network/DOM updates (non-blocking for listener, handled by background sleep)
            setTimeout(() => sendResponse({ status: 'scrolled' }), 100);
            return true;
        }
        else if (message.action === 'START_AUTO_DETECT') {
            startAutoDetect();
            sendResponse({ status: 'started' });
        }
        else if (message.action === 'WAIT_FOR_ELEMENT') {
            waitForElement(message.selector, 15000).then(found => {
                sendResponse({ status: found ? 'found' : 'timeout' });
            });
            return true; // async
        }
        else if (message.action === 'CLICK_NEXT') {
            let sel = message.selector;
            let el = null;
            try {
                if (sel.startsWith('//') || sel.startsWith('(')) {
                    el = document.evaluate(sel, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                } else {
                    el = document.querySelector(sel);
                }
            } catch(e) { console.error("Invalid selector", e); }

            if (el) {
                el.click();
                sendResponse({ status: 'clicked' });
            } else {
                sendResponse({ status: 'not_found' });
            }
        }
        else if (message.action === 'TEST_SELECTOR') {
            const result = extractFieldData(message.field);
            sendResponse({ result: result });
        }
        else if (message.action === 'INJECT_AI_IDS') {
            if (window.injectAiIds) {
                window.injectAiIds();
            }
            sendResponse({ status: 'injected' });
        }
        else if (message.action === 'DRAW_BOXES') {
            let count = 0;
            if (window.drawBoundingBoxes) {
                count = window.drawBoundingBoxes();
            }
            sendResponse({ status: 'drawn', count });
        }
        else if (message.action === 'CLEAR_BOXES') {
            if (window.clearBoundingBoxes) {
                window.clearBoundingBoxes();
            }
            sendResponse({ status: 'cleared' });
        }
        else if (message.action === 'RESOLVE_BOX_ID') {
            const boxId = message.box_id;
            let finalSelector = null;
            if (window.visionBoxMapping && boxId && window.visionBoxMapping[boxId]) {
                const el = window.visionBoxMapping[boxId];
                if (window.generateResilientSelectors) {
                    const selectors = window.generateResilientSelectors(el);
                    finalSelector = selectors.length > 0 ? selectors[0].val : null;
                }
            }
            sendResponse({ selector: finalSelector });
        }
        else if (message.action === 'RESOLVE_AI_ID') {
            const ai_id = message.ai_id;
            let finalSelector = null;
            if (ai_id) {
                const el = document.querySelector(`[data-ai-id="${ai_id}"]`);
                if (el && window.generateResilientSelectors) {
                    const selectors = window.generateResilientSelectors(el);
                    finalSelector = selectors.length > 0 ? selectors[0].val : null;
                }
            }
            if (!message.keepIds && window.cleanAiIds) {
                window.cleanAiIds();
            }
            sendResponse({ selector: finalSelector });
        }
        else if (message.action === 'GET_PAGE_TEXT') {
            try {
                const clone = document.body.cloneNode(true);

                // 1. Remove garbage to save LLM tokens
                clone.querySelectorAll('script, style, noscript, svg, iframe, path, meta, link').forEach(s => s.remove());

                // 2. Clean up massive text blocks that bloat tokens
                const textNodes = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT, null, false);
                let node;
                while (node = textNodes.nextNode()) {
                    if (node.nodeValue.trim().length > 200) {
                        node.nodeValue = node.nodeValue.substring(0, 200) + '...';
                    }
                }

                sendResponse({ text: clone.innerHTML });
            } catch (e) {
                console.error("AI-Digger: DOM Pruner failed, falling back to innerText", e);
                sendResponse({ text: document.body.innerText });
            }
        }
        else if (message.action === 'TOGGLE_MACRO_RECORDING') {
            if (message.isRecording) {
                startMacroRecording();
            } else {
                stopMacroRecording();
            }
            sendResponse({ status: 'toggled' });
        }
        else if (message.action === 'EXECUTE_ACTION') {
            executeAction(message.actionData).then(result => {
                sendResponse({ status: result ? 'success' : 'failed' });
            });
            return true;
        }
        else if (message.action === 'SIMULATE_STEALTH') {
            simulateHumanStealth().then(() => {
                sendResponse({ status: 'stealth_complete' });
            });
            return true;
        }
        return true;
    });
}