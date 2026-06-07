/**
 * ui/dashboard-manager.js
 * Stats, progress tracking, data preview, elapsed timer, error counting,
 * and full run-history management (download, delete, select, merge-export).
 */

import { showToast } from './utils.js';

export const DashboardManager = {
    _jobStartedAt: null,
    _timerInterval: null,
    _errorCount: 0,
    _searchTerm: '',

    init() {
        this.updateStatus();
        setInterval(() => this.updateStatus(), 2000);

        const searchInput = document.getElementById('data-preview-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this._searchTerm = e.target.value.toLowerCase();
                this.renderDataPreview();
            });
        }

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.runHistory) this.renderRunHistory();
            if (namespace === 'local' && changes.scrapedData) this.renderDataPreview();
        });

        this.renderRunHistory();
        this.renderDataPreview();
        this.bindHistoryControls();
    },

    // ─── Status Polling ───────────────────────────────────────
    updateStatus() {
        chrome.runtime.sendMessage({ action: 'GET_STATUS' }, (res) => {
            if (!res) return;
            const count = res.scrapedCount || 0;
            document.getElementById('stat-count').innerText = count;

            const progContainer = document.getElementById('progress-container');
            const statusIndicator = document.getElementById('status-indicator');
            const statusDot = document.getElementById('status-dot');
            const elapsedTimer = document.getElementById('elapsed-timer');
            const errorBadge = document.getElementById('error-count-badge');
            const btnStart = document.getElementById('btn-start');

            if (res.isRunning) {
                // Start elapsed timer on first running tick
                if (!this._jobStartedAt) {
                    this._jobStartedAt = Date.now();
                    this._errorCount = 0;
                    this._startTimer();
                }

                const isDeep = res.isDeepCrawling;
                statusIndicator.innerText = isDeep ? "Deep Crawling..." : "Scraping...";
                statusIndicator.style.color = isDeep ? "#a855f7" : "#22c55e";
                statusDot.className = `dashboard-status-dot ${isDeep ? 'deep' : 'running'}`;

                document.getElementById('btn-stop').style.display = 'inline-block';

                if (btnStart) {
                    btnStart.disabled = true;
                    btnStart.innerText = "⏳ Running...";
                    btnStart.style.opacity = '0.7';
                    btnStart.style.cursor = 'not-allowed';
                }

                if (res.jobProgress?.total > 0) {
                    progContainer.style.display = 'block';
                    const bar = document.getElementById('job-progress');
                    bar.max = res.jobProgress.total;
                    bar.value = res.jobProgress.current;
                    const percent = Math.round((res.jobProgress.current / res.jobProgress.total) * 100);
                    document.getElementById('progress-percent').innerText = `${percent}%`;
                    document.getElementById('progress-text').innerText = `${isDeep ? 'Deep Crawl' : 'Scraping'}: ${res.jobProgress.current}/${res.jobProgress.total}`;
                }

                // Count errors from logs
                if (res.jobLogs) {
                    this._errorCount = res.jobLogs.filter(l => l.includes('ERROR:')).length;
                }
                if (this._errorCount > 0) {
                    errorBadge.style.display = 'inline';
                    errorBadge.innerText = `⚠ ${this._errorCount}`;
                } else {
                    errorBadge.style.display = 'none';
                }

                elapsedTimer.style.display = 'inline';
            } else {
                statusIndicator.innerText = "Idle";
                statusIndicator.style.color = "var(--text-muted)";
                statusDot.className = 'dashboard-status-dot';

                document.getElementById('btn-stop').style.display = 'none';
                progContainer.style.display = 'none';

                if (btnStart) {
                    btnStart.disabled = false;
                    btnStart.innerText = "▶ Start Scraping Job";
                    btnStart.style.opacity = '1';
                    btnStart.style.cursor = 'pointer';
                }

                // Stop timer when job finishes
                if (this._jobStartedAt) {
                    this._stopTimer();
                    this._jobStartedAt = null;
                }
                elapsedTimer.style.display = 'none';
                errorBadge.style.display = 'none';
            }

            if (res.jobLogs?.length > 0) {
                const logsCard = document.getElementById('logs-card');
                const logsBox = document.getElementById('job-logs');
                logsCard.style.display = 'block';
                logsBox.innerText = res.jobLogs.join('\n');
                logsBox.scrollTop = logsBox.scrollHeight;
            }
        });
    },

    // ─── Elapsed Timer ────────────────────────────────────────
    _startTimer() {
        this._stopTimer();
        const timerEl = document.getElementById('elapsed-timer');
        this._timerInterval = setInterval(() => {
            if (!this._jobStartedAt) return;
            const elapsed = Math.floor((Date.now() - this._jobStartedAt) / 1000);
            const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
            const secs = String(elapsed % 60).padStart(2, '0');
            timerEl.innerText = `⏱ ${mins}:${secs}`;
        }, 1000);
    },

    _stopTimer() {
        if (this._timerInterval) {
            clearInterval(this._timerInterval);
            this._timerInterval = null;
        }
    },

    // ─── Data Preview Table ───────────────────────────────────
    async renderDataPreview() {
        const res = await new Promise(r => chrome.storage.local.get(['scrapedData'], r));
        let data = res.scrapedData || [];
        const card = document.getElementById('data-preview-card');
        const table = document.getElementById('data-preview-table');
        const countLabel = document.getElementById('data-preview-count');

        // Apply Search Filter
        if (this._searchTerm) {
            data = data.filter(row => 
                Object.values(row).some(v => String(v).toLowerCase().includes(this._searchTerm))
            );
        }

        countLabel.innerText = `${data.length} row${data.length !== 1 ? 's' : ''}`;

        if (data.length === 0) {
            if (this._searchTerm) {
                card.style.display = 'block';
                table.innerHTML = '<tbody><tr><td style="text-align: center; color: var(--text-muted); padding: 16px;">No data matches your search.</td></tr></tbody>';
            } else {
                card.style.display = 'none';
            }
            return;
        }

        card.style.display = 'block';

        // Show up to 100 rows for preview to keep DOM light, but scrollable
        const preview = data.slice(-100).reverse();
        const excludeKeys = ['_pageMarkdown', '_failedFields'];
        const headers = [...new Set(preview.flatMap(r => Object.keys(r)))].filter(h => !excludeKeys.includes(h));

        let html = '<thead><tr>';
        headers.forEach(h => { html += `<th title="${this._esc(h)}">${this._esc(this._truncate(h, 18))}</th>`; });
        html += '</tr></thead><tbody>';

        preview.forEach(row => {
            html += '<tr>';
            headers.forEach(h => {
                const val = row[h] != null ? (typeof row[h] === 'object' ? JSON.stringify(row[h]) : String(row[h])) : '';
                html += `<td title="${this._esc(val)}">${this._esc(this._truncate(val, 50))}</td>`;
            });
            html += '</tr>';
        });
        html += '</tbody>';
        table.innerHTML = html;
    },

    // ─── Run History ──────────────────────────────────────────
    bindHistoryControls() {
        // Select All checkbox
        document.getElementById('hist-select-all')?.addEventListener('change', (e) => {
            const checked = e.target.checked;
            document.querySelectorAll('#run-history-list .hist-checkbox').forEach(cb => { cb.checked = checked; });
            this._updateSelectionButtons();
        });

        // Clear All history
        document.getElementById('btn-clear-history')?.addEventListener('click', () => {
            if (confirm('Clear all run history? This cannot be undone.')) {
                chrome.storage.local.set({ runHistory: [] }, () => {
                    this.renderRunHistory();
                    showToast('History cleared.', 'success');
                });
            }
        });

        // Delete Selected
        document.getElementById('btn-delete-selected-history')?.addEventListener('click', () => {
            this._withSelectedRunIds((selectedIds) => {
                if (confirm(`Delete ${selectedIds.length} selected run(s)?`)) {
                    chrome.storage.local.get(['runHistory'], (res) => {
                        const history = (res.runHistory || []).filter(r => !selectedIds.includes(r.id));
                        chrome.storage.local.set({ runHistory: history }, () => {
                            this.renderRunHistory();
                            showToast(`${selectedIds.length} run(s) deleted.`, 'success');
                        });
                    });
                }
            });
        });

        // Export Selected (merged CSV)
        document.getElementById('btn-export-selected-history')?.addEventListener('click', () => {
            this._withSelectedRunIds((selectedIds) => {
                chrome.storage.local.get(['runHistory'], (res) => {
                    const history = res.runHistory || [];
                    const selectedRuns = history.filter(r => selectedIds.includes(r.id));
                    const allRows = selectedRuns.flatMap(r => r.data || []);

                    if (allRows.length === 0) return showToast('No data in selected runs.', 'info');

                    this._downloadMergedCSV(allRows, `Merged_${selectedRuns.length}_Runs`);
                    showToast(`Exported ${allRows.length} rows from ${selectedRuns.length} run(s).`, 'success');
                });
            });
        });
    },

    async renderRunHistory() {
        const res = await new Promise(r => chrome.storage.local.get(['runHistory'], r));
        const history = res.runHistory || [];
        const container = document.getElementById('run-history-list');
        if (!container) return;

        // Reset select-all
        const selectAllCb = document.getElementById('hist-select-all');
        if (selectAllCb) selectAllCb.checked = false;
        this._updateSelectionButtons();

        if (history.length === 0) {
            container.innerHTML = '<div class="empty-state">No runs yet.<br>Complete a scraping job to see it here.</div>';
            return;
        }

        container.innerHTML = '';

        history.forEach(run => {
            const div = document.createElement('div');
            div.className = 'history-item';
            div.dataset.runId = run.id;
            div.innerHTML = `
                <input type="checkbox" class="hist-checkbox" data-id="${run.id}" />
                <div class="history-info">
                    <div class="history-name">${this._esc(run.jobName)}</div>
                    <div class="history-meta">${this._esc(run.date)} · ${run.count} rows</div>
                </div>
                <div class="history-actions">
                    <button class="btn-icon hist-download-csv" title="Download CSV" aria-label="Download CSV">📊</button>
                    <button class="btn-icon hist-delete" title="Delete Run" aria-label="Delete Run">🗑️</button>
                </div>
            `;

            // Per-run download
            div.querySelector('.hist-download-csv').addEventListener('click', () => {
                if (!run.data || run.data.length === 0) return showToast('No data in this run.', 'info');
                this._downloadMergedCSV(run.data, run.jobName);
                showToast(`Exported ${run.count} rows.`, 'success');
            });

            // Per-run delete
            div.querySelector('.hist-delete').addEventListener('click', () => {
                if (confirm(`Delete run "${run.jobName}"?`)) {
                    chrome.storage.local.get(['runHistory'], (res2) => {
                        const updated = (res2.runHistory || []).filter(r => r.id !== run.id);
                        chrome.storage.local.set({ runHistory: updated }, () => {
                            this.renderRunHistory();
                            showToast('Run deleted.', 'success');
                        });
                    });
                }
            });

            // Checkbox change → update selection buttons
            div.querySelector('.hist-checkbox').addEventListener('change', () => this._updateSelectionButtons());

            container.appendChild(div);
        });
    },

    // ─── History Helpers ──────────────────────────────────────
    _withSelectedRunIds(callback) {
        const checked = document.querySelectorAll('#run-history-list .hist-checkbox:checked');
        const selectedIds = [...checked].map(cb => Number(cb.dataset.id));
        if (selectedIds.length === 0) return showToast('No runs selected.', 'info');
        callback(selectedIds);
    },

    _updateSelectionButtons() {
        const count = document.querySelectorAll('#run-history-list .hist-checkbox:checked').length;
        const deleteBtn = document.getElementById('btn-delete-selected-history');
        const exportBtn = document.getElementById('btn-export-selected-history');
        if (deleteBtn) deleteBtn.style.display = count > 0 ? 'inline-block' : 'none';
        if (exportBtn) exportBtn.style.display = count > 0 ? 'inline-block' : 'none';
    },

    _downloadMergedCSV(data, name) {
        const cleanData = data.map(row => {
            const clean = {};
            for (let key in row) {
                let val = row[key];
                clean[key] = (val === null || val === undefined) ? "" : (typeof val === 'object' ? JSON.stringify(val) : String(val));
            }
            return clean;
        });

        const headers = [...new Set(cleanData.flatMap(r => Object.keys(r)))];
        const csv = [
            headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
            ...cleanData.map(row => headers.map(h => `"${(row[h] || "").replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const safeName = (name || 'AI_Digger').replace(/[^a-z0-9]/gi, '_');
        const now = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${safeName}_${now}.csv`;

        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    },

    // ─── Utilities ────────────────────────────────────────────
    _esc(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    _truncate(str, max) {
        return str.length > max ? str.substring(0, max) + '…' : str;
    }
};
