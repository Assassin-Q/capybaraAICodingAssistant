<div align="center">

[简体中文](./README.zh-CN.md) | [English](./README.md)

<img src="./docs/images/Capybara.svg" width="120">

# CapybaraAI Coding Assistant

**基于 OpenCode 的 IntelliJ IDEA AI 编程助手**

🚀 **自由模型接入** × 🔧 **高度自定义** × ⚡ **极速开发体验**

[![Gitee Stars](https://gitee.com/qianguanshui/capybaraAICodingAssistant/badge/star.svg?style=flat-square)](https://gitee.com/qianguanshui/capybaraAICodingAssistant)
[![GitHub Stars](https://img.shields.io/github/stars/Assassin-Q/capybaraAICodingAssistant?style=flat-square&logo=github&logoColor=white)](https://github.com/Assassin-Q/capybaraAICodingAssistant)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![Release](https://img.shields.io/badge/Release-3.0.2-green?style=flat-square)](https://gitee.com/qianguanshui/capybaraAICodingAssistant/releases)

</div>

<div align="center">

![CapybaraAI Coding Assistant](./docs/images/example/home.png)

</div>

<div align="center">

## 🎬 演示视频 / Demo Video

<p align="center">
  <a href="https://www.shine.jx.cn/capybaraAICodingAssistantPreview.mp4" target="_blank">
    ▶ 点击观看演示视频 / Click to watch demo video
  </a>
</p>

</div>

---

## 前言

现有的 AI 编程工具大多为 CLI、VS Code 插件或其变种，而对于使用 IntelliJ IDEA 的开发者，国内外各大厂商的 IDEA 编程代理均不够灵活：无法自由添加自定义模型，开发者的自定义空间有限。

因此，本项目基于开源编程代理工具 [OpenCode](https://opencode.ai) 开发了一款 IntelliJ IDEA 插件。前端通过 JCEF 直接嵌入 IDEA，插件能够自动检测、启动和管理本地 OpenCode 服务，并提供快速添加文件、编辑器右键操作、原生会话标签、内置浏览器、记忆系统和国际化等能力。代码补全功能仍在完善中。

**问：为什么重写前端，而不直接引用 OpenCode 官方前端？**

**答：** 官方 Web 前端的会话管理和消息回显不适合直接嵌入 IDEA，界面布局也不适配 IDE 侧边工具窗口，因此本项目针对插件场景重新实现了完整交互界面。

IntelliJ IDEA 插件系统存在较多兼容性限制。如遇到问题，欢迎提交 Issue。

---

## 使用方式

### 方法一：直接导入

从 [Gitee Releases](https://gitee.com/qianguanshui/capybaraAICodingAssistant/releases) 页面下载 ZIP 包，在 IDEA 中依次打开 `Settings → Plugins → ⚙ → Install Plugin from Disk`，选择 ZIP 文件完成安装。

也可以从 [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/31562-capybara-ai-coding-assistant) 安装已发布版本。

### 方法二：源码编译

```bash
# 1. 构建前端（需要 pnpm）
cd frontend
pnpm install
pnpm build

# 2. 构建插件（需要 Gradle；Gradle 构建会自动重新构建前端）
cd ../idea-plugin
gradle buildPlugin

# 3. ZIP 产物位于 idea-plugin/build/distributions/
```

> 插件内置 OpenCode 进程管理。打开面板时会自动检测并拉起 OpenCode 服务；未安装或版本过低时，面板内会提供安装指引。详情请参阅 [OpenCode](https://opencode.ai)。

---

## 项目结构

```text
capybaraAICodingAssistant/
├── frontend/                        # React + TypeScript + Vite 前端（Tailwind CSS 4）
│   ├── src/
│   │   ├── components/
│   │   │   ├── ai-elements/         # AI 会话组件（会话、输入框、工具调用、推理、附件等）
│   │   │   ├── assistant/           # 助手面板（消息、设置、待办、会话标签、Skill Hub 等）
│   │   │   └── ui/                  # shadcn/ui 风格 Radix 基础组件
│   │   ├── hooks/                   # SSE 事件流、运行生命周期、会话 Diff/压缩/标签
│   │   ├── lib/                     # OpenCode/IDEA API 客户端、类型定义和工具函数
│   │   ├── locales/                 # 中英文语言包
│   │   └── index.css                # JCEF 兼容主题变量
│   ├── vite.config.ts               # 构建到 idea-plugin/src/main/resources/static
│   └── package.json
├── idea-plugin/                     # IntelliJ IDEA 插件（Kotlin 1.9.20 / JVM 17）
│   └── src/main/kotlin/com/aicoding/plugin/
│       ├── server/                  # 静态资源服务、API 桥接和 SSE 广播
│       ├── services/                # OpenCode、Diff、记忆、搜索、更新等服务
│       ├── actions/                 # 编辑器右键操作
│       ├── ui/                      # JCEF 面板、内置浏览器、原生会话标签
│       └── resources/META-INF/plugin.xml
├── docs/                            # 文档与截图
└── AGENTS.md                        # 开发指南
```

## 已实现功能

- **AI 对话**：流式聊天界面，支持多轮对话与 SSE 实时更新
- **会话管理**：创建、重命名、删除、分叉、历史浏览和原生多标签并行会话
- **模型提供商**：管理 OpenAI、DeepSeek 等供应商，自定义模型和模型变体
- **技能系统（Skills）**：创建、编辑、导入和导出可复用 AI 指令，支持项目/全局作用域和 Skill Hub
- **MCP 服务器**：集成本地与远程 Model Context Protocol 服务器
- **权限管理**：通过面板审批文件、命令、编辑和网络访问
- **记忆系统**：项目级长期记忆、向量检索和本地嵌入模型配置
- **人格与专业角色**：自定义助手人格与专业角色预设
- **代码操作**：解释代码、优化代码、生成单元测试和加入对话
- **文件搜索**：调用 IDEA 原生文件搜索，支持文件名和内容匹配
- **Diff 查看**：会话代码差异可视化，并可打开 IDEA 原生 Diff
- **待办事项**：展示并跟踪 AI 生成的任务列表
- **交互式问卷**：支持单选、多选和自定义回答
- **内置浏览器**：可由 OpenCode 控制的 JCEF 浏览器，支持页面交互与调试
- **Maven 运行桥接**：调用 IDEA 原生 Maven Runner 执行构建和测试
- **Git 状态感知**：在面板内展示当前仓库改动状态
- **主题切换**：深色/浅色主题，可跟随 IDEA 主题
- **国际化**：完整中英文界面，默认跟随 IDE 语言
- **Token 统计**：展示运行级 Token 使用情况
- **会话压缩**：压缩历史消息以管理上下文窗口
- **文件附件**：在消息中引用文件、文件夹和编辑器选区
- **语音输入**：支持浏览器语音识别输入
- **更新检测**：检测新版本并展示更新提示

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | React 18 + TypeScript 5.2 |
| UI 库 | Tailwind CSS 4 + Radix UI + AI Elements 风格会话组件 |
| Markdown/代码渲染 | Streamdown + Shiki |
| 图标 | lucide-react |
| 构建工具 | Vite 5 + pnpm |
| 插件语言 | Kotlin 1.9.20（JVM 17） |
| 插件 HTTP 服务 | JDK 内置 HttpServer（静态资源 + API 桥接 + SSE） |
| IDE 平台 | IntelliJ IDEA 2023.2+（JCEF） |
| AI 后端 | OpenCode（开源） |
| 编辑器集成 | IDEA 原生编辑器与 Diff |

---

## 软件截图

| | |
|:---:|:---:|
| **IDE 集成面板** | **模型配置** |
| ![IDE 集成面板](./docs/images/example/ideaPanel.png) | ![模型配置](./docs/images/example/model.png) |
| **MCP 配置** | **Skill 配置** |
| ![MCP 配置](./docs/images/example/mcp.png) | ![Skill 配置](./docs/images/example/skills.png) |
| **权限配置** | **对话与工具调用** |
| ![权限配置](./docs/images/example/permission.png) | ![对话与工具调用](./docs/images/example/tool.png) |
| **待办事项** | **代码编辑** |
| ![待办事项](./docs/images/example/todo.png) | ![代码编辑](./docs/images/example/edit.png) |

---

## 赞助

感谢以下小伙伴的咖啡支持 ☕

| 赞助人 | 金额 | 时间 | 留言 |
|---|---:|---|---|
| 风随心动 | 100 RMB | 2026-04-30 | 优化下界面（已安排） |
| fighterdy | 20 RMB | 2026-08-05 | 秋天的第一杯奶茶，提升交互速度（已安排） |
| SupBug | 100 RMB | 2026-08-11 | 适配 Mac（已安排） |
| — | — | — | 虚位以待 |

> 如果你想出现在这里，请赞助后在备注中留下你的 ID 和留言。

---

## 写在最后

<img src="./docs/images/user.jpg" width="100" height="100" style="border-radius:50%">

### 开源不易，烧了几十亿 Token，白天上班跟生活对线，晚上和周末继续为 AI 发电。如果觉得好用，可以请作者喝杯咖啡 ☕

| 微信收款码 | 支付宝收款码 |
|:---:|:---:|
| ![微信收款码](./docs/images/wechat-pay.png) | ![支付宝收款码](./docs/images/alipay.png) |

### **作者微信：** 使用人数较多时，可以建群互相交流技术

![作者微信](./docs/images/wechat.png)
