// === Global Variables ===
let fieldCount = 0;
let actionCount = 0;
const fieldsContainer = document.getElementById('fields-container');
const actionsContainer = document.getElementById('actions-container');

// === UI Logic ===

// Toast Notification System
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;

    container.appendChild(toast);

    // Trigger animation
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (container.contains(toast)) container.removeChild(toast);
        }, 300); // Wait for transition
    }, 3000);
}

// Subtitle Updaters
function updateActionSubtitle() {
    const subtitle = document.getElementById('subtitle-actions');
    if (!subtitle) return;
    const actions = document.querySelectorAll('#actions-container .field-row');
    subtitle.innerText = actions.length > 0 ? `${actions.length} action(s)` : 'None';
}

function updateContainerSubtitle() {
    const subtitle = document.getElementById('subtitle-container');
    if (!subtitle) return;
    const containerSel = document.getElementById('item-container-selector').value;
    const maxItems = document.getElementById('max-items').value;

    if (containerSel.trim() !== '') {
        const count = parseInt(maxItems) || 0;
        subtitle.innerText = count > 0 ? `Active (Max ${count})` : 'Active (All)';
        subtitle.style.color = '#10b981'; // Green indicator
    } else {
        subtitle.innerText = 'None';
        subtitle.style.color = '';
    }
}

function updatePaginationSubtitle() {
    const subtitle = document.getElementById('subtitle-pagination');
    if (!subtitle) return;
    const nextBtn = document.getElementById('next-button-selector').value;
    const maxPages = document.getElementById('max-pages').value;
    const infScroll = document.getElementById('enable-infinite-scroll').checked;

    let parts = [];
    if (nextBtn) parts.push(`Up to ${maxPages} pages`);
    if (infScroll) parts.push('Scroll first');

    subtitle.innerText = parts.length > 0 ? parts.join(', ') : 'No pagination';
}

function updateScheduleSubtitle() {
    const subtitle = document.getElementById('subtitle-schedule');
    if (!subtitle) return;
    const enabled = document.getElementById('enable-schedule').checked;
    const intervalSelect = document.getElementById('schedule-interval');
    if (enabled) {
        const text = intervalSelect.options[intervalSelect.selectedIndex].text;
        subtitle.innerText = text;
        subtitle.style.color = '#10b981'; // green indicator
    } else {
        subtitle.innerText = 'Off';
        subtitle.style.color = '';
    }
}

function updateAntiBotSubtitle() {
    const subtitle = document.getElementById('subtitle-antibot');
    if (!subtitle) return;
    const stealth = document.getElementById('enable-stealth-mode').checked;
    const min = document.getElementById('min-delay').value;
    const max = document.getElementById('max-delay').value;
    subtitle.innerText = `Stealth ${stealth ? 'On' : 'Off'}, ${min}-${max}s`;
}

// Bind subtitle updaters to inputs
document.getElementById('next-button-selector').addEventListener('input', updatePaginationSubtitle);
document.getElementById('max-pages').addEventListener('input', updatePaginationSubtitle);
document.getElementById('enable-infinite-scroll').addEventListener('change', updatePaginationSubtitle);

document.getElementById('enable-schedule').addEventListener('change', updateScheduleSubtitle);
document.getElementById('schedule-interval').addEventListener('change', updateScheduleSubtitle);

document.getElementById('enable-stealth-mode').addEventListener('change', updateAntiBotSubtitle);
document.getElementById('min-delay').addEventListener('input', updateAntiBotSubtitle);
document.getElementById('max-delay').addEventListener('input', updateAntiBotSubtitle);

document.getElementById('item-container-selector').addEventListener('input', updateContainerSubtitle);
document.getElementById('max-items').addEventListener('input', updateContainerSubtitle);

// Create observer for actions container to update subtitle when actions are added/removed
const actionsObserver = new MutationObserver(updateActionSubtitle);
actionsObserver.observe(document.getElementById('actions-container'), { childList: true });

// Tab Switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.target).classList.add('active');
        // updateStatus() will be defined in main.js, so we wrap it to ensure no error if accessed before ready
        if (typeof updateStatus === 'function') updateStatus();
    });
});

// Toggle visibility based on mode
document.getElementById('scrape-mode').addEventListener('change', (e) => {
    const isMulti = e.target.value === 'multi-url';
    document.getElementById('url-list-group').style.display = isMulti ? 'block' : 'none';
    document.getElementById('batch-settings-group').style.display = isMulti ? 'flex' : 'none';
    document.getElementById('single-page-settings').style.display = isMulti ? 'none' : 'block';
});

// Toggle scrolls input visibility
const enableScrolls = document.getElementById('enable-infinite-scroll');
const scrollsContainer = document.getElementById('scrolls-container');
enableScrolls.addEventListener('change', (e) => {
    scrollsContainer.style.display = e.target.checked ? 'block' : 'none';
});

// Scheduling toggle
const enableSchedule = document.getElementById('enable-schedule');
const scheduleIntervalGroup = document.getElementById('schedule-interval-group');
const scheduleTargetGroup = document.getElementById('schedule-target-group');
enableSchedule.addEventListener('change', (e) => {
    scheduleIntervalGroup.style.display = e.target.checked ? 'block' : 'none';
    scheduleTargetGroup.style.display = e.target.checked ? 'block' : 'none';
});

const scheduleTargetMode = document.getElementById('schedule-target-mode');
const scheduleStartUrlGroup = document.getElementById('schedule-start-url-group');
const scheduleMultipleUrlsGroup = document.getElementById('schedule-multiple-urls-group');

scheduleTargetMode.addEventListener('change', (e) => {
    scheduleStartUrlGroup.style.display = e.target.value === 'start-url' ? 'block' : 'none';
    scheduleMultipleUrlsGroup.style.display = e.target.value === 'multiple-urls' ? 'block' : 'none';
});

// Container input safeguard logic
const containerInput = document.getElementById('item-container-selector');
const outputFormatSelect = document.getElementById('output-format');

function updateUISafeguards() {
    const hasContainer = containerInput.value.trim() !== '';

    updateContainerSubtitle();

    // Toggle Output Format visibility
    if (outputFormatSelect.parentElement) {
        outputFormatSelect.parentElement.style.display = hasContainer ? 'none' : 'block';
    }

    // Toggle Max Items group
    const maxItemsGroup = document.getElementById('max-items-group');
    if (maxItemsGroup) {
        maxItemsGroup.style.display = hasContainer ? 'flex' : 'none';
    }

    // Toggle Field Level settings
    const pkRadios = document.querySelectorAll('.f-primary-key');
    const multipleCheckboxes = document.querySelectorAll('.f-multiple');

    pkRadios.forEach(radio => {
        const label = radio.parentElement;
        if (label) {
            label.style.display = hasContainer ? 'none' : 'flex';
        }
    });

    multipleCheckboxes.forEach(cb => {
        const label = cb.parentElement;
        if (label) {
            if (hasContainer) {
                cb.checked = false;
                cb.disabled = true;
                label.style.opacity = '0.5';
                label.title = 'Disabled when using Container Model';
            } else {
                cb.disabled = false;
                label.style.opacity = '1';
                label.title = 'Extract an Array of multiple items';
            }
        }
    });
}

containerInput.addEventListener('input', updateUISafeguards);

// Test Container Button
document.getElementById('test-container-btn').addEventListener('click', async () => {
    const selectorInput = document.getElementById('item-container-selector');
    if (!selectorInput.value) return;

    const testBtn = document.getElementById('test-container-btn');
    const previewBox = document.getElementById('container-preview-box');

    testBtn.innerText = '⏳';
    const fieldData = {
        name: 'Container Test',
        selector: selectorInput.value,
        type: 'css',
        extractType: 'count' // Special extract type handled in content script
    };

    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['turndown.js', 'js/content/inspector.js', 'js/content/macros.js', 'js/content/auto-detect.js', 'js/content/extractor.js', 'js/content/main.js']
    }).catch(err => console.error("Failed to inject content scripts:", err));

    chrome.tabs.sendMessage(tab.id, { action: 'TEST_SELECTOR', field: fieldData }, (response) => {
        if (chrome.runtime.lastError) return;
        testBtn.innerText = '🧪';
        previewBox.style.display = 'block';
        if (response && response.result !== undefined && response.result > 0) {
            previewBox.style.color = '#10b981';
            previewBox.innerText = `Found ${response.result} matching containers.`;
        } else {
            previewBox.style.color = '#ef4444';
            previewBox.innerText = "No containers found.";
        }
    });
});

// Test Scroll Container Button
document.getElementById('test-scroll-container-btn').addEventListener('click', async () => {
    const selectorInput = document.getElementById('scroll-container-selector');
    if (!selectorInput.value) return;

    const testBtn = document.getElementById('test-scroll-container-btn');
    const previewBox = document.getElementById('scroll-preview-box');

    testBtn.innerText = '⏳';
    const fieldData = {
        name: 'Scroll Container Test',
        selector: selectorInput.value,
        type: 'css',
        extractType: 'exists'
    };

    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['turndown.js', 'js/content/inspector.js', 'js/content/macros.js', 'js/content/auto-detect.js', 'js/content/extractor.js', 'js/content/main.js']
    }).catch(err => console.error("Failed to inject content scripts:", err));

    chrome.tabs.sendMessage(tab.id, { action: 'TEST_SELECTOR', field: fieldData }, (response) => {
        if (chrome.runtime.lastError) return;
        testBtn.innerText = '🧪';
        previewBox.style.display = 'block';
        if (response && response.result) {
            previewBox.style.color = '#10b981';
            previewBox.innerText = "Scroll container found!";
        } else {
            previewBox.style.color = '#ef4444';
            previewBox.innerText = "Scroll container not found.";
        }
    });
});

document.getElementById('inspect-scroll-container-btn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['turndown.js', 'js/content/inspector.js', 'js/content/macros.js', 'js/content/auto-detect.js', 'js/content/extractor.js', 'js/content/main.js'] }).catch(console.error);

    chrome.tabs.sendMessage(tab.id, { action: 'START_INSPECTOR_FOR_FIELD', fieldId: 'scroll-container-selector', mode: 'css' }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response && response.status === 'inspector_started') {
            const btn = document.getElementById('inspect-scroll-container-btn');
            btn.style.backgroundColor = 'var(--magic-bg)';
            btn.style.borderColor = 'var(--magic-border)';
            btn.innerText = '🎯';
        }
    });
});

// Inspect Container Button
document.getElementById('inspect-container-btn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['turndown.js', 'js/content/inspector.js', 'js/content/macros.js', 'js/content/auto-detect.js', 'js/content/extractor.js', 'js/content/main.js']
    }).catch(err => console.error("Failed to inject content scripts:", err));

    chrome.tabs.sendMessage(tab.id, { action: 'START_INSPECTOR_FOR_FIELD', fieldId: 'item-container-selector', mode: 'css' }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response && response.status === 'inspector_started') {
            const btn = document.getElementById('inspect-container-btn');
            btn.style.backgroundColor = 'var(--magic-bg)';
            btn.style.borderColor = 'var(--magic-border)';
            btn.innerText = '🎯';
        }
    });
});

// Test Next Button
document.getElementById('test-next-btn').addEventListener('click', async () => {
    const selectorInput = document.getElementById('next-button-selector');
    if (!selectorInput.value) return;

    const testBtn = document.getElementById('test-next-btn');
    const previewBox = document.getElementById('next-preview-box');

    testBtn.innerText = '⏳';
    const fieldData = {
        name: 'Next Button Test',
        selector: selectorInput.value,
        type: 'css',
        extractType: 'exists'
    };

    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['turndown.js', 'js/content/inspector.js', 'js/content/macros.js', 'js/content/auto-detect.js', 'js/content/extractor.js', 'js/content/main.js']
    }).catch(err => console.error("Failed to inject content scripts:", err));

    chrome.tabs.sendMessage(tab.id, { action: 'TEST_SELECTOR', field: fieldData }, (response) => {
        if (chrome.runtime.lastError) return;
        testBtn.innerText = '🧪';
        previewBox.style.display = 'block';
        if (response && response.result) {
            previewBox.style.color = '#10b981';
            previewBox.innerText = "Next button found!";
        } else {
            previewBox.style.color = '#ef4444';
            previewBox.innerText = "Next button not found.";
        }
    });
});

// Inspect Next Button
document.getElementById('inspect-next-btn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});

    // Inject script programmatically if it's not already there
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['turndown.js', 'js/content/inspector.js', 'js/content/macros.js', 'js/content/auto-detect.js', 'js/content/extractor.js', 'js/content/main.js']
    }).catch(err => console.error("Failed to inject content scripts:", err));

    chrome.tabs.sendMessage(tab.id, { action: 'START_INSPECTOR_FOR_FIELD', fieldId: 'next-button-selector', mode: 'css' }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response && response.status === 'inspector_started') {
            const btn = document.getElementById('inspect-next-btn');
            btn.style.backgroundColor = 'var(--magic-bg)';
            btn.style.borderColor = 'var(--magic-border)';
            btn.innerText = '🎯';
        }
    });
});

// Dynamic Field Management
function addFieldRow(name = '', selector = '', type = 'css', extractType = 'text', attrName = '', format = 'raw') {
    fieldCount++;
    const fieldId = `field_${Date.now()}_${fieldCount}`; // Unique ID for inspector mapping
    const div = document.createElement('div');
    div.className = 'field-row';
    div.id = fieldId;
    div.innerHTML = `
        <div class="field-row-top">
            <label class="checkbox-label" style="width: auto; margin-right: 4px;" title="Set as Primary Key">
                <input type="radio" name="primary-key-radio" class="f-primary-key" ${fieldCount === 1 ? 'checked' : ''} /> PK
            </label>
            <label class="checkbox-label" style="width: auto; margin-right: 4px;" title="Set as Detail URL">
                <input type="radio" name="detail-url-radio" class="f-detail-url" /> URL
            </label>
            <input type="text" placeholder="Field Name" class="f-name" value="${name}" style="flex: 1;" />
            <select class="f-type" style="width: 100px;">
                <option value="css" ${type === 'css' ? 'selected' : ''}>CSS</option>
                <option value="xpath" ${type === 'xpath' ? 'selected' : ''}>XPath</option>
                <option value="ai" ${type === 'ai' ? 'selected' : ''}>AI Prompt</option>
            </select>
            <select class="f-extract-target" style="width: 120px; ${type === 'ai' ? 'display: none;' : ''}">
                <option value="text" ${extractType === 'text' ? 'selected' : ''}>Text (innerText)</option>
                <option value="html" ${extractType === 'html' ? 'selected' : ''}>HTML (innerHTML)</option>
                <option value="href" ${extractType === 'href' ? 'selected' : ''}>Link (href)</option>
                <option value="src" ${extractType === 'src' ? 'selected' : ''}>Image (src)</option>
                <option value="attribute" ${extractType === 'attribute' ? 'selected' : ''}>Custom Attribute</option>
            </select>
            <input type="text" class="f-attr-name" placeholder="attr name" value="${attrName}" style="width: 80px; ${extractType === 'attribute' ? '' : 'display: none;'}" />
            <select class="f-format" style="width: 110px;">
                <option value="raw" ${format === 'raw' ? 'selected' : ''}>Raw Data</option>
                <option value="numbers" ${format === 'numbers' ? 'selected' : ''}>Numbers Only</option>
                <option value="letters" ${format === 'letters' ? 'selected' : ''}>Letters Only</option>
                <option value="email" ${format === 'email' ? 'selected' : ''}>Extract Email</option>
                <option value="trim" ${format === 'trim' ? 'selected' : ''}>Trim Whitespace</option>
            </select>
            <button class="remove-field" title="Remove Field">🗑️</button>
        </div>
        <div class="field-row-bottom">
            <button class="btn-wand" title="Describe to AI" style="flex-shrink: 0; padding: 4px 8px; font-size: 14px; background: transparent; border: 1px solid var(--border); border-radius: 4px; border-top-right-radius: 0; border-bottom-right-radius: 0; cursor: pointer; border-right: none; ${type === 'ai' ? 'display: none;' : ''}">🪄</button>
            <button class="btn-parent-wand" title="Find Parent Container with AI" style="flex-shrink: 0; padding: 4px 8px; font-size: 14px; background: transparent; border: 1px solid var(--border); border-radius: 4px; border-top-left-radius: 0; border-bottom-left-radius: 0; cursor: pointer; ${type === 'ai' ? 'display: none;' : ''}">📦</button>
            <button class="inspect-btn" title="Inspect Selector" style="${type === 'ai' ? 'display: none;' : ''}">🔍</button>
            <button class="test-btn" title="Test Selector" style="${type === 'ai' ? 'display: none;' : ''}">🧪</button>
            <input type="text" placeholder="CSS Selector, XPath, or AI Prompt" class="f-selector" value="${selector}" style="flex: 1;" />
            <label class="checkbox-label" style="width: auto; flex-shrink: 0; margin-left: auto; ${type === 'ai' ? 'display: none;' : ''}">
                <input type="checkbox" class="f-multiple" title="Extract an Array of multiple items" /> Array
            </label>
        </div>
        <div class="preview-box"></div>
    `;

    // Remove button logic
    div.querySelector('.remove-field').addEventListener('click', () => div.remove());

    // Type change logic (CSS/XPath/AI)
    const typeSelect = div.querySelector('.f-type');
    const targetSelect = div.querySelector('.f-extract-target');
    const attrInput = div.querySelector('.f-attr-name');
    const selectorInput = div.querySelector('.f-selector');
    const inspectBtn = div.querySelector('.inspect-btn');
    const testBtn = div.querySelector('.test-btn');
    const previewBox = div.querySelector('.preview-box');

    const multipleLabel = div.querySelector('.f-multiple').parentElement;

    typeSelect.addEventListener('change', (e) => {
        if (e.target.value === 'ai') {
            targetSelect.style.display = 'none';
            attrInput.style.display = 'none';
            inspectBtn.style.display = 'none';
            testBtn.style.display = 'none';
            previewBox.style.display = 'none';
            multipleLabel.style.display = 'none';
            selectorInput.placeholder = "e.g. What is the product price?";
        } else {
            targetSelect.style.display = 'block';
            if (targetSelect.value === 'attribute') {
                attrInput.style.display = 'block';
            }
            inspectBtn.style.display = 'flex';
            testBtn.style.display = 'flex';
            multipleLabel.style.display = 'flex';
            selectorInput.placeholder = e.target.value === 'xpath' ? "XPath (e.g. //h1[@class='title'])" : "CSS Selector (e.g. h1.title)";
        }
    });

    // Extract target change logic (Text/HTML/Href/etc)
    targetSelect.addEventListener('change', (e) => {
        if (e.target.value === 'attribute') {
            attrInput.style.display = 'block';
        } else {
            attrInput.style.display = 'none';
        }
    });

    // Inspect button logic
    inspectBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});

        // Inject script programmatically if it's not already there
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['turndown.js', 'js/content/inspector.js', 'js/content/macros.js', 'js/content/auto-detect.js', 'js/content/extractor.js', 'js/content/main.js']
        }).catch(err => console.error("Failed to inject content scripts:", err));

        const mode = typeSelect.value; // css or xpath

        chrome.tabs.sendMessage(tab.id, { action: 'START_INSPECTOR_FOR_FIELD', fieldId: fieldId, mode: mode }, (response) => {
            if (chrome.runtime.lastError) return;
            if (response && response.status === 'inspector_started') {
                // Change button style to indicate it's active
                inspectBtn.style.backgroundColor = 'var(--magic-bg)';
                inspectBtn.style.borderColor = 'var(--magic-border)';
                inspectBtn.innerText = '🎯';
            }
        });
    });

    // Test button logic
    testBtn.addEventListener('click', async () => {
        if (!selectorInput.value) return;

        testBtn.innerText = '⏳';
        const fieldData = {
            name: div.querySelector('.f-name').value || 'Preview',
            selector: selectorInput.value,
            type: typeSelect.value,
            extractType: targetSelect.value,
            attributeName: attrInput.value,
            multiple: div.querySelector('.f-multiple').checked,
            format: div.querySelector('.f-format') ? div.querySelector('.f-format').value : 'raw'
        };

        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['turndown.js', 'js/content/inspector.js', 'js/content/macros.js', 'js/content/auto-detect.js', 'js/content/extractor.js', 'js/content/main.js']
        }).catch(err => console.error("Failed to inject content scripts:", err));

        chrome.tabs.sendMessage(tab.id, { action: 'TEST_SELECTOR', field: fieldData }, (response) => {
            if (chrome.runtime.lastError) return;
            testBtn.innerText = '🧪';
            previewBox.style.display = 'block';
            if (response && response.result !== undefined && response.result !== null) {
                previewBox.style.color = 'var(--text-main)';
                previewBox.innerText = typeof response.result === 'object' ? JSON.stringify(response.result, null, 2) : response.result;
            } else {
                previewBox.style.color = '#ef4444';
                previewBox.innerText = "No results found or error occurred.";
            }
        });
    });

    fieldsContainer.appendChild(div);
    updateUISafeguards(); // Apply dynamic safeguards to the new field
}

// === Pre-Extraction Actions Logic ===
function addActionRow(type = 'click', selector = '', text = '') {
    actionCount++;
    const actionId = `action_${Date.now()}_${actionCount}`;
    const div = document.createElement('div');
    div.className = 'field-row';
    div.id = actionId;
    div.style.padding = '8px';
    div.innerHTML = `
        <div style="display: flex; gap: 8px; align-items: center;">
            <select class="a-type" style="width: 100px;">
                <option value="click" ${type === 'click' ? 'selected' : ''}>Click</option>
                <option value="type" ${type === 'type' ? 'selected' : ''}>Type Text</option>
                <option value="wait" ${type === 'wait' ? 'selected' : ''}>Wait For</option>
            </select>
            <button class="btn-wand" title="Describe to AI" style="flex-shrink: 0; padding: 4px 8px; font-size: 14px; background: transparent; border: 1px solid var(--border); border-radius: 4px; border-top-right-radius: 0; border-bottom-right-radius: 0; cursor: pointer; border-right: none;">🪄</button>
            <button class="btn-parent-wand" title="Find Parent Container with AI" style="flex-shrink: 0; padding: 4px 8px; font-size: 14px; background: transparent; border: 1px solid var(--border); border-radius: 4px; border-top-left-radius: 0; border-bottom-left-radius: 0; cursor: pointer;">📦</button>
            <button class="inspect-btn a-inspect" title="Inspect Selector" style="flex-shrink: 0;">🔍</button>
            <button class="test-btn a-test" title="Test Action" style="flex-shrink: 0;">🧪</button>
            <input type="text" placeholder="CSS or XPath Selector" class="a-selector" value="${selector}" style="flex: 1;" />
            <input type="text" placeholder="Text to type" class="a-text" value="${text}" style="width: 120px; ${type === 'type' ? '' : 'display: none;'}" />
            <button class="remove-field" style="position: static;" title="Remove Action">🗑️</button>
        </div>
        <div class="preview-box a-preview" style="margin-top: 8px;"></div>
    `;

    div.querySelector('.remove-field').addEventListener('click', () => div.remove());

    const typeSelect = div.querySelector('.a-type');
    const textInput = div.querySelector('.a-text');
    const inspectBtn = div.querySelector('.a-inspect');
    const testBtn = div.querySelector('.a-test');
    const selectorInput = div.querySelector('.a-selector');
    const previewBox = div.querySelector('.a-preview');

    typeSelect.addEventListener('change', (e) => {
        textInput.style.display = e.target.value === 'type' ? 'block' : 'none';
    });

    testBtn.addEventListener('click', async () => {
        if (!selectorInput.value) return;

        testBtn.innerText = '⏳';
        const fieldData = {
            name: 'Action Test',
            selector: selectorInput.value,
            type: 'css', // Let content script guess based on selector shape
            extractType: 'exists'
        };

        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['turndown.js', 'js/content/inspector.js', 'js/content/macros.js', 'js/content/auto-detect.js', 'js/content/extractor.js', 'js/content/main.js']
        }).catch(err => console.error("Failed to inject content scripts:", err));

        chrome.tabs.sendMessage(tab.id, { action: 'TEST_SELECTOR', field: fieldData }, (response) => {
            if (chrome.runtime.lastError) return;
            testBtn.innerText = '🧪';
            previewBox.style.display = 'block';
            if (response && response.result) {
                previewBox.style.color = '#10b981';
                previewBox.innerText = "Element found!";
            } else {
                previewBox.style.color = '#ef4444';
                previewBox.innerText = "Element not found.";
            }
        });
    });

    inspectBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['turndown.js', 'js/content/inspector.js', 'js/content/macros.js', 'js/content/auto-detect.js', 'js/content/extractor.js', 'js/content/main.js']
        }).catch(err => console.error(err));

        chrome.tabs.sendMessage(tab.id, { action: 'START_INSPECTOR_FOR_FIELD', fieldId: actionId, mode: 'css' }, (response) => {
            if (chrome.runtime.lastError) return;
            if (response && response.status === 'inspector_started') {
                inspectBtn.style.backgroundColor = 'var(--magic-bg)';
                inspectBtn.style.borderColor = 'var(--magic-border)';
                inspectBtn.innerText = '🎯';
            }
        });
    });

    actionsContainer.appendChild(div);
}

document.getElementById('add-action').addEventListener('click', () => addActionRow());
document.getElementById('add-field').addEventListener('click', () => addFieldRow());

// Initialize Default Fields
function loadDefaultFields() {
    fieldsContainer.innerHTML = '';
    fieldCount = 0;
    addFieldRow('Product Name', 'h1', 'css', 'text');
    addFieldRow('Product Link', 'a.product-link', 'css', 'href');
    addFieldRow('Summary', 'Summarize the product in one sentence', 'ai');
}
loadDefaultFields();

// === AI Settings Logic ===

// Toggle Password Visibility
document.querySelectorAll('.toggle-vis').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const targetId = e.currentTarget.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (input.type === 'password') {
            input.type = 'text';
            e.currentTarget.innerText = '👁️'; // Open eye: password is now visible
        } else {
            input.type = 'password';
            e.currentTarget.innerText = '🙈'; // Closed eye: password is now hidden
        }
    });
});

// Highlight active provider card
const platformSelect = document.getElementById('default-ai-platform');
platformSelect.addEventListener('change', (e) => {
    document.querySelectorAll('.provider-card').forEach(card => card.classList.remove('active-provider'));
    document.getElementById(`card-${e.target.value}`).classList.add('active-provider');
});

// Theme Selection Logic
const appThemeSelect = document.getElementById('app-theme');
appThemeSelect.addEventListener('change', (e) => {
    const theme = e.target.value;
    if (theme === 'system') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
});

// Save Settings
document.getElementById('btn-save-settings').addEventListener('click', () => {
    const settings = {
        theme: appThemeSelect.value,
        aiPlatform: platformSelect.value,
        openai: { key: document.getElementById('key-openai').value, model: document.getElementById('model-openai').value },
        gemini: { key: document.getElementById('key-gemini').value, model: document.getElementById('model-gemini').value },
        claude: { key: document.getElementById('key-claude').value, model: document.getElementById('model-claude').value }
    };

    chrome.storage.sync.set({ aiSettings: settings }, () => {
        showToast("AI Settings saved successfully!", "success");
    });
});

// Load Settings
chrome.storage.sync.get(['aiSettings'], (result) => {
    if (result.aiSettings) {
        const s = result.aiSettings;
        if (s.theme) {
            appThemeSelect.value = s.theme;
            appThemeSelect.dispatchEvent(new Event('change'));
        }
        if (s.aiPlatform) {
            platformSelect.value = s.aiPlatform;
            platformSelect.dispatchEvent(new Event('change'));
        }
        if (s.openai) { document.getElementById('key-openai').value = s.openai.key || ''; document.getElementById('model-openai').value = s.openai.model || 'gpt-4o'; }
        if (s.gemini) { document.getElementById('key-gemini').value = s.gemini.key || ''; document.getElementById('model-gemini').value = s.gemini.model || 'gemini-2.5-flash'; }
        if (s.claude) { document.getElementById('key-claude').value = s.claude.key || ''; document.getElementById('model-claude').value = s.claude.model || 'claude-3-5-sonnet-20241022'; }
    } else {
        platformSelect.dispatchEvent(new Event('change')); // trigger initial highlight
        // Set default models
        document.getElementById('model-openai').value = 'gpt-4o';
        document.getElementById('model-gemini').value = 'gemini-2.5-flash';
        document.getElementById('model-claude').value = 'claude-3-5-sonnet-20241022';
    }
});