/**
 * modules/ai-provider.js
 * Unified factory for AI requests across OpenAI, Gemini, and Claude.
 */

import { PROMPTS } from '../js/prompts.js';

export const AIProvider = {
    async fetchAI(settings, prompt, options = {}) {
        const platform = settings.aiPlatform;
        if (!platform) throw new Error("AI Platform not configured.");

        switch (platform) {
            case 'openai':
                return this.fetchOpenAI(settings.openai, prompt, options);
            case 'gemini':
                return this.fetchGemini(settings.gemini, prompt, options);
            case 'claude':
                return this.fetchClaude(settings.claude, prompt, options);
            default:
                throw new Error(`Unsupported AI platform: ${platform}`);
        }
    },

    async fetchOpenAI(config, prompt, options) {
        const { key, model = 'gpt-4o' } = config;
        if (!key) throw new Error("OpenAI API key missing.");

        const content = [];
        if (options.imageUrl) {
            content.push({ type: "text", text: prompt });
            content.push({ type: "image_url", image_url: { url: options.imageUrl } });
        } else {
            content.push({ type: "text", text: prompt });
        }

        const body = {
            model: model,
            messages: [{ role: "user", content: content }],
            temperature: 0.1
        };

        if (options.response_format) {
            body.response_format = options.response_format;
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) throw new Error(`OpenAI API error: ${response.statusText}`);
        const data = await response.json();
        return data.choices[0].message.content;
    },

    async fetchGemini(config, prompt, options) {
        const { key, model = 'gemini-2.0-flash' } = config; // Updated default to 2.0-flash
        if (!key) throw new Error("Gemini API key missing.");

        const parts = [{ text: prompt }];
        if (options.imageUrl) {
            const [mime, base64] = options.imageUrl.split(',');
            const mimeType = mime.split(':')[1].split(';')[0];
            parts.push({ inlineData: { mimeType: mimeType, data: base64 } });
        }

        const body = {
            contents: [{ parts: parts }],
            generationConfig: {
                temperature: 0.1
            }
        };

        if (options.responseSchema) {
            body.generationConfig.responseMimeType = "application/json";
            body.generationConfig.responseSchema = options.responseSchema;
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) throw new Error(`Gemini API error: ${response.statusText}`);
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    },

    async fetchClaude(config, prompt, options) {
        const { key, model = 'claude-3-5-sonnet-20241022' } = config;
        if (!key) throw new Error("Claude API key missing.");

        const body = {
            model: model,
            max_tokens: options.max_tokens || 1024,
            messages: [{ role: "user", content: prompt }]
        };

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': key,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) throw new Error(`Claude API error: ${response.statusText}`);
        const data = await response.json();
        return data.content[0].text;
    },

    // Specific AI Workflows
    async analyzePage(text, settings) {
        const truncatedText = text.substring(0, 20000);
        const prompt = `${PROMPTS.ANALYZE_PAGE}\n\nWebpage Text:\n"""\n${truncatedText}\n"""`;
        
        let options = {};
        if (settings.aiPlatform === 'openai') {
            options.response_format = {
                type: "json_schema",
                json_schema: {
                    name: "analysis",
                    strict: true,
                    schema: {
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
                    }
                }
            };
        } else if (settings.aiPlatform === 'gemini') {
            options.responseSchema = {
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
        }

        const result = await this.fetchAI(settings, prompt, options);
        return this.parseJSON(result, "fields");
    },

    async generateBlueprint(userPrompt, text, settings) {
        const truncatedText = text.substring(0, 20000);
        const prompt = `${PROMPTS.MAGIC_BUILD}\n\nUser Request:\n"${userPrompt}"\n\nWebpage HTML:\n"""\n${truncatedText}\n"""`;

        let options = {};
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

        if (settings.aiPlatform === 'openai') {
            options.response_format = { type: "json_schema", json_schema: { name: "blueprint", strict: true, schema: blueprintSchema } };
        } else if (settings.aiPlatform === 'gemini') {
            options.responseSchema = blueprintSchema;
        }

        const result = await this.fetchAI(settings, prompt, options);
        return this.parseJSON(result);
    },

    async extractData(blueprint, text, settings, options = {}) {
        const aiFields = blueprint.fields.filter(f => f.type === 'ai' || f.type === 'vision');
        if (aiFields.length === 0) return {};

        let prompt = options.imageUrl ? PROMPTS.VISION_EXTRACTION : PROMPTS.EXTRACTION;
        aiFields.forEach(f => {
            prompt += `- "${f.name}": ${f.selector}\n`;
        });

        const truncatedText = text ? text.substring(0, 30000) : "";
        if (truncatedText && !options.imageUrl) {
            prompt += `\n\nSource Markdown:\n"""\n${truncatedText}\n"""`;
        } else if (options.imageUrl) {
            prompt += `\n\n[Vision Input Attached] Please analyze the provided image to extract these fields.`;
        }

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

        if (settings.aiPlatform === 'openai') {
            options.response_format = { type: "json_schema", json_schema: { name: "extraction", strict: true, schema: schema } };
        } else if (settings.aiPlatform === 'gemini') {
            options.responseSchema = schema;
        }

        const result = await this.fetchAI(settings, prompt, options);
        return this.parseJSON(result);
    },

    async healSelectors(job, failedFields, markdown, settings) {
        let basePrompt = PROMPTS.SELF_HEALING;
        failedFields.forEach(f => {
            basePrompt += `- Name: "${f.name}", Old Selector: "${f.selector}"\n`;
        });

        const truncatedText = markdown.substring(0, 30000);
        basePrompt += `\n\nPage Markdown:\n"""\n${truncatedText}\n"""`;

        const schemaPropertiesRecovered = {};
        failedFields.forEach(f => {
            schemaPropertiesRecovered[f.name] = { type: ["string", "null"] };
        });

        const schema = {
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

        let options = {};
        if (settings.aiPlatform === 'openai') {
            options.response_format = { type: "json_schema", json_schema: { name: "healing", strict: true, schema: schema } };
        } else if (settings.aiPlatform === 'gemini') {
            options.responseSchema = schema;
        }

        const result = await this.fetchAI(settings, basePrompt, options);
        return this.parseJSON(result);
    },

    async generateSelector(prompt, settings) {
        const result = await this.fetchAI(settings, prompt, { max_tokens: 100 });
        return result.replace(/^```css/i, '').replace(/^```/i, '').replace(/```$/, '').trim();
    },

    parseJSON(str, key = null) {
        try {
            const cleanStr = str.replace(/^```json/i, '').replace(/```$/, '').trim();
            const parsed = JSON.parse(cleanStr);
            if (key && parsed[key]) return parsed[key];
            return parsed;
        } catch (e) {
            console.error("AIProvider: Failed to parse AI response as JSON", str);
            throw new Error("AI returned invalid JSON.");
        }
    }
};
