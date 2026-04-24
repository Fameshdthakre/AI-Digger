/**
 * modules/data-store.js
 * Manages all interactions with chrome.storage and handles data persistence.
 */

export const DataStore = {
    async get(keys) {
        return new Promise((resolve) => {
            chrome.storage.local.get(keys, (res) => resolve(res));
        });
    },

    async set(items) {
        return new Promise((resolve) => {
            chrome.storage.local.set(items, () => resolve());
        });
    },

    async remove(keys) {
        return new Promise((resolve) => {
            chrome.storage.local.remove(keys, () => resolve());
        });
    },

    async getSync(keys) {
        return new Promise((resolve) => {
            chrome.storage.sync.get(keys, (res) => resolve(res));
        });
    },

    async setSync(items) {
        return new Promise((resolve) => {
            chrome.storage.sync.set(items, () => resolve());
        });
    },

    async addLog(message, jobLogs = [], jobProgress = {}) {
        const timestamp = new Date().toLocaleTimeString();
        const newLog = `[${timestamp}] ${message}`;
        jobLogs.push(newLog);
        if (jobLogs.length > 100) jobLogs.shift();
        await this.set({ jobLogs, jobProgress });
        return jobLogs;
    },

    async saveScrapedData(newData, currentScrapedData = []) {
        const updatedData = currentScrapedData.concat(newData);
        await this.set({ scrapedData: updatedData });
        return updatedData;
    },

    async archiveRun(jobName, data) {
        if (!data || data.length === 0) return;

        const res = await this.get(['runHistory']);
        let history = res.runHistory || [];

        const runRecord = {
            id: Date.now(),
            jobName: jobName || "Unknown Job",
            date: new Date().toLocaleString(),
            count: data.length,
            data: [...data]
        };

        history.unshift(runRecord);
        if (history.length > 50) history.pop();

        await this.set({ runHistory: history });
    }
};
