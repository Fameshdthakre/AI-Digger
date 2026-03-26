/**
 * background.js
 * The "Brain" of the extension. Manages the queue of URLs, applies randomized delays,
 * and orchestrates the content scripts to extract data.
 */

let currentJob = null;
let scrapedData = [];
let isRunning = false;

// Allow users to open the side panel by clicking the action toolbar icon
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));

// Listen for messages from the Popup or Content Script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_JOB') {
        startJob(message.blueprint);
        sendResponse({ status: 'started' });
    } else if (message.action === 'STOP_JOB') {
        isRunning = false;
        sendResponse({ status: 'stopped' });
    } else if (message.action === 'GET_STATUS') {
        sendResponse({ isRunning, scrapedCount: scrapedData.length, currentJob });
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

async function startJob(blueprint) {
    currentJob = blueprint;
    isRunning = true;
    
    // Parse URLs if it's a multi-url job
    let urlsToScrape = [];
    if (blueprint.scrapingType === 'multi-url' && blueprint.urls) {
        urlsToScrape = blueprint.urls.split('\n').map(u => u.trim()).filter(u => u);
    } else if (blueprint.scrapingType === 'single-page') {
        // Get active tab URL
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        urlsToScrape = [tab.url];
    }

    let batchCounter = 0;

    for (let i = 0; i < urlsToScrape.length; i++) {
        if (!isRunning) break; // Stop if user cancelled

        const url = urlsToScrape[i];
        console.log(`Scraping URL ${i + 1}/${urlsToScrape.length}: ${url}`);

        try {
            // 1. Open or update the tab
            let tab = await createOrUpdateTab(url);
            
            // 2. Wait for page to load (simple heuristic)
            await sleep(2000); 

            // 3. Inject and execute the scraper script
            const results = await chrome.tabs.sendMessage(tab.id, { 
                action: 'EXTRACT_DATA', 
                blueprint: currentJob 
            }).catch(err => {
                console.error("Content script not ready, retrying...", err);
                return [];
            });

            // 4. Handle Anti-Bot Delays
            batchCounter++;
            let delayMs = getRandomDelay(blueprint.antiBot.minDelayMs, blueprint.antiBot.maxDelayMs);
            
            // Check for batch pause
            if (blueprint.scrapingType === 'multi-url' && 
                blueprint.antiBot.batchSize > 0 && 
                batchCounter >= blueprint.antiBot.batchSize) {
                console.log(`Batch size reached. Pausing for ${blueprint.antiBot.batchPauseMs}ms`);
                delayMs = blueprint.antiBot.batchPauseMs;
                batchCounter = 0;
            }

            if (i < urlsToScrape.length - 1 && isRunning) {
                console.log(`Waiting ${delayMs}ms before next URL...`);
                await sleep(delayMs);
            }

        } catch (error) {
            console.error(`Failed to scrape ${url}:`, error);
        }
    }
    
    isRunning = false;
    currentJob = null;
    console.log("Job completed!");
}

// Helper: Creates a new tab or updates existing active tab
function createOrUpdateTab(url) {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.update(tabs[0].id, { url: url }, (updatedTab) => {
                    // Wait for tab to finish loading
                    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                        if (tabId === updatedTab.id && info.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(listener);
                            resolve(updatedTab);
                        }
                    });
                });
            } else {
                chrome.tabs.create({ url: url }, (newTab) => {
                     chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
                        if (tabId === newTab.id && info.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(listener);
                            resolve(newTab);
                        }
                    });
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
