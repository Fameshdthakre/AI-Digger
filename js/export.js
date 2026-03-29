// === Export & History Logic ===

function getExportFilename(extension) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');

    // Try to get current job name, fallback to 'Universal_Scraper'
    let jobName = document.getElementById('job-name')?.value || 'AI_Digger';
    // Clean job name of invalid filename characters
    jobName = jobName.replace(/[^a-z0-9]/gi, '_');

    return `${jobName}_${yyyy}-${mm}-${dd}_${hh}-${min}.${extension}`;
}

function sanitizeDataForExport(data) {
    return data.map(row => {
        const cleanRow = {};
        for (let key in row) {
            let val = row[key];
            if (val === null || val === undefined) {
                cleanRow[key] = "";
            } else if (typeof val === 'object') {
                // Force arrays and nested objects into readable strings
                cleanRow[key] = JSON.stringify(val);
            } else {
                cleanRow[key] = String(val);
            }
        }
        return cleanRow;
    });
}

// Export CSV logic
document.getElementById('btn-export-csv').addEventListener('click', () => {
    chrome.storage.local.get(['scrapedData'], (result) => {
        const data = result.scrapedData;
        if (!data || data.length === 0) {
            showToast("No data to export!", "info");
            return;
        }

        const cleanData = sanitizeDataForExport(data);

        // Gather ALL unique headers across all rows in case some rows have missing keys
        const headerSet = new Set();
        cleanData.forEach(row => Object.keys(row).forEach(k => headerSet.add(k)));
        const headers = Array.from(headerSet);

        const csvRows = [];
        // Header row
        csvRows.push(headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(','));

        for (const row of cleanData) {
            const values = headers.map(header => {
                let rawVal = row[header];

                // Prevent literal "undefined" or "null" text
                if (rawVal === null || rawVal === undefined) rawVal = "";

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

        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = getExportFilename('csv');
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
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
            const cleanData = sanitizeDataForExport(data);
            const worksheet = XLSX.utils.json_to_sheet(cleanData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Scraped Data");

            // Use SheetJS's native downloader (bypasses Blob/URL restrictions)
            XLSX.writeFile(workbook, getExportFilename('xlsx'));
        } catch (error) {
            console.error("Excel Export Error:", error);
            showToast("Failed to export to Excel. Please ensure the data format is correct.", "error");
        }
    });
});

function renderRunHistory() {
    chrome.storage.local.get(['runHistory'], (res) => {
        const list = document.getElementById('run-history-list');
        const history = res.runHistory || [];
        const selectAllCb = document.getElementById('hist-select-all');
        const btnDeleteSelected = document.getElementById('btn-delete-selected-history');

        selectAllCb.checked = false;
        btnDeleteSelected.style.display = 'none';

        if (history.length === 0) {
            list.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; text-align: center; padding: 10px;">No past runs found.</div>';
            selectAllCb.disabled = true;
            return;
        }

        selectAllCb.disabled = false;
        list.innerHTML = '';

        history.forEach(run => {
            const item = document.createElement('div');
            item.style.cssText = 'padding: 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); display: flex; justify-content: space-between; align-items: center; gap: 12px;';

            item.innerHTML = `
                <input type="checkbox" class="hist-checkbox" data-id="${run.id}" style="width: 16px; height: 16px; margin: 0; cursor: pointer; flex-shrink: 0;" />
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: bold; font-size: 13px; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${run.jobName}</div>
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${run.date} • ${run.count} rows</div>
                </div>
                <div style="display: flex; gap: 6px; flex-shrink: 0;">
                    <button class="btn-hist-csv" data-id="${run.id}" style="background: var(--surface); border: 1px solid #3b82f6; color: #3b82f6; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;" title="Download CSV">📊 CSV</button>
                    <button class="btn-hist-excel" data-id="${run.id}" style="background: var(--surface); border: 1px solid #10b981; color: #10b981; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;" title="Download Excel">📗 XLSX</button>
                </div>
            `;
            list.appendChild(item);
        });

        // Attach Export Listeners
        document.querySelectorAll('.btn-hist-csv').forEach(btn => {
            btn.addEventListener('click', (e) => exportHistoryItem(e.target.dataset.id, 'csv'));
        });
        document.querySelectorAll('.btn-hist-excel').forEach(btn => {
            btn.addEventListener('click', (e) => exportHistoryItem(e.target.dataset.id, 'xlsx'));
        });

        // Attach Checkbox Listeners for Bulk UI
        const checkboxes = document.querySelectorAll('.hist-checkbox');
        checkboxes.forEach(cb => {
            cb.addEventListener('change', () => {
                const checkedCount = document.querySelectorAll('.hist-checkbox:checked').length;
                selectAllCb.checked = (checkedCount === checkboxes.length);
                btnDeleteSelected.style.display = checkedCount > 0 ? 'block' : 'none';
            });
        });
    });
}

// Bulk Delete Listeners
document.getElementById('hist-select-all')?.addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    document.querySelectorAll('.hist-checkbox').forEach(cb => cb.checked = isChecked);
    document.getElementById('btn-delete-selected-history').style.display = isChecked ? 'block' : 'none';
});

document.getElementById('btn-delete-selected-history')?.addEventListener('click', () => {
    const checkedBoxes = document.querySelectorAll('.hist-checkbox:checked');
    if (checkedBoxes.length === 0) return;

    if (confirm(`Are you sure you want to delete these ${checkedBoxes.length} runs?`)) {
        const idsToDelete = Array.from(checkedBoxes).map(cb => cb.dataset.id);

        chrome.storage.local.get(['runHistory'], (res) => {
            let history = res.runHistory || [];
            history = history.filter(run => !idsToDelete.includes(run.id.toString()));

            chrome.storage.local.set({ runHistory: history }, () => {
                renderRunHistory();
                showToast(`Deleted ${idsToDelete.length} runs.`, "success");
            });
        });
    }
});

function exportHistoryItem(runId, type) {
    chrome.storage.local.get(['runHistory'], (res) => {
        const history = res.runHistory || [];
        const run = history.find(r => r.id.toString() === runId);
        if (!run || !run.data || run.data.length === 0) {
            showToast("Data not found for this run.", "error");
            return;
        }

        const cleanData = sanitizeDataForExport(run.data);
        const filename = `${run.jobName.replace(/[^a-z0-9]/gi, '_')}_${run.id}.${type}`;

        if (type === 'csv') {
            const headerSet = new Set();
            cleanData.forEach(row => Object.keys(row).forEach(k => headerSet.add(k)));
            const headers = Array.from(headerSet);
            const csvRows = [headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(',')];

            for (const row of cleanData) {
                csvRows.push(headers.map(h => `"${String(row[h] || "").replace(/"/g, '""')}"`).join(','));
            }

            const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
            triggerDownload(blob, filename);
        } else {
            try {
                const worksheet = XLSX.utils.json_to_sheet(cleanData);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Data");

                // Use SheetJS's native downloader
                XLSX.writeFile(workbook, filename);
            } catch (error) {
                console.error("Excel History Export Error:", error);
                showToast(`Excel Error: ${error.message || "Data format issue"}`, "error");
            }
        }
    });
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

document.getElementById('btn-clear-history').addEventListener('click', () => {
    if (confirm("Are you sure you want to delete all past job runs?")) {
        chrome.storage.local.remove('runHistory', () => {
            renderRunHistory();
            showToast("History cleared.");
        });
    }
});