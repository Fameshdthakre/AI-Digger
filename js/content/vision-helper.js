// js/content/vision-helper.js

window.visionBoxMapping = {};

window.drawBoundingBoxes = function() {
    window.clearBoundingBoxes();

    let boxCounter = 1;
    window.visionBoxMapping = {};

    // Create a container to hold all boxes so they can be easily cleared
    const container = document.createElement('div');
    container.id = 'ai-digger-vision-overlay-container';
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '2147483647'; // Max z-index
    document.body.appendChild(container);

    // Find all visible interactive or semantic elements
    const elements = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"], img, h1, h2, h3, p, span, div.card, div.item');

    elements.forEach(el => {
        const rect = el.getBoundingClientRect();

        // Skip hidden or tiny elements
        if (rect.width < 10 || rect.height < 10 || rect.top < 0 || rect.left < 0) {
            return;
        }

        // Check if element is reasonably within the viewport
        if (rect.bottom > window.innerHeight * 2 || rect.right > window.innerWidth * 2) {
            return;
        }

        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return;
        }

        // Store mapping
        window.visionBoxMapping[boxCounter] = el;

        // Draw Box
        const box = document.createElement('div');
        box.style.position = 'absolute';
        box.style.left = `${rect.left + window.scrollX}px`;
        box.style.top = `${rect.top + window.scrollY}px`;
        box.style.width = `${rect.width}px`;
        box.style.height = `${rect.height}px`;
        box.style.border = '2px solid rgba(255, 255, 0, 0.8)';
        box.style.backgroundColor = 'rgba(255, 255, 0, 0.1)';
        box.style.boxSizing = 'border-box';

        // Draw Number Label
        const label = document.createElement('div');
        label.innerText = boxCounter;
        label.style.position = 'absolute';
        label.style.top = '-2px';
        label.style.left = '-2px';
        label.style.backgroundColor = 'rgba(255, 255, 0, 1)';
        label.style.color = '#000';
        label.style.fontSize = '12px';
        label.style.fontWeight = 'bold';
        label.style.padding = '1px 4px';
        label.style.lineHeight = '1';

        box.appendChild(label);
        container.appendChild(box);

        boxCounter++;
    });

    return boxCounter - 1; // Return total number of boxes drawn
};

window.clearBoundingBoxes = function() {
    const existing = document.getElementById('ai-digger-vision-overlay-container');
    if (existing) {
        existing.remove();
    }
};