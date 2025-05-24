import * as vscode from "vscode";
import fetch from "node-fetch";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "extension.generateCommitMessage",
    async () => {
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

        vscode.window.showInformationMessage(
          "📦 Running Generate Commit Message"
        );
        vscode.window.showInformationMessage("📁 Workspace path:", cwd);
        vscode.window.showInformationMessage(
          "🧾 Diff:\n",
          diff.substring(0, 200)
        );
        vscode.window.showInformationMessage("📤 Prompt:\n", prompt);

        const res = await fetch("http://localhost:11434/api/generate", {
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

        let message: string = "";
        if (data.response) {
          try {
            // Try parsing as JSON first (structured output)
            const parsed = JSON.parse(data.response);
            message = parsed.commit_message;
          } catch {
            // Fallback - maybe it returned plain text
            message = data.response.trim();
          }
        }
        vscode.window.showInformationMessage("Response:", data);
        vscode.window.showInformationMessage("Generated message:", message);
        if (message) {
          await vscode.env.clipboard.writeText(message);
          vscode.window.showInformationMessage(
            `Commit message copied: ${message}`
          );
          const _t = vscode.window.createTerminal({
            name: "Commit Message",
          });
          _t.sendText(message);
          _t.sendText(JSON.stringify({ data: data.response }));
          _t.show();
        } else {
          vscode.window.showErrorMessage("No message generated.");
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`Error: ${err.message}`);
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
