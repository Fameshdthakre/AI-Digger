// === Execution & Glue Logic ===

// Global Listener for Wand Clicks
document.addEventListener('click', async (e) => {
    if (e.target.closest('.btn-wand')) {
        const wandBtn = e.target.closest('.btn-wand');

        let fieldId = null;
        const row = wandBtn.closest('.field-row');
        if (row) {
            fieldId = row.id;
        } else if (wandBtn.closest('#item-container-selector-row')) {
            fieldId = 'item-container-selector';
        }

        if (!fieldId) return;

        const query = prompt("What element do you want to find here? (e.g., 'The author name under the title')");

        if (!query) return;

        wandBtn.innerText = '⏳';

        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['js/content/main.js'] }).catch(()=>null);

        chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_TEXT' }, (response) => {
            if (response && response.text) {
                chrome.runtime.sendMessage({ action: 'PROCESS_AI_WAND', fieldId, query, html: response.text });
            } else {
                wandBtn.innerText = '🪄';
                showToast("Could not read page.", "error");
            }
        });
    } else if (e.target.closest('.btn-parent-wand')) {
        // Start visual inspector in parent mode
        const wandBtn = e.target.closest('.btn-parent-wand');
        let fieldId = null;
        const row = wandBtn.closest('.field-row');
        if (row) {
            fieldId = row.id;
        } else if (wandBtn.closest('#item-container-selector-row')) {
            fieldId = 'item-container-selector';
        }

        if (!fieldId) return;

        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['turndown.js', 'js/content/inspector.js', 'js/content/macros.js', 'js/content/auto-detect.js', 'js/content/extractor.js', 'js/content/main.js']
        }).catch(err => console.error("Failed to inject content scripts:", err));

        chrome.tabs.sendMessage(tab.id, { action: 'START_INSPECTOR_FOR_FIELD', fieldId: fieldId, mode: 'parent' }, (response) => {
            if (response && response.status === 'inspector_started') {
                wandBtn.style.backgroundColor = 'var(--magic-bg)';
                wandBtn.style.borderColor = 'var(--magic-border)';
                wandBtn.innerText = '🎯';
            }
        });
    }
});

// Unified Message Listener
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
        } else if (fieldId === 'scroll-container-selector') {
            const selectorInput = document.getElementById('scroll-container-selector');
            if (selectorInput) selectorInput.value = selector;

            const inspectBtn = document.getElementById('inspect-scroll-container-btn');
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
    } else if (message.action === 'AUTO_DETECT_RESULT') {
        const btn = document.getElementById('btn-auto-detect');
        btn.innerText = '🎯 Smart Container Scan';
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

            document.getElementById('item-container-selector').value = bp.containerSelector || '';
            updateUISafeguards();

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
    } else if (message.action === 'MACRO_ACTION_RECORDED') {
        addActionRow(message.data.type, message.data.selector, message.data.text || '');
        sendResponse({ status: 'received' });
    } else if (message.action === 'SCRAPE_ERROR') {
        showToast(message.message, 'error');
        sendResponse({ status: 'received' });
    } else if (message.action === 'AI_SELECTOR_RESULT') {
        let row = document.getElementById(message.fieldId);
        let selectorInput, wandBtn, testBtn, parentWandBtn;

        if (message.fieldId === 'item-container-selector') {
            const rowEl = document.getElementById('item-container-selector-row');
            if (rowEl) {
                selectorInput = document.getElementById('item-container-selector');
                wandBtn = rowEl.querySelector('.btn-wand');
                parentWandBtn = rowEl.querySelector('.btn-parent-wand');
                testBtn = document.getElementById('test-container-btn');
            }
        } else if (row) {
            selectorInput = row.querySelector('.f-selector') || row.querySelector('.a-selector');
            wandBtn = row.querySelector('.btn-wand');
            parentWandBtn = row.querySelector('.btn-parent-wand');
            testBtn = row.querySelector('.test-btn') || row.querySelector('.a-test');
        }

        if (selectorInput) selectorInput.value = message.selector;
        if (wandBtn) wandBtn.innerText = '🪄';
        if (parentWandBtn) parentWandBtn.innerText = '📦';

        // Auto-trigger the test button to show the user the result
        if (testBtn) testBtn.click();
        showToast("AI generated selector!", "success");
        sendResponse({ status: 'received' });
    } else if (message.action === 'AI_SELECTOR_ERROR') {
        let row = document.getElementById(message.fieldId);
        if (message.fieldId === 'item-container-selector') {
            const rowEl = document.getElementById('item-container-selector-row');
            if (rowEl) {
                const wandBtn = rowEl.querySelector('.btn-wand');
                const parentWandBtn = rowEl.querySelector('.btn-parent-wand');
                if (wandBtn) wandBtn.innerText = '🪄';
                if (parentWandBtn) parentWandBtn.innerText = '📦';
            }
        } else if (row) {
            const wandBtn = row.querySelector('.btn-wand');
            const parentWandBtn = row.querySelector('.btn-parent-wand');
            if (wandBtn) wandBtn.innerText = '🪄';
            if (parentWandBtn) parentWandBtn.innerText = '📦';
        }
        showToast(`AI Error: ${message.error}`, "error");
        sendResponse({ status: 'received' });
    } else if (message.action === 'INSPECTOR_CANCELLED') {
        if (message.fieldId) {
            const row = document.getElementById(message.fieldId);
            // Also check standalone buttons like container selectors
            const standaloneBtn = document.getElementById(`inspect-${message.fieldId.replace('-selector', '-btn')}`);
            const standaloneParentBtn = document.getElementById(`parent-${message.fieldId.replace('-selector', '-btn')}`);

            const targetBtn = standaloneBtn || (row ? (row.querySelector('.inspect-btn') || row.querySelector('.a-inspect')) : null);
            const parentBtn = standaloneParentBtn || (row ? row.querySelector('.btn-parent-wand') : null);

            if (targetBtn) {
                targetBtn.style.backgroundColor = 'var(--surface)';
                targetBtn.style.borderColor = 'var(--border)';
                targetBtn.innerText = '🔍';
            }
            if (parentBtn) {
                parentBtn.style.backgroundColor = 'transparent';
                parentBtn.style.borderColor = 'var(--border)';
                parentBtn.innerText = '📦';
            }
        }
        sendResponse({ status: 'received' });
    }
    return true;
});

// Auto-Detect Logic
document.getElementById('btn-auto-detect').addEventListener('click', async () => {
    const btn = document.getElementById('btn-auto-detect');
    btn.innerText = 'Scanning...';
    btn.disabled = true;

    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['turndown.js', 'js/content/inspector.js', 'js/content/macros.js', 'js/content/auto-detect.js', 'js/content/extractor.js', 'js/content/main.js']
    }).catch(err => console.error(err));

    chrome.tabs.sendMessage(tab.id, { action: 'START_AUTO_DETECT' }, (response) => {
        if (!response || response.status !== 'started') {
            btn.innerText = '🎯 Smart Container Scan';
            btn.disabled = false;
        }
    });
});

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
        files: ['turndown.js', 'js/content/inspector.js', 'js/content/macros.js', 'js/content/auto-detect.js', 'js/content/extractor.js', 'js/content/main.js']
    }).catch(err => console.error(err));

    chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_MACRO_RECORDING', isRecording: isRecordingMacro });
});

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
        files: ['turndown.js', 'js/content/inspector.js', 'js/content/macros.js', 'js/content/auto-detect.js', 'js/content/extractor.js', 'js/content/main.js']
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

// Start Job
document.getElementById('btn-start').addEventListener('click', () => {
    const blueprint = getBlueprintFromUI();
    const shouldAppend = document.getElementById('append-data-toggle').checked;

    const startTheJob = () => {
        chrome.runtime.sendMessage({ action: 'START_JOB', blueprint }, () => {
            // Switch to run tab
            document.querySelector('[data-target="view-run"]').click();
            updateStatus();
        });
    };

    if (!shouldAppend) {
        // Auto-clear old data so the new export is perfectly clean
        chrome.runtime.sendMessage({ action: 'CLEAR_DATA' }, () => {
            startTheJob();
        });
    } else {
        startTheJob();
    }
});

// Stop Job
document.getElementById('btn-stop').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'STOP_JOB' }, updateStatus);
});

// Clear Data
document.getElementById('btn-clear').addEventListener('click', () => {
    if(confirm("Are you sure you want to delete all stored data from the current run?")) {
        chrome.runtime.sendMessage({ action: 'CLEAR_DATA' }, () => {
            updateStatus();
            showToast("Stored data cleared.", "success");
        });
    }
});

// Update Status and Stats
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

                const percent = Math.round((response.jobProgress.current / response.jobProgress.total) * 100);
                document.getElementById('progress-percent').innerText = `${percent}%`;

                if (response.isDeepCrawling) {
                    progText.innerText = `Deep Crawl: ${response.jobProgress.current} / ${response.jobProgress.total}`;
                } else {
                    progText.innerText = `Scraping: ${response.jobProgress.current} / ${response.jobProgress.total}`;
                }
            }

            // Update the live rows counter
            const liveCountEl = document.getElementById('live-rows-count');
            if (liveCountEl) {
                liveCountEl.innerText = response.scrapedCount || 0;
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

// Initial status poll
updateStatus();
renderRunHistory();
setInterval(updateStatus, 2000); // Poll every 2 seconds to update count live

// Listen for changes to storage to auto-refresh the history UI live
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.runHistory) {
        renderRunHistory();
    }
});