// js/content/extractor.js

if (!window.aiDiggerExtractorLoaded) {
    window.aiDiggerExtractorLoaded = true;

    window.VisualOverlay = {
        highlight(el, label) {
            const rect = el.getBoundingClientRect();
            const box = document.createElement('div');
            box.className = 'ai-digger-highlight';
            box.style.position = 'fixed';
            box.style.top = rect.top + 'px';
            box.style.left = rect.left + 'px';
            box.style.width = rect.width + 'px';
            box.style.height = rect.height + 'px';
            box.style.border = '2px solid var(--magic-bg, #8b5cf6)';
            box.style.backgroundColor = 'rgba(139, 92, 246, 0.1)';
            box.style.zIndex = '1000000';
            box.style.pointerEvents = 'none';
            box.style.transition = 'all 0.3s ease';

            if (label) {
                const tag = document.createElement('div');
                tag.innerText = label;
                tag.style.position = 'absolute';
                tag.style.top = '-18px';
                tag.style.left = '-2px';
                tag.style.backgroundColor = 'var(--magic-bg, #8b5cf6)';
                tag.style.color = 'white';
                tag.style.fontSize = '10px';
                tag.style.padding = '2px 6px';
                tag.style.borderRadius = '2px 2px 0 0';
                box.appendChild(tag);
            }

            document.body.appendChild(box);
            setTimeout(() => box.remove(), 2000);
        }
    };

    window.formatValue = function (val, formatType) {
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
    };

    window.waitForElement = function (rawSelector, timeoutMs = 15000) {
        return new Promise((resolve) => {
            const selectors = resolveSelectorArray(rawSelector);

            const checkElements = () => findPageElement(rawSelector);

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
    };

    window.resolveSelectorArray = function (rawSelector) {
        if (!rawSelector) return [];
        let arr = [];
        try {
            arr = JSON.parse(rawSelector);
            if (!Array.isArray(arr)) arr = [arr];
        } catch (e) {
            arr = [{ type: 'css', val: rawSelector }];
        }
        return arr;
    };

    window.findPageElements = function (rawSelector, contextNode = document) {
        const selectors = resolveSelectorArray(rawSelector);
        let elements = [];
        for (let selObj of selectors) {
            let selector = selObj.val;
            try {
                if (selObj.type === 'xpath' || selector.startsWith('//') || selector.startsWith('(')) {
                    if (contextNode !== document && selector.startsWith('//')) selector = '.' + selector;
                    const xpathResult = document.evaluate(selector, contextNode, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                    for (let i = 0; i < xpathResult.snapshotLength; i++) elements.push(xpathResult.snapshotItem(i));
                } else {
                    elements = Array.from(contextNode.querySelectorAll(selector));
                }
                if (elements.length > 0) break;
            } catch (e) { }
        }
        return elements;
    };

    window.findPageElement = function (rawSelector, contextNode = document) {
        const elements = findPageElements(rawSelector, contextNode);
        return elements.length > 0 ? elements[0] : null;
    };

    window.extractFieldData = function (field, contextNode = document) {
        if (field.type === 'ai') return null;

        try {
            let elements = findPageElements(field.selector, contextNode);

            if (field.extractType === 'count') return elements.length;
            if (field.extractType === 'exists') return elements.length > 0;
            if (elements.length === 0) return field.multiple ? [] : null;

            const extractValue = (el) => {
                if (el && el.nodeType === 1) {
                    VisualOverlay.highlight(el, field.name);
                }
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
    };

    window.executeExtraction = function (blueprint) {
        let result = {};
        let needsAi = false;
        let failedFieldsGlobal = [];

        const processRow = (contextNode) => {
            const row = {};
            blueprint.fields.forEach(field => {
                if (field.type === 'ai') {
                    needsAi = true;
                    return;
                }
                row[field.name] = extractFieldData(field, contextNode);
                if (!row[field.name] || (Array.isArray(row[field.name]) && row[field.name].length === 0)) {
                    if (!failedFieldsGlobal.some(f => f.name === field.name)) {
                        failedFieldsGlobal.push(field);
                        needsAi = true;
                    }
                }
            });
            return row;
        };

        if (blueprint.containerSelector) {
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
                    } catch (e) { }
                }
            } catch (e) {
                console.error("Container selector failed", e);
            }

            if (containers.length > 0) {
                for (let i = 0; i < containers.length; i++) {
                    if (blueprint.maxItems > 0 && result['items'].length >= blueprint.maxItems) break;
                    result['items'].push(processRow(containers[i]));
                }
            } else {
                result['items'].push(processRow(document));
            }
        } else {
            result = processRow(document);
            if (blueprint.maxItems > 0) {
                for (let key in result) {
                    if (Array.isArray(result[key]) && result[key].length > blueprint.maxItems) {
                        result[key] = result[key].slice(0, blueprint.maxItems);
                    }
                }
            }
        }

        result['URL'] = window.location.href;
        result['Timestamp'] = new Date().toISOString();

        if (failedFieldsGlobal.length > 0) {
            result['_failedFields'] = failedFieldsGlobal;
        }

        if (needsAi) {
            try {
                const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
                const clone = document.body.cloneNode(true);
                clone.querySelectorAll('script, style, noscript, svg, iframe').forEach(s => s.remove());
                result['_pageMarkdown'] = turndownService.turndown(clone.innerHTML);
            } catch (err) {
                result['_pageMarkdown'] = document.body.innerText.trim();
            }
        }

        return result;
    };
}