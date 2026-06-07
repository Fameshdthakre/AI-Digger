// js/content/inspector.js

var inspectorActive = false;
var hoveredElement = null;
var overlayBox = null;
var currentInspectFieldId = null;
var currentInspectMode = 'css';

function handleInspectorKeyDown(e) {
    if (e.key === 'Escape' && inspectorActive) {
        e.preventDefault();
        e.stopPropagation();
        // Capture fieldId BEFORE stopInspector() nullifies it
        var fieldId = currentInspectFieldId;
        stopInspector();
        chrome.runtime.sendMessage({ action: 'INSPECTOR_CANCELLED', fieldId: fieldId });
    }
}

function startInspector(fieldId, mode) {
    // If another mode is active (e.g. auto-detect), shut it down first
    if (typeof stopAutoDetect === 'function' && autoDetectActive) {
        stopAutoDetect();
        chrome.runtime.sendMessage({ action: 'AUTO_DETECT_RESULT', status: 'stopped' });
    }

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

    createInspectorUIPanel();
}

function stopInspector() {
    inspectorActive = false;
    document.body.style.cursor = 'default';
    if (overlayBox) {
        overlayBox.remove();
        overlayBox = null;
    }
    var ui = document.getElementById('ai-digger-inspector-ui');
    if (ui) ui.remove();
    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleInspectorKeyDown, true);
    currentInspectFieldId = null;
}

function createInspectorUIPanel() {
    // Remove any existing panel first
    var existing = document.getElementById('ai-digger-inspector-ui');
    if (existing) existing.remove();

    var ui = document.createElement('div');
    ui.id = 'ai-digger-inspector-ui';
    ui.style.position = 'fixed';
    ui.style.bottom = '20px';
    ui.style.right = '20px';
    ui.style.zIndex = '1000000';
    ui.style.background = '#3b82f6';
    ui.style.color = 'white';
    ui.style.padding = '12px 20px';
    ui.style.borderRadius = '8px';
    ui.style.fontFamily = 'sans-serif';
    ui.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
    ui.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 4px;">🔍 Visual Inspector Mode</div>
        <div style="font-size: 12px; margin-bottom: 8px;">
            ${currentInspectMode === 'parent' ? '<b>Click</b> on any item to automatically find its repeating parent container.' : '<b>Ctrl + Click</b> (or Cmd + Click) on an element to capture its AI selector.'}
        </div>
        <div style="font-size: 11px; margin-bottom: 12px; opacity: 0.8;">Press Esc to cancel</div>
        <button id="ai-digger-cancel-inspector" style="background: white; color: #3b82f6; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px;">Cancel</button>
    `;
    document.body.appendChild(ui);
    document.getElementById('ai-digger-cancel-inspector').addEventListener('click', function () {
        // Capture fieldId BEFORE stopInspector() nullifies it
        var fieldId = currentInspectFieldId;
        stopInspector();
        chrome.runtime.sendMessage({ action: 'INSPECTOR_CANCELLED', fieldId: fieldId });
    });
}

function handleMouseOver(e) {
    if (!inspectorActive) return;
    var ui = document.getElementById('ai-digger-inspector-ui');
    if (ui && ui.contains(e.target)) return;

    hoveredElement = e.target;

    const rect = hoveredElement.getBoundingClientRect();
    overlayBox.style.top = rect.top + 'px';
    overlayBox.style.left = rect.left + 'px';
    overlayBox.style.width = rect.width + 'px';
    overlayBox.style.height = rect.height + 'px';
}

function handleClick(e) {
    if (!inspectorActive) return;

    var ui = document.getElementById('ai-digger-inspector-ui');
    if (ui && ui.contains(e.target)) return;

    e.preventDefault();
    e.stopPropagation();

    var target = e.target;

    // 1. Generate the standard fallback selector locally
    var fallbackData = typeof generateResilientSelectors === 'function' ? generateResilientSelectors(target) : [{ type: 'css', val: '' }];
    var fallbackSelector = currentInspectMode === 'xpath' ? generateXPath(target) : fallbackData[0].val;

    // 2. Handle Parent Container Mode (📦)
    if (currentInspectMode === 'parent') {
        let itemContainer = target;
        let p = itemContainer.parentNode;
        while (p && p !== document.body) {
            if (p.children.length > 2 && p.children[0].tagName === p.children[1].tagName) {
                itemContainer = p.children[0]; // Take the first child as the template
                break;
            }
            p = p.parentNode;
        }

        var parentData = typeof generateResilientSelectors === 'function' ? generateResilientSelectors(itemContainer) : [{ type: 'css', val: '' }];
        var parentSelector = parentData[0].val;

        chrome.runtime.sendMessage({
            action: 'AI_SELECTOR_RESULT',
            fieldId: currentInspectFieldId,
            selector: parentSelector
        });
        stopInspector();
        return;
    }

    // 3. Technical Bypass: If CTRL or CMD is held, skip AI and instantly return the local selector
    if (e.ctrlKey || e.metaKey) {
        chrome.runtime.sendMessage({ action: 'INSPECTOR_RESULT', fieldId: currentInspectFieldId, selector: fallbackSelector });
        stopInspector();
        return;
    }

    // 4. Otherwise, proceed with AI Inspector
    target.setAttribute('data-ai-target', 'true');
    var contextNode = target.parentElement ? (target.parentElement.parentElement || target.parentElement) : target;
    var clone = contextNode.cloneNode(true);

    clone.querySelectorAll('script, style, svg, path, noscript').forEach(n => n.remove());
    var htmlSnippet = clone.outerHTML;
    target.removeAttribute('data-ai-target');

    var isContainer = currentInspectFieldId === 'item-container-selector';

    chrome.runtime.sendMessage({
        action: 'PROCESS_AI_INSPECTOR',
        fieldId: currentInspectFieldId,
        htmlSnippet: htmlSnippet,
        fallbackSelector: fallbackSelector,
        isContainer: isContainer
    });

    stopInspector();
}

function generateResilientSelectors(el) {
    const selectors = [];
    if (!el || el.tagName.toLowerCase() === 'html') return [{ type: 'css', val: 'html' }];

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