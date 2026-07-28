# Thoth for VS Code

Companion extension for the [thoth](../thoth) coding agent. Replaces thoth's
window-title detection with real editor data:

- **active file** in the current workspace
- **selection** (line numbers + selected text, up to 2000 chars)
- **diagnostics** ("Problems": errors and warnings, up to 50)

## How it works

On every editor event (tab switch, selection change, diagnostics update,
save — debounced 300ms, plus a 60s heartbeat) the extension writes a small
JSON state file to `~/.thoth/ide/vscode-<workspace-hash>.json`:

```json
{
  "ide": "VS Code",
  "workspace": "C:\\proj",
  "updated": 1699999999,
  "activeFile": "src/main.rs",
  "selection": { "startLine": 5, "endLine": 10 },
  "selectedText": "...",
  "diagnostics": [
    { "file": "src/lib.rs", "line": 3, "severity": "error", "message": "..." }
  ]
}
```

Before each request, thoth picks the freshest state whose workspace matches
its working directory and injects it as `<editor-context>` for the model.
The file is removed when the extension deactivates; thoth ignores states
older than 5 minutes. Everything stays on your machine — nothing is sent
anywhere.

Other editors can integrate the same way: write the same JSON shape to
`~/.thoth/ide/<editor>-<key>.json`.

## Build

```sh
bun install
bun run build     # -> index.js (CJS bundle, vscode kept external)
```

## Install (local)

Copy `package.json` + `index.js` into your VS Code extensions folder:

```powershell
$dst = "$env:USERPROFILE\.vscode\extensions\thoth.thoth-for-vscode-0.1.0"
New-Item -ItemType Directory -Force $dst | Out-Null
Copy-Item package.json, index.js $dst
```

Then run **Developer: Reload Window** in VS Code. No configuration needed.
