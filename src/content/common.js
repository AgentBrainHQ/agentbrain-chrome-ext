// Brain shared content-script helpers.
// Each site-specific script (chatgpt.js, claude.js, gemini.js, perplexity.js)
// defines a `BrainAdapter` with site selectors, then calls `mountBrainButton(adapter)`.

const BRAIN_BUTTON_ID = "agentbrain-inject-btn";
const BRAIN_WRAPPER_ID = "agentbrain-controls";
const MEMORY_BLOCK_PREFIX = "<!-- BRAIN MEMORIES (injected) -->\n";
const MEMORY_BLOCK_SUFFIX = "\n<!-- /BRAIN MEMORIES -->\n\n";

function brainRenderMemoriesForInjection(memories) {
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

function brainStripPreviousInjection(text) {
  const start = text.indexOf(MEMORY_BLOCK_PREFIX);
  const end = text.indexOf(MEMORY_BLOCK_SUFFIX.trim());
  if (start >= 0 && end > start) {
    return text.slice(0, start) + text.slice(end + MEMORY_BLOCK_SUFFIX.length);
  }
  return text;
}

function brainSetButtonState(state, count) {
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
  if (state !== "idle" && state !== "loading") {
    setTimeout(() => {
      const b = document.getElementById(BRAIN_BUTTON_ID);
      if (b) b.textContent = labels.idle;
    }, 2500);
  }
}

function brainSetTextareaValue(composer, text) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  ).set;
  setter.call(composer, text);
  composer.dispatchEvent(new Event("input", { bubbles: true }));
}

function brainSetContentEditableValue(composer, text) {
  composer.focus();
  // Clear existing content
  const range = document.createRange();
  range.selectNodeContents(composer);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand("delete");
  // Insert new text (execCommand is deprecated but still the most reliable way
  // to produce an input event the host app's React/Vue state actually picks up)
  document.execCommand("insertText", false, text);
}

async function brainHandleClick(adapter) {
  const composer = adapter.findComposer();
  if (!composer) return;

  const rawPrompt = brainStripPreviousInjection(adapter.getPromptText(composer)).trim();
  if (!rawPrompt) {
    brainSetButtonState("empty");
    return;
  }

  brainSetButtonState("loading");
  let resp;
  try {
    resp = await chrome.runtime.sendMessage({
      type: "brain_recall",
      payload: { query: rawPrompt, limit: 5 },
    });
  } catch (_err) {
    brainSetButtonState("error");
    return;
  }

  if (!resp || !resp.ok) {
    brainSetButtonState(resp && resp.error === "not-configured" ? "unconfigured" : "error");
    return;
  }

  const memories = (resp.data && resp.data.memories) || [];
  if (memories.length === 0) {
    brainSetButtonState("zero");
    return;
  }

  const injection = brainRenderMemoriesForInjection(memories);
  adapter.setPromptText(composer, injection + rawPrompt);
  brainSetButtonState("ok", memories.length);
}

function brainMakeButton(adapter) {
  const wrapper = document.createElement("div");
  wrapper.id = BRAIN_WRAPPER_ID;
  wrapper.style.cssText =
    "display:flex;gap:6px;margin:4px 0;font-size:12px;justify-content:flex-end;";

  const btn = document.createElement("button");
  btn.id = BRAIN_BUTTON_ID;
  btn.type = "button";
  btn.textContent = "🧠 Brain";
  btn.style.cssText =
    "padding:4px 10px;border-radius:999px;border:1px solid currentColor;background:transparent;cursor:pointer;opacity:0.85;font:inherit;color:inherit;";
  btn.title = "Inject top-5 Brain memories relevant to your current prompt";
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    brainHandleClick(adapter);
  });

  wrapper.appendChild(btn);
  return wrapper;
}

function brainInjectButton(adapter) {
  if (document.getElementById(BRAIN_BUTTON_ID)) return;
  const composer = adapter.findComposer();
  if (!composer) return;

  const mountPoint = adapter.findMountPoint
    ? adapter.findMountPoint(composer)
    : composer.closest("form")?.parentElement || composer.parentElement?.parentElement;

  if (!mountPoint) return;

  const wrapper = brainMakeButton(adapter);
  mountPoint.appendChild(wrapper);
}

function mountBrainButton(adapter) {
  const attempt = () => brainInjectButton(adapter);
  const observer = new MutationObserver(attempt);
  observer.observe(document.body, { childList: true, subtree: true });
  attempt();
}

// Expose to site-specific scripts
window.__brain = {
  mountBrainButton,
  brainSetTextareaValue,
  brainSetContentEditableValue,
};
