// js/content/dom-tagger.js

window.injectAiIds = function() {
    let aiIdCounter = 1;

    // Walk the DOM tree
    const treeWalker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT,
        {
            acceptNode: function(node) {
                // Skip script, style, svg, noscript
                const tagName = node.tagName.toLowerCase();
                if (['script', 'style', 'svg', 'noscript', 'iframe'].includes(tagName)) {
                    return NodeFilter.FILTER_REJECT;
                }

                // Skip hidden elements
                const style = window.getComputedStyle(node);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                    return NodeFilter.FILTER_REJECT;
                }

                return NodeFilter.FILTER_ACCEPT;
            }
        },
        false
    );

    let currentNode = treeWalker.nextNode();
    while (currentNode) {
        currentNode.setAttribute('data-ai-id', aiIdCounter.toString());
        aiIdCounter++;
        currentNode = treeWalker.nextNode();
    }

    return aiIdCounter - 1;
};

window.cleanAiIds = function() {
    const elements = document.querySelectorAll('[data-ai-id]');
    elements.forEach(el => el.removeAttribute('data-ai-id'));
};