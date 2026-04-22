# Brain — Chrome Extension

Inject your personal Agent Brain memory into ChatGPT. One memory, every AI.

## What it does

Adds a `🧠 Brain` button below the ChatGPT composer. Click it and the extension will:

1. Take your current prompt text as the query
2. Recall the top-5 relevant memories from your Brain (`api.agentbrain.ch`)
3. Prepend them silently as a memory-block above your prompt
4. ChatGPT sees the memories as context and answers using them

Memories injected this way live only inside the current message — they are not stored in ChatGPT's own memory system.

## Install (developer mode)

1. Run `chrome://extensions`.
2. Enable **Developer mode** (toggle top-right).
3. Click **Load unpacked** and select this directory (`agentbrain-chrome-ext/`).
4. Click the Brain icon in the toolbar and hit **Settings**.
5. Paste your API key and workspace ID from <https://agentbrain.ch/settings>.
6. Open <https://chatgpt.com/> — a `🧠 Brain` button appears below the composer.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Store your API key and workspace ID locally (synced across your Chrome instances) |
| `activeTab` | Detect when you open ChatGPT |
| `chatgpt.com`, `chat.openai.com` | Inject the content script |
| `api.agentbrain.ch` | Call `/memory/recall` |

No data leaves your machine other than the recall queries to `api.agentbrain.ch` using your own API key.

## Roadmap

- [x] ChatGPT inject (v0.1)
- [ ] Claude.ai inject (v0.2)
- [ ] Gemini inject (v0.3)
- [ ] Perplexity inject (v0.4)
- [ ] After-submit auto-store (optional toggle)
- [ ] Similarity-threshold auto-inject (optional toggle)
- [ ] Chrome Web Store submission

## Architecture

```
manifest.json                — MV3 config, host permissions
src/background/service-worker.js   — single entry for Brain API calls
src/content/chatgpt.js       — DOM-inject button + prompt rewrite
src/popup/popup.html|js      — toolbar popup status
src/options/options.html|js  — settings page
icons/                       — (todo: real icons)
```

Content script ↔ Service Worker ↔ Brain API. Content script never talks to the API directly — avoids CORS headaches and keeps secrets out of the page context.

## Development

No build step. Edit files directly and hit the reload icon on `chrome://extensions` to pick up changes.

## License

MIT
