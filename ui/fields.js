/**
 * ui/fields.js
 * Logic for dynamic field rows and inspector integration.
 */

import { showToast } from './utils.js';

let fieldCount = 0;
const fieldsContainer = document.getElementById('fields-container');

export const FieldsManager = {
    init() {
        document.getElementById('add-field')?.addEventListener('click', () => this.addFieldRow());
        document.getElementById('inspect-container-btn')?.addEventListener('click', () => this.startInspector('item-container-selector'));
        document.getElementById('test-container-btn')?.addEventListener('click', () => this.testSelector('item-container-selector', 'count'));
        document.getElementById('inspect-next-btn')?.addEventListener('click', () => this.startInspector('next-button-selector'));
        document.getElementById('test-next-btn')?.addEventListener('click', () => this.testSelector('next-button-selector', 'exists'));

        // Trigger UI updates and summary subtitles when any setting changes
        const triggerUpdate = () => {
            this.updateUISafeguards();
            const currentBlueprint = this.getBlueprintFromUI();
            // We need access to JobsUIManager, but to avoid circular imports, 
            // we can dispatch a custom event or check if it's available on window
            if (window.JobsUIManager) {
                window.JobsUIManager.updateSummarySubtitles(currentBlueprint);
            }
        };

        ['item-container-selector', 'wait-for-selector', 'max-wait-ms', 'next-button-selector', 'enable-stealth-mode', 'stealth-level', 'min-delay', 'max-delay', 'enable-schedule', 'schedule-interval', 'scrape-mode'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', triggerUpdate);
                el.addEventListener('change', triggerUpdate);
            }
        });
    },

    addFieldRow(name = '', selector = '', type = 'css', extractType = 'text', attrName = '', format = 'raw') {
        fieldCount++;
        const fieldId = `field_${Date.now()}_${fieldCount}`;
        const div = document.createElement('div');
        div.className = 'field-row';
        div.id = fieldId;
        div.innerHTML = `
            <div class="field-row-top">
                <label class="checkbox-label" style="width: auto; margin-right: 4px;" title="Set as Primary Key">
                    <input type="radio" name="primary-key-radio" class="f-primary-key" ${fieldCount === 1 ? 'checked' : ''} /> PK
                </label>
                <label class="checkbox-label" style="width: auto; margin-right: 4px;" title="Set as Detail URL">
                    <input type="radio" name="detail-url-radio" class="f-detail-url" /> URL
                </label>
                <input type="text" placeholder="Field Name" class="f-name" value="${name}" style="flex: 1;" />
                <select class="f-type" style="width: 100px;">
                    <option value="css" ${type === 'css' ? 'selected' : ''}>CSS</option>
                    <option value="xpath" ${type === 'xpath' ? 'selected' : ''}>XPath</option>
                    <option value="ai" ${type === 'ai' ? 'selected' : ''}>AI Prompt</option>
                    <option value="vision" ${type === 'vision' ? 'selected' : ''}>AI Vision</option>
                </select>
                <select class="f-extract-target" style="width: 120px; ${type === 'ai' ? 'display: none;' : ''}">
                    <option value="text" ${extractType === 'text' ? 'selected' : ''}>Text (innerText)</option>
                    <option value="html" ${extractType === 'html' ? 'selected' : ''}>HTML (innerHTML)</option>
                    <option value="href" ${extractType === 'href' ? 'selected' : ''}>Link (href)</option>
                    <option value="src" ${extractType === 'src' ? 'selected' : ''}>Image (src)</option>
                    <option value="attribute" ${extractType === 'attribute' ? 'selected' : ''}>Custom Attribute</option>
                </select>
                <input type="text" class="f-attr-name" placeholder="attr name" value="${attrName}" style="width: 80px; ${extractType === 'attribute' ? '' : 'display: none;'}" />
                <select class="f-format" style="width: 110px;">
                    <option value="raw" ${format === 'raw' ? 'selected' : ''}>Raw Data</option>
                    <option value="numbers" ${format === 'numbers' ? 'selected' : ''}>Numbers Only</option>
                    <option value="letters" ${format === 'letters' ? 'selected' : ''}>Letters Only</option>
                    <option value="email" ${format === 'email' ? 'selected' : ''}>Extract Email</option>
                    <option value="trim" ${format === 'trim' ? 'selected' : ''}>Trim Whitespace</option>
                </select>
                <button class="remove-field" title="Remove Field">🗑️</button>
            </div>
            <div class="field-row-bottom">
                <button class="btn-wand" title="Describe to AI" style="flex-shrink: 0; padding: 4px 8px; font-size: 14px; background: transparent; border: 1px solid var(--border); border-radius: 4px; border-top-right-radius: 0; border-bottom-right-radius: 0; cursor: pointer; border-right: none; ${type === 'ai' ? 'display: none;' : ''}">🪄</button>
                <button class="btn-parent-wand" title="Find Parent Container with AI" style="flex-shrink: 0; padding: 4px 8px; font-size: 14px; background: transparent; border: 1px solid var(--border); border-radius: 4px; border-top-left-radius: 0; border-bottom-left-radius: 0; cursor: pointer; ${type === 'ai' ? 'display: none;' : ''}">📦</button>
                <button class="inspect-btn" title="Inspect Selector" style="${type === 'ai' ? 'display: none;' : ''}">🔍</button>
                <button class="test-btn" title="Test Selector" style="${type === 'ai' ? 'display: none;' : ''}">🧪</button>
                <input type="text" placeholder="CSS Selector, XPath, or AI Prompt" class="f-selector" value="${selector}" style="flex: 1;" />
                <label class="checkbox-label" style="width: auto; flex-shrink: 0; margin-left: auto; ${type === 'ai' ? 'display: none;' : ''}">
                    <input type="checkbox" class="f-multiple" title="Extract an Array of multiple items" /> Array
                </label>
                <label class="checkbox-label" style="width: auto; flex-shrink: 0; margin-left: 8px;">
                    <input type="checkbox" class="f-follow" title="Follow this link and scrape with another job" /> Follow
                </label>
                <select class="f-follow-job" style="width: 100px; display: none; margin-left: 4px; font-size: 10px;">
                    <option value="">-- Select Job --</option>
                </select>
            </div>
            <div class="preview-box"></div>
        `;

        div.querySelector('.remove-field').addEventListener('click', () => div.remove());

        const typeSelect = div.querySelector('.f-type');
        const targetSelect = div.querySelector('.f-extract-target');
        const attrInput = div.querySelector('.f-attr-name');
        const inspectBtn = div.querySelector('.inspect-btn');
        const testBtn = div.querySelector('.test-btn');

        typeSelect.addEventListener('change', (e) => {
            const isAI = e.target.value === 'ai';
            const isVision = e.target.value === 'vision';
            const isAnyAI = isAI || isVision;

            targetSelect.style.display = isAnyAI ? 'none' : 'block';
            attrInput.style.display = (!isAnyAI && targetSelect.value === 'attribute') ? 'block' : 'none';
            inspectBtn.style.display = isAnyAI ? 'none' : 'flex';
            testBtn.style.display = isAnyAI ? 'none' : 'flex';
            div.querySelector('.f-multiple').parentElement.style.display = isAnyAI ? 'none' : 'flex';
            div.querySelector('.btn-wand').style.display = isAnyAI ? 'none' : 'flex';
            div.querySelector('.btn-parent-wand').style.display = isAnyAI ? 'none' : 'flex';
        });

        const followCb = div.querySelector('.f-follow');
        const followJobSelect = div.querySelector('.f-follow-job');
        followCb.addEventListener('change', (e) => {
            followJobSelect.style.display = e.target.checked ? 'block' : 'none';
        });

        targetSelect.addEventListener('change', (e) => {
            attrInput.style.display = e.target.value === 'attribute' ? 'block' : 'none';
        });

        inspectBtn.addEventListener('click', () => this.startInspector(fieldId, typeSelect.value));
        testBtn.addEventListener('click', () => this.testFieldSelector(div));

        fieldsContainer.appendChild(div);
        this.updateUISafeguards();
    },

    async startInspector(fieldId, mode = 'css') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await this.ensureScripts(tab.id);
        chrome.tabs.sendMessage(tab.id, { action: 'START_INSPECTOR_FOR_FIELD', fieldId, mode }, (res) => {
            if (res?.status === 'inspector_started') {
                const btn = document.getElementById(fieldId)?.querySelector('.inspect-btn') || 
                            document.getElementById(`inspect-${fieldId.replace('-selector', '').replace('item-container', 'container').replace('next-button', 'next')}-btn`);
                if (btn) {
                    btn.style.backgroundColor = 'var(--magic-bg)';
                    btn.innerText = '🎯';
                }
            }
        });
    },

    async testFieldSelector(div) {
        const selectorInput = div.querySelector('.f-selector');
        if (!selectorInput.value) return;

        const testBtn = div.querySelector('.test-btn');
        testBtn.innerText = '⏳';

        const fieldData = {
            name: div.querySelector('.f-name').value || 'Preview',
            selector: selectorInput.value,
            type: div.querySelector('.f-type').value,
            extractType: div.querySelector('.f-extract-target').value,
            attributeName: div.querySelector('.f-attr-name').value,
            multiple: div.querySelector('.f-multiple').checked,
            format: div.querySelector('.f-format').value
        };

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await this.ensureScripts(tab.id);
        chrome.tabs.sendMessage(tab.id, { action: 'TEST_SELECTOR', field: fieldData }, (response) => {
            testBtn.innerText = '🧪';
            const previewBox = div.querySelector('.preview-box');
            previewBox.style.display = 'block';
            if (response?.result !== undefined && response.result !== null) {
                previewBox.style.color = 'var(--text-main)';
                previewBox.innerText = typeof response.result === 'object' ? JSON.stringify(response.result, null, 2) : response.result;
            } else {
                previewBox.style.color = '#ef4444';
                previewBox.innerText = "No results found.";
            }
        });
    },

    async testSelector(inputId, extractType) {
        const selectorInput = document.getElementById(inputId);
        const selector = selectorInput.value.trim();
        if (!selector) return;

        const buttonId = `test-${inputId.replace('-selector', '').replace('item-container', 'container').replace('next-button', 'next')}-btn`;
        const testBtn = document.getElementById(buttonId);
        if (testBtn) testBtn.innerText = '⏳';

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await this.ensureScripts(tab.id);

        // Auto-detect type if not specified
        const type = (selector.startsWith('//') || selector.startsWith('(') || selector.startsWith('xpath:')) ? 'xpath' : 'css';
        const cleanSelector = selector.replace(/^xpath:\s*/, '');

        chrome.tabs.sendMessage(tab.id, { 
            action: 'TEST_SELECTOR', 
            field: { selector: cleanSelector, type, extractType } 
        }, (response) => {
            if (testBtn) testBtn.innerText = '🧪';
            const previewBox = document.getElementById(`${inputId.replace('-selector', '')}-preview-box`);
            if (previewBox) {
                previewBox.style.display = 'block';
                if (extractType === 'count') {
                    const count = response?.result || 0;
                    previewBox.innerText = count > 0 ? `Found ${count} items!` : "No items found.";
                    previewBox.style.color = count > 0 ? '#10b981' : '#ef4444';
                } else {
                    previewBox.innerText = response?.result ? "Found!" : "Not found.";
                    previewBox.style.color = response?.result ? '#10b981' : '#ef4444';
                }
            }
        });
    },

    async ensureScripts(tabId) {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['turndown.js', 'js/content/inspector.js', 'js/content/macros.js', 'js/content/auto-detect.js', 'js/content/extractor.js', 'js/content/main.js']
        }).catch(() => null);
    },

    updateUISafeguards() {
        const containerInput = document.getElementById('item-container-selector');
        if (!containerInput) return;
        
        const hasContainer = containerInput.value.trim() !== '';
        
        // Update Subtitle Status
        const subtitle = document.getElementById('subtitle-container');
        if (subtitle) {
            subtitle.innerText = hasContainer ? `Scoped: ${containerInput.value.trim()}` : "Full Page Mode";
            subtitle.style.color = hasContainer ? 'var(--magic-bg)' : 'var(--text-muted)';
        }

        const outputFormat = document.getElementById('output-format');
        if (outputFormat?.parentElement) outputFormat.parentElement.style.display = hasContainer ? 'none' : 'block';
        
        const maxItemsGroup = document.getElementById('max-items-group');
        if (maxItemsGroup) maxItemsGroup.style.display = hasContainer ? 'flex' : 'none';

        // Note: We DO NOT disable PK anymore, as it's needed for deduplication even in scoped mode.
        
        document.querySelectorAll('.f-multiple').forEach(cb => {
            cb.disabled = hasContainer;
            cb.parentElement.style.opacity = hasContainer ? '0.5' : '1';
            if (hasContainer) cb.checked = false; // Usually single items per container
        });
    },

    getBlueprintFromUI() {
        const fields = [];
        document.querySelectorAll('.field-row').forEach(row => {
            if (row.id.startsWith('field_')) {
                fields.push({
                    name: row.querySelector('.f-name').value,
                    selector: row.querySelector('.f-selector').value,
                    type: row.querySelector('.f-type').value,
                    extractType: row.querySelector('.f-extract-target').value,
                    attributeName: row.querySelector('.f-attr-name').value,
                    format: row.querySelector('.f-format').value,
                    multiple: row.querySelector('.f-multiple').checked,
                    isPrimaryKey: row.querySelector('.f-primary-key').checked,
                    isDetailUrl: row.querySelector('.f-detail-url').checked,
                    follow: row.querySelector('.f-follow').checked,
                    followJob: row.querySelector('.f-follow-job').value
                });
            }
        });

        const actions = [];
        document.querySelectorAll('.action-row').forEach(row => {
            actions.push({
                type: row.querySelector('.a-type').value,
                selector: row.querySelector('.a-selector').value,
                text: row.querySelector('.a-text').value
            });
        });

        return {
            jobName: document.getElementById('job-name').value,
            scrapingType: document.getElementById('scrape-mode').value,
            outputFormat: document.getElementById('output-format').value,
            containerSelector: document.getElementById('item-container-selector').value,
            maxItems: parseInt(document.getElementById('max-items').value) || 0,
            urls: document.getElementById('url-list').value,
            linkedDetailJob: document.getElementById('linked-detail-job').value,
            maxDetailPages: parseInt(document.getElementById('max-detail-pages').value) || 10,
            webhookUrl: document.getElementById('webhook-url').value,
            fields: fields,
            actions: actions,
            singlePageOptions: {
                nextButtonSelector: document.getElementById('next-button-selector').value,
                maxPages: parseInt(document.getElementById('max-pages').value) || 1,
                paginationWaitMs: parseInt(document.getElementById('pagination-wait-ms').value) || 2000,
                infiniteScroll: document.getElementById('enable-infinite-scroll').checked,
                maxScrolls: parseInt(document.getElementById('max-scrolls').value) || 5,
                scrollContainerSelector: document.getElementById('scroll-container-selector').value
            },
            waitOptions: {
                waitForSelector: document.getElementById('wait-for-selector').value,
                maxWaitMs: parseInt(document.getElementById('max-wait-ms').value) || 15000
            },
            antiBot: {
                stealthMode: document.getElementById('enable-stealth-mode').checked,
                stealthLevel: document.getElementById('stealth-level').value,
                minDelayMs: parseFloat(document.getElementById('min-delay').value || 1) * 1000,
                maxDelayMs: parseFloat(document.getElementById('max-delay').value || 3) * 1000,
                batchSize: parseInt(document.getElementById('batch-size').value) || 0,
                batchPauseMs: parseFloat(document.getElementById('batch-pause').value || 10) * 1000
            },
            schedule: {
                enabled: document.getElementById('enable-schedule').checked,
                interval: parseInt(document.getElementById('schedule-interval').value) || 60,
                targetMode: document.getElementById('schedule-target-mode').value,
                startUrl: document.getElementById('schedule-start-url').value,
                multipleUrls: document.getElementById('schedule-multiple-urls').value
            },
            schema: document.getElementById('data-schema').value ? JSON.parse(document.getElementById('data-schema').value) : null
        };
    }
};
