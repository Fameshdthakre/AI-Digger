/**
 * background.js
 * The "Brain" of the extension. Manages the queue of URLs, applies randomized delays,
 * and orchestrates the content scripts to extract data.
 */

let currentJob = null;
let scrapedData = [];
let isRunning = false;
let jobLogs = [];
let jobProgress = { current: 0, total: 0 };

// Restore job state on service worker startup if a job was running
chrome.storage.local.get(['jobState', 'jobLogs', 'jobProgress'], (res) => {
    if (res.jobState && res.jobState.isRunning) {
        currentJob = res.jobState.blueprint;
        isRunning = true;
        if (res.jobLogs) jobLogs = res.jobLogs;
        if (res.jobProgress) jobProgress = res.jobProgress;
        addLog("Service Worker woke up. Resuming job...");
    }
});

// Allow users to open the side panel by clicking the action toolbar icon
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));

// Listen for messages from the Popup or Content Script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_JOB') {
        startJob(message.blueprint);
        sendResponse({ status: 'started' });
    } else if (message.action === 'STOP_JOB') {
        isRunning = false;
        chrome.alarms.clear("nextJobStep");
        chrome.storage.local.remove('jobState');
        addLog("Job stopped by user.");
        sendResponse({ status: 'stopped' });
    } else if (message.action === 'GET_STATUS') {
        sendResponse({ isRunning, scrapedCount: scrapedData.length, currentJob, jobProgress, jobLogs });
    } else if (message.action === 'SAVE_PAGE_DATA') {
        // Content script sends extracted data here
        if (message.data && message.data.length > 0) {
            scrapedData = scrapedData.concat(message.data);
            // Save to local storage so it persists if the popup closes
            chrome.storage.local.set({ scrapedData: scrapedData });
        }
        sendResponse({ status: 'saved' });
    } else if (message.action === 'CLEAR_DATA') {
        scrapedData = [];
        chrome.storage.local.set({ scrapedData: [] });
        sendResponse({ status: 'cleared' });
    } else if (message.action === 'ANALYZE_PAGE_AI') {
        analyzePageWithAI(message.text).then(fields => {
            chrome.runtime.sendMessage({ action: 'AI_ANALYZE_RESULT', fields: fields });
        }).catch(err => {
            chrome.runtime.sendMessage({ action: 'AI_ANALYZE_RESULT', error: err.message });
        });
        sendResponse({ status: 'analyzing' });
    } else if (message.action === 'MAGIC_BUILD_BLUEPRINT') {
        generateBlueprintWithAI(message.userPrompt, message.pageText).then(blueprint => {
            chrome.runtime.sendMessage({ action: 'MAGIC_BUILD_RESULT', blueprint: blueprint });
        }).catch(err => {
            chrome.runtime.sendMessage({ action: 'MAGIC_BUILD_RESULT', error: err.message });
        });
        sendResponse({ status: 'building' });
    }
    return true; // Keep message channel open for async responses
});

// Load existing data on startup
chrome.storage.local.get(['scrapedData'], (result) => {
    if (result.scrapedData) scrapedData = result.scrapedData;
});

function addLog(message) {
    const timestamp = new Date().toLocaleTimeString();
    jobLogs.push(`[${timestamp}] ${message}`);
    if (jobLogs.length > 100) jobLogs.shift(); // Keep last 100 logs
    chrome.storage.local.set({ jobLogs, jobProgress });
}

// Alarm listener to wake up background script and process next URL/Page
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "nextJobStep") {
        processNextStep();
    }
});

async function startJob(blueprint) {
    currentJob = blueprint;
    isRunning = true;
    jobLogs = [];
    addLog(`Started job: ${blueprint.jobName}`);

    let state = {
        isRunning: true,
        blueprint: blueprint,
        batchCounter: 0
    };
    
    if (blueprint.scrapingType === 'multi-url') {
        state.urlsToScrape = blueprint.urls ? blueprint.urls.split('\n').map(u => u.trim()).filter(u => u) : [];
        state.currentIndex = 0;
        jobProgress.total = state.urlsToScrape.length;
    } else if (blueprint.scrapingType === 'single-page') {
        state.maxPages = blueprint.singlePageOptions?.maxPages || 1;
        state.currentPage = 1;
        jobProgress.total = state.maxPages;

        // Ensure active tab logic
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        state.tabId = tab.id;
    }

    await chrome.storage.local.set({ jobState: state });
    processNextStep();
}

async function processNextStep() {
    const res = await chrome.storage.local.get(['jobState']);
    // Removed the memory-only `!isRunning` check to prevent race conditions
    // when the Service Worker wakes up via alarm before the top-level
    // chrome.storage.local.get callback can set isRunning = true.
    if (!res.jobState || !res.jobState.isRunning) {
        addLog("Job completed or stopped.");
        isRunning = false;
        currentJob = null;
        chrome.storage.local.remove('jobState');
        return;
    }

    // Ensure memory state is synced with storage state in case of SW wake
    isRunning = true;
    currentJob = res.jobState.blueprint;

    let state = res.jobState;
    const blueprint = state.blueprint;

    if (blueprint.scrapingType === 'multi-url') {
        if (state.currentIndex >= state.urlsToScrape.length) {
            completeJob();
            return;
        }

        const url = state.urlsToScrape[state.currentIndex];
        jobProgress.current = state.currentIndex + 1;
        addLog(`Scraping URL ${jobProgress.current}/${state.urlsToScrape.length}: ${url}`);

        try {
            let tab = await createOrUpdateTab(url);
            await sleep(2000);

            await ensureScriptInjected(tab.id);
            await executeActions(tab.id, blueprint.actions);

            if (blueprint.antiBot?.stealthMode) {
                addLog("Executing stealth human emulation...");
                await chrome.tabs.sendMessage(tab.id, { action: 'SIMULATE_STEALTH' }).catch(() => null);
            }

            let extractedData = await scrapeTab(tab.id, blueprint, url);
            if (extractedData) saveExtractedData(extractedData);

            state.batchCounter++;
            let delayMs = getRandomDelay(blueprint.antiBot.minDelayMs, blueprint.antiBot.maxDelayMs);

            if (blueprint.antiBot.batchSize > 0 && state.batchCounter >= blueprint.antiBot.batchSize) {
                addLog(`Batch size reached. Pausing for ${blueprint.antiBot.batchPauseMs}ms`);
                delayMs = blueprint.antiBot.batchPauseMs;
                state.batchCounter = 0;
            }

            state.currentIndex++;
            await chrome.storage.local.set({ jobState: state });

            if (state.currentIndex < state.urlsToScrape.length) {
                addLog(`Waiting ${delayMs}ms before next URL...`);
                // Use setTimeout for actual short delay, alarms as fallback
                chrome.alarms.create("nextJobStep", { when: Date.now() + 60000 }); // 1 min fallback wake up
                setTimeout(processNextStep, delayMs);
            } else {
                completeJob();
            }

        } catch (error) {
            addLog(`ERROR: Failed to load or scrape ${url}: ${error.message}`);
            state.currentIndex++;
            await chrome.storage.local.set({ jobState: state });
            chrome.alarms.create("nextJobStep", { when: Date.now() + 60000 }); // 1 min fallback wake up
            setTimeout(processNextStep, 1000); // Retry next quickly
        }
    } else if (blueprint.scrapingType === 'single-page') {
        if (state.currentPage > state.maxPages) {
            completeJob();
            return;
        }

        jobProgress.current = state.currentPage;
        addLog(`Scraping Page ${state.currentPage} of ${state.maxPages}...`);

        let tabId = state.tabId;

        try {
            await ensureScriptInjected(tabId);
            if (state.currentPage === 1) await executeActions(tabId, blueprint.actions);

            const firstSelectorField = blueprint.fields.find(f => f.type !== 'ai');
            if (firstSelectorField) {
                addLog(`Waiting for ${firstSelectorField.name} to appear...`);
                const waitRes = await chrome.tabs.sendMessage(tabId, { action: 'WAIT_FOR_ELEMENT', selector: firstSelectorField.selector }).catch(()=>null);
                if (waitRes && waitRes.status === 'timeout') addLog(`Timeout waiting for element. Continuing anyway.`);
            } else {
                await sleep(2000);
            }

            if (blueprint.singlePageOptions?.infiniteScroll) {
                let maxScrolls = blueprint.singlePageOptions.maxScrolls || 5;
                addLog(`Scrolling ${maxScrolls} times...`);
                for (let s = 0; s < maxScrolls; s++) {
                    if (!isRunning) return;
                    await chrome.tabs.sendMessage(tabId, { action: 'SCROLL_BOTTOM' }).catch(()=>null);
                    await sleep(getRandomDelay(blueprint.antiBot.minDelayMs, blueprint.antiBot.maxDelayMs));
                }
            }

            let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            let extractedData = await scrapeTab(tabId, blueprint, tab.url);
            if (extractedData) saveExtractedData(extractedData);

            if (state.currentPage < state.maxPages) {
                let nextSelector = blueprint.singlePageOptions?.nextButtonSelector;
                if (!nextSelector) {
                    addLog("No 'Next Button' selector provided. Stopping pagination.");
                    completeJob();
                    return;
                }

                if (blueprint.antiBot?.stealthMode) {
                    addLog("Executing stealth human emulation before navigating...");
                    await chrome.tabs.sendMessage(tabId, { action: 'SIMULATE_STEALTH' }).catch(() => null);
                }

                addLog(`Clicking next page...`);
                let clickRes = await chrome.tabs.sendMessage(tabId, { action: 'CLICK_NEXT', selector: nextSelector }).catch(()=>null);

                if (!clickRes || clickRes.status === 'not_found') {
                    addLog("Next button not found. Reached end of pagination.");
                    completeJob();
                    return;
                }

                let delayMs = getRandomDelay(blueprint.antiBot.minDelayMs, blueprint.antiBot.maxDelayMs);
                state.currentPage++;
                await chrome.storage.local.set({ jobState: state });

                addLog(`Waiting ${delayMs}ms before next page...`);
                chrome.alarms.create("nextJobStep", { when: Date.now() + 60000 }); // 1 min fallback wake up
                setTimeout(processNextStep, delayMs + 2000);
            } else {
                completeJob();
            }
        } catch (err) {
            addLog(`ERROR: Single page scrape failed: ${err.message}`);
            completeJob();
        }
    }
}

function completeJob() {
    isRunning = false;
    currentJob = null;
    chrome.storage.local.remove('jobState');
    addLog("Job completed!");
}

async function ensureScriptInjected(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['turndown.js', 'content.js']
        });
    } catch (err) {
        addLog(`Note: content script inject err (may already exist)`);
    }
}

async function executeActions(tabId, actions) {
    if (!actions || actions.length === 0) return;

    addLog(`Running ${actions.length} pre-extraction actions...`);
    for (let i = 0; i < actions.length; i++) {
        const a = actions[i];
        addLog(`Action: [${a.type}] on ${a.selector}`);
        const res = await chrome.tabs.sendMessage(tabId, { action: 'EXECUTE_ACTION', actionData: a }).catch(() => null);
        if (res && res.status === 'failed') {
            addLog(`Action failed: ${a.type} on ${a.selector}`);
        } else {
            // Small buffer between actions
            await sleep(500);
        }
    }
}

async function scrapeTab(tabId, job, url) {
    let extractedData = await chrome.tabs.sendMessage(tabId, {
        action: 'EXTRACT_DATA',
        blueprint: job
    }).catch(err => {
        addLog(`ERROR: Content script not responding`);
        return null;
    });

    if (extractedData && extractedData._pageMarkdown) {
        // Handle Self-Healing first
        if (extractedData._failedFields && extractedData._failedFields.length > 0) {
            addLog(`Attempting self-healing for ${extractedData._failedFields.length} failed fields...`);
            try {
                const healedData = await processSelfHealing(tabId, job, extractedData._failedFields, extractedData._pageMarkdown);
                extractedData = { ...extractedData, ...healedData.recoveredValues };

                // Update job blueprint locally
                if (healedData.updatedFields.length > 0) {
                    const savedJobsObj = await chrome.storage.local.get(['savedJobs']);
                    let savedJobs = savedJobsObj.savedJobs || {};
                    let jobNeedsUpdate = false;

                    healedData.updatedFields.forEach(healedF => {
                        // Update the running job immediately to prevent re-healing on next URL
                        const currentIdx = currentJob.fields.findIndex(f => f.name === healedF.name);
                        if (currentIdx !== -1) {
                            currentJob.fields[currentIdx].selector = healedF.selector;
                            addLog(`Healed running selector for ${healedF.name}: ${healedF.selector}`);
                            jobNeedsUpdate = true;
                        }

                        // Also update saved profile if applicable
                        if (savedJobs[job.jobName]) {
                            const idx = savedJobs[job.jobName].fields.findIndex(f => f.name === healedF.name);
                            if (idx !== -1) {
                                savedJobs[job.jobName].fields[idx].selector = healedF.selector;
                            }
                        }
                    });

                    if (jobNeedsUpdate) {
                        await chrome.storage.local.set({ savedJobs: savedJobs });
                        // Update the jobState in storage so it persists if the service worker sleeps
                        const stateRes = await chrome.storage.local.get(['jobState']);
                        if (stateRes.jobState) {
                            stateRes.jobState.blueprint = currentJob;
                            await chrome.storage.local.set({ jobState: stateRes.jobState });
                        }
                    }
                }
            } catch (e) {
                addLog(`Self-healing failed: ${e.message}`);
            }
        }

        // Handle standard AI fields
        const aiFields = job.fields.filter(f => f.type === 'ai');
        if (aiFields.length > 0) {
            addLog("Processing AI extraction...");
            try {
                const aiExtracted = await processAIExtraction(job, extractedData._pageMarkdown);

                // Merge AI items with deterministic items
                if (aiExtracted.items && Array.isArray(aiExtracted.items)) {
                    if (!extractedData.items) extractedData.items = [];

                    // If deterministic found 10 items, and AI found 10 items, merge them by index
                    if (extractedData.items.length > 0) {
                        aiExtracted.items.forEach((aiItem, idx) => {
                            if (extractedData.items[idx]) {
                                extractedData.items[idx] = { ...extractedData.items[idx], ...aiItem };
                            } else {
                                extractedData.items.push(aiItem); // Extra AI items
                            }
                        });
                    } else {
                        extractedData.items = aiExtracted.items; // Only AI items exist
                    }
                }
            } catch (e) {
                addLog(`AI Extraction failed: ${e.message}`);
            }
        }

        delete extractedData._pageMarkdown;
        delete extractedData._failedFields;
    }
    return extractedData;
}

function saveExtractedData(data) {
    if (!data) return;

    let rowsToSave = [];

    // CASE 1: Container Model or AI Model (returns structured 'items' array)
    if (data.items && Array.isArray(data.items)) {
        data.items.forEach(itemRow => {
            const finalRow = { ...itemRow };
            if (data.URL) finalRow['URL'] = data.URL;
            if (data.Timestamp) finalRow['Timestamp'] = data.Timestamp;
            rowsToSave.push(finalRow);
        });
    }
    // CASE 2: Flat Model / Legacy (Returns an object with parallel arrays)
    else {
        let maxArrayLength = 0;
        const arrayFields = [];
        const scalarFields = [];

        for (const [key, value] of Object.entries(data)) {
            if (Array.isArray(value)) {
                arrayFields.push(key);
                if (value.length > maxArrayLength) maxArrayLength = value.length;
            } else {
                scalarFields.push(key);
            }
        }

        if (maxArrayLength > 0) {
            // Unpivot arrays into individual rows
            for (let i = 0; i < maxArrayLength; i++) {
                const row = {};
                scalarFields.forEach(key => row[key] = data[key]);
                arrayFields.forEach(key => {
                    // Prevent "undefined" text strings
                    row[key] = data[key][i] !== undefined ? data[key][i] : "";
                });
                rowsToSave.push(row);
            }
        } else {
            // No arrays found, it's just a single flat object
            rowsToSave.push(data);
        }
    }

    // Push clean rows to global storage and trigger webhooks
    rowsToSave.forEach(row => {
        // Clean up internal keys just in case
        delete row['_failedFields'];
        delete row['_pageMarkdown'];

        scrapedData.push(row);
        triggerWebhook(currentJob?.webhookUrl, row);
    });

    chrome.storage.local.set({ scrapedData: scrapedData });
}

function triggerWebhook(url, data) {
    if (!url) return;
    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }).then(res => {
        if (!res.ok) addLog(`Webhook failed: ${res.status} ${res.statusText}`);
    }).catch(err => {
        addLog(`Webhook fetch error: ${err.message}`);
    });
}

// Helper: AI Extraction Caller
async function processAIExtraction(blueprint, text) {
    const settingsObj = await chrome.storage.sync.get(['aiSettings']);
    const settings = settingsObj.aiSettings;

    if (!settings || !settings.aiPlatform) {
        throw new Error("AI Platform not configured in settings.");
    }

    const aiFields = blueprint.fields.filter(f => f.type === 'ai');
    if (aiFields.length === 0) return {};

    // Build the prompt
    let prompt = "You are an expert data extraction agent. Extract the requested fields from the source Markdown.\n";
    prompt += "Each item must represent a discrete row/card/product found in the text. ";
    prompt += "If a field is missing, return null.\n\n";
    prompt += "Fields to extract:\n";
    aiFields.forEach(f => {
        prompt += `- "${f.name}": ${f.selector}\n`;
    });

    // Truncate text to avoid token limits roughly
    const truncatedText = text.substring(0, 30000);
    prompt += `\n\nSource Markdown:\n"""\n${truncatedText}\n"""`;

    let resultJsonStr = "{}";

    if (settings.aiPlatform === 'openai') {
        const apiKey = settings.openai.key;
        const model = settings.openai.model || 'gpt-4o';
        if (!apiKey) throw new Error("OpenAI API key missing.");

        const schemaProperties = {};
        const requiredFields = [];
        aiFields.forEach(f => {
            schemaProperties[f.name] = { type: ["string", "null"] };
            requiredFields.push(f.name);
        });

        const schema = {
            type: "object",
            properties: {
                items: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: schemaProperties,
                        required: requiredFields,
                        additionalProperties: false
                    }
                }
            },
            required: ["items"],
            additionalProperties: false
        };

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.1,
                response_format: { type: "json_schema", json_schema: { name: "extraction", strict: true, schema: schema } }
            })
        });

        if (!response.ok) throw new Error(`OpenAI API error: ${response.statusText}`);
        const data = await response.json();
        resultJsonStr = data.choices[0].message.content;

    } else if (settings.aiPlatform === 'gemini') {
        const apiKey = settings.gemini.key;
        const model = settings.gemini.model || 'gemini-2.5-flash';
        if (!apiKey) throw new Error("Gemini API key missing.");

        const schemaProperties = {};
        aiFields.forEach(f => {
            schemaProperties[f.name] = { type: "string", nullable: true };
        });

        const schema = {
            type: "object",
            properties: {
                items: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: schemaProperties
                    }
                }
            }
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json", responseSchema: schema }
            })
        });

        if (!response.ok) throw new Error(`Gemini API error: ${response.statusText}`);
        const data = await response.json();
        resultJsonStr = data.candidates[0].content.parts[0].text;

    } else if (settings.aiPlatform === 'claude') {
        const apiKey = settings.claude.key;
        const model = settings.claude.model || 'claude-3-5-sonnet-20241022';
        if (!apiKey) throw new Error("Claude API key missing.");

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 1024,
                messages: [{ role: "user", content: prompt }]
            })
        });

        if (!response.ok) throw new Error(`Claude API error: ${response.statusText}`);
        const data = await response.json();
        resultJsonStr = data.content[0].text;
    }

    try {
        // Strip out any markdown fences if the AI ignored instructions
        const cleanStr = resultJsonStr.replace(/^```json/i, '').replace(/```$/, '').trim();
        return JSON.parse(cleanStr);
    } catch (e) {
        console.error("Failed to parse AI response as JSON", resultJsonStr);
        throw new Error("AI returned invalid JSON.");
    }
}

// Helper: Agentic Self-Healing Caller
async function processSelfHealing(tabId, job, failedFields, markdown) {
    const settingsObj = await chrome.storage.sync.get(['aiSettings']);
    const settings = settingsObj.aiSettings;

    if (!settings || !settings.aiPlatform) {
        throw new Error("AI Platform not configured for self-healing.");
    }

    let basePrompt = "You are an expert web scraper recovery agent.\n";
    basePrompt += "The following data fields failed to match any elements on the page using their current CSS/XPath selectors.\n";
    basePrompt += "Given the page Markdown below, find the missing values for these fields, AND deduce a highly resilient, semantic CSS selector for them.\n";
    basePrompt += "Prioritize attributes like data-testid, aria-label, or semantic class names over structural paths.\n\n";
    basePrompt += "Failed Fields:\n";
    failedFields.forEach(f => {
        basePrompt += `- Name: "${f.name}", Old Selector: "${f.selector}"\n`;
    });

    const truncatedText = markdown.substring(0, 30000);
    basePrompt += `\n\nPage Markdown:\n"""\n${truncatedText}\n"""`;

    let attempts = 0;
    let feedback = "";

    while (attempts < 2) {
        attempts++;
        let prompt = basePrompt;
        if (feedback) {
            prompt += `\n\nFeedback from previous attempt:\n${feedback}\nPlease provide alternative selectors.`;
        }

        let resultJsonStr = "{}";

        const schemaPropertiesRecovered = {};
        failedFields.forEach(f => {
            schemaPropertiesRecovered[f.name] = { type: ["string", "null"] };
        });

        const openAiSchema = {
            type: "object",
            properties: {
                recoveredValues: {
                    type: "object",
                    properties: schemaPropertiesRecovered,
                    required: failedFields.map(f => f.name),
                    additionalProperties: false
                },
                updatedFields: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            selector: { type: "string" }
                        },
                        required: ["name", "selector"],
                        additionalProperties: false
                    }
                }
            },
            required: ["recoveredValues", "updatedFields"],
            additionalProperties: false
        };

        const geminiSchema = {
            type: "object",
            properties: {
                recoveredValues: {
                    type: "object",
                    properties: failedFields.reduce((acc, f) => { acc[f.name] = { type: "string", nullable: true }; return acc; }, {})
                },
                updatedFields: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            selector: { type: "string" }
                        }
                    }
                }
            }
        };

        if (settings.aiPlatform === 'openai') {
            const apiKey = settings.openai.key;
            const model = settings.openai.model || 'gpt-4o';
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.1,
                    response_format: { type: "json_schema", json_schema: { name: "healing", strict: true, schema: openAiSchema } }
                })
            });
            if (!response.ok) throw new Error(`OpenAI API error: ${response.statusText}`);
            const data = await response.json();
            resultJsonStr = data.choices[0].message.content;

        } else if (settings.aiPlatform === 'gemini') {
            const apiKey = settings.gemini.key;
            const model = settings.gemini.model || 'gemini-2.5-flash';
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: "application/json", responseSchema: geminiSchema }
                })
            });
            if (!response.ok) throw new Error(`Gemini API error: ${response.statusText}`);
            const data = await response.json();
            resultJsonStr = data.candidates[0].content.parts[0].text;

        } else if (settings.aiPlatform === 'claude') {
            const apiKey = settings.claude.key;
            const model = settings.claude.model || 'claude-3-5-sonnet-20241022';

            let claudePrompt = prompt + "\n\nReturn ONLY a valid JSON object matching this schema:\n" + JSON.stringify(openAiSchema, null, 2);

            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: model,
                    max_tokens: 1024,
                    messages: [{ role: "user", content: claudePrompt }]
                })
            });
            if (!response.ok) throw new Error(`Claude API error: ${response.statusText}`);
            const data = await response.json();
            resultJsonStr = data.content[0].text;
        }

        try {
            const cleanStr = resultJsonStr.replace(/^```json/i, '').replace(/```$/, '').trim();
            const parsed = JSON.parse(cleanStr);

            // Agentic verification step
            let allValid = true;
            let currentFeedback = "";
            const healedFields = parsed.updatedFields || [];

            for (let healedF of healedFields) {
                // Find original field to get its settings
                const originalField = job.fields.find(f => f.name === healedF.name);
                if (!originalField) continue;

                const testField = { ...originalField, selector: healedF.selector };
                const testRes = await chrome.tabs.sendMessage(tabId, { action: 'TEST_SELECTOR', field: testField }).catch(() => null);

                if (!testRes || testRes.result === null || testRes.result === undefined || (Array.isArray(testRes.result) && testRes.result.length === 0)) {
                    allValid = false;
                    currentFeedback += `The selector you provided for "${healedF.name}" (${healedF.selector}) returned null. `;
                }
            }

            if (allValid || attempts >= 2) {
                return {
                    recoveredValues: parsed.recoveredValues || {},
                    updatedFields: parsed.updatedFields || []
                };
            } else {
                addLog(`Self-healing attempt ${attempts} failed validation. Retrying...`);
                feedback = currentFeedback;
            }

        } catch (e) {
            console.error("Failed to parse Self-Healing response as JSON", resultJsonStr);
            if (attempts >= 2) throw new Error("AI returned invalid JSON during recovery.");
        }
    }
}

}

// Helper: AI Blueprint Analyzer Caller
async function analyzePageWithAI(text) {
    const settingsObj = await chrome.storage.sync.get(['aiSettings']);
    const settings = settingsObj.aiSettings;

    if (!settings || !settings.aiPlatform) {
        throw new Error("AI Platform not configured in settings. Please setup your API keys in the Settings tab.");
    }

    const systemPrompt = `You are an expert web scraping architect. Analyze the provided webpage text content.
Determine the page archetype (e.g., E-commerce grid, Vendor Listing, Article) and identify the optimal data fields a user would want to extract.
For each field, write a clear, precise AI extraction prompt (e.g., "What is the price of the item?").`;

    const truncatedText = text.substring(0, 20000);
    const prompt = `${systemPrompt}\n\nWebpage Text:\n"""\n${truncatedText}\n"""`;

    let resultJsonStr = "[]";

    if (settings.aiPlatform === 'openai') {
        const apiKey = settings.openai.key;
        const model = settings.openai.model || 'gpt-4o';
        if (!apiKey) throw new Error("OpenAI API key missing.");

        const openAiSchema = {
            type: "object",
            properties: {
                fields: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            selector: { type: "string" },
                            type: { type: "string", enum: ["ai"] },
                            multiple: { type: "boolean" }
                        },
                        required: ["name", "selector", "type", "multiple"],
                        additionalProperties: false
                    }
                }
            },
            required: ["fields"],
            additionalProperties: false
        };

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.1,
                response_format: { type: "json_schema", json_schema: { name: "analysis", strict: true, schema: openAiSchema } }
            })
        });
        if (!response.ok) throw new Error(`OpenAI API error: ${response.statusText}`);
        const data = await response.json();
        resultJsonStr = data.choices[0].message.content;

    } else if (settings.aiPlatform === 'gemini') {
        const apiKey = settings.gemini.key;
        const model = settings.gemini.model || 'gemini-2.5-flash';
        if (!apiKey) throw new Error("Gemini API key missing.");

        const geminiSchema = {
            type: "object",
            properties: {
                fields: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            selector: { type: "string" },
                            type: { type: "string", enum: ["ai"] },
                            multiple: { type: "boolean" }
                        }
                    }
                }
            }
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json", responseSchema: geminiSchema }
            })
        });
        if (!response.ok) throw new Error(`Gemini API error: ${response.statusText}`);
        const data = await response.json();
        resultJsonStr = data.candidates[0].content.parts[0].text;

    } else if (settings.aiPlatform === 'claude') {
        const apiKey = settings.claude.key;
        const model = settings.claude.model || 'claude-3-5-sonnet-20241022';
        if (!apiKey) throw new Error("Claude API key missing.");

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 1024,
                messages: [{ role: "user", content: prompt }]
            })
        });
        if (!response.ok) throw new Error(`Claude API error: ${response.statusText}`);
        const data = await response.json();
        resultJsonStr = data.content[0].text;
    }

    try {
        const cleanStr = resultJsonStr.replace(/^```json/i, '').replace(/```$/, '').trim();
        let parsed = JSON.parse(cleanStr);
        if (parsed.fields && Array.isArray(parsed.fields)) {
            return parsed.fields;
        }
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error("Failed to parse AI Analyze response as JSON", resultJsonStr);
        throw new Error("AI returned invalid JSON format.");
    }
}

// Helper: Magic Build Caller
async function generateBlueprintWithAI(userPrompt, text) {
    const settingsObj = await chrome.storage.sync.get(['aiSettings']);
    const settings = settingsObj.aiSettings;

    if (!settings || !settings.aiPlatform) {
        throw new Error("AI Platform not configured in settings. Please setup your API keys in the Settings tab.");
    }

    const systemPrompt = `You are an expert web scraping architect. Generate a complete scraping job blueprint based on the user's natural language request and the provided webpage markdown.
Ensure the container selector (if applicable) targets the repeating item card (e.g., .product-card).`;

    const truncatedText = text.substring(0, 20000);
    const prompt = `${systemPrompt}\n\nUser Request:\n"${userPrompt}"\n\nWebpage Markdown:\n"""\n${truncatedText}\n"""`;

    let resultJsonStr = "{}";

    if (settings.aiPlatform === 'openai') {
        const apiKey = settings.openai.key;
        const model = settings.openai.model || 'gpt-4o';
        if (!apiKey) throw new Error("OpenAI API key missing.");

        const blueprintSchema = {
            type: "object",
            properties: {
                jobName: { type: "string" },
                scrapingType: { type: "string", enum: ["single-page", "multi-url"] },
                containerSelector: { type: "string" },
                singlePageOptions: {
                    type: "object",
                    properties: {
                        nextButtonSelector: { type: "string" },
                        maxPages: { type: "integer" },
                        infiniteScroll: { type: "boolean" },
                        maxScrolls: { type: "integer" }
                    },
                    required: ["nextButtonSelector", "maxPages", "infiniteScroll", "maxScrolls"],
                    additionalProperties: false
                },
                fields: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            selector: { type: "string" },
                            type: { type: "string", enum: ["css", "xpath", "ai"] },
                            extractType: { type: "string", enum: ["text", "html", "href", "src", "attribute"] },
                            multiple: { type: "boolean" }
                        },
                        required: ["name", "selector", "type", "extractType", "multiple"],
                        additionalProperties: false
                    }
                }
            },
            required: ["jobName", "scrapingType", "containerSelector", "singlePageOptions", "fields"],
            additionalProperties: false
        };

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.1,
                response_format: { type: "json_schema", json_schema: { name: "blueprint", strict: true, schema: blueprintSchema } }
            })
        });
        if (!response.ok) throw new Error(`OpenAI API error: ${response.statusText}`);
        const data = await response.json();
        resultJsonStr = data.choices[0].message.content;

    } else if (settings.aiPlatform === 'gemini') {
        const apiKey = settings.gemini.key;
        const model = settings.gemini.model || 'gemini-2.5-flash';
        if (!apiKey) throw new Error("Gemini API key missing.");

        const blueprintSchema = {
            type: "object",
            properties: {
                jobName: { type: "string" },
                scrapingType: { type: "string", enum: ["single-page", "multi-url"] },
                containerSelector: { type: "string" },
                singlePageOptions: {
                    type: "object",
                    properties: {
                        nextButtonSelector: { type: "string" },
                        maxPages: { type: "integer" },
                        infiniteScroll: { type: "boolean" },
                        maxScrolls: { type: "integer" }
                    }
                },
                fields: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            selector: { type: "string" },
                            type: { type: "string", enum: ["css", "xpath", "ai"] },
                            extractType: { type: "string", enum: ["text", "html", "href", "src", "attribute"] },
                            multiple: { type: "boolean" }
                        }
                    }
                }
            }
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json", responseSchema: blueprintSchema }
            })
        });
        if (!response.ok) throw new Error(`Gemini API error: ${response.statusText}`);
        const data = await response.json();
        resultJsonStr = data.candidates[0].content.parts[0].text;

    } else if (settings.aiPlatform === 'claude') {
        const apiKey = settings.claude.key;
        const model = settings.claude.model || 'claude-3-5-sonnet-20241022';
        if (!apiKey) throw new Error("Claude API key missing.");

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: model,
                max_tokens: 1024,
                messages: [{ role: "user", content: prompt }]
            })
        });
        if (!response.ok) throw new Error(`Claude API error: ${response.statusText}`);
        const data = await response.json();
        resultJsonStr = data.content[0].text;
    }

    try {
        const cleanStr = resultJsonStr.replace(/^```json/i, '').replace(/```$/, '').trim();
        return JSON.parse(cleanStr);
    } catch (e) {
        console.error("Failed to parse Magic Build response as JSON", resultJsonStr);
        throw new Error("AI returned invalid JSON format.");
    }
}

// Helper: Creates a new tab or updates existing active tab
function createOrUpdateTab(url) {
    return new Promise((resolve, reject) => {
        const timeoutMs = 30000; // 30 second timeout

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.update(tabs[0].id, { url: url }, (updatedTab) => {
                    let isResolved = false;
                    const timeoutId = setTimeout(() => {
                        if (!isResolved) {
                            chrome.tabs.onUpdated.removeListener(listener);
                            reject(new Error(`Timeout waiting for tab to load: ${url}`));
                        }
                    }, timeoutMs);

                    function listener(tabId, info) {
                        if (tabId === updatedTab.id && info.status === 'complete') {
                            isResolved = true;
                            clearTimeout(timeoutId);
                            chrome.tabs.onUpdated.removeListener(listener);
                            resolve(updatedTab);
                        }
                    }
                    chrome.tabs.onUpdated.addListener(listener);
                });
            } else {
                chrome.tabs.create({ url: url }, (newTab) => {
                    let isResolved = false;
                    const timeoutId = setTimeout(() => {
                        if (!isResolved) {
                            chrome.tabs.onUpdated.removeListener(listener);
                            reject(new Error(`Timeout waiting for new tab to load: ${url}`));
                        }
                    }, timeoutMs);

                    function listener(tabId, info) {
                        if (tabId === newTab.id && info.status === 'complete') {
                            isResolved = true;
                            clearTimeout(timeoutId);
                            chrome.tabs.onUpdated.removeListener(listener);
                            resolve(newTab);
                        }
                    }
                    chrome.tabs.onUpdated.addListener(listener);
                });
            }
        });
    });
}

// Helper: Sleep function for delays
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper: Random number generator for human-like delays
function getRandomDelay(min, max) {
    min = parseInt(min) || 1000;
    max = parseInt(max) || 3000;
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
