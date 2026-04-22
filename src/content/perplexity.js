// Brain content script for Perplexity (www.perplexity.ai).

(() => {
  const adapter = {
    siteName: "perplexity",
    findComposer() {
      return (
        document.querySelector('textarea[placeholder*="Ask"]') ||
        document.querySelector('textarea[placeholder*="follow-up"]') ||
        document.querySelector("main textarea") ||
        document.querySelector('div[contenteditable="true"]')
      );
    },
    getPromptText(composer) {
      return composer.tagName === "TEXTAREA" ? composer.value : composer.innerText || "";
    },
    setPromptText(composer, text) {
      if (composer.tagName === "TEXTAREA") {
        window.__brain.brainSetTextareaValue(composer, text);
      } else {
        window.__brain.brainSetContentEditableValue(composer, text);
      }
    },
    findMountPoint(composer) {
      const form = composer.closest("form");
      return form?.parentElement || composer.parentElement?.parentElement;
    },
  };

  window.__brain.mountBrainButton(adapter);
})();
