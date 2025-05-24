"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
function activate(context) {
    const disposable = vscode.commands.registerCommand("extension.generateCommitMessage", async () => {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage("No workspace open.");
                return;
            }
            const cwd = workspaceFolders[0].uri.fsPath;
            const { stdout: diff } = await execAsync("git diff --cached", { cwd });
            if (!diff.trim()) {
                vscode.window.showWarningMessage("No staged changes found.");
                return;
            }
            const model = "codellama:7b-instruct";
            const system = `You are a helpful assistant that generates commit messages based on the provided git diff. Your task is to create a concise and clear commit message that follows the Conventional Commits format.`;
            const prompt = ` Given a git diff, output a single-line commit message that follows the Conventional Commits specification:
Format: <type>[optional scope]: <description>
Use one of the following types: feat, fix, chore, refactor, docs, style, test, ci, perf, build  
Use ! after the type for breaking changes.  
Do not include explanations, examples, formatting, headers, or any text other than the commit message itself.  
Your commit message must be a single line.  OUTPUT AS JSON|  Diff: ${diff} `;
            vscode.window.showInformationMessage("📦 Running Generate Commit Message");
            vscode.window.showInformationMessage("📁 Workspace path:", cwd);
            vscode.window.showInformationMessage("🧾 Diff:\n", diff.substring(0, 200));
            vscode.window.showInformationMessage("📤 Prompt:\n", prompt);
            const res = await (0, node_fetch_1.default)("http://localhost:11434/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model,
                    stream: false,
                    format: {
                        type: "object",
                        properties: {
                            type: "string",
                            description: "A single-line Conventional Commit message.",
                            example: "fix: corrected minor typos in code",
                        },
                        required: ["commit_message"],
                    },
                }),
            });
            if (!res.ok) {
                throw new Error(`Ollama API error: ${res.status} ${res.statusText}`);
            }
            const data = await res.json();
            let message = "";
            if (data.response) {
                try {
                    // Try parsing as JSON first (structured output)
                    const parsed = JSON.parse(data.response);
                    message = parsed.commit_message;
                }
                catch {
                    // Fallback - maybe it returned plain text
                    message = data.response.trim();
                }
            }
            vscode.window.showInformationMessage("Response:", data);
            vscode.window.showInformationMessage("Generated message:", message);
            if (message) {
                await vscode.env.clipboard.writeText(message);
                vscode.window.showInformationMessage(`Commit message copied: ${message}`);
                const _t = vscode.window.createTerminal({
                    name: "Commit Message",
                });
                _t.sendText(message);
                _t.sendText(JSON.stringify({ data: data.response }));
                _t.show();
            }
            else {
                vscode.window.showErrorMessage("No message generated.");
            }
        }
        catch (err) {
            vscode.window.showErrorMessage(`Error: ${err.message}`);
        }
    });
    context.subscriptions.push(disposable);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map