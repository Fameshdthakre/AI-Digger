/**
 * content.js
 * Injected into all webpages. Handles the Visual Point-and-Click Inspector
 * and the actual DOM extraction logic when a job is running.
 */

if (window.hasRun) {
    // Prevent multiple injections
} else {
window.hasRun = true;

let inspectorActive = false;
let hoveredElement = null;
let overlayBox = null;
let currentInspectFieldId = null;
let currentInspectMode = 'css';

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_INSPECTOR_FOR_FIELD') {
        currentInspectFieldId = message.fieldId;
        currentInspectMode = message.mode || 'css';
        startInspector();
        sendResponse({ status: 'inspector_started' });
    } 
    else if (message.action === 'EXTRACT_DATA') {
        const data = executeExtraction(message.blueprint);
        chrome.runtime.sendMessage({ action: 'SAVE_PAGE_DATA', data: [data] });
        sendResponse(data);
    }
    else if (message.action === 'SCROLL_BOTTOM') {
        window.scrollBy(0, window.innerHeight);
        sendResponse({ status: 'scrolled' });
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
        const selector = message.selector;
        let el = null;
        try {
            if (selector.startsWith('//') || selector.startsWith('(')) { // crude xpath detection
                const xpathResult = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                el = xpathResult.singleNodeValue;
            } else {
                el = document.querySelector(selector);
            }
        } catch(e) {}

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
    else if (message.action === 'GET_PAGE_TEXT') {
        try {
            const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
            const clone = document.body.cloneNode(true);
            const scripts = clone.querySelectorAll('script, style, noscript, svg, iframe');
            scripts.forEach(s => s.remove());
            sendResponse({ text: turndownService.turndown(clone.innerHTML) });
        } catch (e) {
            sendResponse({ text: document.body.innerText.trim() });
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
    return true;
});

async function executeAction(actionData) {
    const { type, selector, text } = actionData;

    if (type === 'wait') {
        return await waitForElement(selector, 15000);
    }

    // For click and type, find element
    let el = null;
    try {
        if (selector.startsWith('//') || selector.startsWith('(')) {
            el = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        } else {
            el = document.querySelector(selector);
        }
    } catch(e) {}

    if (!el) return false;

    if (type === 'click') {
        el.click();
        return true;
    } else if (type === 'type') {
        el.value = text;
        // Dispatch events to trigger framework updates (React/Vue/Angular)
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    return false;
}

// ==========================================
// PHASE 1.5: MACRO RECORDER LOGIC
// ==========================================

let isRecordingMacro = false;

function startMacroRecording() {
    isRecordingMacro = true;
    document.addEventListener('click', handleMacroClick, { capture: true });
    document.addEventListener('change', handleMacroChange, { capture: true });
    console.log("Macro recording started.");
}

function stopMacroRecording() {
    isRecordingMacro = false;
    document.removeEventListener('click', handleMacroClick, { capture: true });
    document.removeEventListener('change', handleMacroChange, { capture: true });
    console.log("Macro recording stopped.");
}

function handleMacroClick(e) {
    if (!isRecordingMacro) return;
    // DO NOT prevent default. Let the user interact naturally.
    const selector = generateCssSelector(e.target);
    chrome.runtime.sendMessage({
        action: 'MACRO_ACTION_RECORDED',
        data: { type: 'click', selector: selector }
    });
}

function handleMacroChange(e) {
    if (!isRecordingMacro) return;
    const selector = generateCssSelector(e.target);
    chrome.runtime.sendMessage({
        action: 'MACRO_ACTION_RECORDED',
        data: { type: 'type', selector: selector, text: e.target.value }
    });
}

// ==========================================
// PHASE 1: VISUAL INSPECTOR LOGIC
// ==========================================

function startInspector() {
    // If already active, just clean up old overlay
    if (overlayBox) overlayBox.remove();

    inspectorActive = true;
    document.body.style.cursor = 'crosshair';
    
    // Create highlight overlay
    overlayBox = document.createElement('div');
    overlayBox.style.position = 'fixed';
    overlayBox.style.pointerEvents = 'none';
    overlayBox.style.zIndex = '999999';
    overlayBox.style.border = '2px solid #3b82f6';
    overlayBox.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
    overlayBox.style.transition = 'all 0.1s ease';
    document.body.appendChild(overlayBox);

    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('click', handleClick, true);
}

function stopInspector() {
    inspectorActive = false;
    document.body.style.cursor = 'default';
    if (overlayBox) overlayBox.remove();
    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('click', handleClick, true);
    currentInspectFieldId = null;
}

function handleMouseOver(e) {
    if (!inspectorActive) return;
    hoveredElement = e.target;
    
    const rect = hoveredElement.getBoundingClientRect();
    overlayBox.style.top = rect.top + 'px';
    overlayBox.style.left = rect.left + 'px';
    overlayBox.style.width = rect.width + 'px';
    overlayBox.style.height = rect.height + 'px';
}

function handleClick(e) {
    if (!inspectorActive) return;
    e.preventDefault();
    e.stopPropagation();
    
    let selector = "";
    if (currentInspectMode === 'xpath') {
        selector = generateXPath(hoveredElement);
    } else {
        selector = generateCssSelector(hoveredElement);
    }
    
    // Flash green to indicate selection
    overlayBox.style.backgroundColor = 'rgba(34, 197, 94, 0.4)';
    overlayBox.style.border = '2px solid #22c55e';

    // Send result back to sidepanel
    chrome.runtime.sendMessage({
        action: 'INSPECTOR_RESULT',
        fieldId: currentInspectFieldId,
        selector: selector
    });

    setTimeout(() => {
        stopInspector();
    }, 300);
}

// Generates a robust CSS selector
function generateCssSelector(el) {
    if (el.tagName.toLowerCase() === 'html') return 'html';
    
    let path = [];
    while (el.nodeType === Node.ELEMENT_NODE && el.tagName.toLowerCase() !== 'html') {
        let selector = el.tagName.toLowerCase();
        
        if (el.id) {
            selector += '#' + el.id;
            path.unshift(selector);
            break; // IDs are usually unique, we can stop here
        } else {
            let sib = el, nth = 1;
            while (sib = sib.previousElementSibling) {
                if (sib.tagName.toLowerCase() == selector) nth++;
            }
            if (nth != 1) selector += ":nth-of-type("+nth+")";
        }
        path.unshift(selector);
        el = el.parentNode;
    }
    return path.join(' > ');
}

// Generates a robust XPath
let autoDetectActive = false;

function startAutoDetect() {
    if (overlayBox) overlayBox.remove();

    autoDetectActive = true;
    document.body.style.cursor = 'crosshair';

    overlayBox = document.createElement('div');
    overlayBox.style.position = 'fixed';
    overlayBox.style.pointerEvents = 'none';
    overlayBox.style.zIndex = '999999';
    overlayBox.style.border = '3px dashed #8b5cf6';
    overlayBox.style.backgroundColor = 'rgba(139, 92, 246, 0.1)';
    overlayBox.style.transition = 'all 0.1s ease';
    document.body.appendChild(overlayBox);

    document.addEventListener('mouseover', handleAutoDetectMouseOver, true);
    document.addEventListener('click', handleAutoDetectClick, true);

    // Create UI helper prompt
    createAutoDetectUIPanel();
}

function stopAutoDetect() {
    autoDetectActive = false;
    document.body.style.cursor = 'default';
    if (overlayBox) overlayBox.remove();
    const ui = document.getElementById('ai-digger-auto-ui');
    if (ui) ui.remove();
    document.removeEventListener('mouseover', handleAutoDetectMouseOver, true);
    document.removeEventListener('click', handleAutoDetectClick, true);
}

function handleAutoDetectMouseOver(e) {
    if (!autoDetectActive) return;
    const ui = document.getElementById('ai-digger-auto-ui');
    if (ui && ui.contains(e.target)) return;

    hoveredElement = e.target;

    // Find closest container that has repeating children (like ul, grid, table, etc)
    const rect = hoveredElement.getBoundingClientRect();
    overlayBox.style.top = rect.top + 'px';
    overlayBox.style.left = rect.left + 'px';
    overlayBox.style.width = rect.width + 'px';
    overlayBox.style.height = rect.height + 'px';
}

function handleAutoDetectClick(e) {
    if (!autoDetectActive) return;
    const ui = document.getElementById('ai-digger-auto-ui');
    if (ui && ui.contains(e.target)) return;

    e.preventDefault();
    e.stopPropagation();

    // Highlight
    overlayBox.style.backgroundColor = 'rgba(34, 197, 94, 0.4)';
    overlayBox.style.border = '3px solid #22c55e';

    // Simple heuristic: walk up the DOM to find a repeating container
    let itemContainer = hoveredElement;
    let parent = itemContainer.parentNode;
    while (parent && parent !== document.body) {
        if (parent.children.length > 2 && parent.children[0].tagName === parent.children[1].tagName) {
            itemContainer = parent.children[0]; // Take the first child as the template
            break;
        }
        parent = parent.parentNode;
    }

    const fields = analyzeContainerForFields(itemContainer);

    chrome.runtime.sendMessage({ action: 'AUTO_DETECT_RESULT', fields: fields });

    setTimeout(() => {
        stopAutoDetect();
    }, 300);
}

function analyzeContainerForFields(container) {
    const fields = [];
    let fieldCounter = 1;

    // Root container class
    const containerClasses = Array.from(container.classList).join('.');
    const baseSelector = container.tagName.toLowerCase() + (containerClasses ? '.' + containerClasses : '');

    // Look for links
    const links = container.querySelectorAll('a');
    if (links.length > 0) {
        fields.push({
            name: "Link URL",
            selector: baseSelector + ' a',
            extractType: 'href'
        });

        if (links[0].innerText.trim()) {
            fields.push({
                name: "Link Text",
                selector: baseSelector + ' a',
                extractType: 'text'
            });
        }
    }

    // Look for images
    const images = container.querySelectorAll('img');
    if (images.length > 0) {
        fields.push({
            name: "Image Source",
            selector: baseSelector + ' img',
            extractType: 'src'
        });
    }

    // Look for headings (Titles)
    const headings = container.querySelectorAll('h1, h2, h3, h4, h5');
    if (headings.length > 0) {
        fields.push({
            name: "Title",
            selector: baseSelector + ' ' + headings[0].tagName.toLowerCase(),
            extractType: 'text'
        });
    }

    // Look for spans/divs with text (prices, descriptions)
    const textNodes = container.querySelectorAll('span, div, p');
    textNodes.forEach(node => {
        const text = node.innerText.trim();
        if (text && text.length > 0 && text.length < 100) {
            if (text.match(/^[\$€£]?\s*\d+[.,]?\d*\s*$/) || Array.from(node.classList).some(c => c.toLowerCase().includes('price') || c.toLowerCase().includes('title'))) {
                const nodeClass = Array.from(node.classList).join('.');
                if (nodeClass) {
                    const sel = baseSelector + ' ' + node.tagName.toLowerCase() + '.' + nodeClass;
                    if (!fields.some(f => f.selector === sel)) {
                        fields.push({
                            name: `Data ${fieldCounter++}`,
                            selector: sel,
                            extractType: 'text'
                        });
                    }
                }
            }
        }
    });

    if (fields.length === 0) {
        fields.push({
            name: "Item Text",
            selector: baseSelector,
            extractType: 'text'
        });
    }

    return fields;
}

function createAutoDetectUIPanel() {
    const ui = document.createElement('div');
    ui.id = 'ai-digger-auto-ui';
    ui.style.position = 'fixed';
    ui.style.bottom = '20px';
    ui.style.right = '20px';
    ui.style.zIndex = '1000000';
    ui.style.background = '#8b5cf6';
    ui.style.color = 'white';
    ui.style.padding = '12px 20px';
    ui.style.borderRadius = '8px';
    ui.style.fontFamily = 'sans-serif';
    ui.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
    ui.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 4px;">✨ Auto-Detect Mode</div>
        <div style="font-size: 12px; margin-bottom: 8px;">Click on a repeating item (like a product card or list row) to auto-generate selectors.</div>
        <button id="ai-digger-cancel-auto" style="background: white; color: #8b5cf6; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px;">Cancel</button>
    `;
    document.body.appendChild(ui);
    document.getElementById('ai-digger-cancel-auto').addEventListener('click', stopAutoDetect);
}

// Generates a robust XPath
function generateXPath(el) {
    if (el.id !== '') {
        return '//*[@id="' + el.id + '"]';
    }
    if (el === document.body) {
        return '/html/body';
    }

    let ix = 0;
    const siblings = el.parentNode.childNodes;
    for (let i = 0; i < siblings.length; i++) {
        const sibling = siblings[i];
        if (sibling === el) {
            return generateXPath(el.parentNode) + '/' + el.tagName.toLowerCase() + '[' + (ix + 1) + ']';
        }
        if (sibling.nodeType === 1 && sibling.tagName === el.tagName) {
            ix++;
        }
    }
}


// ==========================================
// PHASE 3/4: EXTRACTION ENGINE
// ==========================================

function formatValue(val, formatType) {
    if (!val || typeof val !== 'string') return val;

    switch (formatType) {
        case 'numbers':
            return val.replace(/[^0-9.]/g, '');
        case 'letters':
            return val.replace(/[^a-zA-Z\s]/g, '').trim();
        case 'email':
            const match = val.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
            return match ? match[1] : '';
        case 'trim':
            return val.replace(/\s+/g, ' ').trim();
        case 'raw':
        default:
            return val;
    }
}

function waitForElement(selector, timeoutMs = 15000) {
    return new Promise((resolve) => {
        let el = null;
        try {
            if (selector.startsWith('//') || selector.startsWith('(')) {
                el = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            } else {
                el = document.querySelector(selector);
            }
        } catch(e) {}

        if (el) return resolve(true);

        const observer = new MutationObserver(() => {
            let found = null;
            try {
                if (selector.startsWith('//') || selector.startsWith('(')) {
                    found = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                } else {
                    found = document.querySelector(selector);
                }
            } catch(e) {}

            if (found) {
                observer.disconnect();
                resolve(true);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => {
            observer.disconnect();
            resolve(false);
        }, timeoutMs);
    });
}

function extractFieldData(field) {
    if (field.type === 'ai') return null; // AI handled in background

    try {
        let elements = [];

        if (field.type === 'xpath') {
            const xpathResult = document.evaluate(field.selector, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            for (let i = 0; i < xpathResult.snapshotLength; i++) {
                elements.push(xpathResult.snapshotItem(i));
            }
        } else {
            elements = Array.from(document.querySelectorAll(field.selector));
        }

        if (elements.length === 0) {
            return field.multiple ? [] : null;
        }

        // Define extraction helper function
        const extractValue = (el) => {
            let val = "";
            if (field.extractType === 'text') {
                val = el.innerText ? el.innerText.trim() : "";
            } else if (field.extractType === 'html') {
                val = el.innerHTML;
            } else if (field.extractType === 'href' || field.extractType === 'src') {
                val = el.getAttribute(field.extractType) || "";
            } else if (field.extractType === 'attribute' && field.attributeName) {
                val = el.getAttribute(field.attributeName) || "";
            } else {
                val = el.innerText ? el.innerText.trim() : "";
            }
            return formatValue(val, field.format);
        };

        if (field.multiple) {
            return elements.map(extractValue);
        } else {
            return extractValue(elements[0]);
        }

    } catch (e) {
        console.error(`Error extracting field ${field.name}:`, e);
        return "ERROR";
    }
}

function executeExtraction(blueprint) {
    const result = {};
    result['URL'] = window.location.href;
    result['Timestamp'] = new Date().toISOString();

    let needsAi = false;

    blueprint.fields.forEach(field => {
        if (field.type === 'ai') {
            needsAi = true;
            return;
        }
        result[field.name] = extractFieldData(field);

        // Also capture failures for potential self-healing
        if (!result[field.name] || (Array.isArray(result[field.name]) && result[field.name].length === 0)) {
            if (!result['_failedFields']) result['_failedFields'] = [];
            result['_failedFields'].push(field);
            needsAi = true; // Turn on AI mode for self-healing
        }
    });

    if (needsAi) {
        // Use Turndown to convert DOM to Markdown
        try {
            const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
            // Remove noise tags like script and style before converting
            const clone = document.body.cloneNode(true);
            const scripts = clone.querySelectorAll('script, style, noscript, svg, iframe');
            scripts.forEach(s => s.remove());
            result['_pageMarkdown'] = turndownService.turndown(clone.innerHTML);
        } catch (err) {
            console.error("Turndown failed, falling back to innerText", err);
            result['_pageMarkdown'] = document.body.innerText.trim();
        }
    }

    return result;
}
}
