// js/content/extractor.js

function formatValue(val, formatType) {
    if (!val || typeof val !== 'string') return val;

    switch (formatType) {
        case 'numbers':
            return val.replace(/[^0-9.]/g, '');
        case 'letters':
            return val.replace(/[^a-zA-Z\s]/g, '').trim();
        case 'email':
            const match = val.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
            return match ? match[1] : '';
        case 'trim':
            return val.replace(/\s+/g, ' ').trim();
        case 'raw':
        default:
            return val;
    }
}

function waitForElement(rawSelector, timeoutMs = 15000) {
    return new Promise((resolve) => {
        const selectors = resolveSelectorArray(rawSelector);

        const checkElements = () => {
            for (let selObj of selectors) {
                let el = null;
                try {
                    let selector = selObj.val;
                    if (selObj.type === 'xpath' || selector.startsWith('//') || selector.startsWith('(')) {
                        el = document.evaluate(selector, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                    } else {
                        el = document.querySelector(selector);
                    }
                } catch(e) {}
                if (el) return el;
            }
            return null;
        };

        if (checkElements()) return resolve(true);

        const observer = new MutationObserver(() => {
            if (checkElements()) {
                observer.disconnect();
                resolve(true);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => {
            observer.disconnect();
            resolve(false);
        }, timeoutMs);
    });
}

function resolveSelectorArray(rawSelector) {
    let arr = [];
    try {
        arr = JSON.parse(rawSelector);
    } catch(e) {
        // Not a JSON string array, just use the raw value
        arr = [{ type: 'css', val: rawSelector }];
    }
    return arr;
}

function extractFieldData(field, contextNode = document) {
    if (field.type === 'ai') return null; // AI handled in background

    try {
        let elements = [];
        const selectors = resolveSelectorArray(field.selector);

        for (let selObj of selectors) {
            let selector = selObj.val;
            try {
                if (selObj.type === 'xpath' || selector.startsWith('//') || selector.startsWith('(')) {
                    // If we are searching within a context node, ensure the xpath is relative
                    if (contextNode !== document && selector.startsWith('//')) {
                        selector = '.' + selector;
                    }
                    const xpathResult = document.evaluate(selector, contextNode, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                    for (let i = 0; i < xpathResult.snapshotLength; i++) {
                        elements.push(xpathResult.snapshotItem(i));
                    }
                } else {
                    elements = Array.from(contextNode.querySelectorAll(selector));
                }

                // If we found something, break out of fallback loop
                if (elements.length > 0) break;
            } catch (e) {
                chrome.runtime.sendMessage({ action: 'SCRAPE_ERROR', message: `Selector error in field "${field.name}": ${e.message}` });
            }
        }

        if (field.extractType === 'count') {
            return elements.length;
        }

        if (field.extractType === 'exists') {
            return elements.length > 0;
        }

        if (elements.length === 0) {
            // Apply Missing Node Problem logic
            const aiHeal = field.aiHeal !== false; // Default to true
            if (aiHeal) {
                return field.multiple ? [] : null; // Will trigger failure array logic below
            } else {
                // If aiHeal is false, we gracefully soft-fail by returning an empty string/array,
                // which will NOT trigger the failure loop because we use a special "__USER_SKIPPED__" marker internally
                return field.multiple ? ["__USER_SKIPPED__"] : "__USER_SKIPPED__";
            }
        }

        // Define extraction helper function
        const extractValue = (el) => {
            let val = "";
            if (field.extractType === 'text') {
                val = el.innerText ? el.innerText.trim() : "";
            } else if (field.extractType === 'html') {
                val = el.innerHTML;
            } else if (field.extractType === 'href' || field.extractType === 'src') {
                val = el.getAttribute(field.extractType) || "";
            } else if (field.extractType === 'attribute' && field.attributeName) {
                val = el.getAttribute(field.attributeName) || "";
            } else {
                val = el.innerText ? el.innerText.trim() : "";
            }
            return formatValue(val, field.format);
        };

        if (field.multiple) {
            return elements.map(extractValue);
        } else {
            return extractValue(elements[0]);
        }

    } catch (e) {
        console.error(`Error extracting field ${field.name}:`, e);
        return "ERROR";
    }
}

function executeExtraction(blueprint) {
    let result = {};
    let needsAi = false;
    let failedFieldsGlobal = [];

    // Helper to process a single row given a context node
    const processRow = (contextNode) => {
        const row = {};
        blueprint.fields.forEach(field => {
            if (field.type === 'ai') {
                needsAi = true;
                return;
            }
            let extractedValue = extractFieldData(field, contextNode);

            // Handle Missing Node Problem logic (Accept None vs AI Fallback)
            if (extractedValue === "__USER_SKIPPED__") {
                row[field.name] = ""; // Gracefully soft-fail, skip self-healing
            } else if (Array.isArray(extractedValue) && extractedValue.length > 0 && extractedValue[0] === "__USER_SKIPPED__") {
                row[field.name] = []; // Gracefully soft-fail array
            } else {
                row[field.name] = extractedValue;

                // Capture actual failures for potential self-healing (where aiHeal is true)
                if (!row[field.name] || (Array.isArray(row[field.name]) && row[field.name].length === 0) || row[field.name] === "ERROR") {
                    // Ensure we only track unique failed fields
                    if (!failedFieldsGlobal.some(f => f.name === field.name)) {
                        failedFieldsGlobal.push(field);
                        needsAi = true;
                    }
                }
            }
        });
        return row;
    };

    if (blueprint.containerSelector) {
        // CONTAINER MODEL
        result['items'] = [];
        let containers = [];
        try {
            const containerSelectors = resolveSelectorArray(blueprint.containerSelector);
            for (let selObj of containerSelectors) {
                let selector = selObj.val;
                try {
                    if (selObj.type === 'xpath' || selector.startsWith('//') || selector.startsWith('(')) {
                        const xpathRes = document.evaluate(selector, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                        for (let i = 0; i < xpathRes.snapshotLength; i++) {
                            containers.push(xpathRes.snapshotItem(i));
                        }
                    } else {
                        containers = Array.from(document.querySelectorAll(selector));
                    }
                    if (containers.length > 0) break;
                } catch(e) {}
            }
        } catch(e) {
            console.error("Container selector failed", e);
        }

        if (containers.length > 0) {
            for (let i = 0; i < containers.length; i++) {
                if (blueprint.maxItems > 0 && result['items'].length >= blueprint.maxItems) {
                    break;
                }
                result['items'].push(processRow(containers[i]));
            }
        } else {
            // If container fails, still process Document as fallback but flag it
            result['items'].push(processRow(document));
        }

    } else {
        // STANDARD MODEL (Single Page / Flat mapping)
        result = processRow(document);

        if (blueprint.maxItems > 0) {
            for (let key in result) {
                if (Array.isArray(result[key]) && result[key].length > blueprint.maxItems) {
                    result[key] = result[key].slice(0, blueprint.maxItems);
                }
            }
        }
    }

    // Attach Meta Data
    result['URL'] = window.location.href;
    result['Timestamp'] = new Date().toISOString();

    if (failedFieldsGlobal.length > 0) {
        result['_failedFields'] = failedFieldsGlobal;
    }

    if (needsAi) {
        // Use Turndown to convert DOM to Markdown
        try {
            const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
            const clone = document.body.cloneNode(true);
            const scripts = clone.querySelectorAll('script, style, noscript, svg, iframe');
            scripts.forEach(s => s.remove());
            result['_pageMarkdown'] = turndownService.turndown(clone.innerHTML);
        } catch (err) {
            console.error("Turndown failed", err);
            result['_pageMarkdown'] = document.body.innerText.trim();
        }
    }

    return result;
}