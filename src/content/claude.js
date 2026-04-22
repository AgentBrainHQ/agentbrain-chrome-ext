// Brain content script for Claude.ai.
// Claude uses a ProseMirror contenteditable div for the composer.

(() => {
  const adapter = {
    findComposer() {
      return (
        document.querySelector('div.ProseMirror[contenteditable="true"]') ||
        document.querySelector('div[contenteditable="true"][role="textbox"]') ||
        document.querySelector('fieldset div[contenteditable="true"]')
      );
    },
    getPromptText(composer) {
      return composer.innerText || "";
    },
    setPromptText(composer, text) {
      window.__brain.brainSetContentEditableValue(composer, text);
    },
    findMountPoint(composer) {
      const fieldset = composer.closest("fieldset");
      return fieldset?.parentElement || composer.parentElement?.parentElement;
    },
  };

  window.__brain.mountBrainButton(adapter);
})();
