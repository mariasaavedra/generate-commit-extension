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
const zod_1 = require("zod");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
// Zod schema for validating model output
const CommitResponseSchema = zod_1.z.object({
    commit_message: zod_1.z.string(),
});
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
                console.log("No staged changes found.");
                vscode.window.showWarningMessage("No staged changes found.");
                return;
            }
            const model = "codellama:7b-instruct";
            const prompt = `Given a git diff, output a single-line commit message that follows the Conventional Commits specification: Use one of the following types: feat, fix, chore, refactor, docs, style, test, ci, perf, build   Use ! after the type for breaking changes.   Do not include explanations, examples, formatting, headers, or any text other than the commit message itself. Your response must be a JSON object.e.g  { "commit_message": "chore: updated package.json" } Return only the JSON. |  Diff: ${diff}`.trim();
            vscode.window.showInformationMessage("📦 Running Generate Commit Message");
            const res = await (0, node_fetch_1.default)("http://localhost:11434/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: model,
                    prompt: prompt,
                    temperature: 0,
                    stream: false,
                }),
            });
            if (!res.ok) {
                console.error("Error:", res.statusText);
                vscode.window.showErrorMessage(`💥 Error: ${res.status || "Unknown error"}`);
                const logFilePath = `${cwd}/log.txt`;
                const logFileUri = vscode.Uri.file(logFilePath);
                const logFileContent = `Error: ${res.statusText || "Unknown error"}`;
                await vscode.workspace.fs.writeFile(logFileUri, Buffer.from(logFileContent, "utf-8"));
                vscode.window.showInformationMessage(`⚠️ Error logged to ${logFilePath}`);
                throw new Error(`Error: ${res.statusText || "Unknown error"}`);
            }
            const raw = await res.json();
            console.log("Raw response:", raw);
            const inner = JSON.parse(raw.response);
            console.log("Parsed response:", inner);
            const parsedData = CommitResponseSchema.safeParse(inner);
            vscode.window.showInformationMessage(`JSON Response: ${JSON.stringify(inner, null, 2)}`);
            if (parsedData.success) {
                vscode.window.showInformationMessage(`✅ Commit message generated successfully!`, {
                    detail: `Commit message: ${parsedData.data.commit_message}`,
                });
                const commitMessage = parsedData.data.commit_message;
                console.log("Commit message:", commitMessage);
                // 1. Copy to clipboard
                await vscode.env.clipboard.writeText(commitMessage);
                // 2. Insert into active editor
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    await editor.edit((editBuilder) => {
                        editBuilder.insert(editor.selection.active, commitMessage);
                    });
                }
                else {
                    vscode.window.showWarningMessage("⚠️ No active editor to insert commit message.");
                }
                // 3. Echo in terminal
                const terminal = vscode.window.createTerminal({
                    name: "Generated Commit",
                    cwd,
                });
                terminal.sendText(`echo "${commitMessage}"`);
                terminal.show();
                // 4. Set in Source Control input box
                const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
                const api = gitExtension?.getAPI(1);
                if (api && api.repositories.length > 0) {
                    api.repositories[0].inputBox.value = commitMessage;
                }
                vscode.window.showInformationMessage(`✅ Commit message ready: copied, inserted, echoed, and populated.`);
            }
        }
        catch (e) {
            vscode.window.showErrorMessage(`💥 Error: could not generate a message.`);
        }
    });
    context.subscriptions.push(disposable);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map