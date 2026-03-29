// js/content/auto-detect.js

var autoDetectActive = false;

function handleAutoDetectKeyDown(e) {
    if (e.key === 'Escape') {
        stopAutoDetect();
        chrome.runtime.sendMessage({ action: 'AUTO_DETECT_RESULT', status: 'stopped' });
    }
}

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
    document.addEventListener('keydown', handleAutoDetectKeyDown, true);

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
    document.removeEventListener('keydown', handleAutoDetectKeyDown, true);
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

    // Always block normal click behavior while inspecting
    e.preventDefault();
    e.stopPropagation();

    // Require Ctrl+Click (or Cmd+Click on Mac) to finalize selection
    if (!e.ctrlKey && !e.metaKey) return;

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
        <div style="font-size: 12px; margin-bottom: 8px;"><b>Ctrl + Click</b> (or Cmd + Click) on a repeating item (like a product card or list row) to auto-generate selectors.</div>
        <div style="font-size: 11px; margin-bottom: 12px; opacity: 0.8;">Press Esc to cancel</div>
        <button id="ai-digger-cancel-auto" style="background: white; color: #8b5cf6; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 12px;">Cancel</button>
    `;
    document.body.appendChild(ui);
    document.getElementById('ai-digger-cancel-auto').addEventListener('click', stopAutoDetect);
}