/**
 * ui/main-ui.js
 * Entry point for the side panel UI.
 */

import { FieldsManager } from './fields.js';
import { ActionsManager } from './actions.js';
import { SettingsManager } from './settings.js';
import { DashboardManager } from './dashboard-manager.js';
import { JobsUIManager } from './jobs-manager.js';
import { ExportManager } from './export-manager.js';
import { showToast, ensureScripts, safeSendTab } from './utils.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize All Managers
    FieldsManager.init();
    ActionsManager.init();
    SettingsManager.init();
    DashboardManager.init();
    ExportManager.init();
    await JobsUIManager.init();

    window.JobsUIManager = JobsUIManager;
    window.FieldsManager = FieldsManager;

    setupTabNavigation();
    setupMainButtons();
    FieldsManager.updateUISafeguards();
    setupMessageListeners();
    updateAppInfo();
    setupFeedbackLink("#btn-feedback");

    window.updateAiFeatureState = updateAiFeatureState;
    await updateAiFeatureState();
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.aiSettings) {
            updateAiFeatureState();
        }
    });
});

export async function updateAiFeatureState() {
    const isConfigured = await SettingsManager.isAiConfigured();
    
    // Disable Magic Build
    const magicBuildBtn = document.getElementById('btn-generate-blueprint');
    if (magicBuildBtn) {
        magicBuildBtn.disabled = !isConfigured;
        if (!isConfigured) {
            magicBuildBtn.title = "Configure AI API Key in Settings to enable Magic Build";
            magicBuildBtn.style.opacity = '0.5';
            magicBuildBtn.style.cursor = 'not-allowed';
        } else {
            magicBuildBtn.title = "Generate extraction blueprint using AI";
            magicBuildBtn.style.opacity = '1';
            magicBuildBtn.style.cursor = 'pointer';
        }
    }

    // Disable AI options in f-type
    document.querySelectorAll('.f-type').forEach(select => {
        let changed = false;
        Array.from(select.options).forEach(opt => {
            if (opt.value === 'ai' || opt.value === 'vision') {
                opt.disabled = !isConfigured;
            }
        });
        if (!isConfigured && (select.value === 'ai' || select.value === 'vision')) {
            select.value = 'css';
            changed = true;
        }
        if (changed) {
            select.dispatchEvent(new Event('change'));
        }
    });
}


function setupTabNavigation() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {

            const target = tab.getAttribute('data-target');
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            tab.classList.add('active');
            if (target) document.getElementById(target).classList.add('active');
        });
    });
}

function setupMainButtons() {
    document.getElementById('btn-start')?.addEventListener('click', async () => {
        const blueprint = FieldsManager.getBlueprintFromUI();
        const append = document.getElementById('append-data-toggle').checked;

        if (!append) await chrome.runtime.sendMessage({ action: 'CLEAR_DATA' });
        
        chrome.runtime.sendMessage({ action: 'START_JOB', blueprint }, () => {
            document.querySelector('[data-target="view-run"]').click();
        });
    });

    document.getElementById('btn-stop')?.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'STOP_JOB' });
    });

    // Smart Container Scan
    document.getElementById('btn-auto-detect')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-auto-detect');
        btn.innerText = '⏳ Scanning...';
        btn.disabled = true;

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const injected = await ensureScripts(tab.id);
        if (!injected) {
            btn.innerText = '🎯 Smart Container Scan';
            btn.disabled = false;
            return;
        }

        safeSendTab(tab.id, { action: 'START_AUTO_DETECT' }, (res) => {
            // The actual result comes via AUTO_DETECT_RESULT message
            if (res?.status !== 'started') {
                btn.innerText = '🎯 Smart Container Scan';
                btn.disabled = false;
                showToast('Failed to start auto-detect.', 'error');
            }
        }, { resetBtn: btn, resetIcon: '🎯 Smart Container Scan' });
    });

    document.getElementById('btn-clear')?.addEventListener('click', () => {
        if (confirm("Clear all stored data?")) {
            chrome.runtime.sendMessage({ action: 'CLEAR_DATA' });
        }
    });

    document.getElementById('btn-generate-blueprint')?.addEventListener('click', async () => {
        const promptText = document.getElementById('nl-prompt').value;
        if (!promptText) return showToast("Enter a description", "error");

        const btn = document.getElementById('btn-generate-blueprint');
        btn.innerText = 'Generating...';
        btn.disabled = true;

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const injected = await ensureScripts(tab.id);
        if (!injected) {
            btn.innerText = 'Generate Blueprint';
            btn.disabled = false;
            return;
        }

        safeSendTab(tab.id, { action: 'GET_PAGE_TEXT' }, (res) => {
            if (res?.text) {
                chrome.runtime.sendMessage({ action: 'MAGIC_BUILD_BLUEPRINT', userPrompt: promptText, pageText: res.text });
            } else {
                btn.innerText = 'Generate Blueprint';
                btn.disabled = false;
                showToast("Could not read page content.", "error");
            }
        }, { resetBtn: btn, resetIcon: 'Generate Blueprint' });
    });
}

function setupMessageListeners() {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === 'AI_SELECTOR_RESULT') {
            handleSelectorResult(msg);
        } else if (msg.action === 'MAGIC_BUILD_RESULT') {
            const btn = document.getElementById('btn-generate-blueprint');
            btn.innerText = 'Generate Blueprint';
            btn.disabled = false;

            if (msg.blueprint) {
                JobsUIManager.loadJobToUI(null, msg.blueprint);
                showToast("Magic Build Complete!");
            } else {
                showToast(msg.error || "Magic Build failed", "error");
            }
        } else if (msg.action === 'INSPECTOR_RESULT') {
            handleInspectorResult(msg);
        } else if (msg.action === 'AUTO_DETECT_RESULT') {
            // Reset the Smart Container Scan button
            const btn = document.getElementById('btn-auto-detect');
            if (btn) { btn.innerText = '🎯 Smart Container Scan'; btn.disabled = false; }

            if (msg.fields && msg.fields.length > 0) {
                // Clear existing fields and add detected ones
                document.getElementById('fields-container').innerHTML = '';
                msg.fields.forEach(f => {
                    FieldsManager.addFieldRow(f.name || '', f.selector || '', 'css', f.extractType || 'text');
                });
                showToast(`Detected ${msg.fields.length} field(s)!`, 'success');
            } else if (msg.status !== 'stopped') {
                showToast('No fields detected. Try clicking a different element.', 'info');
            }
        } else if (msg.action === 'INSPECTOR_CANCELLED') {
            // Reset inspect buttons on dynamic field/action rows
            const row = document.getElementById(msg.fieldId);
            if (row) {
                const inspectBtn = row.querySelector('.inspect-btn') || row.querySelector('.a-inspect');
                if (inspectBtn) { inspectBtn.innerText = '🔍'; inspectBtn.style.backgroundColor = ''; }
            }
            // Reset fixed selector buttons (container, next, scroll)
            const fixedBtnMap = {
                'item-container-selector': 'inspect-container-btn',
                'next-button-selector': 'inspect-next-btn',
                'scroll-container-selector': 'inspect-scroll-container-btn'
            };
            const fixedBtnId = fixedBtnMap[msg.fieldId];
            if (fixedBtnId) {
                const btn = document.getElementById(fixedBtnId);
                if (btn) { btn.innerText = '🔍'; btn.style.backgroundColor = ''; }
            }
        }
    });
}

function handleSelectorResult(msg) {
    let input;
    if (msg.fieldId === 'item-container-selector') {
        input = document.getElementById('item-container-selector');
    } else {
        const row = document.getElementById(msg.fieldId);
        if (row) {
            input = row.querySelector('.f-selector') || row.querySelector('.a-selector');
        }
    }

    if (input && msg.selector) {
        input.value = msg.selector;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        showToast("Selector acquired!", "success");
    } else {
        showToast("Failed to acquire selector.", "error");
    }
}

function handleInspectorResult(msg) {
    let input, inspectBtn, parentBtn;
    if (msg.fieldId === 'item-container-selector') {
        input = document.getElementById('item-container-selector');
        inspectBtn = document.getElementById('inspect-container-btn');
        parentBtn = document.getElementById('parent-item-container-btn') || document.querySelector('#item-container-selector-row .btn-parent-wand');
    } else {
        const row = document.getElementById(msg.fieldId);
        if (row) {
            input = row.querySelector('.f-selector') || row.querySelector('.a-selector');
            inspectBtn = row.querySelector('.inspect-btn') || row.querySelector('.a-inspect');
            parentBtn = row.querySelector('.btn-parent-wand');
        }
    }

    if (input) {
        input.value = msg.selector;
        input.dispatchEvent(new Event('input'));
    }
    if (inspectBtn) {
        inspectBtn.innerText = '🔍';
        inspectBtn.style.backgroundColor = '';
    }
    if (parentBtn) {
        parentBtn.innerText = '📦';
        parentBtn.style.backgroundColor = '';
    }
}

function updateAppInfo() {
    const manifest = chrome.runtime.getManifest();
    const badge = document.getElementById('app-version-badge');
    if (badge) badge.innerText = `v${manifest.version}`;
}

/**
 * Sets up the Feedback link logic
 * @param {string} selector - CSS selector for the feedback link
 */
function setupFeedbackLink(selector = "#feedbackLink") {
    const feedbackLink = document.querySelector(selector);
    if (!feedbackLink) return;

    feedbackLink.addEventListener("click", (e) => {
        e.preventDefault();
        const manifest = chrome.runtime.getManifest();
        let appName = manifest.name;
        if (chrome.i18n && chrome.i18n.getMessage) {
            const i18nName = chrome.i18n.getMessage("appName");
            if (i18nName) appName = i18nName;
        }
        const version = `${appName} ${manifest.version}`;
        const baseUrl =
            "https://docs.google.com/forms/d/e/1FAIpQLSeZ4zNH3_Jiov3JnTa5K2VXffCCkDSsh-KvK_h3kIxmbejoIg/viewform";
        const versionFieldId = "entry.2030262534";
        const params = new URLSearchParams();
        params.append("usp", "pp_url");
        if (versionFieldId) params.append(versionFieldId, version);
        const finalUrl = `${baseUrl}?${params.toString()}`;
        chrome.tabs.create({ url: finalUrl });
    });
}

