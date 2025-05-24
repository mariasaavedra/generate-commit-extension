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
        const prompt = `Given a git diff, output a single-line commit message that follows the Conventional Commits specification: Use one of the following types: feat, fix, chore, refactor, docs, style, test, ci, perf, build   Use ! after the type for breaking changes.   Do not include explanations, examples, formatting, headers, or any text other than the commit message itself. Your response must be a JSON object.e.g  { "commit_message": "chore: updated package.json" } Return only the JSON. |  Diff: ${diff}`.trim();

        vscode.window.showInformationMessage("📦 Running Generate Commit Message");

        const res = await fetch("http://localhost:11434/api/generate", {
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
          } else {
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
      } catch (e) {
        vscode.window.showErrorMessage(`💥 Error: could not generate a message.`);
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
