const DEFAULT_BRAIN_URL = "https://api.agentbrain.ch";

async function load() {
  const { apiKey, workspaceId, brainUrl } = await chrome.storage.sync.get([
    "apiKey",
    "workspaceId",
    "brainUrl",
  ]);
  document.getElementById("apiKey").value = apiKey || "";
  document.getElementById("workspaceId").value = workspaceId || "";
  document.getElementById("brainUrl").value = brainUrl || DEFAULT_BRAIN_URL;
}

async function save() {
  const apiKey = document.getElementById("apiKey").value.trim();
  const workspaceId = document.getElementById("workspaceId").value.trim();
  const brainUrl = (document.getElementById("brainUrl").value.trim() || DEFAULT_BRAIN_URL).replace(
    /\/$/,
    "",
  );
  await chrome.storage.sync.set({ apiKey, workspaceId, brainUrl });
  const saved = document.getElementById("saved");
  saved.style.display = "block";
  setTimeout(() => (saved.style.display = "none"), 1500);
}

document.getElementById("save").addEventListener("click", save);
load();
