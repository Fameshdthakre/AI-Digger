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

// Toggle URL list visibility based on mode
document.getElementById('scrape-mode').addEventListener('change', (e) => {
    document.getElementById('url-list-group').style.display = e.target.value === 'multi-url' ? 'block' : 'none';
});

// Dynamic Field Management
const fieldsContainer = document.getElementById('fields-container');
let fieldCount = 0;

function addFieldRow(name = '', selector = '', type = 'css', extractType = 'text', attrName = '') {
    fieldCount++;
    const fieldId = `field_${Date.now()}_${fieldCount}`; // Unique ID for inspector mapping
    const div = document.createElement('div');
    div.className = 'field-row';
    div.id = fieldId;
    div.innerHTML = `
        <button class="remove-field" title="Remove Field">❌</button>
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
        </div>
        <div class="field-row-bottom">
            <button class="inspect-btn" title="Inspect Selector" style="${type === 'ai' ? 'display: none;' : ''}">🔍</button>
            <input type="text" placeholder="CSS Selector, XPath, or AI Prompt" class="f-selector" value="${selector}" style="flex: 1;" />
        </div>
    `;

    // Remove button logic
    div.querySelector('.remove-field').addEventListener('click', () => div.remove());

    // Type change logic (CSS/XPath/AI)
    const typeSelect = div.querySelector('.f-type');
    const targetSelect = div.querySelector('.f-extract-target');
    const attrInput = div.querySelector('.f-attr-name');
    const selectorInput = div.querySelector('.f-selector');
    const inspectBtn = div.querySelector('.inspect-btn');

    typeSelect.addEventListener('change', (e) => {
        if (e.target.value === 'ai') {
            targetSelect.style.display = 'none';
            attrInput.style.display = 'none';
            inspectBtn.style.display = 'none';
            selectorInput.placeholder = "e.g. What is the product price?";
        } else {
            targetSelect.style.display = 'block';
            if (targetSelect.value === 'attribute') {
                attrInput.style.display = 'block';
            }
            inspectBtn.style.display = 'flex';
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
            files: ['content.js']
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

    fieldsContainer.appendChild(div);
}

document.getElementById('add-field').addEventListener('click', () => addFieldRow());

// Add default fields to start
addFieldRow('Product Name', 'h1', 'css', 'text');
addFieldRow('Product Link', 'a.product-link', 'css', 'href');
addFieldRow('Summary', 'Summarize the product in one sentence', 'ai');

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
        const fieldRow = document.getElementById(fieldId);
        if (fieldRow) {
            const selectorInput = fieldRow.querySelector('.f-selector');
            selectorInput.value = selector;

            // Reset button style
            const inspectBtn = fieldRow.querySelector('.inspect-btn');
            inspectBtn.style.backgroundColor = 'var(--surface)';
            inspectBtn.style.borderColor = 'var(--border)';
            inspectBtn.innerText = '🔍';
        }
        sendResponse({ status: 'received' });
    }
    return true;
});


// 2. Start Job
document.getElementById('btn-start').addEventListener('click', () => {
    const blueprint = {
        jobName: document.getElementById('job-name').value,
        scrapingType: document.getElementById('scrape-mode').value,
        urls: document.getElementById('url-list').value,
        fields: Array.from(document.querySelectorAll('.field-row')).map(row => ({
            name: row.querySelector('.f-name').value,
            selector: row.querySelector('.f-selector').value,
            type: row.querySelector('.f-type').value, // 'css', 'xpath', 'ai'
            extractType: row.querySelector('.f-extract-target').value, // 'text', 'html', 'href', 'src', 'attribute'
            attributeName: row.querySelector('.f-attr-name').value
        })).filter(f => f.name && f.selector),
        antiBot: {
            minDelayMs: parseInt(document.getElementById('min-delay').value),
            maxDelayMs: parseInt(document.getElementById('max-delay').value),
            batchSize: parseInt(document.getElementById('batch-size').value),
            batchPauseMs: parseInt(document.getElementById('batch-pause').value)
        }
    };

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

        // Generate CSV string
        const headers = Object.keys(data[0]);
        const csvRows = [];
        csvRows.push(headers.join(',')); // Header row

        for (const row of data) {
            const values = headers.map(header => {
                let val = row[header] === null ? "" : String(row[header]);
                // Escape quotes and wrap in quotes for CSV safety
                val = val.replace(/"/g, '""');
                return `"${val}"`;
            });
            csvRows.push(values.join(','));
        }

        const csvString = csvRows.join('\n');
        
        // Create download blob
        const blob = new Blob([csvString], { type: 'text/csv' });
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
