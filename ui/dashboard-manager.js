/**
 * ui/dashboard-manager.js
 * Stats, progress tracking, and log management.
 */

export const DashboardManager = {
    init() {
        this.updateStatus();
        setInterval(() => this.updateStatus(), 2000);
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local' && changes.runHistory) this.renderRunHistory();
        });
        this.renderRunHistory();
    },

    updateStatus() {
        chrome.runtime.sendMessage({ action: 'GET_STATUS' }, (res) => {
            if (!res) return;
            document.getElementById('stat-count').innerText = res.scrapedCount || 0;

            const progContainer = document.getElementById('progress-container');
            const statusIndicator = document.getElementById('status-indicator');

            if (res.isRunning) {
                statusIndicator.innerText = res.isDeepCrawling ? "Deep Crawling..." : "Scraping...";
                statusIndicator.style.color = res.isDeepCrawling ? "#a855f7" : "#22c55e";
                document.getElementById('btn-stop').style.display = 'block';

                if (res.jobProgress?.total > 0) {
                    progContainer.style.display = 'block';
                    const bar = document.getElementById('job-progress');
                    bar.max = res.jobProgress.total;
                    bar.value = res.jobProgress.current;
                    const percent = Math.round((res.jobProgress.current / res.jobProgress.total) * 100);
                    document.getElementById('progress-percent').innerText = `${percent}%`;
                    document.getElementById('progress-text').innerText = `${res.isDeepCrawling ? 'Deep Crawl' : 'Scraping'}: ${res.jobProgress.current}/${res.jobProgress.total}`;
                }
            } else {
                statusIndicator.innerText = "Idle";
                statusIndicator.style.color = "var(--text-muted)";
                document.getElementById('btn-stop').style.display = 'none';
                progContainer.style.display = 'none';
            }

            if (res.jobLogs?.length > 0) {
                const logsBox = document.getElementById('job-logs');
                document.getElementById('logs-card').style.display = 'flex';
                logsBox.innerText = res.jobLogs.join('\n');
                logsBox.scrollTop = logsBox.scrollHeight;
            }
        });
    },

    async renderRunHistory() {
        const res = await new Promise(r => chrome.storage.local.get(['runHistory'], r));
        const history = res.runHistory || [];
        const container = document.getElementById('history-list');
        if (!container) return;

        container.innerHTML = history.length === 0 ? '<div class="empty-state">No history yet.</div>' : '';

        history.forEach(run => {
            const div = document.createElement('div');
            div.className = 'history-item';
            div.innerHTML = `
                <div class="history-info">
                    <div class="history-name">${run.jobName}</div>
                    <div class="history-meta">${run.date} • ${run.count} rows</div>
                </div>
                <div class="history-actions">
                    <button class="btn-icon" title="Download CSV">📥</button>
                    <button class="btn-icon delete-run" title="Delete">🗑️</button>
                </div>
            `;
            // Add download and delete logic here
            container.appendChild(div);
        });
    }
};
