# CodeRun AI Agent 🚀

<p align="center">
  <img src="./logo.png" width="160" alt="CodeRun Logo"/>
</p>

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

**CodeRun AI Agent** is a VS Code extension that uses **Qwen 3.7 through the browser API** (`chat.qwen.ai`) as an autonomous coding agent. It operates via a Think → Plan → Act → Verify loop, reading/writing/editing files, running terminal commands, and searching code — all by embedding tool calls as text JSON blocks in the conversation.

---

## 🌟 How It Works

Unlike traditional AI extensions that use native function-calling APIs, CodeRun communicates with Qwen through the **browser chat API** — the same API the `chat.qwen.ai` website uses. Tool calls are embedded as ````json {"tool_calls":[...]}```` blocks in Qwen's response text, then parsed and executed by the extension.

```
User Prompt → Extension → Qwen Browser API → Qwen responds with text
  → Extension parses ```json {tool_calls}``` blocks
  → Executes tools (read_file, write_file, run_terminal, etc.)
  → Sends results back to Qwen as next user message
  → Loop continues until task is complete
```

## 🔑 Features

| Feature | Description |
|---------|-------------|
| **Agent Loop** | Multi-iteration Think → Plan → Act → Verify loop with up to 20 iterations |
| **19 Tools** | File I/O, directory ops, search, terminal, web requests, planning |
| **Terminal Integration** | VS Code shell integration with ANSI cleaning, streaming output, auto shell detection |
| **File Checkpoints** | SQLite-backed snapshots before every file modification with one-click undo |
| **Diff Review** | Inline Accept/Reject buttons for proposed file changes in the chat UI |
| **Permission System** | Per-tool Allow/Deny with persistent Always Allow/Always Deny decisions |
| **Thinking Blocks** | Collapsible thought process cards with accumulated reasoning across iterations |
| **Tool Cards** | Collapsible execution cards with status, args, and results inline in chat |
| **History Restoration** | Full conversation history loaded from Qwen's API with tool call/result reconstruction |
| **Custom Context** | Full conversation serialized into every request — own context management |

## 🛠️ Available Tools (19)

| Category | Tools |
|----------|-------|
| **File** | `read_file`, `write_file`, `edit_file`, `delete_file`, `patch_file` |
| **Directory** | `create_folder`, `delete_folder`, `list_directory` |
| **Search** | `search_files`, `find_in_files`, `list_symbols`, `get_file_info` |
| **Terminal** | `run_terminal`, `terminal_input`, `stop_terminal` |
| **Web** | `web_request` |
| **Planning** | `create_plan`, `update_plan` |
| **Utility** | `get_current_datetime` |

All tools accept multiple parameter name variants (e.g., `file_path`, `filepath`, `path`) for robustness.

## 🔌 Authentication

Uses cookie-based authentication from `chat.qwen.ai`. Paste your browser cookie string (containing the `token=eyJ...` JWT) in the settings panel. The cookie is stored in VS Code's encrypted secrets storage.

## 📁 Project Structure

```
src/
├── extension.js           ← VS Code activation, IPC bridge, auth, 30+ message types
├── agentLoop.js           ← Core agent loop: stream → parse → execute → loop
├── promptBuilder.js       ← System prompt assembly with workspace context
├── providerQwen.js        ← Qwen Browser API client + context serialization
├── providerManager.js     ← Returns Qwen provider
│
├── tools.js               ← 18 tool async generators (file, dir, terminal, search, etc.)
├── toolDefinitions.js     ← JSON schemas for all tools
├── toolRegistry.js        ← Name→impl mapping with alias resolution (bash, read, etc.)
├── toolExecutor.js        ← Result formatting for LLM context
│
├── terminalManager.js     ← VS Code Terminal API, shell integration, child_process fallback
├── permissions.js         ← Permission system with persistent decisions
├── diffManager.js         ← Diff patch storage, apply/reject
├── checkpointManager.js   ← SQLite file snapshots for undo
│
├── projectKnowledge.js    ← SQLite knowledge base (sql.js)
├── searchManager.js       ← Search abstraction (SQLite → filesystem fallback)
├── contextManager.js      ← Intent classification, editor context
├── planningManager.js     ← Plan creation and step tracking
├── executionManager.js    ← Plan execution engine
├── verificationManager.js ← Post-execution verification
├── learningManager.js     ← Framework/convention detection
├── timelineManager.js     ← Chronological event log
│
├── ChatSpace.js/.css      ← Chat UI: tool cards, diff cards, terminal cards, thinking blocks
├── Dashboard.js/.css      ← Sidebar, settings, conversation list
├── MarkdownRenderer.js    ← Client-side markdown → HTML
│
├── constants.js           ← System prompt, event types, storage keys
├── config.js              ← VS Code settings reader, API key management
├── utils.js               ← Shared helpers
├── events.js              ← Simple pub/sub event bus
├── symbolParser.js        ← Multi-language symbol extractor (JS, TS, Python, Go, Rust, Java, etc.)
├── memoryManager.js       ← Simple in-memory store
├── mcpManager.js          ← MCP placeholder stub
├── skillsManager.js       ← Skill prompt fragments
├── workspaceContext.js    ← Workspace folder detection
├── conversationStore.js   ← LocalStorage conversation CRUD
├── settingsStore.js       ← LocalStorage settings persistence
├── agent.js               ← Public agent API wrapper
├── index.html             ← Standalone browser entry point
```

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org) >= 18.x
- [VS Code](https://code.visualstudio.com) >= 1.80.0

### Debug
1. Open the project in VS Code
2. Press `F5` — the Extension Development Host window opens
3. Paste your Qwen browser cookie in the login panel

### Package
```bash
npm install -g @vscode/vsce
vsce package
```

## 💻 Tech Stack

| Layer | Technology |
|-------|-----------|
| Extension Host | VS Code Extension API (Node.js) |
| Frontend | Vanilla JS + CSS (no framework) |
| Database | SQLite via `sql.js` (WASM) |
| LLM | Qwen 3.7 Max (browser API) |
| Auth | Cookie-based (chat.qwen.ai JWT) |
| Build | None — raw ES modules |

This creates a `.vsix` file that can be installed via:
```
code --install-extension ai-agent-<version>.vsix
```

## License

MIT



