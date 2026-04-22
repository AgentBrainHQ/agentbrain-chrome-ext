// Brain content script for Gemini (gemini.google.com).
// Gemini uses a contenteditable rich-text area inside a rich-textarea web component.

(() => {
  const adapter = {
    siteName: "gemini",
    findComposer() {
      return (
        document.querySelector('rich-textarea div.ql-editor[contenteditable="true"]') ||
        document.querySelector('div.ql-editor[contenteditable="true"]') ||
        document.querySelector('div[contenteditable="true"][role="textbox"]')
      );
    },
    getPromptText(composer) {
      return composer.innerText || "";
    },
    setPromptText(composer, text) {
      window.__brain.brainSetContentEditableValue(composer, text);
    },
    findMountPoint(composer) {
      const rta = composer.closest("rich-textarea");
      const container = rta?.parentElement?.parentElement || composer.parentElement?.parentElement;
      return container || composer.parentElement;
    },
  };

  window.__brain.mountBrainButton(adapter);
})();
