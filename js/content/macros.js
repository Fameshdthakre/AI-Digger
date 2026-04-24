// js/content/macros.js

var isRecordingMacro = false;

function startMacroRecording() {
    isRecordingMacro = true;
    document.addEventListener('click', handleMacroClick, { capture: true });
    document.addEventListener('change', handleMacroChange, { capture: true });
    console.log("Macro recording started.");
}

function stopMacroRecording() {
    isRecordingMacro = false;
    document.removeEventListener('click', handleMacroClick, { capture: true });
    document.removeEventListener('change', handleMacroChange, { capture: true });
    console.log("Macro recording stopped.");
}

function handleMacroClick(e) {
    if (!isRecordingMacro) return;
    // DO NOT prevent default. Let the user interact naturally.
    const selector = generateCssSelector(e.target);
    chrome.runtime.sendMessage({
        action: 'MACRO_ACTION_RECORDED',
        data: { type: 'click', selector: selector }
    });
}

function handleMacroChange(e) {
    if (!isRecordingMacro) return;
    const selector = generateCssSelector(e.target);
    chrome.runtime.sendMessage({
        action: 'MACRO_ACTION_RECORDED',
        data: { type: 'type', selector: selector, text: e.target.value }
    });
}

async function simulateHumanStealth() {
    return new Promise((resolve) => {
        const duration = Math.floor(Math.random() * 1500) + 1000; // 1000ms to 2500ms
        const intervalTime = 100;
        let elapsed = 0;

        const interval = setInterval(() => {
            // Simulate random mouse movements
            const x = Math.floor(Math.random() * window.innerWidth);
            const y = Math.floor(Math.random() * window.innerHeight);
            const mouseEvent = new MouseEvent('mousemove', {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y
            });
            document.body.dispatchEvent(mouseEvent);

            // Occasional micro-scrolls
            if (Math.random() > 0.7) {
                window.scrollBy({
                    top: Math.random() * 100 - 50,
                    behavior: 'smooth'
                });
            }

            elapsed += intervalTime;
            if (elapsed >= duration) {
                clearInterval(interval);
                resolve();
            }
        }, intervalTime);
    });
}

async function executeAction(actionData) {
    const { type, selector, text } = actionData;

    if (type === 'wait') {
        return await waitForElement(selector, 15000);
    }

    let el = findPageElement(selector);

    if (!el) return false;

    if (type === 'click') {
        el.click();
        return true;
    } else if (type === 'type') {
        el.value = text;
        // Dispatch events to trigger framework updates (React/Vue/Angular)
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    return false;
}