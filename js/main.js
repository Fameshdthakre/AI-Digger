// === Execution & Glue Logic ===

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
                    addFieldRow(f.name, f.selector, f.type || 'css', f.extractType || 'text', f.attributeName || '', f.format || 'raw', f.aiHeal !== false);
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
        if (message.fieldId === 'enhance') {
            const promptEl = document.getElementById('nl-prompt');
            const btn = document.getElementById('btn-enhance-prompt');
            if (promptEl) promptEl.value = message.selector;
            if (btn) { btn.innerText = '🪄 Enhance Prompt'; btn.disabled = false; }
            showToast("Prompt enhanced!", "success");
            sendResponse({ status: 'received' });
            return true;
        }
    } else if (message.action === 'AI_SELECTOR_ERROR') {
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
    } else if (message.action === 'VISION_BLUEPRINT_RESULT') {
        const btn = document.getElementById('btn-live-vision');
        if (btn) {
            btn.innerText = '👁️ Live AI Vision';
            btn.disabled = false;
        }

        if (message.fields && message.fields.length > 0) {
            message.fields.forEach(f => {
                addFieldRow(f.name || 'Vision Field', f.selector || '', f.type || 'css', f.extractType || 'text', '', 'raw', f.aiHeal !== false);
            });
            showToast("Vision Blueprint generated successfully!", "success");
        } else {
            showToast("No fields detected in the selected area.", "info");
        }
        sendResponse({ status: 'received' });
    } else if (message.action === 'VISION_BLUEPRINT_ERROR') {
        const btn = document.getElementById('btn-live-vision');
        if (btn) {
            btn.innerText = '👁️ Live AI Vision';
            btn.disabled = false;
        }
        showToast(`Live Vision Error: ${message.error}`, "error");
        sendResponse({ status: 'received' });
    } else if (message.action === 'VISION_SINGLE_SELECTOR_RESULT') {
        const btn = document.querySelector(`.btn-vision[data-field-id="${message.fieldId}"]`) || document.querySelector(`#${message.fieldId}-row .btn-vision`) || document.querySelector(`#${message.fieldId} .btn-vision`) || Array.from(document.querySelectorAll('.btn-vision')).find(b => {
            const row = b.closest('.field-row');
            return row && row.id === message.fieldId;
        });

        if (btn) {
            btn.innerText = '👁️';
            btn.disabled = false;
        } else {
            // Fallback to reset all loading vision buttons if specific one not found
            document.querySelectorAll('.btn-vision').forEach(b => {
                if (b.innerText === '⏳') {
                    b.innerText = '👁️';
                    b.disabled = false;
                }
            });
        }

        let selectorInput, testBtn;

        if (message.fieldId === 'item-container-selector' || message.fieldId === 'next-button-selector' || message.fieldId === 'scroll-container-selector') {
            selectorInput = document.getElementById(message.fieldId);
            const prefix = message.fieldId.replace('-selector', '');
            testBtn = document.getElementById(`test-${prefix}-btn`);
        } else {
            const row = document.getElementById(message.fieldId);
            if (row) {
                selectorInput = row.querySelector('.f-selector') || row.querySelector('.a-selector');
                testBtn = row.querySelector('.test-btn') || row.querySelector('.a-test');
            }
        }

        if (selectorInput) {
            selectorInput.value = message.selector;
            selectorInput.dispatchEvent(new Event('input')); // Trigger UI safeguards
        }

        if (testBtn) testBtn.click(); // Auto-test the new AI selector
        showToast("Live AI Vision selector generated!", "success");
        sendResponse({ status: 'received' });
    }
    return true;
});

// Inline Live AI Vision Listener (Precision Generation)
document.addEventListener('click', async (e) => {
    if (e.target.closest('.btn-vision')) {
        const visionBtn = e.target.closest('.btn-vision');
        let fieldId;

        // Try to identify the field ID
        if (visionBtn.closest('#item-container-selector-row')) fieldId = 'item-container-selector';
        else if (visionBtn.closest('#next-button-selector')?.parentElement || document.getElementById('next-button-selector') && visionBtn.parentElement.contains(document.getElementById('next-button-selector'))) fieldId = 'next-button-selector';
        else if (visionBtn.closest('#scroll-container-selector')?.parentElement || document.getElementById('scroll-container-selector') && visionBtn.parentElement.contains(document.getElementById('scroll-container-selector'))) fieldId = 'scroll-container-selector';
        else {
            const row = visionBtn.closest('.field-row');
            if (row) fieldId = row.id;
        }

        if (!fieldId) {
             // Fallback for next-button and scroll-container if parent structure is loose
             if (visionBtn.nextElementSibling?.id === 'inspect-next-btn') fieldId = 'next-button-selector';
             else if (visionBtn.nextElementSibling?.id === 'inspect-scroll-container-btn') fieldId = 'scroll-container-selector';
             else return;
        }

        visionBtn.innerText = '⏳';
        visionBtn.disabled = true;
        visionBtn.dataset.fieldId = fieldId; // Mark for the result handler

        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['turndown.js', 'js/content/inspector.js', 'js/content/live-ai-inspector.js', 'js/content/macros.js', 'js/content/extractor.js', 'js/content/main.js']
        }).catch(err => console.error(err));

        chrome.tabs.sendMessage(tab.id, { action: 'START_LIVE_AI_MODE', fieldId: fieldId }, (response) => {
            if (chrome.runtime.lastError) {
                visionBtn.innerText = '👁️';
                visionBtn.disabled = false;
                return;
            }
            if (!response || response.status !== 'started') {
                visionBtn.innerText = '👁️';
                visionBtn.disabled = false;
            }
        });
    }
});

// Live AI Vision Logic
document.getElementById('btn-live-vision').addEventListener('click', async () => {
    const btn = document.getElementById('btn-live-vision');
    btn.innerText = 'Select an element...';
    btn.disabled = true;

    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['turndown.js', 'js/content/inspector.js', 'js/content/live-ai-inspector.js', 'js/content/macros.js', 'js/content/extractor.js', 'js/content/main.js']
    }).catch(err => console.error(err));

    chrome.tabs.sendMessage(tab.id, { action: 'START_LIVE_AI_MODE' }, (response) => {
        if (chrome.runtime.lastError) {
            btn.innerText = '👁️ Live AI Vision';
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
        files: ['turndown.js', 'js/content/inspector.js', 'js/content/live-ai-inspector.js', 'js/content/macros.js', 'js/content/extractor.js', 'js/content/main.js']
    }).catch(err => console.error(err));

    chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_MACRO_RECORDING', isRecording: isRecordingMacro });
});

// Enhance Prompt Logic
document.getElementById('btn-enhance-prompt')?.addEventListener('click', () => {
    const promptEl = document.getElementById('nl-prompt');
    if (!promptEl.value.trim()) {
        showToast("Enter a basic idea first to enhance it.", "info");
        return;
    }
    const btn = document.getElementById('btn-enhance-prompt');
    const origText = btn.innerText;
    btn.innerText = '⏳ Enhancing...';
    btn.disabled = true;

    // Send to background to enhance (reuses AI Selector function for simple text-in/text-out)
    const enhancePrompt = `You are an expert prompt engineer. The user wants to scrape a website. Take their short request and expand it into a detailed, professional instruction for a web scraper. \nUser Request: "${promptEl.value}"\nOutput ONLY the improved prompt, no quotes, no extra conversational text.`;

    chrome.runtime.sendMessage({ action: 'PROCESS_AI_WAND', fieldId: 'enhance', query: enhancePrompt, html: 'none' });
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
        files: ['turndown.js', 'js/content/inspector.js', 'js/content/live-ai-inspector.js', 'js/content/macros.js', 'js/content/extractor.js', 'js/content/main.js']
    }).catch(err => console.error(err));

    chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_TEXT' }, (response) => {
        if (chrome.runtime.lastError) return;
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

// --- Dynamic UI & Feedback Logic ---

// Auto-set the version badge based on manifest
const manifest = chrome.runtime.getManifest();
const appVersion = manifest.version;
const badgeEl = document.getElementById('app-version-badge');
if (badgeEl) badgeEl.innerText = `v${appVersion}`;

// Feedback Button Logic
document.getElementById('btn-feedback')?.addEventListener('click', () => {
    // 1. Base URL
    const baseUrl = "https://docs.google.com/forms/d/e/1FAIpQLSd6PMcPs0clpdj_-sUg6yLBCx1lZAHUnjxypWartxsSNA6NpA/viewform?usp=pp_url";

    // 2. Add App Version
    const versionParam = `&entry.2030262534=${encodeURIComponent(appVersion)}`;

    // 3. Attempt to get User Email (Graceful fallback if permission denied/unavailable)
    if (chrome.identity && chrome.identity.getProfileUserInfo) {
        chrome.identity.getProfileUserInfo((userInfo) => {
            const email = userInfo.email || '';
            openForm(email);
        });
    } else {
        openForm('');
    }

    function openForm(userEmail) {
        const emailParam = userEmail ? `&entry.1847764537=${encodeURIComponent(userEmail)}` : "";
        const finalUrl = baseUrl + versionParam + emailParam;
        chrome.tabs.create({ url: finalUrl });
    }
});