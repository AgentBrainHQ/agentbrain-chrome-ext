// Brain MV3 service worker.
// Handles Brain API calls so content scripts never need direct network/CORS access.

const DEFAULT_BRAIN_URL = "https://api.agentbrain.ch";

async function loadConfig() {
  const { apiKey, workspaceId, brainUrl } = await chrome.storage.sync.get([
    "apiKey",
    "workspaceId",
    "brainUrl",
  ]);
  return {
    apiKey: apiKey || "",
    workspaceId: workspaceId || "",
    brainUrl: (brainUrl || DEFAULT_BRAIN_URL).replace(/\/$/, ""),
  };
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

async function brainStore({ content, memoryType = "episodic", sourceTrust = 0.9 }) {
  const cfg = await loadConfig();
  if (!cfg.apiKey || !cfg.workspaceId) {
    return { ok: false, error: "not-configured" };
  }

  const resp = await fetch(`${cfg.brainUrl}/memory/store`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": cfg.apiKey,
    },
    body: JSON.stringify({
      workspace_id: cfg.workspaceId,
      content,
      memory_type: memoryType,
      source_trust: sourceTrust,
    }),
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
