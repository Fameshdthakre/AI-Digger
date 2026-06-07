/**
 * ui/actions.js
 * Logic for pre-extraction macros.
 */

import { ensureScripts, safeSendTab, showToast } from './utils.js';

let actionCount = 0;
const actionsContainer = document.getElementById('actions-container');

export const ActionsManager = {
    init() {
        document.getElementById('add-action')?.addEventListener('click', () => this.addActionRow());
        document.getElementById('btn-record-macro')?.addEventListener('click', () => this.toggleMacroRecording());
    },

    addActionRow(type = 'click', selector = '', text = '') {
        actionCount++;
        const actionId = `action_${Date.now()}_${actionCount}`;
        const div = document.createElement('div');
        div.className = 'action-row';
        div.id = actionId;
        div.style.padding = '8px';
        div.innerHTML = `
            <div style="display: flex; gap: 8px; align-items: center;">
                <select class="a-type" style="width: 100px;">
                    <option value="click" ${type === 'click' ? 'selected' : ''}>Click</option>
                    <option value="type" ${type === 'type' ? 'selected' : ''}>Type Text</option>
                    <option value="wait" ${type === 'wait' ? 'selected' : ''}>Wait For</option>
                </select>
                <button class="inspect-btn a-inspect" title="Inspect Selector">🔍</button>
                <button class="test-btn a-test" title="Test Action">🧪</button>
                <input type="text" placeholder="CSS or XPath Selector" class="a-selector" value="${selector}" style="flex: 1;" />
                <input type="text" placeholder="Text to type" class="a-text" value="${text}" style="width: 120px; ${type === 'type' ? '' : 'display: none;'}" />
                <button class="remove-field" style="position: static;" title="Remove Action">🗑️</button>
            </div>
            <div class="preview-box a-preview" style="margin-top: 8px;"></div>
        `;

        const triggerUpdate = () => {
            if (window.FieldsManager && window.JobsUIManager) {
                const blueprint = window.FieldsManager.getBlueprintFromUI();
                window.JobsUIManager.updateSummarySubtitles(blueprint);
            }
        };

        div.querySelector('.remove-field').addEventListener('click', () => {
            div.remove();
            triggerUpdate();
        });

        const typeSelect = div.querySelector('.a-type');
        typeSelect.addEventListener('change', (e) => {
            div.querySelector('.a-text').style.display = e.target.value === 'type' ? 'block' : 'none';
            triggerUpdate();
        });

        div.querySelector('.a-selector').addEventListener('input', triggerUpdate);

        div.querySelector('.a-test').addEventListener('click', () => this.testAction(div));
        div.querySelector('.a-inspect').addEventListener('click', () => this.startInspector(actionId));

        actionsContainer.appendChild(div);
        triggerUpdate();
        if (typeof window.updateAiFeatureState === 'function') {
            window.updateAiFeatureState();
        }
    },

    async testAction(div) {
        const selector = div.querySelector('.a-selector').value;
        if (!selector) return;
        const testBtn = div.querySelector('.a-test');
        testBtn.innerText = '⏳';

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const injected = await ensureScripts(tab.id);
        if (!injected) { testBtn.innerText = '🧪'; return; }

        safeSendTab(tab.id, { action: 'TEST_SELECTOR', field: { selector, type: 'css', extractType: 'exists' } }, (res) => {
            testBtn.innerText = '🧪';
            const preview = div.querySelector('.a-preview');
            preview.style.display = 'block';
            preview.innerText = res?.result ? "Element found!" : "Element not found.";
            preview.style.color = res?.result ? '#10b981' : '#ef4444';
        }, { resetBtn: testBtn, resetIcon: '🧪' });
    },

    async startInspector(fieldId) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const injected = await ensureScripts(tab.id);
        if (!injected) return;

        safeSendTab(tab.id, { action: 'START_INSPECTOR_FOR_FIELD', fieldId, mode: 'css' }, (res) => {
            if (res?.status === 'inspector_started') {
                const btn = document.getElementById(fieldId).querySelector('.a-inspect');
                btn.style.backgroundColor = 'var(--magic-bg)';
                btn.innerText = '🎯';
            }
        });
    },

    isRecording: false,
    async toggleMacroRecording() {
        this.isRecording = !this.isRecording;
        const btn = document.getElementById('btn-record-macro');
        btn.innerText = this.isRecording ? '⏹ Stop Recording' : '🔴 Record Actions';
        btn.style.backgroundColor = this.isRecording ? '#fee2e2' : 'transparent';

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const injected = await ensureScripts(tab.id);
        if (!injected) {
            // Revert toggle state if injection failed
            this.isRecording = !this.isRecording;
            btn.innerText = this.isRecording ? '⏹ Stop Recording' : '🔴 Record Actions';
            btn.style.backgroundColor = this.isRecording ? '#fee2e2' : 'transparent';
            return;
        }

        safeSendTab(tab.id, { action: 'TOGGLE_MACRO_RECORDING', isRecording: this.isRecording }, () => {});
    }
};
