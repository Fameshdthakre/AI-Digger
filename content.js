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
let uiPanel = null;

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'TOGGLE_INSPECTOR') {
        if (inspectorActive) stopInspector();
        else startInspector();
        sendResponse({ status: 'inspector_toggled' });
    } 
    else if (message.action === 'EXTRACT_DATA') {
        const data = executeExtraction(message.blueprint);
        chrome.runtime.sendMessage({ action: 'SAVE_PAGE_DATA', data: [data] });
        sendResponse(data);
    }
    return true;
});

// ==========================================
// PHASE 1: VISUAL INSPECTOR LOGIC
// ==========================================

function startInspector() {
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
    
    createUIPanel();
}

function stopInspector() {
    inspectorActive = false;
    document.body.style.cursor = 'default';
    if (overlayBox) overlayBox.remove();
    if (uiPanel) uiPanel.remove();
    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('click', handleClick, true);
}

function handleMouseOver(e) {
    if (!inspectorActive || uiPanel.contains(e.target)) return;
    hoveredElement = e.target;
    
    const rect = hoveredElement.getBoundingClientRect();
    overlayBox.style.top = rect.top + 'px';
    overlayBox.style.left = rect.left + 'px';
    overlayBox.style.width = rect.width + 'px';
    overlayBox.style.height = rect.height + 'px';
}

function handleClick(e) {
    if (!inspectorActive || uiPanel.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    
    const selector = generateCssSelector(hoveredElement);
    const previewText = hoveredElement.innerText.trim().substring(0, 50);
    
    // Update the floating UI panel
    const shadowRoot = uiPanel.shadowRoot;
    shadowRoot.getElementById('selector-input').value = selector;
    shadowRoot.getElementById('preview-text').innerText = `Preview: ${previewText}...`;
    
    // Flash green to indicate selection
    overlayBox.style.backgroundColor = 'rgba(34, 197, 94, 0.4)';
    overlayBox.style.border = '2px solid #22c55e';
    setTimeout(() => {
        overlayBox.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
        overlayBox.style.border = '2px solid #3b82f6';
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

// Creates an isolated floating UI using Shadow DOM to avoid site CSS conflicts
function createUIPanel() {
    uiPanel = document.createElement('div');
    uiPanel.style.position = 'fixed';
    uiPanel.style.bottom = '20px';
    uiPanel.style.right = '20px';
    uiPanel.style.zIndex = '1000000';
    
    const shadow = uiPanel.attachShadow({mode: 'open'});
    shadow.innerHTML = `
        <style>
            .panel { font-family: system-ui, sans-serif; background: white; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); padding: 16px; width: 320px; border: 1px solid #e5e7eb; }
            h3 { margin: 0 0 12px 0; font-size: 16px; color: #111827; }
            label { font-size: 12px; color: #4b5563; font-weight: 600; display: block; margin-bottom: 4px; }
            input { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #d1d5db; border-radius: 4px; margin-bottom: 12px; font-family: monospace; font-size: 12px; }
            .preview { font-size: 12px; color: #6b7280; margin-bottom: 12px; font-style: italic; background: #f3f4f6; padding: 6px; border-radius: 4px;}
            .btn-group { display: flex; gap: 8px; }
            button { flex: 1; padding: 8px; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 13px; }
            .btn-save { background: #3b82f6; color: white; }
            .btn-cancel { background: #f3f4f6; color: #374151; }
        </style>
        <div class="panel">
            <h3>🔍 Universal Inspector</h3>
            <p style="font-size:12px; color:#6b7280; margin-top:-8px; margin-bottom:12px;">Click any element on the page to generate its selector.</p>
            
            <label>Generated CSS Selector</label>
            <input type="text" id="selector-input" placeholder="e.g. h1.title" readonly />
            
            <div class="preview" id="preview-text">Preview: (Click an element)</div>
            
            <div class="btn-group">
                <button class="btn-save" id="btn-copy">Copy to Clipboard</button>
                <button class="btn-cancel" id="btn-close">Close</button>
            </div>
        </div>
    `;
    
    shadow.getElementById('btn-close').addEventListener('click', stopInspector);
    shadow.getElementById('btn-copy').addEventListener('click', () => {
        const sel = shadow.getElementById('selector-input').value;
        navigator.clipboard.writeText(sel);
        shadow.getElementById('btn-copy').innerText = "Copied!";
        setTimeout(() => shadow.getElementById('btn-copy').innerText = "Copy to Clipboard", 2000);
    });

    document.body.appendChild(uiPanel);
}


// ==========================================
// PHASE 3/4: EXTRACTION ENGINE
// ==========================================

function executeExtraction(blueprint) {
    const result = {};
    result['URL'] = window.location.href;
    result['Timestamp'] = new Date().toISOString();

    let needsAi = false;

    blueprint.fields.forEach(field => {
        if (field.type === 'ai') {
            needsAi = true;
            return; // Skip AI fields here, handled in background
        }

        try {
            const elements = document.querySelectorAll(field.selector);
            if (elements.length === 0) {
                result[field.name] = null;
                return;
            }

            // For simplicity, we grab the first matching element per page for now.
            const el = elements[0];
            
            if (field.type === 'text' || field.type === 'css') {
                result[field.name] = el.innerText.trim();
            } else if (field.type === 'attribute' && field.attributeName) {
                result[field.name] = el.getAttribute(field.attributeName);
            } else if (field.type === 'html') {
                result[field.name] = el.innerHTML;
            }

        } catch (e) {
            console.error(`Error extracting field ${field.name}:`, e);
            result[field.name] = "ERROR";
        }
    });

    if (needsAi) {
        // Send page text back as a special field
        result['_pageText'] = document.body.innerText.trim();
    }

    return result;
}
}
