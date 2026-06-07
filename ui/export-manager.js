/**
 * ui/export-manager.js
 * Logic for exporting data to CSV and Excel.
 */

import { showToast } from './utils.js';

export const ExportManager = {
    init() {
        document.getElementById('btn-export-csv')?.addEventListener('click', () => this.exportCurrentData('csv'));
        document.getElementById('btn-export-excel')?.addEventListener('click', () => this.exportCurrentData('xlsx'));
    },

    async exportCurrentData(type) {
        const res = await new Promise(r => chrome.storage.local.get(['scrapedData'], r));
        const data = res.scrapedData;
        if (!data || data.length === 0) return showToast("No data to export", "error");

        const cleanData = this.sanitizeData(data);
        const filename = this.getFilename(type);

        if (type === 'csv') this.downloadCSV(cleanData, filename);
        else this.downloadExcel(cleanData, filename);
    },

    sanitizeData(data) {
        return data.map(row => {
            const clean = {};
            for (let key in row) {
                let val = row[key];
                clean[key] = (val === null || val === undefined) ? "" : (typeof val === 'object' ? JSON.stringify(val) : String(val));
            }
            return clean;
        });
    },

    getFilename(ext) {
        let name = document.getElementById('job-name')?.value || 'AI_Digger';
        name = name.replace(/[^a-z0-9]/gi, '_');
        const now = new Date().toISOString().replace(/[:.]/g, '-');
        return `${name}_${now}.${ext}`;
    },

    downloadCSV(data, filename) {
        const headers = Array.from(new Set(data.flatMap(row => Object.keys(row))));
        const csv = [
            headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','),
            ...data.map(row => headers.map(h => `"${(row[h] || "").replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
        this.triggerDownload(blob, filename);
    },

    async downloadExcel(data, filename) {
        if (typeof XLSX === 'undefined') {
            try {
                showToast("Loading Excel library...", "info");
                await this.loadScript('../xlsx.full.min.js');
            } catch (e) {
                return showToast("Failed to load Excel library", "error");
            }
        }
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
        const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        this.triggerDownload(blob, filename);
    },

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    },

    triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    }
};
