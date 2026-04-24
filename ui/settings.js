/**
 * ui/settings.js
 * AI, theme, and provider configuration.
 */

import { showToast } from './utils.js';

export const SettingsManager = {
    init() {
        this.bindEvents();
        this.loadSettings();
    },

    bindEvents() {
        document.getElementById('btn-save-settings')?.addEventListener('click', () => this.saveSettings());

        document.querySelectorAll('.toggle-vis').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = e.currentTarget.getAttribute('data-target');
                const input = document.getElementById(targetId);
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                e.currentTarget.innerText = isPassword ? '👁️' : '🙈';
            });
        });

        const platformSelect = document.getElementById('default-ai-platform');
        platformSelect?.addEventListener('change', (e) => {
            document.querySelectorAll('.provider-card').forEach(card => card.classList.remove('active-provider'));
            document.getElementById(`card-${e.target.value}`)?.classList.add('active-provider');
        });

        document.getElementById('app-theme')?.addEventListener('change', (e) => {
            const theme = e.target.value;
            if (theme === 'system') document.documentElement.removeAttribute('data-theme');
            else document.documentElement.setAttribute('data-theme', theme);
        });
    },

    saveSettings() {
        const settings = {
            theme: document.getElementById('app-theme').value,
            aiPlatform: document.getElementById('default-ai-platform').value,
            openai: { key: document.getElementById('key-openai').value, model: document.getElementById('model-openai').value },
            gemini: { key: document.getElementById('key-gemini').value, model: document.getElementById('model-gemini').value },
            claude: { key: document.getElementById('key-claude').value, model: document.getElementById('model-claude').value }
        };

        chrome.storage.sync.set({ aiSettings: settings }, () => {
            showToast("Settings saved!", "success");
        });
    },

    loadSettings() {
        chrome.storage.sync.get(['aiSettings'], (result) => {
            if (result.aiSettings) {
                const s = result.aiSettings;
                if (s.theme) {
                    document.getElementById('app-theme').value = s.theme;
                    document.getElementById('app-theme').dispatchEvent(new Event('change'));
                }
                if (s.aiPlatform) {
                    document.getElementById('default-ai-platform').value = s.aiPlatform;
                    document.getElementById('default-ai-platform').dispatchEvent(new Event('change'));
                }
                if (s.openai) {
                    document.getElementById('key-openai').value = s.openai.key || '';
                    document.getElementById('model-openai').value = s.openai.model || 'gpt-4o';
                }
                if (s.gemini) {
                    document.getElementById('key-gemini').value = s.gemini.key || '';
                    document.getElementById('model-gemini').value = s.gemini.model || 'gemini-2.5-flash';
                }
                if (s.claude) {
                    document.getElementById('key-claude').value = s.claude.key || '';
                    document.getElementById('model-claude').value = s.claude.model || 'claude-3-5-sonnet-20241022';
                }
            }
        });
    }
};
