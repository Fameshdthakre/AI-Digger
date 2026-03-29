// js/content/inspector.js

var inspectorActive = false;
var hoveredElement = null;
var overlayBox = null;
var currentInspectFieldId = null;
var currentInspectMode = 'css';

function handleInspectorKeyDown(e) {
    if (e.key === 'Escape') {
        stopInspector();
        // Send empty response to unblock if needed
        chrome.runtime.sendMessage({ action: 'INSPECTOR_RESULT', fieldId: currentInspectFieldId, selector: '' });
    }
}

function startInspector(fieldId, mode) {
    currentInspectFieldId = fieldId;
    currentInspectMode = mode || 'css';

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
    document.addEventListener('keydown', handleInspectorKeyDown, true);
}

function stopInspector() {
    inspectorActive = false;
    document.body.style.cursor = 'default';
    if (overlayBox) overlayBox.remove();
    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleInspectorKeyDown, true);
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

    // Always block normal click behavior while inspecting
    e.preventDefault();
    e.stopPropagation();

    // Require Ctrl+Click (or Cmd+Click on Mac) to finalize selection
    if (!e.ctrlKey && !e.metaKey) return;

    // Generate resilient selectors
    const selectors = generateResilientSelectors(hoveredElement);

    // Fallback if we only want xpath
    let finalSelector = JSON.stringify(selectors);
    if (currentInspectMode === 'xpath') {
        finalSelector = generateXPath(hoveredElement);
    } else {
        // Just send the first resilient one as a plain string if it's not JSON
        finalSelector = JSON.stringify(selectors);
    }

    // Flash green to indicate selection
    overlayBox.style.backgroundColor = 'rgba(34, 197, 94, 0.4)';
    overlayBox.style.border = '2px solid #22c55e';

    // Send result back to sidepanel
    chrome.runtime.sendMessage({
        action: 'INSPECTOR_RESULT',
        fieldId: currentInspectFieldId,
        selector: finalSelector
    });

    setTimeout(() => {
        stopInspector();
    }, 300);
}

function generateResilientSelectors(el) {
    const selectors = [];
    if (!el || el.tagName.toLowerCase() === 'html') return [{type: 'css', val: 'html'}];

    const tagName = el.tagName.toLowerCase();

    // 1. High-Priority Custom Data Attributes
    const stableAttributes = ['data-testid', 'data-asin', 'data-id', 'data-component', 'data-cy', 'aria-label', 'name', 'role'];
    for (let attr of stableAttributes) {
        if (el.hasAttribute(attr)) {
            const val = el.getAttribute(attr).replace(/"/g, '\\"');
            selectors.push({ type: 'attribute', val: `${tagName}[${attr}="${val}"]` });
            break; // Got a highly stable one, stop looking for attributes
        }
    }

    // 2. Semantic Class Filtering
    if (el.classList.length > 0) {
        const semanticClasses = Array.from(el.classList).filter(cls => {
            // Filter out common utility frameworks and generated hashes
            if (/^(tw-|css-|js-|ng-|v-|md:|[0-9]+$)/i.test(cls)) return false;
            // Filter out highly generic positional or state classes
            if (['active', 'disabled', 'hidden', 'show', 'flex', 'block', 'w-full', 'row', 'col'].includes(cls)) return false;
            return true;
        });

        if (semanticClasses.length > 0) {
            // Use the first semantic class
            selectors.push({ type: 'semantic-class', val: `${tagName}.${semanticClasses[0]}` });
        }
    }

    // 3. Structural ID (Fall back to ID if it exists and looks non-random)
    if (el.id && !/\d+/.test(el.id)) {
        selectors.push({ type: 'css', val: `#${el.id}` });
    }

    // 4. Absolute structural fallback
    selectors.push({ type: 'xpath', val: generateXPath(el) });

    return selectors;
}

// Keep old generateCssSelector around for macro recorder, but make it use the new logic for first element
function generateCssSelector(el) {
    const resilient = generateResilientSelectors(el);
    return resilient[0].val;
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