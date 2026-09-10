# Image Sprint

A compact Windows desktop launcher for finding images without breaking your flow. Inspired by Agent Native’s charcoal palette and Raycast’s keyboard-first workflow.

## Use it

Open **Image Sprint.exe** from the packaged `release/win-unpacked` folder, or the portable `Image-Sprint-1.0.0-Windows.exe` when available. Keep the unpacked folder together if using that version.

1. Open Settings and enter your **SerpAPI** key. Get your existing key from [your SerpAPI dashboard](https://serpapi.com/manage-api-key).
2. Search for an image. Press **Ctrl+T** to start another search immediately; existing searches keep running.
3. Hover an image to **copy**, **save to Downloads**, or **remove its background**. Click the image for a larger preview and source link.
4. Every copied or downloaded image is also kept in **Saved**, with a name based on its search: `Monkey (1).png`, `Monkey (2).png`, and so on.

**Ctrl+Alt+Space** shows or hides the app while it is running. Closing the window keeps it in the system tray; use the tray menu to quit. Settings includes optional launch at Windows sign-in.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+Alt+Space | Show / hide Image Sprint globally |
| Ctrl+T | New search tab |
| Ctrl+W | Close current search tab |
| Ctrl+Tab / Ctrl+Shift+Tab | Next / previous tab |
| Ctrl+L | Focus the search box |
| Enter | Search, or preview the focused image |
| Down from search | Focus first result |
| Arrow keys | Move between results |
| Ctrl+C on a result | Copy image |
| Ctrl+S on a result | Save to Downloads |
| Ctrl+S elsewhere | Open Saved |
| Ctrl+, | Settings |
| Esc | Close a dialog, otherwise hide the window |

## How images are stored

- **Copy** puts actual PNG image data on the system clipboard and preserves a copy in the local library. It does not add a file to Downloads.
- **Save** writes a PNG to the Windows Downloads folder and keeps it in the local library.
- The library reuses the same entry when the same image, query, and variant are copied/saved again. Cutouts get their own entry.
- Filenames are safe on Windows. Existing files are never overwritten; if a number is taken, the download uses the next available number.
- The library, encrypted key, and cutout cache live under Electron’s per-user app data directory, normally `%APPDATA%/image-sprint`. No images or keys are stored in this repository.
- Search tabs persist while the app is running or hidden; Saved persists across restarts. Closing a search tab cancels its outstanding search.

## Real services

Search uses [SerpAPI’s Google Images endpoint](https://serpapi.com/google-images-api), with All images, Transparent, Icons, and Photos filters. Searches require a valid key and available account quota. Requests run in Electron’s main process; the renderer never receives the key. Responses are cached for five minutes to avoid repeated paid calls for the same query, filter, and page.

Background removal uses [IMG.LY background removal](https://github.com/imgly/background-removal-js) in a dedicated worker. Its quantized model and runtime download from IMG.LY on first use and are cached locally. Processing happens on your device. Multiple cutouts queue while search tabs stay usable. The first run may take a few minutes; subsequent cutouts reuse the loaded model. Quality varies with the image.

Some image hosts reject direct downloads, disappear, or return unsupported content. The app reports the failure and lets you choose another result. Images are limited to 30 MB / 40 megapixels. Animated images become a still PNG. Google results do not grant usage rights; the original source is available from the preview.

## Develop

Requires Node.js 22.12+ (or a supported newer release), pnpm 11+, and Windows for the supplied packaging targets.

```sh
pnpm install
pnpm test
pnpm start
```

`pnpm start` builds the UI and opens the actual Electron app. `pnpm dev` starts a **UI-only** browser preview at `http://127.0.0.1:5176`; native actions and SerpAPI are available in Electron.

You may set `SERPAPI_API_KEY` in an ignored `.env` file beside `package.json`, or enter the key in Settings. A saved Settings key takes precedence. For the unpacked app, an optional `.env` can sit beside the executable. Settings is recommended for portable builds.

```sh
pnpm build  # Renderer assets
pnpm pack   # Unpacked Windows app in release/win-unpacked
pnpm dist   # Single-file Windows portable executable
pnpm smoke  # Native renderer, IPC, shortcut, and encryption check
```

For a live smoke test, supply your key and set `SPRINT_SMOKE_QUERY=monkey` before running `pnpm smoke`. It makes one real search and downloads one returned image for decoding. Do not run a second app instance during smoke tests. Use `SPRINT_TEST_DATA` to isolate test settings/library from your real library.

`tests/background.html`, served by `pnpm dev`, exercises the real cutout model on a generated fixture and lets you verify the main thread remains responsive. It is not included in the production build.

## Architecture and security

- Sandboxed Electron renderer, context isolation, no Node integration, narrow validated IPC.
- Credential encryption through Electron `safeStorage` (Windows DPAPI); no plaintext credential persistence through Settings.
- HTTPS-only fixed SerpAPI destination. Image requests are separate and never carry the API key.
- Image fetches reject private/local IPs, non-HTTP schemes, credential-bearing URLs, unusual ports, oversized responses, and invalid content. Redirect targets are revalidated.
- Original image bytes are decoded by Sharp, normalized to PNG, and bounded in memory. Large-model inference runs in a separate worker.
- Exclusive writes prevent file overwrites. Library writes are serialized and the JSON index is replaced atomically.

## License

AGPL-3.0-only, matching the included IMG.LY background-removal dependency. See [LICENSE](LICENSE). Third-party packages retain their own licenses. The local Windows build is unsigned.
