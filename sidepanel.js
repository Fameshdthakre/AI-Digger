// === UI Logic ===

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
            <button class="inspect-btn a-inspect" title="Inspect Selector">🔍</button>
            <input type="text" placeholder="CSS or XPath Selector" class="a-selector" value="${selector}" style="flex: 1;" />
            <input type="text" placeholder="Text to type" class="a-text" value="${text}" style="width: 120px; ${type === 'type' ? '' : 'display: none;'}" />
            <button class="remove-field" style="position: static;" title="Remove Action">🗑️</button>
        </div>
    `;

    div.querySelector('.remove-field').addEventListener('click', () => div.remove());

    const typeSelect = div.querySelector('.a-type');
    const textInput = div.querySelector('.a-text');
    const inspectBtn = div.querySelector('.a-inspect');

    typeSelect.addEventListener('change', (e) => {
        textInput.style.display = e.target.value === 'type' ? 'block' : 'none';
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
        alert("Please enter a description of what you want to scrape.");
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
            alert("Could not extract text from page to analyze.");
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
            alert(`AI Analysis failed: ${message.error}`);
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
            alert(`Magic Build failed: ${message.error}`);
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
            alert("Could not extract text from page to analyze.");
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

function updateSavedJobsDropdown(selectedJobName = null) {
    const select = document.getElementById('saved-jobs-select');
    select.innerHTML = '<option value="">-- Create a new job --</option>';
    for (const jobName in savedJobs) {
        const option = document.createElement('option');
        option.value = jobName;
        option.innerText = jobName;
        if (jobName === selectedJobName) option.selected = true;
        select.appendChild(option);
    }
}

chrome.storage.local.get(['savedJobs'], (result) => {
    if (result.savedJobs) {
        savedJobs = result.savedJobs;
        updateSavedJobsDropdown();
    }
});

function getBlueprintFromUI() {
    return {
        jobName: document.getElementById('job-name').value,
        scrapingType: document.getElementById('scrape-mode').value,
        urls: document.getElementById('url-list').value,
        webhookUrl: document.getElementById('webhook-url').value,
        containerSelector: document.getElementById('item-container-selector').value,
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

document.getElementById('btn-save-job').addEventListener('click', () => {
    const blueprint = getBlueprintFromUI();
    if (!blueprint.jobName) {
        alert("Please enter a Job Name in the text box below to save it.");
        return;
    }
    savedJobs[blueprint.jobName] = blueprint;
    chrome.storage.local.set({ savedJobs: savedJobs }, () => {
        updateSavedJobsDropdown(blueprint.jobName);
        const btn = document.getElementById('btn-save-job');
        const origText = btn.innerText;
        btn.innerText = 'Saved!';
        btn.style.backgroundColor = '#10b981'; // Green
        btn.style.borderColor = '#10b981';
        setTimeout(() => {
            btn.innerText = origText;
            btn.style.backgroundColor = '';
            btn.style.borderColor = '';
        }, 2000);
    });
});

document.getElementById('saved-jobs-select').addEventListener('change', (e) => {
    const jobName = e.target.value;
    if (!jobName) {
        // Reset to default new state
        document.getElementById('job-name').value = "My Scraper Job";
        document.getElementById('url-list').value = "";
        actionsContainer.innerHTML = '';
        actionCount = 0;
        loadDefaultFields();
        return;
    }

    const blueprint = savedJobs[jobName];
    if (!blueprint) return;

    // Set Basic Info
    document.getElementById('job-name').value = blueprint.jobName;
    document.getElementById('scrape-mode').value = blueprint.scrapingType;
    document.getElementById('scrape-mode').dispatchEvent(new Event('change'));
    document.getElementById('url-list').value = blueprint.urls || '';
    document.getElementById('webhook-url').value = blueprint.webhookUrl || '';
    document.getElementById('item-container-selector').value = blueprint.containerSelector || '';

    // Set Anti-Bot
    if (blueprint.antiBot) {
        document.getElementById('min-delay').value = blueprint.antiBot.minDelayMs || 2000;
        document.getElementById('max-delay').value = blueprint.antiBot.maxDelayMs || 5000;
        document.getElementById('batch-size').value = blueprint.antiBot.batchSize || 10;
        document.getElementById('batch-pause').value = blueprint.antiBot.batchPauseMs || 10000;
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
        });
    } else {
        loadDefaultFields();
    }
});

document.getElementById('btn-delete-job').addEventListener('click', () => {
    const jobName = document.getElementById('saved-jobs-select').value;
    if (!jobName || !savedJobs[jobName]) return;

    if (confirm(`Are you sure you want to delete the saved job "${jobName}"?`)) {
        delete savedJobs[jobName];
        chrome.storage.local.set({ savedJobs: savedJobs }, () => {
            updateSavedJobsDropdown();
            alert("Job deleted.");
        });
    }
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
            if (selectorInput) selectorInput.value = selector;

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
            document.getElementById('status-indicator').innerText = "Scraping in progress...";
            document.getElementById('status-indicator').style.color = "#22c55e";
            document.getElementById('btn-stop').style.display = 'block';

            if (response.jobProgress && response.jobProgress.total > 0) {
                progContainer.style.display = 'block';
                progBar.max = response.jobProgress.total;
                progBar.value = response.jobProgress.current;
                progText.innerText = `${response.jobProgress.current} / ${response.jobProgress.total}`;
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
            alert("No data to export!");
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
