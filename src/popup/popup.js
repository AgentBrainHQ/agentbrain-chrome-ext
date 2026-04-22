async function refreshStatus() {
  const statusEl = document.getElementById("status");
  const resp = await chrome.runtime.sendMessage({ type: "brain_config_get" });
  const cfg = resp && resp.ok ? resp.data : {};

  if (!cfg.apiKey || !cfg.workspaceId) {
    statusEl.className = "status warn";
    statusEl.textContent = "Brain not configured. Open settings to paste your key.";
    return;
  }

  statusEl.className = "status ok";
  statusEl.textContent = `Connected (${cfg.workspaceId.slice(0, 8)}…)`;
}

document.getElementById("open-options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("open-site").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://agentbrain.ch" });
});

refreshStatus();
