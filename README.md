<div align="center">

<img src="./docs/images/Capybara.svg" width="120">

# CapybaraAI Coding Assistant

**基于 OpenCode 的 IntelliJ IDEA AI 编程助手**

🚀 **自由模型接入** × 🔧 **高度自定义** × ⚡ **极速开发体验**

[![Gitee Stars](https://gitee.com/qianguanshui/capybaraAICodingAssistant/badge/star.svg?style=flat-square)](https://gitee.com/qianguanshui/capybaraAICodingAssistant)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![Release](https://img.shields.io/badge/Release-v3.0.0-green?style=flat-square)](https://gitee.com/qianguanshui/capybaraAICodingAssistant/releases)

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

现有的 AI 编程工具大多为 CLI、VS Code 插件或其变种，而对于使用 IntelliJ IDEA 的开发者，国内外各大厂商的idea编程代理均不够灵活——无法自由添加自定义模型，功能上开发者自定义程度不高，限制极大。

故基于 [OpenCode](https://opencode.ai) 开源编程代理工具，编写了这款 IntelliJ IDEA 插件。前端直接嵌入 IDEA 中（JCEF），插件自动拉起并管理本地 OpenCode 服务，并提供了快速添加文件、右键菜单操作、原生会话标签、内置浏览器、记忆系统、国际化等功能，代码补全待完善。

Q：为什么重写前端，不引用官方前端

A：官方web前端bug太多，会话管理和回显混乱，样式也不适合嵌入进来

IntelliJ IDEA插件系统兼容性限制很多，如遇到问题请提Issues

---

## 使用方式

### 方法一：直接导入

从 [Gitee Releases](https://gitee.com/qianguanshui/capybaraAICodingAssistant/releases) 页面获取 ZIP 包，在 IDEA 中通过 `Settings → Plugins → ⚙ → Install Plugin from Disk` 导入即可使用。

### 方法二：源码编译

```bash
# 1. 构建前端（需要 pnpm）
cd frontend
pnpm install
pnpm build

# 2. 构建插件（需要 gradle；gradle build 会自动重新构建前端）
cd ../idea-plugin
gradle build

# 3. 产物在 idea-plugin/build/distributions/ 目录下,获取 ZIP 包，在 IDEA 中通过 `Settings → Plugins → ⚙ → Install Plugin from Disk` 导入即可使用。
```


> 插件内置 OpenCode 进程管理，打开面板时会自动检测并拉起 OpenCode 服务；未安装或版本过低时，面板内会给出安装指引。详情见 [OpenCode](https://opencode.ai)。

---

## 项目结构

```
capybaraAICodingAssistant/
├── frontend/                        # React + TypeScript + Vite 前端（Tailwind CSS 4）
│   ├── src/
│   │   ├── components/
│   │   │   ├── ai-elements/         # 自研 AI 会话组件（会话、输入框、工具调用、推理、附件等）
│   │   │   ├── assistant/           # 助手面板（消息、设置、待办、会话标签、Skill Hub 等）
│   │   │   └── ui/                  # shadcn/ui 风格 Radix 基础组件
│   │   ├── hooks/                   # 自定义 Hooks（SSE 事件流、运行生命周期、会话 Diff/压缩/标签）
│   │   ├── lib/                     # API 客户端（opencode.ts / idea.ts）、类型定义、工具函数
│   │   ├── locales/                 # 中英文语言包
│   │   └── index.css                # Tailwind 主题变量（JCEF 兼容的 legacy 色彩）
│   ├── vite.config.ts               # 构建产物输出到 ../idea-plugin/src/main/resources/static
│   └── package.json
├── idea-plugin/                     # IntelliJ IDEA 插件（Kotlin 1.9.20 / JVM 17）
│   └── src/main/kotlin/com/aicoding/plugin/
│       ├── server/                  # JDK 内置 HttpServer：静态资源服务、/api 桥接、SSE 广播
│       ├── services/                # OpenCode 进程管理、Diff、记忆系统、文件搜索、更新检测等
│       ├── actions/                 # 编辑器右键菜单（解释/优化/生成测试/加入对话）
│       ├── ui/                      # JCEF 面板、内置浏览器、原生会话标签
│       └── resources/META-INF/plugin.xml
├── docs/                            # 文档与截图
└── AGENTS.md                        # 开发指南
```

## 已实现功能

- **AI 对话** — 流式聊天界面，支持多轮对话与 SSE 实时更新
- **会话管理** — 创建、重命名、删除、分叉（Fork）、历史浏览，原生多标签并行会话
- **模型提供商** — 多提供商管理（OpenAI、DeepSeek 等），自定义模型接入与模型变体配置
- **技能系统（Skills）** — 创建/编辑/导入/导出可复用 AI 指令，支持项目/全局作用域，内置 Skill Hub
- **MCP 服务器** — Model Context Protocol 集成，支持本地与远程服务器
- **权限管理** — 按模式定义允许/询问/拒绝规则（文件、命令、编辑等），由面板统一裁决
- **记忆系统** — 项目级长期记忆，支持向量检索与本地嵌入模型配置
- **人格与专业角色** — 自定义助手人格（Persona）与专业角色预设
- **代码操作** — 右键菜单：解释代码、优化代码、生成单元测试、加入对话
- **文件搜索** — IDEA 原生文件搜索，支持文件名/内容匹配
- **Diff 查看** — 会话代码差异内联可视化，可在 IDEA 编辑器内打开
- **待办事项** — AI 生成的任务列表与跟踪
- **交互式问卷** — 多选/选择题面板
- **内置浏览器** — 可被 OpenCode 控制的内置 JCEF 浏览器窗口，支持页面交互与调试
- **Maven 运行桥接** — 驱动 IDEA 原生 Maven Runner 执行构建与测试
- **Git 状态感知** — 面板内展示当前仓库改动状态
- **主题切换** — 深色/浅色主题，跟随 IDEA 主题，CSS 变量驱动
- **国际化** — 完整中英文界面，默认跟随 IDE 语言
- **Token 统计** — 运行级 Token 用量统计
- **会话压缩** — 自动压缩以管理上下文窗口
- **文件附件** — 消息中引用文件与编辑器选区
- **语音输入** — 浏览器语音识别输入
- **更新检测** — 新版本检测与更新提示

---

## 技术栈

| 层 | 技术                              |
|---|---------------------------------|
| 前端框架 | React 18 + TypeScript 5.2       |
| UI 库 | Tailwind CSS 4 + shadcn/ui 风格 Radix 组件 + 自研 ai-elements 会话组件 |
| Markdown/代码渲染 | Streamdown + Shiki           |
| 图标 | lucide-react                    |
| 构建工具 | Vite 5 + pnpm                   |
| 插件语言 | Kotlin 1.9.20（JVM 17）           |
| 插件 HTTP 服务 | JDK 内置 HttpServer（静态资源 + API 桥接 + SSE） |
| IDE 平台 | IntelliJ IDEA 2023.2+（JCEF）     |
| AI 后端 | OpenCode（开源）                    |
| 编辑器 | IDEA 原生编辑器（Diff 内联展示）          |

---

## 软件截图

| | |
|:---:|:---:|
| **IDE 集成面板** | **模型配置** |
| ![ideaPanel](./docs/images/example/ideaPanel.png) | ![model](./docs/images/example/model.png) |
| **MCP 配置** | **Skill 配置** |
| ![mcp](./docs/images/example/mcp.png) | ![skills](./docs/images/example/skills.png) |
| **权限配置** | **对话-工具调用** |
| ![permission](./docs/images/example/permission.png) | ![tool](./docs/images/example/tool.png) |
| **待办事项** | **对话-编辑代码** |
| ![todo](./docs/images/example/todo.png) | ![edit](./docs/images/example/edit.png) |

---



## 赞助

感谢以下小伙伴的咖啡支持 ☕

| 赞助人  | 金额      | 时间         | 留言         |
|------|---------|------------|------------|
| 风随心动 | 100 RMB | 2026-04-30 | 优化下界面（已安排） |
| —    | —       | —          | 虚位以待       |

> 如果你想出现在这里，请赞助后在备注中留下你的ID和留言。

---

## 写在最后

<img src="./docs/images/user.jpg" width="100" height="100" style="border-radius:50%">

### 开源不易，烧了几十亿 token，白天上班跟生活对线，晚上和周六周末通宵为ai发电。如果觉得好用，可以请作者喝杯咖啡 ☕


|                 微信收款码                  | 支付宝收款码 |
|:--------------------------------------:|:---:|
| ![微信收款码](./docs/images/wechat-pay.png) | ![支付宝收款码](./docs/images/alipay.png) |


### **作者微信：** 使用人多的话可以考虑建群互相交流技术

![作者微信](./docs/images/wechat.png)


