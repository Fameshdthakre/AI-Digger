/**
 * modules/orchestrator.js
 * Manages the scraping queue and job lifecycle.
 */

import { DataStore } from './data-store.js';
import { AIProvider } from './ai-provider.js';
import { JobManager } from './job-manager.js';
import { Validator } from './validator.js';

export const Orchestrator = {
    state: {
        isRunning: false,
        currentJob: null,
        scrapedData: [],
        jobLogs: [],
        jobProgress: { current: 0, total: 0 }
    },

    async init() {
        const res = await DataStore.get(['jobState', 'jobLogs', 'jobProgress', 'scrapedData']);
        if (res.jobState && res.jobState.isRunning) {
            this.state.isRunning = true;
            this.state.currentJob = res.jobState.blueprint;
            this.state.jobLogs = res.jobLogs || [];
            this.state.jobProgress = res.jobProgress || { current: 0, total: 0 };
            this.state.scrapedData = res.scrapedData || [];
            this.addLog("Service Worker woke up. Resuming job...");
        } else {
            this.state.scrapedData = res.scrapedData || [];
        }
    },

    async addLog(message) {
        this.state.jobLogs = await DataStore.addLog(message, this.state.jobLogs, this.state.jobProgress);
    },

    async startJob(blueprint, explicitTabId = null) {
        this.state.currentJob = blueprint;
        this.state.isRunning = true;
        this.state.jobLogs = [];
        this.state.scrapedData = []; // Clear for new job? Plan says "Careful migration", but usually START_JOB starts fresh
        await this.addLog(`Started job: ${blueprint.jobName}`);

        let jobState = {
            isRunning: true,
            blueprint: blueprint,
            batchCounter: 0,
            deepCrawlQueue: [],
            isDeepCrawling: false,
            deepCrawlIndex: 0
        };

        if (blueprint.scrapingType === 'multi-url') {
            jobState.urlsToScrape = blueprint.urls ? blueprint.urls.split('\n').map(u => u.trim()).filter(u => u) : [];
            jobState.currentIndex = 0;
            this.state.jobProgress.total = jobState.urlsToScrape.length;
        } else if (blueprint.scrapingType === 'single-page') {
            jobState.maxPages = blueprint.singlePageOptions?.maxPages || 1;
            jobState.currentPage = 1;
            this.state.jobProgress.total = jobState.maxPages;

            if (explicitTabId) {
                jobState.tabId = explicitTabId;
            } else {
                let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                jobState.tabId = tab.id;
            }
        }

        // Preload detail blueprint if linked
        if (blueprint.linkedDetailJob) {
            const savedJobs = await JobManager.getSavedJobs();
            if (savedJobs[blueprint.linkedDetailJob]) {
                jobState.detailBlueprint = savedJobs[blueprint.linkedDetailJob];
                await this.addLog(`Loaded linked detail job: ${blueprint.linkedDetailJob}`);
            } else {
                await this.addLog(`WARNING: Linked detail job '${blueprint.linkedDetailJob}' not found.`);
            }
        }

        await DataStore.set({ jobState, jobLogs: this.state.jobLogs, jobProgress: this.state.jobProgress, scrapedData: [] });
        this.processNextStep();
    },

    async stopJob() {
        await DataStore.archiveRun(this.state.currentJob?.jobName, this.state.scrapedData);
        this.state.isRunning = false;
        this.state.currentJob = null;
        chrome.alarms.clearAll();
        await DataStore.remove('jobState');
        await this.addLog("Job stopped by user.");
    },

    async processNextStep() {
        const res = await DataStore.get(['jobState']);
        if (!res.jobState || !res.jobState.isRunning) {
            await this.completeJob();
            return;
        }

        this.state.isRunning = true;
        this.state.currentJob = res.jobState.blueprint;
        let jobState = res.jobState;
        const blueprint = jobState.blueprint;

        // Handle Deep Crawling Phase
        if (jobState.isDeepCrawling && jobState.detailBlueprint) {
            await this.handleDeepCrawlStep(jobState);
            return;
        }

        if (blueprint.scrapingType === 'multi-url') {
            await this.handleMultiUrlStep(jobState);
        } else if (blueprint.scrapingType === 'single-page') {
            await this.handleSinglePageStep(jobState);
        }
    },

    async handleDeepCrawlStep(jobState) {
        if (jobState.deepCrawlIndex >= jobState.deepCrawlQueue.length) {
            await this.addLog("Finished processing deep crawl queue for this batch.");
            jobState.isDeepCrawling = false;
            jobState.deepCrawlQueue = [];
            jobState.deepCrawlIndex = 0;
            await DataStore.set({ jobState });

            if ((jobState.blueprint.scrapingType === 'multi-url' && jobState.currentIndex >= jobState.urlsToScrape.length) ||
                (jobState.blueprint.scrapingType === 'single-page' && jobState.currentPage > jobState.maxPages)) {
                await this.completeJob();
            } else {
                chrome.alarms.create("nextJobStep", { when: Date.now() + 1000 }); // Faster resume
            }
            return;
        }

        const item = jobState.deepCrawlQueue[jobState.deepCrawlIndex];
        const blueprint = item.detailBlueprint;
        this.state.jobProgress.current = jobState.deepCrawlIndex + 1;
        this.state.jobProgress.total = jobState.deepCrawlQueue.length;
        await this.addLog(`Deep Crawling ${this.state.jobProgress.current}/${this.state.jobProgress.total}: ${item.detailUrl} using ${blueprint.jobName}`);

        try {
            let tab = await this.createOrUpdateTab(item.detailUrl);
            await this.sleep(2000);
            await this.ensureScriptInjected(tab.id);
            
            // Execute Actions
            if (blueprint.actions?.length > 0) {
                await this.addLog(`Executing ${blueprint.actions.length} actions...`);
                await this.executeActions(tab.id, blueprint.actions);
            }

            // Wait logic
            if (blueprint.waitOptions?.waitForSelector) {
                await this.addLog(`Waiting for selector: ${blueprint.waitOptions.waitForSelector}...`);
                await chrome.tabs.sendMessage(tab.id, { 
                    action: 'WAIT_FOR_ELEMENT', 
                    selector: blueprint.waitOptions.waitForSelector,
                    timeout: blueprint.waitOptions.maxWaitMs 
                }).catch(()=>null);
            }

            let detailData = await this.scrapeTab(tab.id, blueprint, item.detailUrl);
            if (!this.state.isRunning) return;

            if (detailData) {
                await this.processAndSaveDeepCrawlData(detailData, item, jobState);
            } else {
                await this.addLog(`WARNING: No data extracted from detail page: ${item.detailUrl}`);
                this.state.scrapedData.push(item.parentRow);
                await DataStore.set({ scrapedData: this.state.scrapedData });
            }

            jobState.deepCrawlIndex++;
            await DataStore.set({ jobState });
            const delay = this.getRandomDelay(jobState.detailBlueprint.antiBot?.minDelayMs, jobState.detailBlueprint.antiBot?.maxDelayMs);
            chrome.alarms.create("nextJobStep", { when: Date.now() + delay });

        } catch (error) {
            await this.addLog(`ERROR: Detail scrape failed ${item.detailUrl}: ${error.message}`);
            this.state.scrapedData.push(item.parentRow);
            await DataStore.set({ scrapedData: this.state.scrapedData });
            jobState.deepCrawlIndex++;
            await DataStore.set({ jobState });
            chrome.alarms.create("nextJobStep", { when: Date.now() + 1000 });
        }
    },

    async handleMultiUrlStep(jobState) {
        if (jobState.currentIndex >= jobState.urlsToScrape.length) {
            if (jobState.deepCrawlQueue.length > 0) {
                jobState.isDeepCrawling = true;
                await DataStore.set({ jobState });
                this.processNextStep();
            } else {
                await this.completeJob();
            }
            return;
        }

        const url = jobState.urlsToScrape[jobState.currentIndex];
        this.state.jobProgress.current = jobState.currentIndex + 1;
        await this.addLog(`Scraping URL ${this.state.jobProgress.current}/${jobState.urlsToScrape.length}: ${url}`);

        try {
            let tab = await this.createOrUpdateTab(url);
            await this.sleep(2000);
            await this.ensureScriptInjected(tab.id);

            // Execute Pre-Extraction Actions
            if (jobState.blueprint.actions?.length > 0) {
                await this.addLog(`Executing ${jobState.blueprint.actions.length} actions...`);
                await this.executeActions(tab.id, jobState.blueprint.actions);
            }

            // Wait logic
            if (jobState.blueprint.waitOptions?.waitForSelector) {
                await this.addLog(`Waiting for: ${jobState.blueprint.waitOptions.waitForSelector}`);
                await chrome.tabs.sendMessage(tab.id, { 
                    action: 'WAIT_FOR_ELEMENT', 
                    selector: jobState.blueprint.waitOptions.waitForSelector,
                    timeout: jobState.blueprint.waitOptions.maxWaitMs 
                }).catch(()=>null);
            }

            if (jobState.blueprint.antiBot?.stealthMode) {
                await chrome.tabs.sendMessage(tab.id, { 
                    action: 'SIMULATE_STEALTH', 
                    level: jobState.blueprint.antiBot.stealthLevel 
                }).catch(() => null);
            }

            let extractedData = await this.scrapeTab(tab.id, jobState.blueprint, url);
            if (!this.state.isRunning) return;

            if (extractedData) {
                if (jobState.blueprint.linkedDetailJob && jobState.detailBlueprint) {
                    await this.enqueueForDeepCrawl(extractedData, jobState, url, `URL-${jobState.currentIndex + 1}`);
                } else {
                    await this.saveExtractedData(extractedData, url, `URL-${jobState.currentIndex + 1}`);
                }
            }

            jobState.batchCounter++;
            let delay = this.getRandomDelay(jobState.blueprint.antiBot?.minDelayMs, jobState.blueprint.antiBot?.maxDelayMs);
            if (jobState.blueprint.antiBot?.batchSize > 0 && jobState.batchCounter >= jobState.blueprint.antiBot.batchSize) {
                await this.addLog(`Batch size reached. Pausing...`);
                delay = jobState.blueprint.antiBot.batchPauseMs || 5000;
                jobState.batchCounter = 0;
            }

            jobState.currentIndex++;
            await DataStore.set({ jobState });
            chrome.alarms.create("nextJobStep", { when: Date.now() + delay });

        } catch (error) {
            await this.addLog(`ERROR: Failed to load or scrape ${url}: ${error.message}`);
            jobState.currentIndex++;
            await DataStore.set({ jobState });
            chrome.alarms.create("nextJobStep", { when: Date.now() + 1000 });
        }
    },

    async handleSinglePageStep(jobState) {
        if (jobState.currentPage > jobState.maxPages) {
            if (jobState.deepCrawlQueue.length > 0) {
                jobState.isDeepCrawling = true;
                await DataStore.set({ jobState });
                this.processNextStep();
            } else {
                await this.completeJob();
            }
            return;
        }

        this.state.jobProgress.current = jobState.currentPage;
        await this.addLog(`Scraping Page ${jobState.currentPage} of ${jobState.maxPages}...`);

        try {
            await this.ensureScriptInjected(jobState.tabId);
            if (jobState.currentPage === 1) await this.executeActions(jobState.tabId, jobState.blueprint.actions);

            if (jobState.blueprint.waitOptions?.waitForSelector) {
                await this.addLog(`Waiting for selector: ${jobState.blueprint.waitOptions.waitForSelector}`);
                await chrome.tabs.sendMessage(jobState.tabId, { 
                    action: 'WAIT_FOR_ELEMENT', 
                    selector: jobState.blueprint.waitOptions.waitForSelector,
                    timeout: jobState.blueprint.waitOptions.maxWaitMs 
                }).catch(()=>null);
            } else {
                const firstField = jobState.blueprint.fields.find(f => f.type !== 'ai');
                if (firstField) {
                    await chrome.tabs.sendMessage(jobState.tabId, { action: 'WAIT_FOR_ELEMENT', selector: firstField.selector }).catch(()=>null);
                } else {
                    await this.sleep(2000);
                }
            }

            if (jobState.blueprint.singlePageOptions?.infiniteScroll) {
                let maxScrolls = jobState.blueprint.singlePageOptions.maxScrolls || 5;
                for (let s = 0; s < maxScrolls; s++) {
                    if (!this.state.isRunning) return;
                    await chrome.tabs.sendMessage(jobState.tabId, { action: 'SCROLL_BOTTOM', blueprint: jobState.blueprint }).catch(()=>null);
                    await this.sleep(2000);
                }
            }

            let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            let extractedData = await this.scrapeTab(jobState.tabId, jobState.blueprint, tab.url);
            if (!this.state.isRunning) return;

            if (extractedData) {
                if (jobState.blueprint.linkedDetailJob && jobState.detailBlueprint) {
                    await this.enqueueForDeepCrawl(extractedData, jobState, tab.url, `Page-${jobState.currentPage}`);
                } else {
                    await this.saveExtractedData(extractedData, tab.url, `Page-${jobState.currentPage}`);
                }
            }

            let hasNextPage = false;
            let delay = 0;

            if (jobState.currentPage < jobState.maxPages) {
                let nextSelector = jobState.blueprint.singlePageOptions?.nextButtonSelector;
                if (nextSelector) {
                    let clickRes = await chrome.tabs.sendMessage(jobState.tabId, { action: 'CLICK_NEXT', selector: nextSelector }).catch(()=>null);
                    if (clickRes && clickRes.status !== 'not_found') {
                        hasNextPage = true;
                        const userDelay = jobState.blueprint.singlePageOptions?.paginationWaitMs || 0;
                        const antiBotDelay = this.getRandomDelay(jobState.blueprint.antiBot?.minDelayMs, jobState.blueprint.antiBot?.maxDelayMs);
                        delay = userDelay + antiBotDelay;
                        if (userDelay > 0) await this.addLog(`Waiting ${userDelay}ms for page content to load...`);
                    }
                }
            }

            jobState.currentPage = hasNextPage ? jobState.currentPage + 1 : jobState.maxPages + 1;
            await DataStore.set({ jobState });

            if (jobState.deepCrawlQueue.length > 0) {
                jobState.isDeepCrawling = true;
                await DataStore.set({ jobState });
                this.processNextStep();
                return;
            }

            if (hasNextPage) {
                chrome.alarms.create("nextJobStep", { when: Date.now() + delay });
            } else {
                await this.completeJob();
            }

        } catch (err) {
            await this.addLog(`ERROR: Single page scrape failed: ${err.message}`);
            await this.completeJob();
        }
    },

    async completeJob() {
        await DataStore.archiveRun(this.state.currentJob?.jobName, this.state.scrapedData);
        this.state.isRunning = false;
        this.state.currentJob = null;
        await DataStore.remove('jobState');
        await this.addLog("Job completed!");
    },

    // Helpers
    async createOrUpdateTab(url) {
        return new Promise((resolve, reject) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs.length > 0) {
                    chrome.tabs.update(tabs[0].id, { url }, (tab) => this.waitForTab(tab.id, resolve, reject));
                } else {
                    chrome.tabs.create({ url }, (tab) => this.waitForTab(tab.id, resolve, reject));
                }
            });
        });
    },

    waitForTab(tabId, resolve, reject) {
        const timeout = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            reject(new Error("Tab load timeout"));
        }, 30000);
        const listener = (id, info) => {
            if (id === tabId && info.status === 'complete') {
                clearTimeout(timeout);
                chrome.tabs.onUpdated.removeListener(listener);
                chrome.tabs.get(tabId, resolve);
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
    },

    async ensureScriptInjected(tabId) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['turndown.js', 'js/content/stealth.js', 'js/content/inspector.js', 'js/content/macros.js', 'js/content/auto-detect.js', 'js/content/extractor.js', 'js/content/main.js']
            });
        } catch (e) {}
    },

    async executeActions(tabId, actions) {
        if (!actions) return;
        for (const action of actions) {
            await chrome.tabs.sendMessage(tabId, { action: 'EXECUTE_ACTION', actionData: action }).catch(() => null);
            await this.sleep(500);
        }
    },

    async captureTabScreenshot(tabId) {
        return new Promise((resolve) => {
            // Need to make sure the tab is active to capture
            chrome.tabs.update(tabId, { active: true }, () => {
                chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 50 }, (dataUrl) => {
                    resolve(dataUrl);
                });
            });
        });
    },

    async scrapeTab(tabId, job, url) {
        let data = await chrome.tabs.sendMessage(tabId, { action: 'EXTRACT_DATA', blueprint: job }).catch(() => null);
        if (!this.state.isRunning || !data) return data;

        const settings = (await DataStore.getSync(['aiSettings'])).aiSettings;
        if (!settings) return data;

        // Self-Healing
        if (data._failedFields?.length > 0) {
            const healed = await AIProvider.healSelectors(job, data._failedFields, data._pageMarkdown, settings);
            data = { ...data, ...healed.recoveredValues };
        }

        // AI Extraction (Text-based)
        const aiFields = job.fields.filter(f => f.type === 'ai');
        if (aiFields.length > 0) {
            const aiData = await AIProvider.extractData(job, data._pageMarkdown, settings);
            if (aiData.items) {
                if (data.items) {
                    aiData.items.forEach((item, idx) => {
                        if (data.items[idx]) data.items[idx] = { ...data.items[idx], ...item };
                    });
                } else {
                    data.items = aiData.items;
                }
            }
        }

        // AI Vision Extraction
        const visionFields = job.fields.filter(f => f.type === 'vision');
        if (visionFields.length > 0) {
            await this.addLog(`Using AI Vision for ${visionFields.length} fields...`);
            const screenshot = await this.captureTabScreenshot(tabId);
            
            // For vision, we usually want to extract from the image directly.
            // We can reuse extractData but with image options.
            const visionData = await AIProvider.extractData({ fields: visionFields }, data._pageMarkdown, settings, { imageUrl: screenshot });
            if (visionData.items) {
                if (data.items) {
                    visionData.items.forEach((item, idx) => {
                        if (data.items[idx]) data.items[idx] = { ...data.items[idx], ...item };
                    });
                } else {
                    data.items = visionData.items;
                }
            }
        }

        delete data._pageMarkdown;
        delete data._failedFields;

        if (job.schema) {
            const validation = Validator.validate(data, job.schema);
            if (!validation.valid) {
                await this.addLog(`VALIDATION ERRORS: ${validation.errors.join(' | ')}`);
            }
        }

        return data;
    },

    async saveExtractedData(data, url, pageIndex) {
        const blueprint = this.state.currentJob;
        const rows = this.flattenData(data, blueprint, url, pageIndex);
        
        // Scenario 2 Handling: Deduplicate based on Primary Key
        const pkField = blueprint.fields.find(f => f.isPrimaryKey)?.name;
        let newUniqueRows = rows;

        if (pkField) {
            newUniqueRows = rows.filter(newRow => {
                const isDuplicate = this.state.scrapedData.some(oldRow => 
                    String(oldRow[pkField]).trim() === String(newRow[pkField]).trim()
                );
                return !isDuplicate;
            });
            const diff = rows.length - newUniqueRows.length;
            if (diff > 0) await this.addLog(`Filtered out ${diff} duplicate records.`);
        }

        if (newUniqueRows.length > 0) {
            this.state.scrapedData = await DataStore.saveScrapedData(newUniqueRows, this.state.scrapedData);
        } else if (rows.length > 0) {
            await this.addLog("All records on this page were already captured (duplicate scan).");
        }
    },

    flattenData(data, blueprint, url, pageIndex) {
        const rows = [];
        const items = data.items || [data];
        const timestamp = new Date().toISOString();

        items.forEach(item => {
            const row = {
                JobName: blueprint.jobName,
                URL: url,
                Timestamp: timestamp,
                PageIndex: pageIndex,
                ...item
            };
            rows.push(row);
        });
        return rows;
    },

    async enqueueForDeepCrawl(data, jobState, url, pageIndex) {
        const blueprint = jobState.blueprint;
        const allRows = this.flattenData(data, blueprint, url, pageIndex);
        const savedJobs = await JobManager.getSavedJobs();
        const maxPages = blueprint.maxDetailPages || 100;

        // Deduplicate before enqueuing to avoid visiting same detail page twice
        const pkField = blueprint.fields.find(f => f.isPrimaryKey)?.name;
        const rows = pkField ? allRows.filter(newRow => !this.state.scrapedData.some(oldRow => String(oldRow[pkField]).trim() === String(newRow[pkField]).trim())) : allRows;

        for (const row of rows) {
            let detailAdded = false;
            // ...

            // Support legacy linkedDetailJob
            if (jobState.detailBlueprint && jobState.deepCrawlQueue.length < maxPages) {
                let detailUrl = row[jobState.blueprint.detailUrlField] || Object.values(row).find(v => typeof v === 'string' && (v.startsWith('http') || v.startsWith('/')));
                if (detailUrl) {
                    if (detailUrl.startsWith('/')) detailUrl = new URL(detailUrl, url).href;
                    jobState.deepCrawlQueue.push({ detailUrl, detailBlueprint: jobState.detailBlueprint, parentRow: row });
                    detailAdded = true;
                }
            }

            // Support new N-level follow
            for (const field of jobState.blueprint.fields) {
                if (field.follow && field.followJob && savedJobs[field.followJob] && jobState.deepCrawlQueue.length < maxPages) {
                    let targetUrl = row[field.name];
                    if (targetUrl && (typeof targetUrl === 'string') && (targetUrl.startsWith('http') || targetUrl.startsWith('/'))) {
                        if (targetUrl.startsWith('/')) targetUrl = new URL(targetUrl, url).href;
                        jobState.deepCrawlQueue.push({ 
                            detailUrl: targetUrl, 
                            detailBlueprint: savedJobs[field.followJob], 
                            parentRow: row 
                        });
                        detailAdded = true;
                    }
                }
            }

            if (!detailAdded) {
                this.state.scrapedData.push(row);
            }
        }
        await DataStore.set({ scrapedData: this.state.scrapedData });
    },

    async processAndSaveDeepCrawlData(detailData, queueItem, jobState) {
        const detailRows = detailData.items || [detailData];
        detailRows.forEach(detailRow => {
            const merged = { ...queueItem.parentRow };
            for (const key in detailRow) {
                merged[merged.hasOwnProperty(key) ? `Detail_${key}` : key] = detailRow[key];
            }
            this.state.scrapedData.push(merged);
        });
        await DataStore.set({ scrapedData: this.state.scrapedData });
    },

    sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
    getRandomDelay(min, max) {
        min = parseInt(min) || 1000;
        max = parseInt(max) || 3000;
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
};
