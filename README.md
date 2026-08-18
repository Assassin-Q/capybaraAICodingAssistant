<div align="center">

[English](./README.md) | [简体中文](./README.zh-CN.md)

<img src="./docs/images/Capybara.svg" width="120" alt="CapybaraAI Coding Assistant logo">

# CapybaraAI Coding Assistant

**An OpenCode-powered AI coding assistant for IntelliJ IDEA**

🚀 **Bring Your Own Model** × 🔧 **Deeply Customizable** × ⚡ **Fast IDE Workflow**

[![GitHub Stars](https://img.shields.io/github/stars/Assassin-Q/capybaraAICodingAssistant?style=flat-square&logo=github&logoColor=white)](https://github.com/Assassin-Q/capybaraAICodingAssistant)
[![Gitee Stars](https://gitee.com/qianguanshui/capybaraAICodingAssistant/badge/star.svg?theme=gvp)](https://gitee.com/qianguanshui/capybaraAICodingAssistant)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![Release](https://img.shields.io/badge/Release-3.0.2-green?style=flat-square)](https://github.com/Assassin-Q/capybaraAICodingAssistant/releases)
[![JetBrains Plugin](https://img.shields.io/badge/JetBrains-Marketplace-orange?style=flat-square)](https://plugins.jetbrains.com/plugin/31562-capybara-ai-coding-assistant)

</div>

<div align="center">

![CapybaraAI Coding Assistant](./docs/images/example/home.png)

</div>

<div align="center">

## 🎬 Demo Video

<p align="center">
  <a href="https://www.shine.jx.cn/capybaraAICodingAssistantPreview.mp4" target="_blank">
    ▶ Watch the demo video
  </a>
</p>

</div>

---

## Introduction

Most AI coding tools are CLIs, VS Code extensions, or variations of those two formats. IntelliJ IDEA users often have fewer flexible choices: many coding agents do not allow arbitrary custom models, expose limited configuration, or fail to integrate naturally with the IDE workflow.

CapybaraAI Coding Assistant is an IntelliJ IDEA plugin built on the open-source coding agent [OpenCode](https://opencode.ai). Its React frontend runs directly inside IDEA through JCEF. The plugin can discover, launch, and manage a local OpenCode service while adding IDE-native file attachments, editor context-menu actions, session tabs, an embedded browser, memory, internationalization, and other integrations. Code completion remains under development.

**Why build a dedicated frontend instead of embedding the official OpenCode web UI?**

The official web interface is designed for a browser-sized workspace. Its session behavior, message rendering, and layout are not a good fit for a narrow IntelliJ tool window, so this project provides an interface designed specifically for the plugin environment.

The IntelliJ Platform and JCEF have their own compatibility constraints. If you run into a problem, please open an Issue.

---

## Installation

### Option 1: JetBrains Marketplace

Install the plugin from the [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/31562-capybara-ai-coding-assistant), or search for **Capybara AI Coding Assistant** in `Settings → Plugins`.

### Option 2: Install a Release ZIP

Download the latest ZIP from [GitHub Releases](https://github.com/Assassin-Q/capybaraAICodingAssistant/releases), then open `Settings → Plugins → ⚙ → Install Plugin from Disk` in IDEA and select the downloaded archive.

### Option 3: Build from Source

```bash
# 1. Build the frontend (pnpm is required)
cd frontend
pnpm install
pnpm build

# 2. Build the plugin (Gradle rebuilds the frontend automatically)
cd ../idea-plugin
gradle buildPlugin

# 3. Find the plugin ZIP in idea-plugin/build/distributions/
```

> The plugin includes OpenCode process management. Opening the assistant panel automatically discovers or starts a compatible OpenCode service. If OpenCode is missing or outdated, the panel displays installation guidance. See [OpenCode](https://opencode.ai) for details.

---

## Project Structure

```text
capybaraAICodingAssistant/
├── frontend/                        # React + TypeScript + Vite frontend (Tailwind CSS 4)
│   ├── src/
│   │   ├── components/
│   │   │   ├── ai-elements/         # Conversation, input, tool, reasoning, and attachment UI
│   │   │   ├── assistant/           # Messages, settings, todos, session tabs, Skill Hub, etc.
│   │   │   └── ui/                  # Radix primitives following the shadcn/ui pattern
│   │   ├── hooks/                   # SSE, run lifecycle, session diff, compaction, and tabs
│   │   ├── lib/                     # OpenCode/IDEA API clients, types, and utilities
│   │   ├── locales/                 # English and Chinese translations
│   │   └── index.css                # JCEF-compatible theme variables
│   ├── vite.config.ts               # Builds into idea-plugin/src/main/resources/static
│   └── package.json
├── idea-plugin/                     # IntelliJ plugin (Kotlin 1.9.20 / JVM 17)
│   └── src/main/kotlin/com/aicoding/plugin/
│       ├── server/                  # Static server, API bridge, and SSE broadcasting
│       ├── services/                # OpenCode, diff, memory, search, and update services
│       ├── actions/                 # Editor context-menu actions
│       ├── ui/                      # JCEF panel, embedded browser, and native session tabs
│       └── resources/META-INF/plugin.xml
├── docs/                            # Documentation and screenshots
└── AGENTS.md                        # Development guide
```

## Features

- **AI conversations**: Streaming multi-turn conversations with SSE updates
- **Session management**: Create, rename, delete, fork, browse history, and work across native session tabs
- **Model providers**: Configure OpenAI, DeepSeek, and other providers, including custom models and model variants
- **Skills**: Create, edit, import, and export reusable AI instructions at project or global scope, with Skill Hub integration
- **MCP servers**: Configure local and remote Model Context Protocol servers
- **Approval controls**: Approve or deny file access, edits, commands, and network operations from the composer
- **Memory**: Project-level long-term memory, vector retrieval, and local embedding configuration
- **Personas and professional roles**: Custom assistant personalities and role presets
- **Code actions**: Explain code, optimize code, generate unit tests, and add editor context to a conversation
- **File search**: Use IntelliJ's native file search for filename and content matching
- **Native diffs**: Inspect conversation changes and open IntelliJ's native diff viewer
- **Todos**: Track task plans produced by the AI
- **Interactive questions**: Render single-choice, multiple-choice, and custom-answer prompts
- **Embedded browser**: Let OpenCode interact with and debug pages in a JCEF browser window
- **Maven bridge**: Run builds and tests through IntelliJ's native Maven runner
- **Git awareness**: Display repository changes inside the assistant panel
- **Themes**: Follow the IDEA theme or switch between light and dark modes manually
- **Internationalization**: Complete English and Simplified Chinese UI
- **Token usage**: Show per-run token and context usage
- **Conversation compaction**: Compact history to manage long context windows
- **Attachments**: Reference files, folders, images, and editor selections in messages
- **Voice input**: Use browser speech recognition for prompt input
- **Update checks**: Detect new plugin releases and display update notices

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript 5.2 |
| UI | Tailwind CSS 4 + Radix UI + AI Elements-style conversation components |
| Markdown and code rendering | Streamdown + Shiki |
| Icons | lucide-react |
| Build tools | Vite 5 + pnpm |
| Plugin language | Kotlin 1.9.20 (JVM 17) |
| Plugin HTTP server | JDK HttpServer for static assets, API bridging, and SSE |
| IDE platform | IntelliJ IDEA 2023.2+ with JCEF |
| AI backend | OpenCode |
| Editor integration | IntelliJ native editor and diff viewer |

---

## Screenshots

| | |
|:---:|:---:|
| **IDE Tool Window** | **Model Configuration** |
| ![IDE tool window](./docs/images/example/ideaPanel.png) | ![Model configuration](./docs/images/example/model.png) |
| **MCP Configuration** | **Skill Configuration** |
| ![MCP configuration](./docs/images/example/mcp.png) | ![Skill configuration](./docs/images/example/skills.png) |
| **Approval Configuration** | **Conversation Tool Calls** |
| ![Approval configuration](./docs/images/example/permission.png) | ![Conversation tool calls](./docs/images/example/tool.png) |
| **Task List** | **Code Editing** |
| ![Task list](./docs/images/example/todo.png) | ![Code editing](./docs/images/example/edit.png) |

---

## Sponsors

Thank you to everyone who has supported the project with a coffee ☕

| Sponsor | Amount | Date | Message |
|---|---:|---|---|
| 风随心动 | 100 RMB | 2026-04-30 | Improve the interface (scheduled) |
| fighterdy | 20 RMB | 2026-08-05 | An autumn milk tea; improve interaction speed (scheduled) |
| SupBug | 100 RMB | 2026-08-11 | Add macOS support (scheduled) |
| — | — | — | Your name could be here |

> To be listed here, include your ID and a short message with your sponsorship.

---

## Support the Project

<img src="./docs/images/user.jpg" width="100" height="100" style="border-radius:50%" alt="Author">

### Open source takes time, late nights, weekends, and quite a few billion tokens. If this plugin helps you, you can buy the author a coffee ☕

| WeChat Pay | Alipay |
|:---:|:---:|
| ![WeChat Pay](./docs/images/wechat-pay.png) | ![Alipay](./docs/images/alipay.png) |

### **Author's WeChat:** A community group may be created as the user base grows

![Author's WeChat](./docs/images/wechat.png)
