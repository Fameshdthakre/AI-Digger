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

function addFieldRow(name = '', selector = '') {
    fieldCount++;
    const div = document.createElement('div');
    div.className = 'field-row';
    div.innerHTML = `
        <input type="text" placeholder="Field Name (e.g. Title)" class="f-name" value="${name}" style="flex: 1;" />
        <input type="text" placeholder="CSS Selector (e.g. h1.title)" class="f-selector" value="${selector}" style="flex: 2;" />
        <button class="remove-field" title="Remove Field">×</button>
    `;
    div.querySelector('.remove-field').addEventListener('click', () => div.remove());
    fieldsContainer.appendChild(div);
}

document.getElementById('add-field').addEventListener('click', () => addFieldRow());

// Add default fields to start
addFieldRow('Product Name', 'h1');
addFieldRow('Price', '.price');

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
    
    chrome.storage.local.set({ aiSettings: settings }, () => {
        const msg = document.getElementById('settings-msg');
        msg.style.display = 'block';
        setTimeout(() => msg.style.display = 'none', 3000);
    });
});

// Load Settings
chrome.storage.local.get(['aiSettings'], (result) => {
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

// 1. Visual Inspector Toggle
document.getElementById('btn-inspect').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    chrome.tabs.sendMessage(tab.id, {action: 'TOGGLE_INSPECTOR'}, (response) => {
        window.close(); // Close popup so user can see the webpage and use inspector
    });
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
            type: 'text' // Hardcoded text for V1, can expand to attribute later
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
        
        if (response.isRunning) {
            document.getElementById('status-indicator').innerText = "Scraping in progress...";
            document.getElementById('status-indicator').style.color = "#22c55e";
            document.getElementById('btn-stop').style.display = 'block';
        } else {
            document.getElementById('status-indicator').innerText = "Idle";
            document.getElementById('status-indicator').style.color = "var(--text-muted)";
            document.getElementById('btn-stop').style.display = 'none';
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
