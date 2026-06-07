/**
 * js/content/stealth.js
 * Implements human-like behavior simulation.
 */

window.StealthHelper = {
    async simulateHuman(level = 'advanced') {
        if (level === 'none') return;

        await this.randomScroll();
        if (level === 'advanced') {
            await this.mouseJitter();
        }
    },

    async randomScroll() {
        const height = document.body.scrollHeight;
        const viewportHeight = window.innerHeight;
        const scrollTarget = Math.min(height - viewportHeight, Math.random() * 500 + 200);

        return this.smoothScroll(scrollTarget);
    },

    async smoothScroll(target) {
        return new Promise((resolve) => {
            let current = window.scrollY;
            const step = () => {
                const diff = target - current;
                if (Math.abs(diff) < 5) {
                    window.scrollTo(0, target);
                    resolve();
                    return;
                }
                const move = diff * 0.1 + (Math.random() * 2 - 1);
                current += move;
                window.scrollTo(0, current);
                requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        });
    },

    async mouseJitter() {
        // Simulate a few random mouse movements
        for (let i = 0; i < 5; i++) {
            const x = Math.random() * window.innerWidth;
            const y = Math.random() * window.innerHeight;
            const event = new MouseEvent('mousemove', {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y
            });
            document.dispatchEvent(event);
            await new Promise(r => setTimeout(r, Math.random() * 200 + 100));
        }
    },

    async humanType(element, text) {
        element.focus();
        for (const char of text) {
            const keyCode = char.charCodeAt(0);
            element.dispatchEvent(new KeyboardEvent('keydown', { keyCode }));
            element.dispatchEvent(new KeyboardEvent('keypress', { keyCode }));
            element.value += char;
            element.dispatchEvent(new InputEvent('input', { data: char, inputType: 'insertText' }));
            element.dispatchEvent(new KeyboardEvent('keyup', { keyCode }));
            await new Promise(r => setTimeout(r, Math.random() * 100 + 50));
        }
    }
};
