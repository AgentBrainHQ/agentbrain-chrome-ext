// Brain content script for ChatGPT (chat.openai.com + chatgpt.com).

(() => {
  const adapter = {
    siteName: "chatgpt",
    findComposer() {
      return (
        document.querySelector("textarea#prompt-textarea") ||
        document.querySelector("textarea[data-id]") ||
        document.querySelector('div#prompt-textarea[contenteditable="true"]') ||
        document.querySelector('div[contenteditable="true"][data-id]')
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
