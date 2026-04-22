// Brain content script for ChatGPT (chat.openai.com + chatgpt.com).
// Adds a "🧠 Brain" button below the composer. On click, recalls top memories
// for the current prompt and prepends them as a hidden memory-block.

const BRAIN_BUTTON_ID = "agentbrain-inject-btn";
const BRAIN_WRAPPER_ID = "agentbrain-controls";
const MEMORY_BLOCK_PREFIX = "<!-- BRAIN MEMORIES (injected) -->\n";
const MEMORY_BLOCK_SUFFIX = "\n<!-- /BRAIN MEMORIES -->\n\n";

function findComposer() {
  // ChatGPT composer — currently a textarea with placeholder, fallback to contenteditable
  return (
    document.querySelector("textarea#prompt-textarea") ||
    document.querySelector("textarea[data-id]") ||
    document.querySelector('div[contenteditable="true"][data-id]')
  );
}

function getPromptText(composer) {
  if (composer.tagName === "TEXTAREA") return composer.value;
  return composer.innerText || "";
}

function setPromptText(composer, text) {
  if (composer.tagName === "TEXTAREA") {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    ).set;
    setter.call(composer, text);
    composer.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    composer.innerText = text;
    composer.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }
}

function renderMemoriesForInjection(memories) {
  if (!memories || memories.length === 0) return "";
  const lines = memories.map((m, i) => {
    const content = (m.content || "").trim().replace(/\n+/g, " ");
    return `${i + 1}. ${content.slice(0, 400)}`;
  });
  return (
    MEMORY_BLOCK_PREFIX +
    "The following context comes from your personal Brain. Use it silently if relevant; do not quote these lines verbatim unless asked.\n\n" +
    lines.join("\n") +
    MEMORY_BLOCK_SUFFIX
  );
}

function stripPreviousInjection(text) {
  const start = text.indexOf(MEMORY_BLOCK_PREFIX);
  const end = text.indexOf(MEMORY_BLOCK_SUFFIX.trim());
  if (start >= 0 && end > start) {
    return text.slice(0, start) + text.slice(end + MEMORY_BLOCK_SUFFIX.length);
  }
  return text;
}

async function onBrainClick() {
  const composer = findComposer();
  if (!composer) return;

  const rawPrompt = stripPreviousInjection(getPromptText(composer)).trim();
  if (!rawPrompt) {
    setBrainButtonState("empty");
    return;
  }

  setBrainButtonState("loading");
  const resp = await chrome.runtime.sendMessage({
    type: "brain_recall",
    payload: { query: rawPrompt, limit: 5 },
  });

  if (!resp || !resp.ok) {
    setBrainButtonState(resp && resp.error === "not-configured" ? "unconfigured" : "error");
    return;
  }

  const memories = (resp.data && resp.data.memories) || [];
  if (memories.length === 0) {
    setBrainButtonState("zero");
    return;
  }

  const injection = renderMemoriesForInjection(memories);
  setPromptText(composer, injection + rawPrompt);
  setBrainButtonState("ok", memories.length);
}

function setBrainButtonState(state, count) {
  const btn = document.getElementById(BRAIN_BUTTON_ID);
  if (!btn) return;
  const labels = {
    idle: "🧠 Brain",
    loading: "🧠 …",
    ok: `🧠 +${count || 0}`,
    zero: "🧠 0 found",
    empty: "🧠 type first",
    unconfigured: "🧠 setup needed",
    error: "🧠 error",
  };
  btn.textContent = labels[state] || labels.idle;
  setTimeout(() => {
    btn.textContent = labels.idle;
  }, 2500);
}

function injectButton() {
  if (document.getElementById(BRAIN_BUTTON_ID)) return;
  const composer = findComposer();
  if (!composer) return;

  const wrapper = document.createElement("div");
  wrapper.id = BRAIN_WRAPPER_ID;
  wrapper.style.cssText =
    "display:flex;gap:6px;margin:4px 0;font-size:12px;justify-content:flex-end;";

  const btn = document.createElement("button");
  btn.id = BRAIN_BUTTON_ID;
  btn.type = "button";
  btn.textContent = "🧠 Brain";
  btn.style.cssText =
    "padding:4px 10px;border-radius:999px;border:1px solid currentColor;background:transparent;cursor:pointer;opacity:0.85;";
  btn.title = "Inject top-5 Brain memories relevant to your current prompt";
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onBrainClick();
  });

  wrapper.appendChild(btn);

  const formParent =
    composer.closest("form") || composer.parentElement?.parentElement || composer.parentElement;
  if (formParent && formParent.parentElement) {
    formParent.parentElement.insertBefore(wrapper, formParent.nextSibling);
  }
}

// ChatGPT uses SPA routing + dynamic rerenders — observe DOM and re-inject if needed.
const observer = new MutationObserver(() => {
  injectButton();
});
observer.observe(document.body, { childList: true, subtree: true });

injectButton();
