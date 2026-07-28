// Thoth for VS Code — writes editor state (active file, selection,
// diagnostics) to ~/.thoth/ide/ so the thoth CLI can include it as context.

import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";

const STATE_DIR = path.join(os.homedir(), ".thoth", "ide");
const MAX_SELECTED_CHARS = 2000;
const MAX_DIAGNOSTICS = 50;

let stateFile: string | undefined;
let writeTimer: ReturnType<typeof setTimeout> | undefined;
let heartbeat: ReturnType<typeof setInterval> | undefined;

interface Selection {
    startLine: number;
    endLine: number;
}

interface Diagnostic {
    file: string;
    line: number;
    severity: "error" | "warning";
    message: string;
}

function workspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function collect() {
    const ws = workspaceRoot();
    const rel = (p: string) =>
        ws && p.toLowerCase().startsWith(ws.toLowerCase())
            ? path.relative(ws, p).replace(/\\/g, "/")
            : p;

    let activeFile: string | null = null;
    let selection: Selection | null = null;
    let selectedText: string | null = null;
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.uri.scheme === "file") {
        activeFile = rel(editor.document.uri.fsPath);
        const sel = editor.selection;
        if (!sel.isEmpty) {
            selection = { startLine: sel.start.line + 1, endLine: sel.end.line + 1 };
            selectedText = editor.document.getText(sel).slice(0, MAX_SELECTED_CHARS);
        }
    }

    const diagnostics: Diagnostic[] = [];
    outer: for (const [uri, diags] of vscode.languages.getDiagnostics()) {
        if (uri.scheme !== "file") continue;
        for (const d of diags) {
            if (d.severity > vscode.DiagnosticSeverity.Warning) continue;
            diagnostics.push({
                file: rel(uri.fsPath),
                line: d.range.start.line + 1,
                severity:
                    d.severity === vscode.DiagnosticSeverity.Error ? "error" : "warning",
                message: d.message.slice(0, 300),
            });
            if (diagnostics.length >= MAX_DIAGNOSTICS) break outer;
        }
    }

    return {
        ide: "VS Code",
        pid: process.pid,
        workspace: ws ?? null,
        updated: Math.floor(Date.now() / 1000),
        activeFile,
        selection,
        selectedText,
        diagnostics,
    };
}

function writeState() {
    try {
        const state = collect();
        if (!stateFile) {
            const key = crypto
                .createHash("sha1")
                .update(state.workspace ?? String(process.pid))
                .digest("hex")
                .slice(0, 12);
            stateFile = path.join(STATE_DIR, `vscode-${key}.json`);
        }
        fs.mkdirSync(STATE_DIR, { recursive: true });
        fs.writeFileSync(stateFile, JSON.stringify(state));
    } catch {
        // never break the editor over this
    }
}

function scheduleWrite() {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(writeState, 300);
}

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(scheduleWrite),
        vscode.window.onDidChangeTextEditorSelection(scheduleWrite),
        vscode.languages.onDidChangeDiagnostics(scheduleWrite),
        vscode.workspace.onDidSaveTextDocument(scheduleWrite)
    );
    // heartbeat so thoth can tell the state comes from a live editor
    heartbeat = setInterval(writeState, 60_000);
    writeState();
}

export function deactivate() {
    if (heartbeat) clearInterval(heartbeat);
    if (writeTimer) clearTimeout(writeTimer);
    try {
        if (stateFile) fs.unlinkSync(stateFile);
    } catch {
        // ignore
    }
}
