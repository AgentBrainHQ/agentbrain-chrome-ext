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

  // Also start auto-save observation once; it piggybacks on keydown/click at the document level
  brainObserveSubmits(adapter);
}

// -------------------- Auto-save (Hybrid C) --------------------

// Short window to prevent double-capture when Enter fires AND a Send button click fires.
let brainLastCaptureAt = 0;
const BRAIN_CAPTURE_COOLDOWN_MS = 1500;

function brainIsSubmitLikeButton(el) {
  if (!el || el.nodeType !== 1) return false;
  const btn = el.closest("button");
  if (!btn) return false;
  if (btn.getAttribute("type") === "submit") return true;
  const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
  const dataTestId = (btn.getAttribute("data-testid") || "").toLowerCase();
  if (/\b(send|submit|ask|absenden|senden)\b/.test(aria)) return true;
  if (/send|submit/.test(dataTestId)) return true;
  return false;
}

async function brainCaptureAndStore(adapter, capturedText) {
  const now = Date.now();
  if (now - brainLastCaptureAt < BRAIN_CAPTURE_COOLDOWN_MS) return;
  brainLastCaptureAt = now;

  const prompt = brainStripPreviousInjection(capturedText || "").trim();
  if (!prompt || prompt.length < 20) return;

  let cfgResp;
  try {
    cfgResp = await chrome.runtime.sendMessage({ type: "brain_config_get" });
  } catch (_err) {
    return;
  }
  if (!cfgResp || !cfgResp.ok) return;
  const cfg = cfgResp.data || {};
  if (!cfg.autoSave || !cfg.apiKey || !cfg.workspaceId) return;

  const site = adapter.siteName || "unknown";
  const content = `[SOURCE:${site}] User prompt:\n${prompt}`;

  // Optimistic UI: flash confirmation now. Brain API can take 10+ seconds to
  // respond, by which time the user has moved on and any feedback is useless.
  brainFlashSavedDot();
  brainFlashButtonLabel("🧠 ✓ saved");

  let resp;
  try {
    resp = await chrome.runtime.sendMessage({
      type: "brain_store",
      payload: {
        content,
        memoryType: "episodic",
        sourceTrust: 0.7,
        metadata: { source: site, chat_url: location.href, kind: "user_prompt" },
      },
    });
  } catch (_err) {
    brainFlashButtonLabel("🧠 save error");
    return;
  }

  if (!resp || !resp.ok) {
    const label = resp && resp.error === "sensitive-content-filtered"
      ? "🧠 skipped (sensitive)"
      : "🧠 save error";
    brainFlashButtonLabel(label);
  }
}

function brainFlashSavedDot() {
  const btn = document.getElementById(BRAIN_BUTTON_ID);
  if (!btn) return;
  let dot = document.getElementById("agentbrain-saved-dot");
  if (!dot) {
    dot = document.createElement("span");
    dot.id = "agentbrain-saved-dot";
    dot.title = "Saved to Brain";
    dot.style.cssText =
      "display:inline-block;width:10px;height:10px;border-radius:50%;background:#22c55e;margin-left:6px;vertical-align:middle;transition:opacity 2.5s ease;opacity:0;box-shadow:0 0 6px #22c55e;";
    btn.appendChild(dot);
  }
  void dot.offsetWidth;
  dot.style.opacity = "1";
  setTimeout(() => {
    dot.style.opacity = "0";
  }, 2500);
}

let brainLabelFlashTimer = null;
function brainFlashButtonLabel(label) {
  const btn = document.getElementById(BRAIN_BUTTON_ID);
  if (!btn) return;
  btn.textContent = label;
  // Re-append the dot if it was flushed by textContent reset
  const dot = document.getElementById("agentbrain-saved-dot");
  if (dot) btn.appendChild(dot);
  if (brainLabelFlashTimer) clearTimeout(brainLabelFlashTimer);
  brainLabelFlashTimer = setTimeout(() => {
    const b = document.getElementById(BRAIN_BUTTON_ID);
    if (b) {
      b.textContent = "🧠 Brain";
      const d = document.getElementById("agentbrain-saved-dot");
      if (d) b.appendChild(d);
    }
  }, 2500);
}

function brainObserveSubmits(adapter) {
  // Capture the prompt text SYNCHRONOUSLY on Enter / Send-click, because
  // host apps (ChatGPT etc.) clear the composer within the same tick.
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      const composer = adapter.findComposer();
      if (!composer) return;
      const active = document.activeElement;
      if (active !== composer && !composer.contains(active)) return;
      brainCaptureAndStore(adapter, adapter.getPromptText(composer));
    },
    true,
  );

  document.addEventListener(
    "click",
    (e) => {
      if (!brainIsSubmitLikeButton(e.target)) return;
      const composer = adapter.findComposer();
      if (!composer) return;
      brainCaptureAndStore(adapter, adapter.getPromptText(composer));
    },
    true,
  );
}

// Expose to site-specific scripts
window.__brain = {
  mountBrainButton,
  brainSetTextareaValue,
  brainSetContentEditableValue,
};
