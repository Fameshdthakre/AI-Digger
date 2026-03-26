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
    return true;
});

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
            if (field.extractType === 'text') {
                return el.innerText ? el.innerText.trim() : "";
            } else if (field.extractType === 'html') {
                return el.innerHTML;
            } else if (field.extractType === 'href' || field.extractType === 'src') {
                return el.getAttribute(field.extractType);
            } else if (field.extractType === 'attribute' && field.attributeName) {
                return el.getAttribute(field.attributeName);
            } else {
                return el.innerText ? el.innerText.trim() : "";
            }
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
    });

    if (needsAi) {
        // Send page text back as a special field
        result['_pageText'] = document.body.innerText.trim();
    }

    return result;
}
}
