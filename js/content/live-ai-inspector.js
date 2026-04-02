// js/content/live-ai-inspector.js

// Ensure we don't declare things multiple times during programmatic injection.
if (typeof window.liveAiInspectorInitialized === 'undefined') {
  window.liveAiInspectorInitialized = true;

  window.liveAiState = {
    isActive: false,
    hoveredElement: null,
    originalOutline: null,
    currentFieldId: null
  };

  window.liveAiMouseOver = function(e) {
    if (!window.liveAiState.isActive) return;

    e.stopPropagation();

    if (window.liveAiState.hoveredElement) {
      window.liveAiState.hoveredElement.style.outline = window.liveAiState.originalOutline;
    }

    const target = e.target;
    window.liveAiState.hoveredElement = target;
    window.liveAiState.originalOutline = target.style.outline;

    // Light blue outline for hover
    target.style.outline = '2px solid #3b82f6';
  };

  window.liveAiMouseOut = function(e) {
    if (!window.liveAiState.isActive) return;

    e.stopPropagation();

    if (window.liveAiState.hoveredElement) {
      window.liveAiState.hoveredElement.style.outline = window.liveAiState.originalOutline;
      window.liveAiState.hoveredElement = null;
      window.liveAiState.originalOutline = null;
    }
  };

  window.liveAiClick = function(e) {
    if (!window.liveAiState.isActive) return;

    e.preventDefault();
    e.stopPropagation();

    const target = e.target;

    // Restore original outline just in case
    target.style.outline = window.liveAiState.originalOutline;

    // Apply thick red outline
    target.style.outline = '4px solid red';
    // Remove the tracking of hover outline so mouseout doesn't clear the red outline
    window.liveAiState.hoveredElement = null;
    window.liveAiState.originalOutline = null;

    // Grab HTML and truncate
    const html = target.outerHTML;
    const truncatedHtml = html ? html.substring(0, 10000) : '';

    // Deactivate listeners immediately so user can't click anything else
    window.deactivateLiveAiMode();

    // Send to background to capture
    chrome.runtime.sendMessage({
      action: 'CAPTURE_VISION_ELEMENT',
      html: truncatedHtml,
      fieldId: window.liveAiState.currentFieldId
    }, (response) => {
      // Background responds when capture is done
      if (chrome.runtime.lastError) {
        console.error("CAPTURE_VISION_ELEMENT error:", chrome.runtime.lastError.message);
      } else {
        console.log("Live AI Capture response:", response);
      }
      // Remove red outline after capture
      target.style.outline = '';
    });
  };

  window.activateLiveAiMode = function(fieldId = null) {
    if (window.liveAiState.isActive) return;
    window.liveAiState.isActive = true;
    window.liveAiState.currentFieldId = fieldId;

    document.addEventListener('mouseover', window.liveAiMouseOver, true);
    document.addEventListener('mouseout', window.liveAiMouseOut, true);
    document.addEventListener('click', window.liveAiClick, true);

    console.log("Live AI Mode activated.");
  };

  window.deactivateLiveAiMode = function() {
    if (!window.liveAiState.isActive) return;
    window.liveAiState.isActive = false;

    document.removeEventListener('mouseover', window.liveAiMouseOver, true);
    document.removeEventListener('mouseout', window.liveAiMouseOut, true);
    document.removeEventListener('click', window.liveAiClick, true);

    if (window.liveAiState.hoveredElement) {
        window.liveAiState.hoveredElement.style.outline = window.liveAiState.originalOutline;
        window.liveAiState.hoveredElement = null;
        window.liveAiState.originalOutline = null;
    }

    console.log("Live AI Mode deactivated.");
  };

  // Listen for activation from UI
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'START_LIVE_AI_MODE') {
      window.activateLiveAiMode(message.fieldId);
      sendResponse({ status: 'live_ai_mode_started' });
    } else if (message.action === 'STOP_LIVE_AI_MODE') {
      window.deactivateLiveAiMode();
      sendResponse({ status: 'live_ai_mode_stopped' });
    }
  });
}
