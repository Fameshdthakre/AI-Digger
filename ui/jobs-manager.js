/**
 * ui/jobs-manager.js
 * Logic for saved jobs, templates, and profile management in the UI.
 */

import { showToast } from './utils.js';
import { FieldsManager } from './fields.js';
import { ActionsManager } from './actions.js';

const DEFAULT_RECIPES = {
    "Lincoln Electric Product": {
        jobName: "Lincoln Electric Product",
        scrapingType: "single-page",
        outputFormat: "flat",
        fields: [
            { name: "Title", selector: ".hero-product__title", type: "css", extractType: "text", multiple: false, format: "raw" },
            { name: "SKU", selector: ".hero-product__subtitle", type: "css", extractType: "text", multiple: false, format: "raw" },
            { name: "MSRP", selector: "span.current", type: "css", extractType: "text", multiple: false, format: "raw" },
            { name: "IncludedItems", selector: "a[href*='/en/Products/']", type: "css", extractType: "href", multiple: true, format: "raw", follow: true, followJob: "Lincoln Electric Detail" }
        ],
        waitOptions: { waitForSelector: ".hero-product__title", maxWaitMs: 15000 },
        antiBot: { stealthMode: true, minDelayMs: 2000, maxDelayMs: 5000 }
    },
    "YellowPages Hospitals": {
        jobName: "YellowPages Hospitals",
        scrapingType: "single-page",
        outputFormat: "flat",
        containerSelector: "ul.popularThisWeekList > li",
        singlePageOptions: {
            nextButtonSelector: ".loadMoreBtn",
            maxPages: 5,
            paginationWaitMs: 3000,
            infiniteScroll: false
        },
        fields: [
            { name: "Hospital Name", selector: "div.popularTitleTextBlock a", type: "css", extractType: "text", multiple: false, format: "raw", isPrimaryKey: true },
            { name: "Phone", selector: "a[href^='tel:']", type: "css", extractType: "text", multiple: false, format: "raw" },
            { name: "Location", selector: "div.popularAddress, .popularAddress", type: "css", extractType: "text", multiple: false, format: "raw" },
            { name: "Detail URL", selector: "div.popularTitleTextBlock a", type: "css", extractType: "href", multiple: false, format: "raw", follow: true, followJob: "Hospital Detail" }
        ],
        waitOptions: { waitForSelector: "ul.popularThisWeekList", maxWaitMs: 15000 },
        antiBot: { stealthMode: true, minDelayMs: 3000, maxDelayMs: 6000 }
    },
    "Hospital Detail": {
        jobName: "Hospital Detail",
        scrapingType: "single-page",
        fields: [
            { name: "About", selector: ".about-section", type: "css", extractType: "text", multiple: false, format: "raw" },
            { name: "Address", selector: ".contact-address", type: "css", extractType: "text", multiple: false, format: "raw" }
        ],
        antiBot: { stealthMode: true, minDelayMs: 1000, maxDelayMs: 3000 }
    },
    "Amazon Product Search": {
        jobName: "Amazon Product Search",
        scrapingType: "single-page",
        outputFormat: "flat",
        primaryKeyField: "Product Title",
        detailUrlField: "Product Link",
        linkedDetailJob: "",
        maxDetailPages: 10,
        urls: "",
        webhookUrl: "",
        containerSelector: "div[data-component-type='s-search-result']",
        maxItems: 0,
        singlePageOptions: {
            nextButtonSelector: "a.s-pagination-next",
            maxPages: 3,
            infiniteScroll: false,
            maxScrolls: 5
        },
        schedule: { enabled: false, interval: 60, targetMode: "active-tab", startUrl: "", multipleUrls: "" },
        fields: [
            { name: "Product Title", selector: "h2 a span", type: "css", extractType: "text", multiple: false, format: "raw", attributeName: "" },
            { name: "Price", selector: ".a-price-whole", type: "css", extractType: "text", multiple: false, format: "raw", attributeName: "" },
            { name: "Product Link", selector: "h2 a", type: "css", extractType: "href", multiple: false, format: "raw", attributeName: "" }
        ],
        actions: [],
        antiBot: { stealthMode: true, minDelayMs: 3000, maxDelayMs: 6000, batchSize: 10, batchPauseMs: 10000 }
    },
    "LinkedIn Company Data": {
        jobName: "LinkedIn Company Data",
        scrapingType: "single-page",
        outputFormat: "flat",
        primaryKeyField: "Company Name",
        detailUrlField: "Website",
        linkedDetailJob: "",
        maxDetailPages: 10,
        urls: "",
        webhookUrl: "",
        containerSelector: ".org-top-card-summary-info-list",
        maxItems: 0,
        singlePageOptions: { maxPages: 1, infiniteScroll: false, maxScrolls: 5, nextButtonSelector: "" },
        schedule: { enabled: false, interval: 60, targetMode: "active-tab", startUrl: "", multipleUrls: "" },
        fields: [
            { name: "Company Name", selector: "h1", type: "css", extractType: "text", multiple: false, format: "raw", attributeName: "" },
            { name: "Website", selector: "a.link-without-visited-state", type: "css", extractType: "href", multiple: false, format: "raw", attributeName: "" },
            { name: "Industry", selector: ".org-top-card-summary-info-list__info-item", type: "css", extractType: "text", multiple: false, format: "raw", attributeName: "" }
        ],
        actions: [],
        antiBot: { stealthMode: true, minDelayMs: 2000, maxDelayMs: 5000, batchSize: 10, batchPauseMs: 10000 }
    },
    "Generic Blog Scraper": {
        jobName: "Generic Blog Scraper",
        scrapingType: "single-page",
        outputFormat: "flat",
        primaryKeyField: "Article Title",
        detailUrlField: "Link",
        linkedDetailJob: "",
        maxDetailPages: 10,
        urls: "",
        webhookUrl: "",
        containerSelector: "article",
        maxItems: 0,
        singlePageOptions: {
            nextButtonSelector: "a.next, .pagination-next",
            maxPages: 5,
            infiniteScroll: false,
            maxScrolls: 5
        },
        schedule: { enabled: false, interval: 60, targetMode: "active-tab", startUrl: "", multipleUrls: "" },
        fields: [
            { name: "Article Title", selector: "h2", type: "css", extractType: "text", multiple: false, format: "raw", attributeName: "" },
            { name: "Author", selector: ".author", type: "css", extractType: "text", multiple: false, format: "raw", attributeName: "" },
            { name: "Publish Date", selector: "time", type: "css", extractType: "text", multiple: false, format: "raw", attributeName: "" },
            { name: "Link", selector: "a", type: "css", extractType: "href", multiple: false, format: "raw", attributeName: "" }
        ],
        actions: [],
        antiBot: { stealthMode: false, minDelayMs: 1000, maxDelayMs: 3000, batchSize: 0, batchPauseMs: 10000 }
    }
};

export const JobsUIManager = {
    savedJobs: {},

    async init() {
        await this.loadJobs();
        this.bindEvents();
    },

    async loadJobs() {
        const res = await new Promise(r => chrome.storage.local.get(['savedJobs'], r));
        this.savedJobs = { ...DEFAULT_RECIPES, ...(res.savedJobs || {}) };
        this.updateDropdowns();
    },

    bindEvents() {
        document.getElementById('saved-jobs-select')?.addEventListener('change', (e) => this.loadJobToUI(e.target.value));
        document.getElementById('btn-save-job')?.addEventListener('click', () => this.saveCurrentJob());
        document.getElementById('btn-save-job-bottom')?.addEventListener('click', () => this.saveCurrentJob());
        document.getElementById('btn-clone-job')?.addEventListener('click', () => this.cloneJob());
        document.getElementById('btn-delete-job')?.addEventListener('click', () => this.deleteJob());
        document.getElementById('btn-export-job')?.addEventListener('click', () => this.exportJob());
        document.getElementById('btn-import-job')?.addEventListener('click', () => document.getElementById('import-file-input').click());
        document.getElementById('import-file-input')?.addEventListener('change', (e) => this.importJob(e));
    },

    updateDropdowns(selectedName = null) {
        const select = document.getElementById('saved-jobs-select');
        if (!select) return;
        select.innerHTML = '<option value="">-- Create a new job --</option>';

        const detailSelect = document.getElementById('linked-detail-job');
        if (detailSelect) detailSelect.innerHTML = '<option value="">-- None --</option>';

        for (const name in this.savedJobs) {
            const opt = new Option(name, name);
            if (name === selectedName) opt.selected = true;
            select.add(opt);

            if (detailSelect && name !== document.getElementById('job-name').value) {
                detailSelect.add(new Option(name, name));
            }
        }

        const followSelects = document.querySelectorAll('.f-follow-job');
        followSelects.forEach(s => {
            const currentVal = s.value;
            s.innerHTML = '<option value="">-- Select Job --</option>';
            for (const name in this.savedJobs) {
                s.add(new Option(name, name));
            }
            s.value = currentVal;
        });
    },

    loadJobToUI(jobName, directBlueprint = null) {
        if (!jobName && !directBlueprint) {
            this.resetUI();
            return;
        }
        const job = directBlueprint || this.savedJobs[jobName];
        if (!job) return;

        // Basic Config
        document.getElementById('job-name').value = job.jobName || "";
        document.getElementById('scrape-mode').value = job.scrapingType || "single-page";
        document.getElementById('scrape-mode').dispatchEvent(new Event('change'));
        document.getElementById('output-format').value = job.outputFormat || "flat";
        document.getElementById('item-container-selector').value = job.containerSelector || '';
        document.getElementById('max-items').value = job.maxItems || 0;
        document.getElementById('url-list').value = job.urls || "";
        document.getElementById('linked-detail-job').value = job.linkedDetailJob || "";
        document.getElementById('max-detail-pages').value = job.maxDetailPages || 10;
        document.getElementById('webhook-url').value = job.webhookUrl || "";

        // Single Page / Pagination
        const spo = job.singlePageOptions || {};
        document.getElementById('next-button-selector').value = spo.nextButtonSelector || "";
        document.getElementById('max-pages').value = spo.maxPages || 1;
        document.getElementById('pagination-wait-ms').value = spo.paginationWaitMs || 2000;
        document.getElementById('enable-infinite-scroll').checked = !!spo.infiniteScroll;
        document.getElementById('max-scrolls').value = spo.maxScrolls || 5;
        document.getElementById('scroll-container-selector').value = spo.scrollContainerSelector || "";
        
        // Trigger UI updates for sections
        document.getElementById('enable-infinite-scroll').dispatchEvent(new Event('change'));

        // Wait Settings
        const wo = job.waitOptions || {};
        document.getElementById('wait-for-selector').value = wo.waitForSelector || "";
        document.getElementById('max-wait-ms').value = wo.maxWaitMs || 15000;

        // Anti-Bot
        const ab = job.antiBot || {};
        document.getElementById('enable-stealth-mode').checked = !!ab.stealthMode;
        document.getElementById('stealth-level').value = ab.stealthLevel || "advanced";
        document.getElementById('min-delay').value = (ab.minDelayMs || 1000) / 1000;
        document.getElementById('max-delay').value = (ab.maxDelayMs || 3000) / 1000;
        document.getElementById('batch-size').value = ab.batchSize || 0;
        document.getElementById('batch-pause').value = (ab.batchPauseMs || 10000) / 1000;
        
        document.getElementById('enable-stealth-mode').dispatchEvent(new Event('change'));

        // Schedule
        const sch = job.schedule || {};
        document.getElementById('enable-schedule').checked = !!sch.enabled;
        document.getElementById('schedule-interval').value = sch.interval || 60;
        document.getElementById('schedule-target-mode').value = sch.targetMode || "active-tab";
        document.getElementById('schedule-start-url').value = sch.startUrl || "";
        document.getElementById('schedule-multiple-urls').value = sch.multipleUrls || "";
        
        document.getElementById('enable-schedule').dispatchEvent(new Event('change'));

        // Schema
        document.getElementById('data-schema').value = job.schema ? JSON.stringify(job.schema, null, 2) : "";

        // Populate Fields
        const fieldsContainer = document.getElementById('fields-container');
        fieldsContainer.innerHTML = '';
        if (job.fields) {
            job.fields.forEach(f => {
                FieldsManager.addFieldRow(f.name, f.selector, f.type, f.extractType, f.attributeName, f.format);
                const row = fieldsContainer.lastElementChild;
                if (f.follow) {
                    const cb = row.querySelector('.f-follow');
                    if (cb) cb.checked = true;
                    const select = row.querySelector('.f-follow-job');
                    if (select) {
                        select.style.display = 'block';
                        select.value = f.followJob || '';
                    }
                }
                if (f.multiple) {
                    const cb = row.querySelector('.f-multiple');
                    if (cb) cb.checked = true;
                }
                if (f.isPrimaryKey) {
                    const rb = row.querySelector('.f-primary-key');
                    if (rb) rb.checked = true;
                }
                if (f.isDetailUrl) {
                    const rb = row.querySelector('.f-detail-url');
                    if (rb) rb.checked = true;
                }
            });
        }

        // Populate Actions
        const actionsContainer = document.getElementById('actions-container');
        actionsContainer.innerHTML = '';
        if (job.actions) {
            job.actions.forEach(a => ActionsManager.addActionRow(a.type, a.selector, a.text));
        }

        FieldsManager.updateUISafeguards();
        this.updateSummarySubtitles(job);
    },

    updateSummarySubtitles(job) {
        if (!job) return;

        // Scoping
        const subtitleContainer = document.getElementById('subtitle-container');
        if (subtitleContainer) {
            subtitleContainer.innerText = job.containerSelector ? `Scoped: ${job.containerSelector}` : "Full Page Mode";
        }

        // Wait Settings
        const wo = job.waitOptions || {};
        const subtitleWait = document.getElementById('subtitle-wait');
        if (subtitleWait) {
            subtitleWait.innerText = wo.waitForSelector ? `Wait: ${wo.waitForSelector}` : "None";
            subtitleWait.style.color = wo.waitForSelector ? 'var(--magic-bg)' : 'var(--text-muted)';
        }

        // Pre-Extraction Actions
        const actionsCount = job.actions?.length || 0;
        const subtitleActions = document.getElementById('subtitle-actions');
        if (subtitleActions) {
            subtitleActions.innerText = actionsCount > 0 ? `${actionsCount} Actions Configured` : "None";
            subtitleActions.style.color = actionsCount > 0 ? 'var(--magic-bg)' : 'var(--text-muted)';
        }

        // Single Page / Pagination
        const spo = job.singlePageOptions || {};
        const subtitlePag = document.getElementById('subtitle-pagination');
        if (subtitlePag) {
            if (job.scrapingType === 'single-page') {
                subtitlePag.innerText = spo.nextButtonSelector ? `Next: ${spo.nextButtonSelector}` : "No pagination";
                subtitlePag.style.color = spo.nextButtonSelector ? 'var(--magic-bg)' : 'var(--text-muted)';
            } else {
                subtitlePag.innerText = "N/A (Multi-URL Mode)";
                subtitlePag.style.color = 'var(--text-muted)';
            }
        }

        // Anti-Bot
        const ab = job.antiBot || {};
        const subtitleAnti = document.getElementById('subtitle-antibot');
        if (subtitleAnti) {
            subtitleAnti.innerText = `Stealth ${ab.stealthMode ? 'On' : 'Off'}, ${ab.minDelayMs/1000}-${ab.maxDelayMs/1000}s`;
            subtitleAnti.style.color = ab.stealthMode ? 'var(--magic-bg)' : 'var(--text-muted)';
        }

        // Schedule
        const sch = job.schedule || {};
        const subtitleSch = document.getElementById('subtitle-schedule');
        if (subtitleSch) {
            subtitleSch.innerText = sch.enabled ? `Every ${sch.interval}m` : "Off";
            subtitleSch.style.color = sch.enabled ? 'var(--success)' : 'var(--text-muted)';
        }
    },

    resetUI() {
        document.getElementById('job-name').value = "My Scraper Job";
        document.getElementById('item-container-selector').value = '';
        document.getElementById('fields-container').innerHTML = '';
        document.getElementById('actions-container').innerHTML = '';
        FieldsManager.addFieldRow(); // Add one empty field
        FieldsManager.updateUISafeguards();
    },

    async saveCurrentJob() {
        const blueprint = FieldsManager.getBlueprintFromUI();
        if (!blueprint.jobName || blueprint.jobName.startsWith("[Template]")) {
            showToast("Invalid Job Name", "error");
            return;
        }

        const jobsToSave = { ...this.savedJobs };
        Object.keys(DEFAULT_RECIPES).forEach(k => delete jobsToSave[k]);
        jobsToSave[blueprint.jobName] = blueprint;

        await chrome.storage.local.set({ savedJobs: jobsToSave });
        this.savedJobs[blueprint.jobName] = blueprint;
        this.updateDropdowns(blueprint.jobName);
        chrome.runtime.sendMessage({ action: 'UPDATE_SCHEDULES' });
        showToast("Job Saved!");
    }

    // ... (implement clone, delete, export, import)
};
