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

// Allow users to open the side panel by clicking the action toolbar icon
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));

// Listen for messages from the Popup or Content Script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_JOB') {
        startJob(message.blueprint);
        sendResponse({ status: 'started' });
    } else if (message.action === 'STOP_JOB') {
        isRunning = false;
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
}

async function startJob(blueprint) {
    currentJob = blueprint;
    isRunning = true;
    jobLogs = [];
    addLog(`Started job: ${blueprint.jobName}`);
    
    if (blueprint.scrapingType === 'multi-url') {
        let urlsToScrape = blueprint.urls ? blueprint.urls.split('\n').map(u => u.trim()).filter(u => u) : [];
        jobProgress.total = urlsToScrape.length;
        let batchCounter = 0;

        for (let i = 0; i < urlsToScrape.length; i++) {
            if (!isRunning) break; // Stop if user cancelled

            const url = urlsToScrape[i];
            jobProgress.current = i + 1;
            addLog(`Scraping URL ${i + 1}/${urlsToScrape.length}: ${url}`);

            try {
                let tab = await createOrUpdateTab(url);
                await sleep(2000);

                await ensureScriptInjected(tab.id);

                await executeActions(tab.id, currentJob.actions);

                let extractedData = await scrapeTab(tab.id, currentJob, url);
                if (extractedData) saveExtractedData(extractedData);

                batchCounter++;
                let delayMs = getRandomDelay(blueprint.antiBot.minDelayMs, blueprint.antiBot.maxDelayMs);

                if (blueprint.antiBot.batchSize > 0 && batchCounter >= blueprint.antiBot.batchSize) {
                    addLog(`Batch size reached. Pausing for ${blueprint.antiBot.batchPauseMs}ms`);
                    delayMs = blueprint.antiBot.batchPauseMs;
                    batchCounter = 0;
                }

                if (i < urlsToScrape.length - 1 && isRunning) {
                    addLog(`Waiting ${delayMs}ms before next URL...`);
                    await sleep(delayMs);
                }

            } catch (error) {
                addLog(`ERROR: Failed to load or scrape ${url}: ${error.message}`);
            }
        }
    } else if (blueprint.scrapingType === 'single-page') {
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        let maxPages = blueprint.singlePageOptions?.maxPages || 1;
        jobProgress.total = maxPages;

        await ensureScriptInjected(tab.id);

        await executeActions(tab.id, blueprint.actions);

        // Ensure there is at least one CSS/XPath field to wait for to determine page loaded
        const firstSelectorField = blueprint.fields.find(f => f.type !== 'ai');

        for (let page = 1; page <= maxPages; page++) {
            if (!isRunning) break;
            jobProgress.current = page;
            addLog(`Scraping Page ${page} of ${maxPages}...`);

            // Smart Wait: Wait for the first configured element to appear in DOM before extracting
            if (firstSelectorField) {
                addLog(`Waiting for ${firstSelectorField.name} to appear...`);
                const waitRes = await chrome.tabs.sendMessage(tab.id, { action: 'WAIT_FOR_ELEMENT', selector: firstSelectorField.selector }).catch(()=>null);
                if (waitRes && waitRes.status === 'timeout') {
                    addLog(`Timeout waiting for element. Continuing anyway.`);
                }
            } else {
                await sleep(2000); // fallback
            }

            // Infinite Scroll Logic
            if (blueprint.singlePageOptions?.infiniteScroll) {
                let maxScrolls = blueprint.singlePageOptions.maxScrolls || 5;
                addLog(`Scrolling ${maxScrolls} times...`);
                for (let s = 0; s < maxScrolls; s++) {
                    if (!isRunning) break;
                    await chrome.tabs.sendMessage(tab.id, { action: 'SCROLL_BOTTOM' }).catch(()=>null);
                    await sleep(getRandomDelay(blueprint.antiBot.minDelayMs, blueprint.antiBot.maxDelayMs));
                }
            }

            let extractedData = await scrapeTab(tab.id, currentJob, tab.url);
            if (extractedData) saveExtractedData(extractedData);

            if (page < maxPages && isRunning) {
                let nextSelector = blueprint.singlePageOptions?.nextButtonSelector;
                if (!nextSelector) {
                    addLog("No 'Next Button' selector provided. Stopping pagination.");
                    break;
                }

                addLog(`Clicking next page...`);
                let clickRes = await chrome.tabs.sendMessage(tab.id, { action: 'CLICK_NEXT', selector: nextSelector }).catch(()=>null);

                if (!clickRes || clickRes.status === 'not_found') {
                    addLog("Next button not found. Reached end of pagination.");
                    break;
                }

                // Re-inject script in case page navigation cleared it (with retry wrapper)
                await sleep(1000);
                await ensureScriptInjected(tab.id);
            }
        }
    }
    
    isRunning = false;
    currentJob = null;
    addLog("Job completed!");
}

async function ensureScriptInjected(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
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

    if (extractedData && extractedData._pageText) {
        addLog("Processing AI extraction...");
        try {
            const aiExtracted = await processAIExtraction(job, extractedData._pageText);
            delete extractedData._pageText;
            extractedData = { ...extractedData, ...aiExtracted };
        } catch (e) {
            addLog(`AI Extraction failed: ${e.message}`);
        }
    }
    return extractedData;
}

function saveExtractedData(data) {
    // Check if any field returned an array (multiple items)
    let maxArrayLength = 0;
    const arrayFields = [];
    const scalarFields = [];

    for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value)) {
            arrayFields.push(key);
            if (value.length > maxArrayLength) {
                maxArrayLength = value.length;
            }
        } else {
            scalarFields.push(key);
        }
    }

    if (maxArrayLength > 0) {
        // Unpivot/Transpose arrays into individual rows
        for (let i = 0; i < maxArrayLength; i++) {
            const row = {};
            // Copy scalar values (like URL, Timestamp, or non-multiple fields)
            scalarFields.forEach(key => row[key] = data[key]);
            // Copy array values for this index
            arrayFields.forEach(key => {
                row[key] = data[key][i] !== undefined ? data[key][i] : null;
            });
            scrapedData.push(row);
        }
    } else {
        // No arrays, just push the single row
        scrapedData.push(data);
    }

    chrome.storage.local.set({ scrapedData: scrapedData });
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
    let prompt = "Extract the following information from the text provided below. Return ONLY a valid JSON object where the keys are the Field Names exactly as requested. Do not wrap in markdown tags or add explanations.\n\n";
    prompt += "Fields to extract:\n";
    aiFields.forEach(f => {
        let typeHint = f.multiple ? " (Must return an array of strings)" : " (Return a single string)";
        prompt += `- "${f.name}": ${f.selector}${typeHint}\n`;
    });

    // Truncate text to avoid token limits roughly
    const truncatedText = text.substring(0, 30000);
    prompt += `\n\nSource Text:\n"""\n${truncatedText}\n"""`;

    let resultJsonStr = "{}";

    if (settings.aiPlatform === 'openai') {
        const apiKey = settings.openai.key;
        const model = settings.openai.model || 'gpt-4o';
        if (!apiKey) throw new Error("OpenAI API key missing.");

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
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) throw new Error(`OpenAI API error: ${response.statusText}`);
        const data = await response.json();
        resultJsonStr = data.choices[0].message.content;

    } else if (settings.aiPlatform === 'gemini') {
        const apiKey = settings.gemini.key;
        const model = settings.gemini.model || 'gemini-2.5-flash';
        if (!apiKey) throw new Error("Gemini API key missing.");

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
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

// Helper: AI Blueprint Analyzer Caller
async function analyzePageWithAI(text) {
    const settingsObj = await chrome.storage.sync.get(['aiSettings']);
    const settings = settingsObj.aiSettings;

    if (!settings || !settings.aiPlatform) {
        throw new Error("AI Platform not configured in settings. Please setup your API keys in the Settings tab.");
    }

    const systemPrompt = `You are an expert web scraping assistant. I will provide you with the text content of a webpage.
    Your goal is to figure out what type of page this is (e.g., E-commerce product list, Real Estate listings, News Articles, etc.)
    and suggest the optimal data fields a user would want to extract.

    Return your response strictly as a JSON array of objects. Do not wrap in markdown tags.
    Each object must have exactly these keys:
    - "name": string (e.g. "Product Price")
    - "selector": string (the exact AI prompt to extract this field, e.g. "What is the price of the item?")
    - "type": "ai"
    - "multiple": boolean (true if it's a list/grid of items, false if it's a single page item)
    `;

    const truncatedText = text.substring(0, 20000);
    const prompt = `${systemPrompt}\n\nWebpage Text:\n"""\n${truncatedText}\n"""`;

    let resultJsonStr = "[]";

    if (settings.aiPlatform === 'openai') {
        const apiKey = settings.openai.key;
        const model = settings.openai.model || 'gpt-4o';
        if (!apiKey) throw new Error("OpenAI API key missing.");

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.1,
                response_format: { type: "json_object" } // Using json_object wrapper to enforce structure
            })
        });
        if (!response.ok) throw new Error(`OpenAI API error: ${response.statusText}`);
        const data = await response.json();
        resultJsonStr = data.choices[0].message.content;

    } else if (settings.aiPlatform === 'gemini') {
        const apiKey = settings.gemini.key;
        const model = settings.gemini.model || 'gemini-2.5-flash';
        if (!apiKey) throw new Error("Gemini API key missing.");

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
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
        // OpenAI json_object usually requires a root key if returning an array
        if (parsed && !Array.isArray(parsed)) {
            const keys = Object.keys(parsed);
            if (keys.length > 0 && Array.isArray(parsed[keys[0]])) {
                parsed = parsed[keys[0]];
            } else {
                parsed = [parsed]; // fallback
            }
        }
        return parsed;
    } catch (e) {
        console.error("Failed to parse AI Analyze response as JSON", resultJsonStr);
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
