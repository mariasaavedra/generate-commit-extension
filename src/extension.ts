import * as vscode from "vscode";
import fetch from "node-fetch";
import { exec } from "child_process";
import { promisify } from "util";
import { z } from "zod";

const execAsync = promisify(exec);

// Zod schema for validating model output
const CommitResponseSchema = z.object({
  commit_message: z.string(),
});

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
          console.log("No staged changes found.");
          vscode.window.showWarningMessage("No staged changes found.");
          return;
        }

        const model = "codellama:7b-instruct";
        const prompt =
          ` Given a git diff, output a single-line commit message that follows the Conventional Commits specification: Use one of the following types: feat, fix, chore, refactor, docs, style, test, ci, perf, build   Use ! after the type for breaking changes.   Do not include explanations, examples, formatting, headers, or any text other than the commit message itself. Your response must be a JSON object.e.g  { "commit_message": "chore: updated package.json" } Return only the JSON. |  Diff: ${diff}`.trim();

        const _log = () => {
          vscode.window.showInformationMessage(
            "📦 Running Generate Commit Message"
          );
          // vscode.window.showInformationMessage(`📁 Workspace path: ${cwd}`);
          // vscode.window.showInformationMessage(
          //   `🧾 Diff (truncated):\n${diff.substring(0, 200)}`
          // );
          // vscode.window.showInformationMessage(
          //   `📤 Prompt (truncated):\n${prompt.substring(0, 200)}`
          // );
        };

        const res = await fetch("http://localhost:11434/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            prompt,
            temperature: 0,
            stream: false,
          }),
        });
        _log();
        const raw = await res.json();
        if (!res.ok) {
          console.error("Error:", raw);
          vscode.window.showErrorMessage(
            `💥 Error: ${raw.error || "Unknown error"}`
          );
          // create a log.txt file in the workspace root with the error message
          const logFilePath = `${cwd}/log.txt`;
          const logFileUri = vscode.Uri.file(logFilePath);
          const logFileContent = `Error: ${raw.error || "Unknown error"}`;
          await vscode.workspace.fs.writeFile(
            logFileUri,
            Buffer.from(logFileContent, "utf-8")
          );
          vscode.window.showInformationMessage(
            `⚠️ Error logged to ${logFilePath}`
          );
          throw new Error(`Error: ${raw.error || "Unknown error"}`);
        }
        console.log("Raw response:", raw);
        const inner = JSON.parse(raw.response); // unwrap "response" string

        console.log("Parsed response:", inner);
        const parsedData = CommitResponseSchema.safeParse(inner);

        vscode.window.showInformationMessage(
          `JSON Response: ${JSON.stringify(inner, null, 2)}`
        );
        if (parsedData.success) {
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
          } else {
            vscode.window.showWarningMessage(
              "⚠️ No active editor to insert commit message."
            );
          }
          // 3. Echo in terminal
          const terminal = vscode.window.createTerminal({
            name: "Generated Commit",
            cwd,
          });
          terminal.sendText(`echo "${commitMessage}"`);
          terminal.show();

          vscode.window.showInformationMessage(
            `✅ Commit message ready: copied, inserted, and echoed.`
          );
        }
      } catch (e) {
        vscode.window.showErrorMessage(
          `💥 Error: could not generate a message.`
        );
      }
    }
  );
  context.subscriptions.push(disposable);
}

export function deactivate() {}
