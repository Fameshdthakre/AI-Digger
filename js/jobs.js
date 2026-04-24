// === Saved Jobs Logic ===
let savedJobs = {};

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
            nextButtonSelector: "button.loadMoreBtn",
            maxPages: 5,
            paginationWaitMs: 3000,
            infiniteScroll: false
        },
        fields: [
            { name: "Hospital Name", selector: "div.popularTitleTextBlock a", type: "css", extractType: "text", multiple: false, format: "raw", isPrimaryKey: true },
            { name: "Phone", selector: "a[href^='tel:']", type: "css", extractType: "text", multiple: false, format: "raw" },
            { name: "Location", selector: "address.businessArea", type: "css", extractType: "text", multiple: false, format: "raw" },
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

function updateSavedJobsDropdown(selectedJobName = null) {
    const select = document.getElementById('saved-jobs-select');
    select.innerHTML = '<option value="">-- Create a new job --</option>';
    const detailSelect = document.getElementById('linked-detail-job');
    const currentDetailJob = detailSelect.value;
    detailSelect.innerHTML = '<option value="">-- None --</option>';

    for (const jobName in savedJobs) {
        const option = document.createElement('option');
        option.value = jobName;
        option.innerText = jobName;
        if (jobName === selectedJobName) option.selected = true;
        select.appendChild(option);

        // Populate detail job dropdown
        if (jobName !== document.getElementById('job-name').value) {
            const detailOption = document.createElement('option');
            detailOption.value = jobName;
            detailOption.innerText = jobName;
            if (jobName === currentDetailJob) detailOption.selected = true;
            detailSelect.appendChild(detailOption);
        }
    }
}

// Update detail jobs dropdown when job name changes to prevent self-linking
document.getElementById('job-name').addEventListener('input', () => {
    updateSavedJobsDropdown(document.getElementById('saved-jobs-select').value);
});

chrome.storage.local.get(['savedJobs'], (result) => {
    savedJobs = { ...DEFAULT_RECIPES, ...(result.savedJobs || {}) };
    updateSavedJobsDropdown();
});

function getBlueprintFromUI() {
    let primaryKeyField = null;
    const pkRadios = document.querySelectorAll('.f-primary-key');
    pkRadios.forEach((radio, index) => {
        if (radio.checked) {
            const row = radio.closest('.field-row');
            primaryKeyField = row.querySelector('.f-name').value;
        }
    });

    // Fallback if none checked
    if (!primaryKeyField && pkRadios.length > 0) {
        primaryKeyField = pkRadios[0].closest('.field-row').querySelector('.f-name').value;
    }

    let detailUrlField = null;
    const urlRadios = document.querySelectorAll('.f-detail-url');
    urlRadios.forEach((radio) => {
        if (radio.checked) {
            const row = radio.closest('.field-row');
            detailUrlField = row.querySelector('.f-name').value;
        }
    });

    let outFormat = document.getElementById('output-format').value;
    let containerSel = document.getElementById('item-container-selector').value;

    // If using a container, or if no primary key is strictly needed but fields are arrays, force flat.
    if (containerSel && containerSel.trim() !== '') {
        outFormat = 'flat';
    }

    return {
        jobName: document.getElementById('job-name').value,
        scrapingType: document.getElementById('scrape-mode').value,
        outputFormat: outFormat,
        primaryKeyField: primaryKeyField,
        detailUrlField: detailUrlField,
        linkedDetailJob: document.getElementById('linked-detail-job').value,
        maxDetailPages: parseInt(document.getElementById('max-detail-pages').value),
        urls: document.getElementById('url-list').value,
        webhookUrl: document.getElementById('webhook-url').value,
        containerSelector: containerSel,
        maxItems: parseInt(document.getElementById('max-items').value) || 0,
        schedule: {
            enabled: document.getElementById('enable-schedule').checked,
            interval: parseInt(document.getElementById('schedule-interval').value) || 60,
            targetMode: document.getElementById('schedule-target-mode').value,
            startUrl: document.getElementById('schedule-start-url').value,
            multipleUrls: document.getElementById('schedule-multiple-urls').value
        },
        actions: Array.from(document.getElementById('actions-container').querySelectorAll('.field-row')).map(row => ({
            type: row.querySelector('.a-type').value,
            selector: row.querySelector('.a-selector').value,
            text: row.querySelector('.a-text').value
        })).filter(a => a.selector),
        fields: Array.from(document.getElementById('fields-container').querySelectorAll('.field-row')).map(row => ({
            name: row.querySelector('.f-name').value,
            selector: row.querySelector('.f-selector').value,
            type: row.querySelector('.f-type').value,
            extractType: row.querySelector('.f-extract-target').value,
            attributeName: row.querySelector('.f-attr-name').value,
            multiple: row.querySelector('.f-multiple') ? row.querySelector('.f-multiple').checked : false,
            format: row.querySelector('.f-format') ? row.querySelector('.f-format').value : 'raw'
        })).filter(f => f.name && f.selector),
        antiBot: {
            stealthMode: document.getElementById('enable-stealth-mode').checked,
            minDelayMs: parseFloat(document.getElementById('min-delay').value || 1) * 1000,
            maxDelayMs: parseFloat(document.getElementById('max-delay').value || 3) * 1000,
            batchSize: parseInt(document.getElementById('batch-size').value || 0),
            batchPauseMs: parseFloat(document.getElementById('batch-pause').value || 10) * 1000
        },
        singlePageOptions: {
            nextButtonSelector: document.getElementById('next-button-selector').value,
            maxPages: parseInt(document.getElementById('max-pages').value),
            infiniteScroll: document.getElementById('enable-infinite-scroll').checked,
            maxScrolls: parseInt(document.getElementById('max-scrolls').value),
            scrollContainerSelector: document.getElementById('scroll-container-selector').value
        }
    };
}

function handleSaveJobClick(btnElement) {
    const blueprint = getBlueprintFromUI();
    if (!blueprint.jobName) {
        showToast("Please enter a Job Name in the text box below to save it.", "error");
        return;
    }

    if (blueprint.jobName.startsWith("[Template]")) {
        showToast("You cannot overwrite a Template. Please use the 'Clone' button or change the Job Name.", "error");
        return;
    }

    // Don't save default recipes to local storage to save space, only custom ones
    const jobsToSave = { ...savedJobs };
    for (const key in DEFAULT_RECIPES) {
        delete jobsToSave[key];
    }

    jobsToSave[blueprint.jobName] = blueprint;
    savedJobs[blueprint.jobName] = blueprint; // update local memory too

    chrome.storage.local.set({ savedJobs: jobsToSave }, () => {
        updateSavedJobsDropdown(blueprint.jobName);

        // Notify background to update schedules
        chrome.runtime.sendMessage({ action: 'UPDATE_SCHEDULES' });

        const origText = btnElement.innerText;
        btnElement.innerText = 'Saved!';
        btnElement.style.backgroundColor = '#10b981'; // Green
        btnElement.style.borderColor = '#10b981';
        btnElement.style.color = '#ffffff';
        setTimeout(() => {
            btnElement.innerText = origText;
            btnElement.style.backgroundColor = '';
            btnElement.style.borderColor = '';
            btnElement.style.color = '';
        }, 2000);
        showToast(`Job "${blueprint.jobName}" saved successfully!`, 'success');
    });
}

// Bind Top Save Button
document.getElementById('btn-save-job')?.addEventListener('click', function () { handleSaveJobClick(this); });

// Bind Bottom Save Button
document.getElementById('btn-save-job-bottom')?.addEventListener('click', function () { handleSaveJobClick(this); });

document.getElementById('saved-jobs-select').addEventListener('change', (e) => {
    const jobName = e.target.value;
    if (!jobName) {
        // Reset to default new state
        document.getElementById('job-name').value = "My Scraper Job";
        document.getElementById('url-list').value = "";
        document.getElementById('webhook-url').value = '';
        document.getElementById('item-container-selector').value = '';

        document.getElementById('scrape-mode').value = 'single-page';
        document.getElementById('scrape-mode').dispatchEvent(new Event('change'));
        document.getElementById('output-format').value = 'flat';

        document.getElementById('linked-detail-job').value = '';
        document.getElementById('max-detail-pages').value = 10;
        document.getElementById('max-items').value = 0;

        // Reset Pagination
        document.getElementById('next-button-selector').value = '';
        document.getElementById('max-pages').value = 1;
        document.getElementById('enable-infinite-scroll').checked = false;
        document.getElementById('enable-infinite-scroll').dispatchEvent(new Event('change'));
        document.getElementById('max-scrolls').value = 5;
        document.getElementById('scroll-container-selector').value = '';

        // Reset Automation
        document.getElementById('enable-schedule').checked = false;
        document.getElementById('enable-schedule').dispatchEvent(new Event('change'));
        document.getElementById('schedule-interval').value = 60;
        document.getElementById('schedule-target-mode').value = 'active-tab';
        document.getElementById('schedule-target-mode').dispatchEvent(new Event('change'));
        document.getElementById('schedule-start-url').value = '';
        document.getElementById('schedule-multiple-urls').value = '';

        // Reset Anti-Bot
        document.getElementById('enable-stealth-mode').checked = false;
        document.getElementById('min-delay').value = 2;
        document.getElementById('max-delay').value = 5;
        document.getElementById('batch-size').value = 10;
        document.getElementById('batch-pause').value = 10;

        actionsContainer.innerHTML = '';
        actionCount = 0;
        loadDefaultFields();

        // Crucial: Update UI Safeguards to re-show PK buttons based on empty container
        updateUISafeguards();
        return;
    }

    const blueprint = savedJobs[jobName];
    if (!blueprint) return;

    // Set Basic Info
    document.getElementById('job-name').value = blueprint.jobName;
    updateSavedJobsDropdown(jobName); // Ensure detail job dropdown excludes current job
    document.getElementById('linked-detail-job').value = blueprint.linkedDetailJob || '';
    document.getElementById('max-detail-pages').value = blueprint.maxDetailPages || 10;
    document.getElementById('scrape-mode').value = blueprint.scrapingType;
    document.getElementById('scrape-mode').dispatchEvent(new Event('change'));
    if (blueprint.outputFormat) {
        document.getElementById('output-format').value = blueprint.outputFormat;
    }
    document.getElementById('url-list').value = blueprint.urls || '';
    document.getElementById('webhook-url').value = blueprint.webhookUrl || '';
    document.getElementById('item-container-selector').value = blueprint.containerSelector || '';
    document.getElementById('max-items').value = blueprint.maxItems || 0;

    // Trigger safeguard update after value set
    updateUISafeguards();

    // Set Anti-Bot
    if (blueprint.antiBot) {
        document.getElementById('enable-stealth-mode').checked = blueprint.antiBot.stealthMode || false;
        document.getElementById('min-delay').value = (blueprint.antiBot.minDelayMs || 2000) / 1000;
        document.getElementById('max-delay').value = (blueprint.antiBot.maxDelayMs || 5000) / 1000;
        document.getElementById('batch-size').value = blueprint.antiBot.batchSize || 10;
        document.getElementById('batch-pause').value = (blueprint.antiBot.batchPauseMs || 10000) / 1000;
    } else {
        document.getElementById('enable-stealth-mode').checked = false;
    }

    // Set Schedule Options
    if (blueprint.schedule) {
        document.getElementById('enable-schedule').checked = blueprint.schedule.enabled || false;
        document.getElementById('enable-schedule').dispatchEvent(new Event('change'));
        if (blueprint.schedule.interval) {
            document.getElementById('schedule-interval').value = blueprint.schedule.interval;
        }
        if (blueprint.schedule.targetMode) {
            document.getElementById('schedule-target-mode').value = blueprint.schedule.targetMode;
            document.getElementById('schedule-target-mode').dispatchEvent(new Event('change'));
        }
        document.getElementById('schedule-start-url').value = blueprint.schedule.startUrl || '';
        document.getElementById('schedule-multiple-urls').value = blueprint.schedule.multipleUrls || '';
    } else {
        document.getElementById('enable-schedule').checked = false;
        document.getElementById('enable-schedule').dispatchEvent(new Event('change'));
    }

    // Set Single Page Options
    if (blueprint.singlePageOptions) {
        document.getElementById('next-button-selector').value = blueprint.singlePageOptions.nextButtonSelector || '';
        document.getElementById('max-pages').value = blueprint.singlePageOptions.maxPages || 1;
        document.getElementById('enable-infinite-scroll').checked = blueprint.singlePageOptions.infiniteScroll || false;
        document.getElementById('enable-infinite-scroll').dispatchEvent(new Event('change'));
        document.getElementById('max-scrolls').value = blueprint.singlePageOptions.maxScrolls || 5;
        document.getElementById('scroll-container-selector').value = blueprint.singlePageOptions.scrollContainerSelector || '';
    }

    // Set Actions
    actionsContainer.innerHTML = '';
    actionCount = 0;
    if (blueprint.actions && blueprint.actions.length > 0) {
        blueprint.actions.forEach(a => {
            addActionRow(a.type, a.selector, a.text);
        });
    }

    // Set Fields
    fieldsContainer.innerHTML = '';
    fieldCount = 0;
    if (blueprint.fields && blueprint.fields.length > 0) {
        blueprint.fields.forEach(f => {
            addFieldRow(f.name, f.selector, f.type, f.extractType, f.attributeName, f.format || 'raw');
            // Need to set the multiple checkbox manually as addFieldRow doesn't accept it
            const newRow = fieldsContainer.lastElementChild;
            const cb = newRow.querySelector('.f-multiple');
            if (cb) cb.checked = f.multiple || false;

            // Set primary key
            if (blueprint.primaryKeyField === f.name) {
                const pkRadio = newRow.querySelector('.f-primary-key');
                if (pkRadio) pkRadio.checked = true;
            }

            // Set detail URL
            if (blueprint.detailUrlField === f.name) {
                const urlRadio = newRow.querySelector('.f-detail-url');
                if (urlRadio) urlRadio.checked = true;
            }
        });
    } else {
        loadDefaultFields();
    }
});

document.getElementById('btn-delete-job').addEventListener('click', () => {
    const jobName = document.getElementById('saved-jobs-select').value;
    if (!jobName || !savedJobs[jobName]) {
        showToast("Please select a job to delete.", "info");
        return;
    }

    if (jobName.startsWith("[Template]")) {
        showToast("Templates cannot be deleted.", "error");
        return;
    }

    if (confirm(`Are you sure you want to delete the saved job "${jobName}"?`)) {
        delete savedJobs[jobName];

        const jobsToSave = { ...savedJobs };
        for (const key in DEFAULT_RECIPES) {
            delete jobsToSave[key];
        }

        chrome.storage.local.set({ savedJobs: jobsToSave }, () => {
            updateSavedJobsDropdown();
            // Reset to default new state
            document.getElementById('saved-jobs-select').value = "";
            document.getElementById('saved-jobs-select').dispatchEvent(new Event('change'));
            showToast("Job deleted.", 'success');
        });
    }
});

document.getElementById('btn-clone-job').addEventListener('click', () => {
    const jobName = document.getElementById('saved-jobs-select').value;
    if (!jobName || !savedJobs[jobName]) {
        showToast("Please select a job to clone.", "info");
        return;
    }

    let clonedName = jobName;
    if (clonedName.startsWith("[Template] ")) {
        clonedName = clonedName.replace("[Template] ", "Copy of ");
    } else {
        clonedName = `Copy of ${clonedName}`;
    }

    document.getElementById('job-name').value = clonedName;

    // Switch dropdown to "Create a new job" so saving will create a new entry
    document.getElementById('saved-jobs-select').value = "";

    showToast("Job cloned successfully!", 'success');
});

// Import / Export Blueprint Logic
document.getElementById('btn-export-job').addEventListener('click', () => {
    const jobName = document.getElementById('saved-jobs-select').value;
    if (!jobName || !savedJobs[jobName]) {
        showToast("Please select a saved job to export.", "info");
        return;
    }
    const blueprint = savedJobs[jobName];
    const jsonStr = JSON.stringify(blueprint, null, 2);

    // Create the Blob for the JSON data
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // Create a temporary hidden anchor element to trigger the download safely without extra permissions
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `${jobName.replace(/[^a-z0-9]/gi, '_')}_blueprint.json`;
    document.body.appendChild(a);
    a.click();

    // Clean up
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
});

document.getElementById('btn-import-job').addEventListener('click', () => {
    document.getElementById('import-file-input').click();
});

document.getElementById('import-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const importedBlueprint = JSON.parse(event.target.result);
            if (!importedBlueprint.jobName || !importedBlueprint.fields || !Array.isArray(importedBlueprint.fields)) {
                throw new Error("Invalid blueprint format. Missing 'jobName' or 'fields' array.");
            }

            savedJobs[importedBlueprint.jobName] = importedBlueprint;
            chrome.storage.local.set({ savedJobs: savedJobs }, () => {
                updateSavedJobsDropdown(importedBlueprint.jobName);

                // Programmatically trigger the change event to populate the UI
                const select = document.getElementById('saved-jobs-select');
                select.dispatchEvent(new Event('change'));

                showToast("Job imported successfully!", 'success');
            });
        } catch (err) {
            showToast("Invalid JSON file.", 'error');
        }

        // Reset the file input so the same file can be imported again if needed
        e.target.value = '';
    };
    reader.readAsText(file);
});