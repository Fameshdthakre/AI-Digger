/**
 * modules/job-manager.js
 * Manages job profiles, scheduling, and CRUD operations.
 */

import { DataStore } from './data-store.js';

export const JobManager = {
    async getSavedJobs() {
        const res = await DataStore.get(['savedJobs']);
        return res.savedJobs || {};
    },

    async saveJob(jobName, blueprint) {
        const savedJobs = await this.getSavedJobs();
        savedJobs[jobName] = blueprint;
        await DataStore.set({ savedJobs });
    },

    async deleteJob(jobName) {
        const savedJobs = await this.getSavedJobs();
        delete savedJobs[jobName];
        await DataStore.set({ savedJobs });
        await this.unregisterSchedule(jobName);
    },

    async updateSchedules() {
        const savedJobs = await this.getSavedJobs();

        // Clear all existing cron alarms
        const alarms = await chrome.alarms.getAll();
        for (let alarm of alarms) {
            if (alarm.name.startsWith("cron_")) {
                await chrome.alarms.clear(alarm.name);
            }
        }

        // Register active schedules
        for (const jobName in savedJobs) {
            const job = savedJobs[jobName];
            if (job.schedule && job.schedule.enabled && job.schedule.interval > 0) {
                const alarmName = `cron_${jobName}`;
                chrome.alarms.create(alarmName, { periodInMinutes: job.schedule.interval });
                console.log(`AI-Digger: Registered cron schedule: ${alarmName} every ${job.schedule.interval} minutes.`);
            }
        }
    },

    async unregisterSchedule(jobName) {
        await chrome.alarms.clear(`cron_${jobName}`);
    }
};
