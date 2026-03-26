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
    
    // Parse URLs if it's a multi-url job
    let urlsToScrape = [];
    if (blueprint.scrapingType === 'multi-url' && blueprint.urls) {
        urlsToScrape = blueprint.urls.split('\n').map(u => u.trim()).filter(u => u);
    } else if (blueprint.scrapingType === 'single-page') {
        // Get active tab URL
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        urlsToScrape = [tab.url];
    }

    jobProgress.total = urlsToScrape.length;
    let batchCounter = 0;

    for (let i = 0; i < urlsToScrape.length; i++) {
        if (!isRunning) break; // Stop if user cancelled

        const url = urlsToScrape[i];
        jobProgress.current = i + 1;
        addLog(`Scraping URL ${i + 1}/${urlsToScrape.length}: ${url}`);
        console.log(`Scraping URL ${i + 1}/${urlsToScrape.length}: ${url}`);

        try {
            // 1. Open or update the tab
            let tab = await createOrUpdateTab(url);
            
            // 2. Wait for page to load (simple heuristic)
            await sleep(2000); 

            // Inject the content script before sending the message
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
            } catch (err) {
                addLog(`ERROR: Failed to inject script on ${url}`);
                console.error("Failed to inject content script:", err);
            }

            // 3. Inject and execute the scraper script
            let extractedData = await chrome.tabs.sendMessage(tab.id, {
                action: 'EXTRACT_DATA', 
                blueprint: currentJob 
            }).catch(err => {
                addLog(`ERROR: Content script not responding on ${url}`);
                console.error("Content script not ready...", err);
                return null;
            });

            if (extractedData) {
                // If there's AI required, process it
                if (extractedData._pageText) {
                    addLog("Processing AI extraction...");
                    try {
                        const aiExtracted = await processAIExtraction(currentJob, extractedData._pageText);
                        delete extractedData._pageText; // Clean up payload
                        extractedData = { ...extractedData, ...aiExtracted };
                    } catch (e) {
                        addLog(`AI Extraction failed: ${e.message}`);
                    }
                }

                scrapedData.push(extractedData);
                chrome.storage.local.set({ scrapedData: scrapedData });
            }

            // 4. Handle Anti-Bot Delays
            batchCounter++;
            let delayMs = getRandomDelay(blueprint.antiBot.minDelayMs, blueprint.antiBot.maxDelayMs);
            
            // Check for batch pause
            if (blueprint.scrapingType === 'multi-url' && 
                blueprint.antiBot.batchSize > 0 && 
                batchCounter >= blueprint.antiBot.batchSize) {
                addLog(`Batch size reached. Pausing for ${blueprint.antiBot.batchPauseMs}ms`);
                console.log(`Batch size reached. Pausing for ${blueprint.antiBot.batchPauseMs}ms`);
                delayMs = blueprint.antiBot.batchPauseMs;
                batchCounter = 0;
            }

            if (i < urlsToScrape.length - 1 && isRunning) {
                addLog(`Waiting ${delayMs}ms before next URL...`);
                console.log(`Waiting ${delayMs}ms before next URL...`);
                await sleep(delayMs);
            }

        } catch (error) {
            addLog(`ERROR: Failed to load or scrape ${url}: ${error.message}`);
            console.error(`Failed to scrape ${url}:`, error);
        }
    }
    
    isRunning = false;
    currentJob = null;
    addLog("Job completed!");
    console.log("Job completed!");
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
        prompt += `- "${f.name}": ${f.selector}\n`;
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
