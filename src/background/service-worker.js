// Brain MV3 service worker.
// Handles Brain API calls so content scripts never need direct network/CORS access.

const DEFAULT_BRAIN_URL = "https://api.agentbrain.ch";
// Patterns that probably indicate sensitive content that should NOT be auto-saved.
// Deliberately conservative — we'd rather skip a save than leak a secret to Brain.
const SENSITIVE_PATTERNS = [
  /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/, // CC
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b.*\b(?:password|passwort|pwd|pass)\b/i, // email+password combo
  /\bpassword\s*[:=]\s*\S{6,}/i,
  /\bpasswort\s*[:=]\s*\S{6,}/i,
  /\bapi[_-]?key\s*[:=]\s*\S{12,}/i,
  /\bsk-[A-Za-z0-9_-]{20,}/, // OpenAI / Anthropic-style keys
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bglpat-[A-Za-z0-9_-]{20,}/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/, // Slack
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
];

async function loadConfig() {
  const { apiKey, workspaceId, brainUrl, autoSave } = await chrome.storage.sync.get([
    "apiKey",
    "workspaceId",
    "brainUrl",
    "autoSave",
  ]);
  return {
    apiKey: apiKey || "",
    workspaceId: workspaceId || "",
    brainUrl: (brainUrl || DEFAULT_BRAIN_URL).replace(/\/$/, ""),
    autoSave: autoSave !== false, // default ON
  };
}

function containsSensitive(text) {
  if (!text) return false;
  return SENSITIVE_PATTERNS.some((re) => re.test(text));
}

async function brainRecall({ query, limit = 5 }) {
  const cfg = await loadConfig();
  if (!cfg.apiKey || !cfg.workspaceId) {
    return { ok: false, error: "not-configured" };
  }

  const resp = await fetch(`${cfg.brainUrl}/memory/recall`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": cfg.apiKey,
    },
    body: JSON.stringify({
      workspace_id: cfg.workspaceId,
      query,
      limit,
    }),
  });

  if (!resp.ok) {
    return { ok: false, error: `brain-api-${resp.status}` };
  }
  const data = await resp.json();
  return { ok: true, data };
}

async function brainStore({ content, memoryType = "episodic", sourceTrust = 0.9, metadata }) {
  const cfg = await loadConfig();
  if (!cfg.apiKey || !cfg.workspaceId) {
    return { ok: false, error: "not-configured" };
  }
  if (containsSensitive(content)) {
    return { ok: false, error: "sensitive-content-filtered" };
  }

  const body = {
    workspace_id: cfg.workspaceId,
    content,
    memory_type: memoryType,
    source_trust: sourceTrust,
  };
  if (metadata) body.metadata = metadata;

  const resp = await fetch(`${cfg.brainUrl}/memory/store`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": cfg.apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    return { ok: false, error: `brain-api-${resp.status}` };
  }
  const data = await resp.json();
  return { ok: true, data };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "brain_recall") {
        sendResponse(await brainRecall(msg.payload || {}));
      } else if (msg.type === "brain_store") {
        sendResponse(await brainStore(msg.payload || {}));
      } else if (msg.type === "brain_config_get") {
        sendResponse({ ok: true, data: await loadConfig() });
      } else {
        sendResponse({ ok: false, error: `unknown-message-type:${msg.type}` });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
  })();
  return true; // keep channel open for async sendResponse
});
