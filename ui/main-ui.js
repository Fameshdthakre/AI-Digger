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
import { showToast, ensureScripts } from './utils.js';

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
    setupAntiBotEvents();
    setupMessageListeners();
    updateAppInfo();
});

function setupAntiBotEvents() {
    const stealthCheckbox = document.getElementById('enable-stealth-mode');
    const stealthOptions = document.getElementById('stealth-options');
    
    stealthCheckbox?.addEventListener('change', (e) => {
        if (stealthOptions) stealthOptions.style.display = e.target.checked ? 'block' : 'none';
    });
}

function setupTabNavigation() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.id === 'tab-dashboard') {
                chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
                return;
            }
            const target = tab.getAttribute('data-target');
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            tab.classList.add('active');
            if (target) document.getElementById(target).classList.add('active');
        });
    });
}

function setupMainButtons() {
    // Global Listener for Wand Clicks (AI Selector Generation)
    document.addEventListener('click', async (e) => {
        const wandBtn = e.target.closest('.btn-wand');
        if (wandBtn) {
            let fieldId;
            if (wandBtn.id === 'wand-item-container-btn') fieldId = 'item-container-selector';
            else if (wandBtn.id === 'wand-next-button-btn') fieldId = 'next-button-selector';
            else if (wandBtn.id === 'wand-scroll-container-btn') fieldId = 'scroll-container-selector';
            else {
                const row = wandBtn.closest('.field-row') || wandBtn.closest('.action-row');
                if (!row) return;
                fieldId = row.id;
            }

            if (!fieldId) return;

            const query = prompt("What element do you want to find here? (e.g., 'The main product container' or 'The next page button')");
            if (!query) return;

            wandBtn.innerText = '⏳';
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await ensureScripts(tab.id);

            chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_TEXT' }, (response) => {
                if (chrome.runtime.lastError || !response?.text) {
                    wandBtn.innerText = '🪄';
                    return showToast("Could not read page content.", "error");
                }
                chrome.runtime.sendMessage({ action: 'PROCESS_AI_WAND', fieldId, query, html: response.text });
            });
        }

        const parentWandBtn = e.target.closest('.btn-parent-wand');
        if (parentWandBtn) {
            let fieldId;
            if (parentWandBtn.id === 'parent-item-container-btn' || parentWandBtn.closest('#item-container-selector-row')) {
                fieldId = 'item-container-selector';
            } else {
                const row = parentWandBtn.closest('.field-row') || parentWandBtn.closest('.action-row');
                if (!row) return;
                fieldId = row.id;
            }

            if (!fieldId) return;

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await ensureScripts(tab.id);

            chrome.tabs.sendMessage(tab.id, { action: 'START_INSPECTOR_FOR_FIELD', fieldId, mode: 'parent' }, (res) => {
                if (res?.status === 'inspector_started') {
                    parentWandBtn.style.backgroundColor = 'var(--magic-bg)';
                    parentWandBtn.innerText = '🎯';
                }
            });
        }
    });

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
        await ensureScripts(tab.id);

        chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_TEXT' }, (res) => {
            if (res?.text) {
                chrome.runtime.sendMessage({ action: 'MAGIC_BUILD_BLUEPRINT', userPrompt: promptText, pageText: res.text });
            } else {
                btn.innerText = 'Generate Blueprint';
                btn.disabled = false;
                showToast("Could not read page content.", "error");
            }
        });
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
                JobsUIManager.loadJobToUI(null, msg.blueprint); // Pass null for name to indicate it's a new draft
                showToast("Magic Build Complete!");
            } else {
                showToast(msg.error || "Magic Build failed", "error");
            }
        } else if (msg.action === 'INSPECTOR_RESULT') {
            handleInspectorResult(msg);
        }
    });
}

function handleSelectorResult(msg) {
    let input, wandBtn;
    if (msg.fieldId === 'item-container-selector') {
        input = document.getElementById('item-container-selector');
        wandBtn = document.getElementById('wand-item-container-btn');
    } else {
        const row = document.getElementById(msg.fieldId);
        if (row) {
            input = row.querySelector('.f-selector') || row.querySelector('.a-selector');
            wandBtn = row.querySelector('.btn-wand');
        }
    }

    if (input) {
        input.value = msg.selector;
        input.dispatchEvent(new Event('input'));
        showToast("AI Selector Generated!");
    }
    if (wandBtn) wandBtn.innerText = '🪄';
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
