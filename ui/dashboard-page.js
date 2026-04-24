/**
 * ui/dashboard-page.js
 * Logic for the full-page dashboard.
 */

import { DataStore } from '../modules/data-store.js';

document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    await loadDashboardData();
    setupEventListeners();
});

function initTheme() {
    chrome.storage.sync.get(['aiSettings'], (res) => {
        if (res.aiSettings?.theme) {
            applyTheme(res.aiSettings.theme);
        }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.aiSettings) {
            const newTheme = changes.aiSettings.newValue?.theme;
            if (newTheme) applyTheme(newTheme);
        }
    });
}

function applyTheme(theme) {
    if (theme === 'system') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
}

async function loadDashboardData() {
    const res = await DataStore.get(['scrapedData', 'jobState']);
    const data = res.scrapedData || [];
    
    // Update Stats
    document.getElementById('stat-total-rows').innerText = data.length;
    document.getElementById('stat-active-jobs').innerText = res.jobState?.isRunning ? 1 : 0;
    
    renderTable(data);
}

function renderTable(data) {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No data found.</td></tr>';
        return;
    }

    data.slice().reverse().forEach((row, idx) => {
        const tr = document.createElement('tr');
        
        // Extract a few fields for summary
        const summary = Object.keys(row)
            .filter(k => !['Timestamp', 'JobName', 'URL', 'PageIndex'].includes(k))
            .slice(0, 3)
            .map(k => `<span style="color: var(--text-muted)">${k}:</span> ${row[k]}`)
            .join(' | ');

        tr.innerHTML = `
            <td style="white-space: nowrap;">${new Date(row.Timestamp).toLocaleString()}</td>
            <td style="font-weight: 600;">${row.JobName}</td>
            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                <a href="${row.URL}" target="_blank" style="color: var(--magic-bg); text-decoration: none;">${row.URL}</a>
            </td>
            <td>${summary}</td>
            <td>
                <button class="btn btn-outline btn-row-delete" data-index="${idx}" style="padding: 4px 8px; font-size: 10px;">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function setupEventListeners() {
    document.getElementById('btn-export-all')?.addEventListener('click', async () => {
        const res = await DataStore.get(['scrapedData']);
        const data = res.scrapedData || [];
        if (data.length === 0) return alert("No data to export.");

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ai_digger_export_${Date.now()}.json`;
        a.click();
    });

    document.getElementById('dashboard-search')?.addEventListener('input', async (e) => {
        const term = e.target.value.toLowerCase();
        const res = await DataStore.get(['scrapedData']);
        const data = res.scrapedData || [];
        const filtered = data.filter(row => 
            Object.values(row).some(v => String(v).toLowerCase().includes(term))
        );
        renderTable(filtered);
    });
}
