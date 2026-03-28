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
    subtitle.innerText = `Stealth ${stealth ? 'On' : 'Off'}, ${(min/1000).toFixed(1)}-${(max/1000).toFixed(1)}s`;
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
        updateStatus(); // Refresh stats when changing tabs
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

    // Toggle Output Format visibility
    if (outputFormatSelect.parentElement) {
        outputFormatSelect.parentElement.style.display = hasContainer ? 'none' : 'block';
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
        files: ['turndown.js', 'content.js']
    }).catch(err => console.error("Failed to inject content.js:", err));

    chrome.tabs.sendMessage(tab.id, { action: 'TEST_SELECTOR', field: fieldData }, (response) => {
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

// Inspect Container Button
document.getElementById('inspect-container-btn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['turndown.js', 'content.js']
    }).catch(err => console.error("Failed to inject content.js:", err));

    chrome.tabs.sendMessage(tab.id, { action: 'START_INSPECTOR_FOR_FIELD', fieldId: 'item-container-selector', mode: 'css' }, (response) => {
        if (response && response.status === 'inspector_started') {
            const btn = document.getElementById('inspect-container-btn');
            btn.style.backgroundColor = '#e0f2fe';
            btn.style.borderColor = '#3b82f6';
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
        files: ['turndown.js', 'content.js']
    }).catch(err => console.error("Failed to inject content.js:", err));

    chrome.tabs.sendMessage(tab.id, { action: 'TEST_SELECTOR', field: fieldData }, (response) => {
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
        files: ['turndown.js', 'content.js']
    }).catch(err => console.error("Failed to inject content.js:", err));

    chrome.tabs.sendMessage(tab.id, { action: 'START_INSPECTOR_FOR_FIELD', fieldId: 'next-button-selector', mode: 'css' }, (response) => {
        if (response && response.status === 'inspector_started') {
            const btn = document.getElementById('inspect-next-btn');
            btn.style.backgroundColor = '#e0f2fe';
            btn.style.borderColor = '#3b82f6';
            btn.innerText = '🎯';
        }
    });
});

// Dynamic Field Management
const fieldsContainer = document.getElementById('fields-container');
let fieldCount = 0;

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
            files: ['turndown.js', 'content.js']
        }).catch(err => console.error("Failed to inject content.js:", err));

        const mode = typeSelect.value; // css or xpath

        chrome.tabs.sendMessage(tab.id, { action: 'START_INSPECTOR_FOR_FIELD', fieldId: fieldId, mode: mode }, (response) => {
            if (response && response.status === 'inspector_started') {
                // Change button style to indicate it's active
                inspectBtn.style.backgroundColor = '#e0f2fe';
                inspectBtn.style.borderColor = '#3b82f6';
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
            files: ['turndown.js', 'content.js']
        }).catch(err => console.error("Failed to inject content.js:", err));

        chrome.tabs.sendMessage(tab.id, { action: 'TEST_SELECTOR', field: fieldData }, (response) => {
            testBtn.innerText = '🧪';
            previewBox.style.display = 'block';
            if (response && response.result !== undefined && response.result !== null) {
                previewBox.style.color = '#374151';
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
const actionsContainer = document.getElementById('actions-container');
let actionCount = 0;

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
            files: ['turndown.js', 'content.js']
        }).catch(err => console.error("Failed to inject content.js:", err));

        chrome.tabs.sendMessage(tab.id, { action: 'TEST_SELECTOR', field: fieldData }, (response) => {
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
            files: ['turndown.js', 'content.js']
        }).catch(err => console.error(err));

        chrome.tabs.sendMessage(tab.id, { action: 'START_INSPECTOR_FOR_FIELD', fieldId: actionId, mode: 'css' }, (response) => {
            if (response && response.status === 'inspector_started') {
                inspectBtn.style.backgroundColor = '#e0f2fe';
                inspectBtn.style.borderColor = '#3b82f6';
                inspectBtn.innerText = '🎯';
            }
        });
    });

    actionsContainer.appendChild(div);
}

document.getElementById('add-action').addEventListener('click', () => addActionRow());

// Visual Macro Recorder Logic
let isRecordingMacro = false;
document.getElementById('btn-record-macro').addEventListener('click', async () => {
    const btn = document.getElementById('btn-record-macro');
    isRecordingMacro = !isRecordingMacro;

    if (isRecordingMacro) {
        btn.innerText = '⏹ Stop Recording';
        btn.style.backgroundColor = '#fee2e2'; // Light red
    } else {
        btn.innerText = '🔴 Record Actions';
        btn.style.backgroundColor = 'transparent';
    }

    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['turndown.js', 'content.js']
    }).catch(err => console.error(err));

    chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_MACRO_RECORDING', isRecording: isRecordingMacro });
});

// Listener for Macro Actions
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'MACRO_ACTION_RECORDED') {
        addActionRow(message.data.type, message.data.selector, message.data.text || '');
        sendResponse({ status: 'received' });
    }
    // Need to return true? Not strictly necessary if not async, but good practice
    return true;
});


document.getElementById('add-field').addEventListener('click', () => addFieldRow());

// Magic Build Logic
document.getElementById('btn-generate-blueprint').addEventListener('click', async () => {
    const btn = document.getElementById('btn-generate-blueprint');
    const promptText = document.getElementById('nl-prompt').value;
    if (!promptText) {
        showToast("Please enter a description of what you want to scrape.", "error");
        return;
    }

    btn.innerText = 'Generating...';
    btn.disabled = true;

    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['turndown.js', 'content.js']
    }).catch(err => console.error(err));

    chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_TEXT' }, (response) => {
        if (response && response.text) {
            chrome.runtime.sendMessage({
                action: 'MAGIC_BUILD_BLUEPRINT',
                userPrompt: promptText,
                pageText: response.text
            });
        } else {
            btn.innerText = 'Generate Blueprint';
            btn.disabled = false;
            showToast("Could not extract text from page to analyze.", "error");
        }
    });
});


// Auto-Detect Logic
document.getElementById('btn-auto-detect').addEventListener('click', async () => {
    const btn = document.getElementById('btn-auto-detect');
    btn.innerText = 'Scanning...';
    btn.disabled = true;

    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['turndown.js', 'content.js']
    }).catch(err => console.error(err));

    chrome.tabs.sendMessage(tab.id, { action: 'START_AUTO_DETECT' }, (response) => {
        if (!response || response.status !== 'started') {
            btn.innerText = '✨ Auto-Detect Data';
            btn.disabled = false;
        }
    });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'AUTO_DETECT_RESULT') {
        const btn = document.getElementById('btn-auto-detect');
        btn.innerText = '✨ Auto-Detect Data';
        btn.disabled = false;

        if (message.fields && message.fields.length > 0) {
            fieldsContainer.innerHTML = '';
            fieldCount = 0;
            message.fields.forEach(f => {
                addFieldRow(f.name, f.selector, 'css', f.extractType || 'text');
                const newRow = fieldsContainer.lastElementChild;
                const cb = newRow.querySelector('.f-multiple');
                if (cb) cb.checked = true; // Auto-detect implies arrays
            });
        }
        sendResponse({ status: 'received' });
    } else if (message.action === 'AI_ANALYZE_RESULT') {
        const btn = document.getElementById('btn-ai-analyze');
        btn.innerText = '🤖 AI Analysis';
        btn.disabled = false;

        if (message.error) {
            showToast(`AI Analysis failed: ${message.error}`, "error");
        } else if (message.fields && message.fields.length > 0) {
            fieldsContainer.innerHTML = '';
            fieldCount = 0;
            message.fields.forEach(f => {
                addFieldRow(f.name, f.selector, f.type || 'css', f.extractType || 'text', f.attributeName || '', f.format || 'raw');
                const newRow = fieldsContainer.lastElementChild;
                const cb = newRow.querySelector('.f-multiple');
                if (cb) cb.checked = f.multiple || false;
            });
        }
        sendResponse({ status: 'received' });
    } else if (message.action === 'MAGIC_BUILD_RESULT') {
        const btn = document.getElementById('btn-generate-blueprint');
        btn.innerText = 'Generate Blueprint';
        btn.disabled = false;

        if (message.error) {
            showToast(`Magic Build failed: ${message.error}`, "error");
        } else if (message.blueprint) {
            const bp = message.blueprint;

            if (bp.jobName) document.getElementById('job-name').value = bp.jobName;

            if (bp.scrapingType) {
                document.getElementById('scrape-mode').value = bp.scrapingType;
                document.getElementById('scrape-mode').dispatchEvent(new Event('change'));
            }

            if (bp.containerSelector) {
                document.getElementById('item-container-selector').value = bp.containerSelector;
            }

            if (bp.singlePageOptions) {
                if (bp.singlePageOptions.nextButtonSelector) {
                    document.getElementById('next-button-selector').value = bp.singlePageOptions.nextButtonSelector;
                }
                if (bp.singlePageOptions.maxPages) {
                    document.getElementById('max-pages').value = bp.singlePageOptions.maxPages;
                }
                if (bp.singlePageOptions.infiniteScroll !== undefined) {
                    document.getElementById('enable-infinite-scroll').checked = bp.singlePageOptions.infiniteScroll;
                    document.getElementById('enable-infinite-scroll').dispatchEvent(new Event('change'));
                }
                if (bp.singlePageOptions.maxScrolls) {
                    document.getElementById('max-scrolls').value = bp.singlePageOptions.maxScrolls;
                }
            }

            if (bp.fields && bp.fields.length > 0) {
                fieldsContainer.innerHTML = '';
                fieldCount = 0;
                bp.fields.forEach(f => {
                    addFieldRow(f.name, f.selector, f.type || 'css', f.extractType || 'text', f.attributeName || '', f.format || 'raw');
                    const newRow = fieldsContainer.lastElementChild;
                    const cb = newRow.querySelector('.f-multiple');
                    if (cb) cb.checked = f.multiple || false;
                });
            }
        }
        sendResponse({ status: 'received' });
    }
    return true;
});

// AI Analyze Logic
document.getElementById('btn-ai-analyze').addEventListener('click', async () => {
    const btn = document.getElementById('btn-ai-analyze');
    btn.innerText = 'Analyzing...';
    btn.disabled = true;

    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['turndown.js', 'content.js']
    }).catch(err => console.error(err));

    chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_TEXT' }, (response) => {
        if (response && response.text) {
            chrome.runtime.sendMessage({ action: 'ANALYZE_PAGE_AI', text: response.text });
        } else {
            btn.innerText = '🤖 AI Analysis';
            btn.disabled = false;
            showToast("Could not extract text from page to analyze.", "error");
        }
    });
});

// Initialize Default Fields
function loadDefaultFields() {
    fieldsContainer.innerHTML = '';
    fieldCount = 0;
    addFieldRow('Product Name', 'h1', 'css', 'text');
    addFieldRow('Product Link', 'a.product-link', 'css', 'href');
    addFieldRow('Summary', 'Summarize the product in one sentence', 'ai');
}
loadDefaultFields();

// === Saved Jobs Logic ===
let savedJobs = {};

const DEFAULT_RECIPES = {
    "[Template] Amazon Product Search": {
        jobName: "[Template] Amazon Product Search",
        scrapingType: "single-page",
        outputFormat: "flat",
        primaryKeyField: "Product Title",
        containerSelector: "div[data-component-type='s-search-result']",
        singlePageOptions: {
            nextButtonSelector: "a.s-pagination-next",
            maxPages: 3,
            infiniteScroll: false,
            maxScrolls: 5
        },
        fields: [
            { name: "Product Title", selector: "h2 a span", type: "css", extractType: "text", multiple: false, format: "raw" },
            { name: "Price", selector: ".a-price-whole", type: "css", extractType: "text", multiple: false, format: "raw" },
            { name: "Product Link", selector: "h2 a", type: "css", extractType: "href", multiple: false, format: "raw" }
        ],
        actions: [],
        antiBot: { stealthMode: true, minDelayMs: 3000, maxDelayMs: 6000, batchSize: 10, batchPauseMs: 10000 }
    },
    "[Template] LinkedIn Company Data": {
        jobName: "[Template] LinkedIn Company Data",
        scrapingType: "single-page",
        outputFormat: "flat",
        primaryKeyField: "Company Name",
        containerSelector: ".org-top-card-summary-info-list",
        singlePageOptions: { maxPages: 1, infiniteScroll: false },
        fields: [
            { name: "Company Name", selector: "h1", type: "css", extractType: "text", multiple: false, format: "raw" },
            { name: "Website", selector: "a.link-without-visited-state", type: "css", extractType: "href", multiple: false, format: "raw" },
            { name: "Industry", selector: ".org-top-card-summary-info-list__info-item", type: "css", extractType: "text", multiple: false, format: "raw" }
        ],
        actions: [],
        antiBot: { stealthMode: true, minDelayMs: 2000, maxDelayMs: 5000, batchSize: 10, batchPauseMs: 10000 }
    },
    "[Template] Generic Blog Scraper": {
        jobName: "[Template] Generic Blog Scraper",
        scrapingType: "single-page",
        outputFormat: "flat",
        primaryKeyField: "Article Title",
        containerSelector: "article",
        singlePageOptions: {
            nextButtonSelector: "a.next, .pagination-next",
            maxPages: 5,
            infiniteScroll: false
        },
        fields: [
            { name: "Article Title", selector: "h2", type: "css", extractType: "text", multiple: false, format: "raw" },
            { name: "Author", selector: ".author", type: "css", extractType: "text", multiple: false, format: "raw" },
            { name: "Publish Date", selector: "time", type: "css", extractType: "text", multiple: false, format: "raw" },
            { name: "Link", selector: "a", type: "css", extractType: "href", multiple: false, format: "raw" }
        ],
        actions: [],
        antiBot: { stealthMode: false, minDelayMs: 1000, maxDelayMs: 3000, batchSize: 0, batchPauseMs: 10000 }
    }
};

function updateSavedJobsDropdown(selectedJobName = null) {
    const select = document.getElementById('saved-jobs-select');
    select.innerHTML = '<option value="">-- Create a new job --</option>';
    const detailSelect = document.getElementById('linked-detail-job');
    const currentDetailJob = detailSelect.value;
    detailSelect.innerHTML = '<option value="">-- None --</option>';

    for (const jobName in savedJobs) {
        const option = document.createElement('option');
        option.value = jobName;
        option.innerText = jobName;
        if (jobName === selectedJobName) option.selected = true;
        select.appendChild(option);

        // Populate detail job dropdown
        if (jobName !== document.getElementById('job-name').value) {
            const detailOption = document.createElement('option');
            detailOption.value = jobName;
            detailOption.innerText = jobName;
            if (jobName === currentDetailJob) detailOption.selected = true;
            detailSelect.appendChild(detailOption);
        }
    }
}

// Update detail jobs dropdown when job name changes to prevent self-linking
document.getElementById('job-name').addEventListener('input', () => {
    updateSavedJobsDropdown(document.getElementById('saved-jobs-select').value);
});

chrome.storage.local.get(['savedJobs'], (result) => {
    savedJobs = { ...DEFAULT_RECIPES, ...(result.savedJobs || {}) };
    updateSavedJobsDropdown();
});

function getBlueprintFromUI() {
    let primaryKeyField = null;
    const pkRadios = document.querySelectorAll('.f-primary-key');
    pkRadios.forEach((radio, index) => {
        if (radio.checked) {
            const row = radio.closest('.field-row');
            primaryKeyField = row.querySelector('.f-name').value;
        }
    });

    // Fallback if none checked
    if (!primaryKeyField && pkRadios.length > 0) {
        primaryKeyField = pkRadios[0].closest('.field-row').querySelector('.f-name').value;
    }

    let detailUrlField = null;
    const urlRadios = document.querySelectorAll('.f-detail-url');
    urlRadios.forEach((radio) => {
        if (radio.checked) {
            const row = radio.closest('.field-row');
            detailUrlField = row.querySelector('.f-name').value;
        }
    });

    return {
        jobName: document.getElementById('job-name').value,
        scrapingType: document.getElementById('scrape-mode').value,
        outputFormat: document.getElementById('output-format').value,
        primaryKeyField: primaryKeyField,
        detailUrlField: detailUrlField,
        linkedDetailJob: document.getElementById('linked-detail-job').value,
        maxDetailPages: parseInt(document.getElementById('max-detail-pages').value),
        urls: document.getElementById('url-list').value,
        webhookUrl: document.getElementById('webhook-url').value,
        containerSelector: document.getElementById('item-container-selector').value,
        schedule: {
            enabled: document.getElementById('enable-schedule').checked,
            interval: parseInt(document.getElementById('schedule-interval').value) || 60,
            targetMode: document.getElementById('schedule-target-mode').value,
            startUrl: document.getElementById('schedule-start-url').value,
            multipleUrls: document.getElementById('schedule-multiple-urls').value
        },
        actions: Array.from(document.getElementById('actions-container').querySelectorAll('.field-row')).map(row => ({
            type: row.querySelector('.a-type').value,
            selector: row.querySelector('.a-selector').value,
            text: row.querySelector('.a-text').value
        })).filter(a => a.selector),
        fields: Array.from(document.getElementById('fields-container').querySelectorAll('.field-row')).map(row => ({
            name: row.querySelector('.f-name').value,
            selector: row.querySelector('.f-selector').value,
            type: row.querySelector('.f-type').value,
            extractType: row.querySelector('.f-extract-target').value,
            attributeName: row.querySelector('.f-attr-name').value,
            multiple: row.querySelector('.f-multiple') ? row.querySelector('.f-multiple').checked : false,
            format: row.querySelector('.f-format') ? row.querySelector('.f-format').value : 'raw'
        })).filter(f => f.name && f.selector),
        antiBot: {
            stealthMode: document.getElementById('enable-stealth-mode').checked,
            minDelayMs: parseInt(document.getElementById('min-delay').value),
            maxDelayMs: parseInt(document.getElementById('max-delay').value),
            batchSize: parseInt(document.getElementById('batch-size').value),
            batchPauseMs: parseInt(document.getElementById('batch-pause').value)
        },
        singlePageOptions: {
            nextButtonSelector: document.getElementById('next-button-selector').value,
            maxPages: parseInt(document.getElementById('max-pages').value),
            infiniteScroll: document.getElementById('enable-infinite-scroll').checked,
            maxScrolls: parseInt(document.getElementById('max-scrolls').value)
        }
    };
}

function handleSaveJobClick(btnElement) {
    const blueprint = getBlueprintFromUI();
    if (!blueprint.jobName) {
        showToast("Please enter a Job Name in the text box below to save it.", "error");
        return;
    }

    if (blueprint.jobName.startsWith("[Template]")) {
        showToast("You cannot overwrite a Template. Please use the 'Clone' button or change the Job Name.", "error");
        return;
    }

    // Don't save default recipes to local storage to save space, only custom ones
    const jobsToSave = { ...savedJobs };
    for (const key in DEFAULT_RECIPES) {
        delete jobsToSave[key];
    }

    jobsToSave[blueprint.jobName] = blueprint;
    savedJobs[blueprint.jobName] = blueprint; // update local memory too

    chrome.storage.local.set({ savedJobs: jobsToSave }, () => {
        updateSavedJobsDropdown(blueprint.jobName);

        // Notify background to update schedules
        chrome.runtime.sendMessage({ action: 'UPDATE_SCHEDULES' });

        const origText = btnElement.innerText;
        btnElement.innerText = 'Saved!';
        btnElement.style.backgroundColor = '#10b981'; // Green
        btnElement.style.borderColor = '#10b981';
        btnElement.style.color = '#ffffff';
        setTimeout(() => {
            btnElement.innerText = origText;
            btnElement.style.backgroundColor = '';
            btnElement.style.borderColor = '';
            btnElement.style.color = '';
        }, 2000);
        showToast(`Job "${blueprint.jobName}" saved successfully.`, "success");
    });
}

document.getElementById('btn-save-job-footer').addEventListener('click', function() { handleSaveJobClick(this); });

document.getElementById('saved-jobs-select').addEventListener('change', (e) => {
    const jobName = e.target.value;
    if (!jobName) {
        // Reset to default new state
        document.getElementById('job-name').value = "My Scraper Job";
        document.getElementById('url-list').value = "";
        document.getElementById('webhook-url').value = '';
        document.getElementById('item-container-selector').value = '';

        document.getElementById('scrape-mode').value = 'single-page';
        document.getElementById('scrape-mode').dispatchEvent(new Event('change'));
        document.getElementById('output-format').value = 'flat';

        document.getElementById('linked-detail-job').value = '';
        document.getElementById('max-detail-pages').value = 10;

        // Reset Pagination
        document.getElementById('next-button-selector').value = '';
        document.getElementById('max-pages').value = 1;
        document.getElementById('enable-infinite-scroll').checked = false;
        document.getElementById('enable-infinite-scroll').dispatchEvent(new Event('change'));
        document.getElementById('max-scrolls').value = 5;

        // Reset Automation
        document.getElementById('enable-schedule').checked = false;
        document.getElementById('enable-schedule').dispatchEvent(new Event('change'));
        document.getElementById('schedule-interval').value = 60;
        document.getElementById('schedule-target-mode').value = 'active-tab';
        document.getElementById('schedule-target-mode').dispatchEvent(new Event('change'));
        document.getElementById('schedule-start-url').value = '';
        document.getElementById('schedule-multiple-urls').value = '';

        // Reset Anti-Bot
        document.getElementById('enable-stealth-mode').checked = false;
        document.getElementById('min-delay').value = 2000;
        document.getElementById('max-delay').value = 5000;
        document.getElementById('batch-size').value = 10;
        document.getElementById('batch-pause').value = 10000;

        actionsContainer.innerHTML = '';
        actionCount = 0;
        loadDefaultFields();

        // Crucial: Update UI Safeguards to re-show PK buttons based on empty container
        updateUISafeguards();
        return;
    }

    const blueprint = savedJobs[jobName];
    if (!blueprint) return;

    // Set Basic Info
    document.getElementById('job-name').value = blueprint.jobName;
    updateSavedJobsDropdown(jobName); // Ensure detail job dropdown excludes current job
    document.getElementById('linked-detail-job').value = blueprint.linkedDetailJob || '';
    document.getElementById('max-detail-pages').value = blueprint.maxDetailPages || 10;
    document.getElementById('scrape-mode').value = blueprint.scrapingType;
    document.getElementById('scrape-mode').dispatchEvent(new Event('change'));
    if (blueprint.outputFormat) {
        document.getElementById('output-format').value = blueprint.outputFormat;
    }
    document.getElementById('url-list').value = blueprint.urls || '';
    document.getElementById('webhook-url').value = blueprint.webhookUrl || '';
    document.getElementById('item-container-selector').value = blueprint.containerSelector || '';

    // Trigger safeguard update after value set
    updateUISafeguards();

    // Set Anti-Bot
    if (blueprint.antiBot) {
        document.getElementById('enable-stealth-mode').checked = blueprint.antiBot.stealthMode || false;
        document.getElementById('min-delay').value = blueprint.antiBot.minDelayMs || 2000;
        document.getElementById('max-delay').value = blueprint.antiBot.maxDelayMs || 5000;
        document.getElementById('batch-size').value = blueprint.antiBot.batchSize || 10;
        document.getElementById('batch-pause').value = blueprint.antiBot.batchPauseMs || 10000;
    } else {
        document.getElementById('enable-stealth-mode').checked = false;
    }

    // Set Schedule Options
    if (blueprint.schedule) {
        document.getElementById('enable-schedule').checked = blueprint.schedule.enabled || false;
        document.getElementById('enable-schedule').dispatchEvent(new Event('change'));
        if (blueprint.schedule.interval) {
            document.getElementById('schedule-interval').value = blueprint.schedule.interval;
        }
        if (blueprint.schedule.targetMode) {
            document.getElementById('schedule-target-mode').value = blueprint.schedule.targetMode;
            document.getElementById('schedule-target-mode').dispatchEvent(new Event('change'));
        }
        document.getElementById('schedule-start-url').value = blueprint.schedule.startUrl || '';
        document.getElementById('schedule-multiple-urls').value = blueprint.schedule.multipleUrls || '';
    } else {
        document.getElementById('enable-schedule').checked = false;
        document.getElementById('enable-schedule').dispatchEvent(new Event('change'));
    }

    // Set Single Page Options
    if (blueprint.singlePageOptions) {
        document.getElementById('next-button-selector').value = blueprint.singlePageOptions.nextButtonSelector || '';
        document.getElementById('max-pages').value = blueprint.singlePageOptions.maxPages || 1;
        document.getElementById('enable-infinite-scroll').checked = blueprint.singlePageOptions.infiniteScroll || false;
        document.getElementById('enable-infinite-scroll').dispatchEvent(new Event('change'));
        document.getElementById('max-scrolls').value = blueprint.singlePageOptions.maxScrolls || 5;
    }

    // Set Actions
    actionsContainer.innerHTML = '';
    actionCount = 0;
    if (blueprint.actions && blueprint.actions.length > 0) {
        blueprint.actions.forEach(a => {
            addActionRow(a.type, a.selector, a.text);
        });
    }

    // Set Fields
    fieldsContainer.innerHTML = '';
    fieldCount = 0;
    if (blueprint.fields && blueprint.fields.length > 0) {
        blueprint.fields.forEach(f => {
            addFieldRow(f.name, f.selector, f.type, f.extractType, f.attributeName, f.format || 'raw');
            // Need to set the multiple checkbox manually as addFieldRow doesn't accept it
            const newRow = fieldsContainer.lastElementChild;
            const cb = newRow.querySelector('.f-multiple');
            if (cb) cb.checked = f.multiple || false;

            // Set primary key
            if (blueprint.primaryKeyField === f.name) {
                const pkRadio = newRow.querySelector('.f-primary-key');
                if (pkRadio) pkRadio.checked = true;
            }

            // Set detail URL
            if (blueprint.detailUrlField === f.name) {
                const urlRadio = newRow.querySelector('.f-detail-url');
                if (urlRadio) urlRadio.checked = true;
            }
        });
    } else {
        loadDefaultFields();
    }
});

document.getElementById('btn-delete-job').addEventListener('click', () => {
    const jobName = document.getElementById('saved-jobs-select').value;
    if (!jobName || !savedJobs[jobName]) {
        showToast("Please select a job to delete.", "info");
        return;
    }

    if (jobName.startsWith("[Template]")) {
        showToast("Templates cannot be deleted.", "error");
        return;
    }

    if (confirm(`Are you sure you want to delete the saved job "${jobName}"?`)) {
        delete savedJobs[jobName];

        const jobsToSave = { ...savedJobs };
        for (const key in DEFAULT_RECIPES) {
            delete jobsToSave[key];
        }

        chrome.storage.local.set({ savedJobs: jobsToSave }, () => {
            updateSavedJobsDropdown();
            // Reset to default new state
            document.getElementById('saved-jobs-select').value = "";
            document.getElementById('saved-jobs-select').dispatchEvent(new Event('change'));
            showToast("Job deleted.", "success");
        });
    }
});

document.getElementById('btn-clone-job').addEventListener('click', () => {
    const jobName = document.getElementById('saved-jobs-select').value;
    if (!jobName || !savedJobs[jobName]) {
        showToast("Please select a job to clone.", "info");
        return;
    }

    let clonedName = jobName;
    if (clonedName.startsWith("[Template] ")) {
        clonedName = clonedName.replace("[Template] ", "Copy of ");
    } else {
        clonedName = `Copy of ${clonedName}`;
    }

    document.getElementById('job-name').value = clonedName;

    // Switch dropdown to "Create a new job" so saving will create a new entry
    document.getElementById('saved-jobs-select').value = "";

    showToast(`Job cloned as "${clonedName}". Click Save.`, "success");
});

// Import / Export Blueprint Logic
document.getElementById('btn-export-job').addEventListener('click', () => {
    const jobName = document.getElementById('saved-jobs-select').value;
    if (!jobName || !savedJobs[jobName]) {
        showToast("Please select a saved job to export.", "info");
        return;
    }
    const blueprint = savedJobs[jobName];
    const jsonStr = JSON.stringify(blueprint, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
        url: url,
        filename: `${jobName}_blueprint.json`,
        saveAs: true
    });
});

document.getElementById('btn-import-job').addEventListener('click', () => {
    document.getElementById('import-file-input').click();
});

document.getElementById('import-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const importedBlueprint = JSON.parse(event.target.result);
            if (!importedBlueprint.jobName || !importedBlueprint.fields || !Array.isArray(importedBlueprint.fields)) {
                throw new Error("Invalid blueprint format. Missing 'jobName' or 'fields' array.");
            }

            savedJobs[importedBlueprint.jobName] = importedBlueprint;
            chrome.storage.local.set({ savedJobs: savedJobs }, () => {
                updateSavedJobsDropdown(importedBlueprint.jobName);

                // Programmatically trigger the change event to populate the UI
                const select = document.getElementById('saved-jobs-select');
                select.dispatchEvent(new Event('change'));

                showToast(`Successfully imported job: ${importedBlueprint.jobName}`, "success");
            });
        } catch (err) {
            showToast(`Failed to import blueprint: ${err.message}`, "error");
        }

        // Reset the file input so the same file can be imported again if needed
        e.target.value = '';
    };
    reader.readAsText(file);
});


// === AI Settings Logic ===

// Toggle Password Visibility
document.querySelectorAll('.toggle-vis').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const targetId = e.currentTarget.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (input.type === 'password') {
            input.type = 'text';
            e.currentTarget.innerText = '🙈';
        } else {
            input.type = 'password';
            e.currentTarget.innerText = '👁️';
        }
    });
});

// Highlight active provider card
const platformSelect = document.getElementById('default-ai-platform');
platformSelect.addEventListener('change', (e) => {
    document.querySelectorAll('.provider-card').forEach(card => card.classList.remove('active-provider'));
    document.getElementById(`card-${e.target.value}`).classList.add('active-provider');
});

// Save Settings
document.getElementById('btn-save-settings').addEventListener('click', () => {
    const settings = {
        aiPlatform: platformSelect.value,
        openai: { key: document.getElementById('key-openai').value, model: document.getElementById('model-openai').value },
        gemini: { key: document.getElementById('key-gemini').value, model: document.getElementById('model-gemini').value },
        claude: { key: document.getElementById('key-claude').value, model: document.getElementById('model-claude').value }
    };
    
    chrome.storage.sync.set({ aiSettings: settings }, () => {
        const msg = document.getElementById('settings-msg');
        msg.style.display = 'block';
        setTimeout(() => msg.style.display = 'none', 3000);
    });
});

// Load Settings
chrome.storage.sync.get(['aiSettings'], (result) => {
    if (result.aiSettings) {
        const s = result.aiSettings;
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

// === Extension Logic ===

// Listen for inspector results from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'INSPECTOR_RESULT') {
        const { fieldId, selector } = message;

        if (fieldId === 'item-container-selector') {
            const selectorInput = document.getElementById('item-container-selector');
            if (selectorInput) {
                selectorInput.value = selector;
                selectorInput.dispatchEvent(new Event('input')); // Trigger safeguard logic
            }

            const inspectBtn = document.getElementById('inspect-container-btn');
            if (inspectBtn) {
                inspectBtn.style.backgroundColor = 'var(--surface)';
                inspectBtn.style.borderColor = 'var(--border)';
                inspectBtn.innerText = '🔍';
            }
        } else if (fieldId === 'next-button-selector') {
            const selectorInput = document.getElementById('next-button-selector');
            if (selectorInput) selectorInput.value = selector;

            const inspectBtn = document.getElementById('inspect-next-btn');
            if (inspectBtn) {
                inspectBtn.style.backgroundColor = 'var(--surface)';
                inspectBtn.style.borderColor = 'var(--border)';
                inspectBtn.innerText = '🔍';
            }
        } else if (fieldId.startsWith('action_')) {
            const actionRow = document.getElementById(fieldId);
            if (actionRow) {
                const selectorInput = actionRow.querySelector('.a-selector');
                if (selectorInput) selectorInput.value = selector;
                const inspectBtn = actionRow.querySelector('.a-inspect');
                if (inspectBtn) {
                    inspectBtn.style.backgroundColor = 'var(--surface)';
                    inspectBtn.style.borderColor = 'var(--border)';
                    inspectBtn.innerText = '🔍';
                }
            }
        } else {
            const fieldRow = document.getElementById(fieldId);
            if (fieldRow) {
                const selectorInput = fieldRow.querySelector('.f-selector');
                if (selectorInput) selectorInput.value = selector;

                // Reset button style
                const inspectBtn = fieldRow.querySelector('.inspect-btn');
                if (inspectBtn) {
                    inspectBtn.style.backgroundColor = 'var(--surface)';
                    inspectBtn.style.borderColor = 'var(--border)';
                    inspectBtn.innerText = '🔍';
                }
            }
        }
        sendResponse({ status: 'received' });
    }
    return true;
});


// 2. Start Job
document.getElementById('btn-start').addEventListener('click', () => {
    const blueprint = getBlueprintFromUI();

    chrome.runtime.sendMessage({ action: 'START_JOB', blueprint }, () => {
        // Switch to run tab
        document.querySelector('[data-target="view-run"]').click();
        updateStatus();
    });
});

// 3. Stop Job
document.getElementById('btn-stop').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'STOP_JOB' }, updateStatus);
});

// 4. Update Status and Stats
function updateStatus() {
    chrome.runtime.sendMessage({ action: 'GET_STATUS' }, (response) => {
        if(!response) return;
        document.getElementById('stat-count').innerText = response.scrapedCount || 0;
        
        const progContainer = document.getElementById('progress-container');
        const progBar = document.getElementById('job-progress');
        const progText = document.getElementById('progress-text');
        const logsCard = document.getElementById('logs-card');
        const logsBox = document.getElementById('job-logs');

        if (response.isRunning) {
            if (response.isDeepCrawling) {
                document.getElementById('status-indicator').innerText = "Deep Crawling Inner Pages...";
                document.getElementById('status-indicator').style.color = "#a855f7"; // Purple
            } else {
                document.getElementById('status-indicator').innerText = "Scraping in progress...";
                document.getElementById('status-indicator').style.color = "#22c55e"; // Green
            }
            document.getElementById('btn-stop').style.display = 'block';

            if (response.jobProgress && response.jobProgress.total > 0) {
                progContainer.style.display = 'block';
                progBar.max = response.jobProgress.total;
                progBar.value = response.jobProgress.current;

                if (response.isDeepCrawling) {
                    progText.innerText = `Deep Crawl: ${response.jobProgress.current} / ${response.jobProgress.total}`;
                } else {
                    progText.innerText = `${response.jobProgress.current} / ${response.jobProgress.total}`;
                }
            }

            if (response.jobLogs && response.jobLogs.length > 0) {
                logsCard.style.display = 'flex';
                logsBox.innerText = response.jobLogs.join('\n');
                logsBox.scrollTop = logsBox.scrollHeight;
            }
        } else {
            document.getElementById('status-indicator').innerText = "Idle";
            document.getElementById('status-indicator').style.color = "var(--text-muted)";
            document.getElementById('btn-stop').style.display = 'none';
            progContainer.style.display = 'none';

            // Keep logs visible if there are any from a recently finished job
            if (response.jobLogs && response.jobLogs.length > 0) {
                logsCard.style.display = 'flex';
                logsBox.innerText = response.jobLogs.join('\n');
                logsBox.scrollTop = logsBox.scrollHeight;
            }
        }
    });
}

// 5. Export CSV logic (Phase 4)
document.getElementById('btn-export-csv').addEventListener('click', () => {
    chrome.storage.local.get(['scrapedData'], (result) => {
        const data = result.scrapedData;
        if (!data || data.length === 0) {
            showToast("No data to export!", "info");
            return;
        }

        // Gather ALL unique headers across all rows in case some rows have missing keys
        const headerSet = new Set();
        data.forEach(row => Object.keys(row).forEach(k => headerSet.add(k)));
        const headers = Array.from(headerSet);

        const csvRows = [];
        // Header row
        csvRows.push(headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(','));

        for (const row of data) {
            const values = headers.map(header => {
                let rawVal = row[header];

                // Prevent literal "undefined" or "null" text
                if (rawVal === null || rawVal === undefined) rawVal = "";

                // If an array somehow survived (e.g., user scraped nested tags), format it safely
                if (typeof rawVal === 'object') rawVal = JSON.stringify(rawVal);

                let val = String(rawVal);
                // Escape quotes and wrap in quotes for CSV safety
                val = val.replace(/"/g, '""');
                return `"${val}"`;
            });
            csvRows.push(values.join(','));
        }

        const csvString = csvRows.join('\n');
        
        // Create download blob with UTF-8 BOM so Excel parses special characters correctly
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        chrome.downloads.download({
            url: url,
            filename: 'Universal_Scraper_Export.csv',
            saveAs: true
        });
    });
});

// Export Excel logic
document.getElementById('btn-export-excel').addEventListener('click', () => {
    chrome.storage.local.get(['scrapedData'], (result) => {
        const data = result.scrapedData;
        if (!data || data.length === 0) {
            showToast("No data to export!", "info");
            return;
        }

        try {
            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Scraped Data");
            XLSX.writeFile(workbook, 'AI_Digger_Export.xlsx');
        } catch (error) {
            console.error("Excel Export Error:", error);
            showToast("Failed to export to Excel. Please ensure the data format is correct.", "error");
        }
    });
});

// 6. Clear Data
document.getElementById('btn-clear').addEventListener('click', () => {
    if(confirm("Are you sure you want to delete all scraped data?")) {
        chrome.runtime.sendMessage({ action: 'CLEAR_DATA' }, () => {
            updateStatus();
        });
    }
});

// Initial status poll
updateStatus();
setInterval(updateStatus, 2000); // Poll every 2 seconds to update count live
