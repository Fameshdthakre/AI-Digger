/**
 * background.js
 * The main entry point for the extension's background logic.
 * Delegating concerns to specialized modules.
 */

import { Orchestrator } from './modules/orchestrator.js';
import { JobManager } from './modules/job-manager.js';
import { DataStore } from './modules/data-store.js';
import { AIProvider } from './modules/ai-provider.js';
import { PROMPTS } from './js/prompts.js';

// Initialize modules
Orchestrator.init();

// Set side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));

// Message Router
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender, sendResponse);
    return true; // Async responses
});

async function handleMessage(message, sender, sendResponse) {
    try {
        switch (message.action) {
            case 'START_JOB':
                await Orchestrator.startJob(message.blueprint);
                sendResponse({ status: 'started' });
                break;

            case 'STOP_JOB':
                await Orchestrator.stopJob();
                sendResponse({ status: 'stopped' });
                break;

            case 'GET_STATUS':
                const state = await DataStore.get(['jobState']);
                sendResponse({
                    isRunning: Orchestrator.state.isRunning,
                    isDeepCrawling: state?.jobState?.isDeepCrawling || false,
                    scrapedCount: Orchestrator.state.scrapedData.length,
                    currentJob: Orchestrator.state.currentJob,
                    jobProgress: Orchestrator.state.jobProgress,
                    jobLogs: Orchestrator.state.jobLogs
                });
                break;

            case 'SAVE_PAGE_DATA':
                if (message.data?.length > 0) {
                    Orchestrator.state.scrapedData = await DataStore.saveScrapedData(message.data, Orchestrator.state.scrapedData);
                }
                sendResponse({ status: 'saved' });
                break;

            case 'CLEAR_DATA':
                Orchestrator.state.scrapedData = [];
                await DataStore.set({ scrapedData: [] });
                sendResponse({ status: 'cleared' });
                break;

            case 'ANALYZE_PAGE_AI':
                const settingsA = (await DataStore.getSync(['aiSettings'])).aiSettings;
                const fields = await AIProvider.analyzePage(message.text, settingsA);
                chrome.runtime.sendMessage({ action: 'AI_ANALYZE_RESULT', fields });
                sendResponse({ status: 'analyzing' });
                break;

            case 'MAGIC_BUILD_BLUEPRINT':
                const settingsB = (await DataStore.getSync(['aiSettings'])).aiSettings;
                const blueprint = await AIProvider.generateBlueprint(message.userPrompt, message.pageText, settingsB);
                chrome.runtime.sendMessage({ action: 'MAGIC_BUILD_RESULT', blueprint });
                sendResponse({ status: 'building' });
                break;

            case 'PROCESS_AI_INSPECTOR':
                await handleAISelectorRequest(message, sendResponse);
                break;

            case 'UPDATE_SCHEDULES':
                await JobManager.updateSchedules();
                sendResponse({ status: 'schedules_updated' });
                break;

            default:
                sendResponse({ status: 'unknown_action' });
        }
    } catch (error) {
        console.error("AI-Digger: Background Error", error);
        sendResponse({ status: 'error', message: "An internal error occurred while processing your request." });
    }
}

async function handleAISelectorRequest(message, sendResponse) {
    const settings = (await DataStore.getSync(['aiSettings'])).aiSettings;
    const platform = settings?.aiPlatform || 'openai';
    const isConfigured = settings && settings[platform] && settings[platform].key && settings[platform].key.trim() !== '';

    if (!isConfigured) {
        if (message.action === 'PROCESS_AI_INSPECTOR' && message.fallbackSelector) {
            chrome.runtime.sendMessage({ action: 'AI_SELECTOR_RESULT', fieldId: message.fieldId, selector: message.fallbackSelector });
            sendResponse({ status: 'fallback_used' });
            return;
        }
        sendResponse({ status: 'error', message: 'AI not configured. Please add an API key in Settings.' });
        return;
    }

    let prompt = "";
    if (message.action === 'PROCESS_AI_INSPECTOR') {
        const template = message.isContainer ? PROMPTS.AI_INSPECTOR_CONTAINER : PROMPTS.AI_INSPECTOR;
        prompt = `${template}\n\nHTML Snippet:\n"""\n${message.htmlSnippet}\n"""`;
    }

    try {
        const selector = await AIProvider.generateSelector(prompt, settings);
        chrome.runtime.sendMessage({ action: 'AI_SELECTOR_RESULT', fieldId: message.fieldId, selector });
        sendResponse({ status: 'processing' });
    } catch (e) {
        console.error("AI-Digger: AI Selector Error", e);
        if (message.action === 'PROCESS_AI_INSPECTOR' && message.fallbackSelector) {
            chrome.runtime.sendMessage({ action: 'AI_SELECTOR_RESULT', fieldId: message.fieldId, selector: message.fallbackSelector });
            sendResponse({ status: 'fallback_used_after_error' });
        } else {
            sendResponse({ status: 'error', message: "Failed to generate AI selector. Please check your AI settings and try again." });
        }
    }
}

// Alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "nextJobStep") {
        Orchestrator.processNextStep();
    } else if (alarm.name.startsWith("cron_")) {
        const jobName = alarm.name.substring(5);
        const savedJobs = await JobManager.getSavedJobs();
        const blueprint = savedJobs[jobName];

        if (blueprint) {
            // Basic schedule logic (simplified for refactor, can be enhanced)
            if (blueprint.schedule?.targetMode === 'start-url' && blueprint.schedule.startUrl) {
                let tab = await Orchestrator.createOrUpdateTab(blueprint.schedule.startUrl);
                await Orchestrator.startJob(blueprint, tab.id);
            } else {
                await Orchestrator.startJob(blueprint);
            }
        }
    }
});
