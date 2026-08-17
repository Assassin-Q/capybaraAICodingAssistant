# Capybara AI Coding Assistant V3 - Completion Audit

## T19 - DeepSeek 审计修复、双源版本检查与 README 星标 `[x]`

### Implementation record (2026-08-17)

- `MemoryEmbeddingService.deleteModel` 仅允许删除内置目录中的已知模型，并通过 canonical path 校验阻止目录穿越。
- `useAutoRetry` 只读取最新一条 assistant 结果，历史失败不会再重放后续已经成功的用户请求。
- `opencode.request` 支持 `AbortController` 超时并让 `sendPrompt` 在 30 秒无响应后明确失败，不再永久挂起。
- 新增 `BoundedProcessRunner`，环境探测、Git 状态和 OpenCode CLI 都会并发排空输出、限制输出大小，并在超时后终止子进程。
- 新增 `AtomicFileIO`。OpenCode 配置的供应商/权限/普通键写入与多项目端口注册表均在 JVM 锁和跨进程文件锁内完成读改写，并通过同目录临时文件原子替换，避免并发覆盖或半截 JSON。
- IDEA 文件刷新改为 150ms 合并的异步 VFS/Project View 刷新；API handler 的二次响应、非法 URL 编码和 SSE executor 关闭竞争也做了防护。
- 停止当前运行后会解除队列暂停并继续 drain；SSE 去重集合只淘汰最旧事件，不再整表清空；会话 diff 轮询降为 1.2 秒并缓存相同快照结果。
- 环境扫描与手工环境编辑使用同一同步边界并原子写入；SkillHub ZIP 增加压缩包、条目、单文件和总解压大小限制，并在 staging 目录校验成功后才替换现有技能。
- 界面语言为中文时检查 Gitee Releases，英文时检查 GitHub Releases；面板加载 10 秒后首次检查，此后每 30 分钟检查一次，切换语言会切换发行源。
- `README.md` 与 `README.zh-CN.md` 均同时展示 GitHub 和 Gitee 星标，两个镜像入口在任一语言文档中都可见。

### Verification

- `pnpm.cmd exec tsc --noEmit` passed.
- `gradle ... compileKotlin` passed against IntelliJ IDEA 2023.2.4.
- `pnpm.cmd build` passed.
- `gradle ... buildPlugin` passed against `E:\\software\\IntelliJ IDEA 2023.2.4` using the in-process Kotlin compiler and one Gradle worker.
- `git diff --check`, credential scan and source-file line-count checks passed.

---

## T17 - OpenCode V2 model variants and native IDEA tab overflow [x]
### Implementation record (2026-08-14)

- `frontend/src/lib/opencode.ts` now treats V2 `/api/model` as the runtime source of truth. An explicitly empty variant set is preserved and is never repopulated from legacy `/provider` data.
- `frontend/src/lib/providerCatalog.ts` applies the same rule while merging the settings catalog, so stale `max`/`high` values cannot leak from the legacy response into the runtime picker.
- `ModelSettings.tsx` still falls back to disk configuration for editing before an OpenCode restart, while the conversation picker only receives live V2 variants.
- `modelRefWithAvailableVariant` now strips an unsupported or stale variant before a session switch or prompt. The existing guard clears the stale UI selection and reports a real switch error instead of silently sending a rejected variant.
- `NativeSessionTabs.kt` and `AICodingToolWindowFactory.kt` register the left arrow, shrinkable tab viewport, and right arrow as three independent IDEA 2023.2.4 tab actions. The root action is never hidden, arrow slots have fixed sizes, and layout/scroll bounds are recalculated after Swing layout completes.

### Runtime verification

- Queried `http://127.0.0.1:65530/api/model`: `capybaraai/gpt-5.6-sol` and `gpt-5.6-terra` expose `none/low/medium/high/xhigh`; `sensenova` exposes `none/low/medium/high`; `opencode/deepseek-v4-flash-free` exposes no variants.
- Created a temporary empty session, posted the V2 JSON model reference, received HTTP `204`, read the session back with the selected `low` variant, and deleted the temporary session. No credential values were read or written.

### Verification

- `pnpm.cmd exec tsc --noEmit` passed.
- `pnpm.cmd build` passed.
- The first standard `gradle ... buildPlugin` attempt was stopped by Windows virtual-memory error 1455 while the Kotlin daemon crashed. The successful retry used `-Dkotlin.compiler.execution.strategy=in-process`, `--max-workers=1`, and reduced Gradle JVM memory; `buildPlugin` passed.
- `git diff --check` passed; no hand-written `.ts/.tsx/.kt` source file exceeds 1000 lines; no browser-native `confirm()` or `alert()` was added.

---

## T12 - IDEA context navigation and turn activity capsule `[x]`

### Implementation record (2026-08-11)

- `ContextChip.tsx` compacts long paths by removing only middle segments, keeps the line range
  visible as a separate monospace label, exposes the full location through the title/ARIA label,
  and sends file, selection, and directory clicks to the IDEA bridge. Directory clicks select the
  matching node in the Project view; file and selection clicks open the editor at the requested line.
- `IdeaInsightService.navigate` validates paths against the current project root and dispatches the
  native IDEA navigation on the application thread. `BaseAICodingAction` continues to publish all
  selected files, while `App.tsx` deduplicates bridge event IDs and only auto-submits
  `explain_code`; add-to-chat, optimize, and test remain attachments until the user sends them.
- `useSessionDiffs` tracks the active user turn separately from completed turn summaries. During a
  run it polls the live snapshot/OpenCode diff without clearing the last successful result; after a
  run it attaches the final per-turn files below the assistant conclusion.
- `TodoPanel` renders a compact floating capsule while a run is active. It shows todo progress,
  live `+/-` changes, or both; the combined state opens a two-tab todo/file-diff popover. The pill is
  hidden after the run and each file can open the IDEA native three-way diff dialog.
- `VirtualConversation` treats wheel, keyboard, touch, and native scrollbar drag as user scroll
  gestures, so the return-to-bottom button is shown consistently without letting streamed layout
  remeasurement force the user back to the bottom.

### Verification (2026-08-11)

- `pnpm.cmd exec tsc --noEmit` passed.
- `pnpm.cmd build` passed.
- `gradle -p idea-plugin buildPlugin -PintellijLocalPath="E:\\software\\IntelliJ IDEA 2023.2.4" --no-daemon` passed.
- `git diff --check` passed; the largest changed source file is 971 lines.
- Runtime limitation: the navigation, native diff dialog, and JCEF scrollbar behavior still need
  confirmation inside the user's running IDEA instance; the current verification uses the bridge
  harness and the packaged plugin build.

Status legend: `[ ]` pending, `[-]` in progress, `[x]` implemented and verified.

## Verification Baseline (2026-08-08)

- Branch: `CapybaraAICodingAssistantV3`
- Toolchain used for verification: `gradle 8.14` (from `~/.gradle/wrapper/dists`), `JAVA_HOME=E:\java\jdk-17`,
  IntelliJ Platform `IC-2023.2.4`, `pnpm` for the frontend.
- Commands run green: `pnpm exec tsc --noEmit`, `pnpm build`, `gradle compileKotlin`, `gradle buildPlugin`.
- Browser verification: headless Chrome driven over CDP against `pnpm dev` (`:5173`).
  - OpenCode traffic went to the **real** OpenCode server (`127.0.0.1:4096`) through the running plugin bridge,
    so conversation, streaming, virtualization and per-turn token rendering were checked against live payloads.
  - The **new** IDEA bridge routes (`/api/skills`, `/api/plugins`, `/api/git/*`, `/api/ide/*`) were exercised
    against a local harness that returns the exact Kotlin DTO shapes, because the routes need a live IntelliJ
    `Project` and the IDEA instance running on this machine still hosts the previous plugin build.
  - Result: 30/30 interaction assertions passed, no page errors, no console errors.
- CDP layer verification: the plugin's own `CdpClient`/`CdpSession` classes were run against a real Chrome
  instance started with `--remote-debugging-port=9222` (the same protocol surface JCEF exposes).
  9/9 assertions passed: `navigate`, `getText`, `executeScript`, `click` (real input events), `screenshot`,
  `listenSSE`, and error propagation.

### Known Verification Limits

- The Kotlin services are verified by compilation, packaging and code review, plus the standalone CDP probe.
  They have **not** been exercised inside a running IDEA sandbox, so IDEA-runtime behaviour
  (`FileChooser` dialogs, `MavenRunner`, `ExternalSystemUtil`, `ProgramRunnerUtil`, JCEF debug port activation)
  is unverified at runtime.
- JCEF remote debugging only takes effect if the port is applied before the first `JBCefBrowser` is created.
  When another plugin has already started JCEF, `BrowserCdpService.status().restartRequired` reports `true`
  and the user must restart IDEA.
- Compatibility with IDEA 2025.3+ is implemented (optional `com.intellij.modules.jcef` dependency, reflective
  `CefRequestHandler`) but could not be tested here — only 2023.2.4 is installed.

## Conversation And Rendering

- [x] Streaming user/assistant messages render once without duplicate sends, full-page flashes, or disappearing placeholders.
- [x] Reasoning uses shimmer before content, streams in a lightweight panel, and says completed after finishing.
- [x] Tool groups remain collapsed by default, preserve the user's manual expanded state, and summarize completed operations.
- [x] Markdown renders during streaming without remounting the whole message tree.
- [x] Long conversations remain responsive through virtualization/windowing and stable localized updates.
      Verified: Virtuoso scroller present, only 5 of the history items mounted at a 2112px scroll height.
- [x] Question tools support single choice, multiple choice, and aligned custom answers.
- [x] Todo status uses a compact floating capsule and hides after completion.
- [x] Slash command search, keyboard navigation, agents, skills, and MCP entries behave correctly.

## Composer And Permissions

> **Root cause found and fixed.** OpenCode 1.18.12 accepts `permission` on `PATCH /session/{id}`
> (V1 and V2 shapes) and on `PATCH /config`, returns 200, and then **discards it** — verified by
> writing and reading back against a live server; the V2 array shape on `/config` is rejected with
> 400. The official schema does define `Config.permission`, so the payload shape was never the
> problem. Approval mode therefore had no effect at all until now: `websearch` and `bash` ran
> unprompted in every mode.
>
> Enforcement now runs in the bridge plugin's `permission.ask` hook, which asks the plugin for a
> decision per session and writes `output.status`. Per-session, no IDE restart, no global config
> writes. `ApprovalModeService` is the single source of truth — the picker renders from
> `/api/approval-mode/rules`, so displayed and enforced behaviour cannot drift.

- [x] Composer approval modes are the sole permission control: request approval, auto approve, and full access.
- [x] Runtime permission cards can approve or reject file access, edits, commands, and network access.
- [x] Network disabled mode requires approval before web access and cannot silently search.
- [x] Build/Plan controls and the Settings permission tab and its advanced JSON code are removed.
      `PermissionSettings.tsx` deleted; settings navigation verified to contain no 权限 entry.
- [x] Composer effects, spacing, narrow layout, scrolling, IME, long-text attachment conversion, and multi-file attachments work.

## Models And Usage

- [x] Providers/models/variants use current OpenCode V2 provider/model data and preserve custom provider variants.
- [x] Variant editor uses key to display-name rows and supports adding/removing variants.
- [x] Every completed turn shows model, variant, input/output/cache token usage, and context occupancy.
      Verified against a live turn: `本轮用量 opencode/ling-3.0-flash-free 输入 17K 输出 167 推理 0 …`.
- [x] Cache read/write values show real values when OpenCode supplies them and an unavailable state otherwise.
      `TokenUsage.cache.reported` now distinguishes "provider reported 0" from "provider reported nothing";
      the summary shows `缓存 不可用` and the context popover shows `不可用` when unreported.

## Attachments, Files, And Diff

- [x] Files and folders appear as attachment chips below the user bubble instead of inline full contents.
- [x] Multiple files selected in IDEA are all delivered to the composer.
- [x] Edited files expose colored add/delete summaries and open IDEA native modal diff with clear before/current/after labels.
- [x] IDEA file tree and open editor documents refresh after AI file creation, edit, and deletion.
- [x] Each completed turn shows per-file and aggregate added/deleted line counts below the conclusion.
- [x] JCEF downloads use an IDEA native save dialog.

## Skills, Plugins, And SkillHub

- [x] Skills load OpenCode project/global paths and Claude Code-compatible project/global skill paths.
      `SkillManagementService` scans `.opencode/skills`, `.opencode/skill`, `.claude/skills`, `.agents/skills`
      for both project and `~/.config/opencode` global scope.
- [x] Skills can be imported into project or global OpenCode scope, enabled, disabled, and deleted.
- [x] SkillHub search and install work **without the CLI, Python or Git Bash**.
      The CLI's own `metadata.json` names the endpoints it calls, and both were verified directly:
      `GET https://api.skillhub.cn/api/v1/search?q=&limit=` returns JSON with no auth, and
      `GET https://api.skillhub.cn/api/v1/download?slug=` returns a flat zip containing `SKILL.md`.
      The plugin now calls them with the JDK HTTP client and unpacks the archive itself
      (with zip-slip protection). Field types were checked against a live response.
      This removes the previous hard dependency on a Python 3 install.
- [x] OpenCode plugins are removed from Skills and have an independent settings page.
- [x] Plugins support import, create, edit, enable/disable, and delete using official OpenCode configuration semantics.
      Uses `.opencode/plugins` and `~/.config/opencode/plugins` (plural), with the singular directories still scanned
      for backwards compatibility, matching the OpenCode config documentation.

## Git And IDEA Integration

- [x] OpenCode worktree support and API limits are documented from official source.
      Finding: the OpenCode CLI and config documentation expose **no** worktree API. Working directory is selected
      only through `--dir` / `--cwd` / the `directory` request field. Using a worktree therefore means opening that
      directory in IDEA; the plugin then starts OpenCode against it.
- [dropped] Git status, commit, branch/worktree, merge and IDEA diff. IDEA's own Git tooling does all of this better,
      and worktree creation is a one-line `git worktree add`. The UI, `GitIntegrationService` and the `/api/git/*`
      routes were all deleted — see "Removed From Scope".
- [x] AI tools can list and run IDEA Run/Debug configurations under approval control.
- [x] AI tools can read current project Run/Debug console output under approval control.
- [x] AI tools can invoke IDEA Maven/Gradle project tasks and return build output under approval control.
      Approval control is two-layered: the OpenCode tool bridge must be explicitly installed from the IDEA settings
      page, and every tool call still goes through OpenCode's own permission prompt.

## Settings And Packaging

- [x] Settings tabs are responsive, scroll correctly, and do not contain the removed agent or permission tabs.
      Current navigation (`WorkspaceDialog.tsx`): 连接 / 外观 / 模型 / 人格 / 记忆 / 技能 / 插件 / MCP.
      The 权限 / Git / 清单 entries were deleted — see "Removed From Scope".
- [x] Theme follows IDEA live, supports an explicit plugin light/dark toggle, and maps each mode to an exact
      installed IDEA theme from the 外观 page.
- [x] Personas and memory settings remain functional after settings refactoring.
- [x] The Connection page can restart the OpenCode service: a plugin-managed process is relaunched, a
      user-owned one is only re-probed and reconnected.
- [x] Frontend typecheck/build, browser interaction tests, Kotlin compile, and `buildPlugin` all pass.
- [x] No source file exceeds 1000 lines. Largest is `frontend/src/App.tsx` at 910.

## Built-In Browser

The first attempt used a second tool window and configured the CEF debug port from the assistant
panel. In a real IDE that broke the assistant (frontend 404, no way back). Reworked:

- [x] The browser opens in a standalone `FrameWrapper` window from 「工具 → 打开水豚浏览器」, not a tool window.
- [x] The assistant panel no longer references any browser code, so this feature cannot affect it.
- [x] Page control uses a `JBCefJSQuery` bridge — no debug port, no IDE restart required.
- [x] `POST /browser/control` and `GET /browser/status` are served by the existing plugin HTTP server; no new port.
- [x] Actions: status, navigate, click, getText, getHtml, type, waitFor, executeScript, listenSSE, openDevTools.
      Verified in a real browser 8/8, including that the synthetic pointer+mouse sequence drives Radix
      components (plain `el.click()` provably does not).
- [x] `screenshot` still uses the JDK-native CDP client, and now degrades with a clear message when the
      debug port is unavailable instead of failing the whole feature.
- [x] `static/index.html` missing now reports why instead of a bare 404.
- [x] OpenCode reaches the browser through the `idea_browser` tool; its description tells the model to call
      `status` first and ask the user to open the window if it is closed.
- [-] IDEA 2023.0–2025.3+ compatibility is implemented but only compiled and packaged against 2023.2.4.
- [-] `JBCefJSQuery` injection, the standalone window, and screenshot fallback are **not** verified inside a
      running IDEA — only the injected JavaScript and the CDP client are verified against a real browser.

## Removed From Scope

Everything below was built, then removed because it duplicated what IDEA or OpenCode already do
better. The principle: this plugin should own what IDEA lacks, not re-skin what it has.

- **Completion checklist page** — my own progress tracking, not a product feature. This file is the
  single source of truth.
- **Composer primary-agent picker** — OpenCode manages the primary agent itself. The approval-mode
  picker took that slot. `@agent` mentions still work.
- **Git / Worktree, end to end** — IDEA's own Commit window, branch widget, log and diff viewer are
  better than anything reimplemented here, and worktree creation is a one-line `git worktree add`.
  Deleted: the settings page, `GitIntegrationService.kt`, the `/api/git/*` routes and the frontend
  `gitApi` client. Nothing references git from the plugin any more.
- **IDEA page run/build/console panels** — the Run/Debug list, Maven and Gradle inputs and the log
  viewer duplicated IDEA's own Run, Maven and Gradle tool windows. The page now only carries the parts
  that are not available elsewhere: the bridge consent toggle, an environment check, and the list of
  tools the AI gains.
- **Verbose approval-mode descriptions** — each row now shows only what runs automatically; the list of
  operations that still ask moved to the hover tooltip.
- **Skills "running" vs "installed" split** — two tabs whose switches did different things (one wrote a
  local preference, one renamed the file) were easy to misread. Now one disk-scanned list, each row
  marked 已加载 / 待重启服务加载 by cross-referencing OpenCode's live skill list.

## Added After The Original Audit

- **Git status button** (top bar, coloured state dot). Lists pending files, generates a commit summary
  with the current session model in a throwaway session, and hands off to IDEA's own commit and push
  dialogs via `CheckinProject` / `Vcs.Push`. Warns when the branch changes mid-session, because files
  the assistant read earlier may no longer match the working tree.
- **Restart OpenCode** from the Connection page — needed because plugin and skill changes only take
  effect on reload.
- **Provider removal** in Model settings. `PATCH /config` has no delete primitive, so the provider map
  is re-sent without the entry and the result is read back; if the server merged instead of replacing,
  the provider is disabled and the user is told the entry remains in `opencode.jsonc`.
- **Readable provider errors** — `reasoning_content ... thinking mode`, context-window overflow and
  quota failures now render as actionable Chinese messages instead of raw JSON.
- **Tool window minimum width** — Swing's `minimumSize` is advisory for tool windows; enforced with
  `ToolWindowEx.stretchWidth` on resize.
- **Conversation fixes** — the process panel no longer swaps component trees when streaming ends (that
  remount read as a collapse/flash), tool-group headers follow their own tools' state instead of
  position, and submitting pins the view to the bottom so the thinking placeholder is fully visible.

---

# 本轮改动（2026-08-08）

## 「重启服务」按钮改成诚实的

**问题**：点一下按钮立刻就返回成功，但什么都没有重启。

**证据**（在本机实测）：

| 观察项 | 值 |
| --- | --- |
| OpenCode 进程 PID | 62292 |
| 该进程启动时间 | 08/04/2026 21:54:59 |
| 桥接插件文件 `capybara-idea.ts` 写入时间 | 08/08/2026 00:37:49 |

进程比插件文件早了 5 天，**它不可能加载过这个插件**。而 `/config` 接口里能列出
`capybara-idea.ts`，那只是 OpenCode 扫描目录的结果，不代表已加载。

**根因**：`OpenCodeServerManager.restart()` 只在 `endpoint.managed == true`（即服务是插件自己拉起来的）
时才会 `terminateFailedProcess()`。用户自己在终端跑的 OpenCode，`managed == false`，restart 走的是
「丢掉缓存 → 重新扫 12001-12100 端口 → 又连上同一个进程」，所以又快又没用。而 OpenCode
**只在启动时加载插件**，所以工具桥接、审批模式、新装技能全都不会生效。

**改动**：

| 文件 | 改动 |
| --- | --- |
| `services/OpenCodeServerManager.kt` | `restart(frontendPort, force)`；新增 `terminateExternalServer(port)` 与 `externalPid(port)`（Windows 用 `netstat -ano`，其余用 `lsof`）；返回值带上 `reconnectedOnly` / `externalPid` |
| `services/OpenCodeServerManager.kt` | `OpenCodeEndpoint` 新增 `reconnectedOnly: Boolean`、`externalPid: Long?` |
| `server/HttpServerManager.kt` | `handleRestartOpenCode` 读取请求体 `RestartRequest(force)` |
| `lib/idea.ts` | `restartOpenCode(force = false)`；`IdeaRuntimeConfig` 新增 `reconnectedOnly?` / `externalPid?` |
| `components/assistant/ConnectionSettings.tsx` | 只是重连时不再显示「已重启」，改为一块琥珀色说明面板，写清「没有真正重启、进程从未停止、插件改动不会生效」，并给出「强制重启」按钮（走站内 `ConfirmDialog` 二次确认，不用原生 `confirm`） |

**为什么强制重启要二次确认**：这会杀掉用户自己启动的进程，可能正在跑别的会话。

**验证**：`pnpm exec tsc --noEmit` 通过，`pnpm build` 通过（9.64s）。
`reconnectedOnly` 分支尚未在真实 IDEA 里点过，属于下面「未验证」清单。

---

# 交接给 Codex 的待办（2026-08-08）

> 下面四项是用户在 2026-08-08 提出的新需求，按优先级排列。每项都写清了**现状**、
> **已经实测到的事实**、**建议做法**和**验收标准**，可以直接开工。

## T1 — SkillHub 排序/筛选改成走官方列表接口 `[x]`

### 现状

`SkillHubPanel.tsx:54-65` 只提供 综合 / 下载量 / 收藏量 / 最近上新 四个排序，而且是
**拿到一页数据后在前端 `Array.sort`**，注释里写的「公开搜索接口忽略排序参数」这一点，对
`api/v1/search` 来说是对的，但结论下早了——网站用的根本不是这个接口。

### 已实测的事实（2026-08-08 直接 curl 验证）

1. 插件现在用的 `GET https://api.skillhub.cn/api/v1/search` 是 **CLI 用的接口**。
   实测 `sortBy=downloads|stars|updated_at|rank|curated_score|score` 六种取值返回的**前几条完全一样**，
   即该接口确实忽略排序参数。

2. 网站自己用的是 **`GET https://api.skillhub.cn/api/skills`（没有 `/v1`）**，它支持排序和筛选：

   | 参数 | 说明 | 实测 |
   | --- | --- | --- |
   | `sortBy` | 排序字段 | 服务端明确回错误信息枚举：`updated_at / downloads / stars / installs / score` |
   | `order` | `desc` / `asc` | 有效。`order=asc` 首页返回的全是 `downloads=0` 的技能 |
   | `page` | 页码，从 1 开始 | 有效，第 2 页内容不同 |
   | `keyword` | 关键词搜索 | **有效**。`keyword=pdf` → total 从 109349 降到 2440 |
   | `q` / `search` / `name` | — | **被忽略**，total 仍是 109349，别用 |
   | `category` | 场景分类，如 `dev-programming` | 有效 |
   | `source` | 来源，如 `community` / `clawhub` | 有效 |
   | `requiresApiKey` | `true` / `false` | 有效 |
   | `limit` / `pageSize` / `offset` | — | **被忽略**，固定每页 20 条 |

3. 响应结构是 `{"code":0,"data":{"skills":[...],"total":109349}}`，字段是 **snake_case**：
   `created_at` / `updated_at` / `icon_url`→这里叫 `iconUrl`（注意两个接口大小写不一样，见下）、
   `namespace:{canonicalName,displayName,handle,publicSlug}`、`labels:{requires_api_key:"false"}`
   （**是字符串不是布尔**）、`subCategories:[{key,name}]`、`ownerName`、`score`、`installs`。

4. **`rank`（近期飙升）和 `curated_score`（推荐精选）这两个值服务端直接返回 400**：
   `{"code":400,"message":"参数错误：sortBy 不支持（updated_at/downloads/stars/installs/score）"}`。
   `https://skillhub.cn/api/skills` 和 `https://www.skillhub.cn/api/skills` 都只返回 HTML，没有第二个 API 入口。
   → 这两个排序**目前无法通过公开接口实现**。请先在浏览器 DevTools 的 Network 面板里看一下
   skillhub.cn 点「近期飙升」时到底发的什么请求（可能带鉴权头或走别的路径），拿到真实请求再实现；
   在拿到之前**不要**放这两个按钮，放了就是假的。

5. 两个接口的图标字段名不一样，改接口时必须同步改 DTO：
   - `api/v1/search` → `icon_url`（`SkillManagementService.kt:75` 已按这个映射，图标是正常的）
   - `api/skills` → `iconUrl`

### 要做的事

- `SkillManagementService.kt`
  - `SEARCH_ENDPOINT` 增加一个 `https://api.skillhub.cn/api/skills` 的列表入口（保留 `api/v1/search` 做兜底，
    万一新接口挂了还能用）。
  - `SkillHubSearchRequest` 增加 `sortBy` / `order` / `page` / `category` / `source` / `requiresApiKey`，
    `query` 映射到 `keyword`。
  - 新增一个匹配 `{code,data:{skills,total}}` 的 DTO，`iconUrl` 走 camelCase，
    `labels.requires_api_key` 按字符串 `"true"` 解析。
  - 返回值带上 `total` 和 `page`，前端才能做翻页。
- `SkillHubPanel.tsx`
  - 排序按钮改成 综合(`score`) / 下载量(`downloads`) / 收藏量(`stars`) / 安装量(`installs`) / 最近上新(`updated_at`)，
    **切换排序时重新请求接口**，删掉 `useMemo` 里的本地 `sorted.sort(...)`。
  - 分类/来源/API Key 三个筛选也改成传给后端，不要在前端过滤 20 条。
  - 加翻页或滚动加载，因为每页固定 20 条、总数 10 万+。

### 验收标准

- 点「下载量」和点「最近上新」返回的**第一条不一样**（现在因为只排一页，很可能一样）。
- 选「dev-programming」后列表里每条的分类都是它，且条数不再被限制在当前这 20 条里。
- 搜索框输入 pdf，返回的是 PDF 相关技能（用 `keyword` 才能做到）。

### Codex 实施记录（实际执行：2026-08-08）

- `SkillManagementService.kt` 新增 `api/skills` 列表 DTO，透传 `keyword`、`sortBy`、`order`、`page`、
  `category`、`source`、`requiresApiKey`，并返回 `total/page/pageSize`；只有 HTTP 5xx 才回退 CLI 搜索接口。
- `SkillHubPanel.tsx` 改为服务端排序和筛选，新增安装量、分页、升降序切换，移除了当前页本地排序和过滤。
- 按用户补充加入 `rank` 与 `curated_score`；当前实际日期 2026-08-08 对公开接口请求这两项仍返回 HTTP 400，
  前端会展示真实服务端错误，不会伪造本地结果。`score/downloads/stars/updated_at` 已实测返回 200。
- 验证通过：`pnpm.cmd exec tsc --noEmit`、`pnpm.cmd build`、
  `gradle -p idea-plugin buildPlugin -PintellijLocalPath="E:\software\IntelliJ IDEA 2023.2.4" --no-daemon`。

---

## T2 — 筛选下拉框要点两次才能切换 `[x]`

### 现象

打开「场景分类」下拉后不选，直接点「来源」下拉：第一次点只是把上一个关掉，
**必须点第二次**才会展开新的。用户截图里箭头指的就是这个。

### 根因

`SkillHubPanel.tsx:322-357` 三个筛选用的是 shadcn 的 `Select`（`components/ui/select.tsx`，
底层是 `radix-ui` 的 `Select.Root`）。Radix 的 Select 是**准模态**的：打开时会给 `body` 挂上
`pointer-events: none`（`RemoveScroll` + `hideOthers`），外部点击只会被当成「关闭」消费掉，
不会穿透到下面那个 trigger 上。Radix Select **没有** `modal` 属性可以关掉这个行为。

### 建议做法（推荐第一种）

1. **把这三个筛选换成 `DropdownMenu`**（`components/ui/dropdown-menu.tsx` 已经有了），
   根节点传 `modal={false}`。非模态时 Radix 不会禁用 body 的 `pointer-events`，
   一次点击既关旧的又开新的。菜单项用 `DropdownMenuRadioGroup` + `DropdownMenuRadioItem`，
   视觉上跟现在的截图（带 ✓ 的单选列表）一致。
2. 或者用 `Popover` + `modal={false}` 自己渲染选项列表。
3. 不要用「全局 CSS 强行 `body{pointer-events:auto!important}`」这种绕法，会顺带破坏
   Dialog / 真正需要模态的组件。

注意：安装页那个「安装到项目 / 安装到全局」的 `Select`（`SkillHubPanel.tsx:407`）不受影响，
因为旁边没有第二个下拉，可以不动。

### 验收标准

在三个筛选之间连续切换，**每次只点一下**就能打开下一个；且 Dialog / 设置页其它模态行为不受影响。

### Codex 实施记录（实际执行：2026-08-08）

- `SkillHubPanel.tsx` 将场景分类、来源、API Key 三个筛选从 Radix `Select` 改为项目现有的
  `DropdownMenu modal={false}`，统一使用单选组并保留当前选中值；安装范围下拉仍保留原 Select。
- 服务端筛选请求行为不变，菜单选择会立即以新值重新请求第一页，不再在前端对当前页做假过滤。
- 验证通过：`pnpm.cmd exec tsc --noEmit`、`pnpm.cmd build`、
  `gradle -p idea-plugin buildPlugin -PintellijLocalPath="E:\software\IntelliJ IDEA 2023.2.4" --no-daemon`。

---

## T3 — 删掉设置里的「IDEA」tab，并入「插件」tab `[x]`

### 现状

- `WorkspaceDialog.tsx:51` 注册了 `{ icon: TerminalSquare, id: "idea", label: "IDEA" }`，
  第 134 行渲染 `IdeaExecutionSettings`。
- `IdeaExecutionSettings.tsx`（128 行）现在只剩三块内容：
  1. 「OpenCode 工具桥接」状态卡（已启用 / 未启用 + 安装路径）；
  2. 环境检查（Maven 插件可用 / Gradle 插件可用 / 识别到 N 个 Run 配置）；
  3. 桥接开启后 AI 能用的 5 个工具列表（`idea_run_configuration` / `idea_read_run_log` /
     `idea_maven` / `idea_gradle` / `idea_browser`）。

用户的判断是对的：这个页面本身**没有任何可操作项**，桥接是 IDEA 打开项目时自动装、关闭时自动卸的
（`IdeaExecutionService.activateBridge/deactivateBridge`），停用要去「插件」页停用 `capybara-idea`——
这句话本来就写在这个页面上，说明它天然属于插件页。

### 要做的事

- 从 `sections` 里删掉 `idea` 项，删掉第 134 行的渲染分支和 `TerminalSquare` 的 import。
- 把 `IdeaExecutionSettings` 的内容折进 `PluginSettings.tsx`：`capybara-idea` 这一行插件展开后，
  显示桥接状态、环境检查和那 5 个工具。其余插件行保持原样。
- `SectionID` 是从 `sections` 推导的联合类型，删完要全局搜一下 `"idea"` 有没有被当作
  `initialSection` 传进来（例如某个「去设置」的跳转按钮）。
- 删掉 `IdeaExecutionSettings.tsx` 文件本身；`lib/ideaIntegrations.ts` 里的
  `ideaExecutionApi.bridgeStatus/configurations` 继续留着给插件页用。

### 验收标准

设置左侧只剩 连接 / 模型 / 人格 / 记忆 / 技能 / 插件 / MCP 七项；在插件页能看到桥接是否已启用、
Maven/Gradle 是否可用、AI 拿到了哪些工具；`pnpm exec tsc --noEmit` 无 `noUnusedLocals` 报错。

### Codex 实施记录（实际执行：2026-08-08）

- `WorkspaceDialog.tsx` 删除 IDEA section、图标 import 和渲染分支，`SectionID` 自动收窄为七个有效设置页。
- `PluginSettings.tsx` 内嵌 IDEA 工具桥接状态、Maven/Gradle 可用性、Run/Debug 配置数量及五个 AI 工具；
  原有插件新建、导入、编辑、启停、删除流程保持不变。
- 删除 `IdeaExecutionSettings.tsx`；`ideaExecutionApi` 与 Kotlin IDEA 路由继续供插件页和 OpenCode 工具使用。
- 验证通过：`pnpm.cmd exec tsc --noEmit`、`pnpm.cmd build`、
  `gradle -p idea-plugin buildPlugin -PintellijLocalPath="E:\software\IntelliJ IDEA 2023.2.4" --no-daemon`。

---

## T4 — 水豚浏览器：保留 JCEF，重做外观并支持选元素/加评论 `[x]`

### 定位已确认（2026-08-08，用户拍板）

> 要的是 **Codex 内置浏览器那种**：任意网站都能开（百度这类外站也要），而且能在页面上操作。
> **不是**只预览本地 dev server。

因此**不用** ai-elements 的 `web-preview`，**不删**独立浏览器窗口。理由见下面「为什么不能换成 iframe」。

### 现状

- `ui/CapybaraBrowserPanel.kt`（286 行）：`JPanel(BorderLayout)` + 一排**原生 `JButton`**
  （`←` `→` `刷新` `打开` `DevTools`）+ `JBTextField` 地址栏 + 底部 `statusLabel`
  （截图最下面那行「脚本桥接：已就绪 · 画布 1848×816 · 截图（CDP 9222）：不可用」）。
  页面本体是 `JBCefBrowser`，`setOffScreenRendering(true)` + `setCreateImmediately(true)`。
- 窗口：`ui/CapybaraBrowserWindow.kt`（`FrameWrapper`，每个 project 一个）。
- 入口：`actions/OpenCapybaraBrowserAction.kt`（工具菜单 → 打开水豚浏览器）。
- 控制：`POST /browser/control`（`BrowserControlService.kt`，313 行），已支持
  status / navigate / click / getText / getHtml / type / waitFor / executeScript / listenSSE /
  openDevTools；screenshot 走 CDP 9222，端口不可用时降级提示。
- AI 侧通过桥接插件的 `idea_browser` 工具调用上面这些 action。

**问题只有两个**：外观太丑（原生 Swing 控件，跟 IDEA 和插件都不搭）、没有元素拾取和评论能力。
渲染内核和控制通道本身是好的，不要动。

### 为什么不能换成 iframe（结论，别再走回头路）

| 方案 | 能开百度 | 能读 DOM / 选元素 | 外观 |
| --- | --- | --- | --- |
| 现在的 JCEF 窗口 | ✅ JCEF 就是 Chromium | ✅ 注入脚本，不受跨域限制 | ❌ 原生 Swing |
| ai-elements `web-preview`（`<iframe>`） | ❌ 百度等站点 `X-Frame-Options: DENY` 直接拒绝被嵌 | ❌ 跨域，父页面读不到 `contentDocument` | ✅ React |
| Codex 内置浏览器 | ✅ 独立 Chromium + CDP | ✅ | — |

补充两点，避免再被绕进去：

- **同机不同端口就是跨域**。助手前端在 `127.0.0.1:<插件端口>`，被预览的站点在别的端口/域名，
  `iframe.contentDocument` 一律读不到；`sandbox` 里的 `allow-same-origin` 不解决这个问题
  （它只是「不额外降级为 opaque origin」）。
- 理论上可以在 JCEF 里用 `CefRequestHandler.getResourceRequestHandler` → `onResourceResponse`
  把响应头的 `X-Frame-Options` 和 CSP `frame-ancestors` 抹掉，让外站也能被 iframe 嵌
  （`CefResponse.setHeaderByName(String,String,boolean)` / `setHeaderMap` 这些方法**确实存在**，
  已用 `javap` 对 2023.2.4 的 JBR 核实）。但**实际效果没验证过**，且只在 JCEF 里成立，
  属于偏门做法，**不作为主方案**。

### 任务 A：外观重做（把原生 Swing 换成 IDEA 风格）

`CapybaraBrowserPanel.buildToolbar()`（第 88-104 行）整段重写：

- 后退/前进/刷新/停止改成 `AnAction` + `ActionManager.getInstance().createActionToolbar(...)`，
  图标用 `AllIcons.Actions.Back` / `Forward` / `Refresh` / `Suspend`；
  `ActionToolbar.setTargetComponent(this)` 别忘了，否则 `update()` 拿不到上下文。
- 地址栏用 `com.intellij.ui.SearchTextField`（或 `ExtendableTextField` 加个前置图标），
  回车触发 `loadUrl`；加载中在右侧挂一个 `AnimatedIcon.Default`。
- 配色一律走 `JBUI.CurrentTheme` / `UIUtil`，不要写死颜色，否则明暗主题切换会花。
  底部状态栏用 `JBLabel` + `UIUtil.getContextHelpForeground()`，字号 `JBUI.Fonts.smallFont()`。
- 间距用 `JBUI.Borders.empty(...)` / `JBUI.scale(...)`，保证 HiDPI 下不糊。
- DevTools 按钮保留，但挪到工具栏右侧的溢出菜单里，不要一直占位。

验收：明/暗主题各截一张图，工具栏和 IDEA 自带工具窗口观感一致，没有原生 `JButton` 的方块边框。

### 任务 B：元素拾取（这条 JCEF 反而比 iframe 好做）

CEF 的 `executeJavaScript` 注入进的是**页面自己的上下文**，跨域限制不存在。已核实存在的 API
（`javap --system "<IDEA>/jbr" --module jcef`）：

```
org.cef.browser.CefBrowser:
  public abstract CefFrame getMainFrame();
  public abstract CefFrame getFrame(java.lang.String);
  public abstract java.util.Vector<String> getFrameNames();
  public abstract int getFrameCount();
org.cef.browser.CefFrame:
  public abstract void executeJavaScript(String code, String url, int line);
  public abstract String getURL();
  public abstract boolean isMain();
```

实现要点：

1. `BrowserControlService` 新增 action：`pickElement`（进入拾取模式）、`stopPick`、
   `listPicks`、`clearPicks`、`addComment`。
2. 拾取脚本在 `onLoadEnd` 时注入（`CapybaraBrowserPanel` 已有 `CefLoadHandler`），
   注入到 `getMainFrame()`；如果页面有 iframe，遍历 `getFrameNames()` 逐个注入，
   这样页面内嵌的第三方 frame 也能拾取。
3. 高亮用一个 `position:fixed; pointer-events:none; z-index:2147483647` 的 overlay `div`，
   **绝对不要改目标元素本身的 style**，否则会污染用户页面的布局（这是最常见的翻车点）。
4. `mouseover` 更新 overlay 位置；`click` 时 `preventDefault()` + `stopPropagation()`，
   计算**稳定选择器**（优先 `id` → `data-testid`/`data-*` → 带 `nth-of-type` 的结构化路径），
   连同 `tagName`、`innerText`、`outerHTML` 前 N 字符、`getBoundingClientRect()`
   一起通过已有的 `JBCefJSQuery` 回传。
5. 拾取模式要能用 `Esc` 退出，并且退出时把所有监听和 overlay 清干净
   （用一个 `window.__capybaraPicker` 单例挂载/卸载，避免重复注入叠加多份监听）。

### 任务 C：评论

1. 评论 = 「选择器 + 用户输入的文字 + 拾取时抓到的元素信息 + 页面 URL」。
   存在 `BrowserControlService` 里（按 URL 分组），跟着窗口生命周期走即可，不需要持久化。
2. 输入框做成**注入到页面里的浮层**，锚定在被选元素旁边，比放 Swing 侧栏好用
   （元素滚动时评论气泡跟着走）。已评论的元素常驻一个小角标。
3. `idea_browser` 的 `status` 和 `getText` 返回值里带上评论列表，
   AI 就能知道「用户指着页面上哪个元素说了什么」。
4. `idea_browser` 工具描述要更新：说明可以先 `listPicks` 看用户标注了什么，再决定怎么改代码。

### 不要动的部分

- JCEF 渲染、`JBCefJSQuery` 桥接、`POST /browser/control` 通道、`idea_browser` 工具——都保留。
- 独立 `FrameWrapper` 窗口和工具菜单入口——**保留**，不要合并进助手面板
  （合进去就变成 iframe 了，见上面的表）。
- `CdpClient.kt` 和 9222 截图路径——保留，截图目前只有它能做。

### 验收标准

- 明/暗主题下工具栏、地址栏、状态栏都跟 IDEA 原生控件观感一致，无原生 `JButton`。
- 打开 `https://www.baidu.com/`，进入拾取模式，鼠标划过有高亮框，点搜索框能拿到一个可复用的选择器，
  **且页面布局没有被改动**（对比拾取前后的截图）。
- 对该元素写一条评论，AI 调用 `idea_browser status` 能读到这条评论和对应元素的文本。
- 连续进出拾取模式 5 次，页面上不残留 overlay，`window` 上不叠加重复监听。
- 现有 10 个 action 不回归：`scratchpad/test-jsbridge.mjs` 仍然 8/8 通过。

### Codex 实施记录（实际执行：2026-08-08）

- 保留了独立 `FrameWrapper`、JCEF OSR 渲染、`JBCefJSQuery`、`POST /browser/control` 与 CDP 9222
  截图链路，没有改成 iframe 或 ai-elements `web-preview`。
- `CapybaraBrowserPanel.kt` 移除了原生 `JButton/JTextField` 工具栏，改为 IDEA `AnAction` 工具栏、
  `SearchTextField`、`AnimatedIcon.Default` 与 `JBLabel` 状态栏；后退、前进、刷新、停止和拾取使用
  `AllIcons`，DevTools 与清除标注收进右侧溢出菜单。这样明暗主题和 HiDPI 缩放都由 IDEA UI 体系接管。
- 新增 `BrowserPickerScript.kt`，以 `window.__capybaraPicker` 单例注入主 frame 和所有子 frame：
  - 鼠标经过只移动独立 overlay，不修改目标元素自身样式；
  - 点击拦截页面默认行为，按 id → `data-testid`/稳定 `data-*` → `nth-of-type` 结构路径生成选择器；
  - 回传 selector、标签、文本、截断后的 HTML、元素矩形、主页面 URL 与 frame URL；
  - 使用页面内自定义评论浮层，不调用原生 `confirm/alert`；已评论元素显示可再次编辑的小角标；
  - Esc 退出，重复安装会先销毁旧 overlay、评论框和监听器，避免重复启停叠加事件。
- `BrowserControlService.kt` 新增 `pickElement / stopPick / listPicks / clearPicks / addComment`，按页面 URL
  保存当前窗口生命周期内的拾取与评论；`status`、`getText` 等控制响应携带当前页面 `picks`，窗口关闭时清空。
- `IdeaExecutionService.kt` 同步扩展 `idea_browser` 的 action 枚举和 `pickId` 参数，并要求 AI 修改 UI 前优先
  调用 `listPicks` 读取用户标注。原有 navigate/click/getText/getHtml/type/waitFor/executeScript/listenSSE/
  screenshot/openDevTools 均保留。
- 验证通过：`pnpm.cmd exec tsc --noEmit`、`pnpm.cmd build`、
  `gradle -p idea-plugin buildPlugin -PintellijLocalPath="E:\software\IntelliJ IDEA 2023.2.4" --no-daemon`；
  额外通过 IDEA 2023.2.4 SDK 的 `compileKotlin`、拾取脚本 `node --check`、`git diff --check` 和手写源码
  单文件不超过 1000 行检查。
- 当前仓库中没有 `scratchpad/test-jsbridge.mjs`，所以无法执行审计原文中的 8/8 脚本；没有启动或操作真实
  IDEA 窗口，因此百度跨 frame 拾取、明暗主题截图、连续启停 5 次与页面布局截图对比仍需运行时手动验收。

---

## T5 — 插件明暗模式与 IDEA 主题映射 `[x]`

### 问题与原因

旧实现只根据主题名称猜测明暗主题，并优先匹配 `IntelliJ Light`。当 IDEA 同时安装了 `Light`、
`IntelliJ Light` 或第三方主题时，用户无法指定插件明亮/暗色按钮究竟切到哪一个 IDEA 主题；
IDEA 的“跟随系统明暗模式”也没有复用插件的主题选择。

### Codex 实施记录（实际执行：2026-08-08）

- 新增设置页「外观」，分别选择“插件明亮模式对应的 IDEA 明亮主题”和“插件暗色模式对应的 IDEA
  暗色主题”；列表直接来自当前 IDEA 的 `LafManager.installedLookAndFeels`，`Light` 与
  `IntelliJ Light` 会作为两个独立选项展示，不再按名称猜测。
- `IdeThemeService` 对 `UIThemeBasedLookAndFeelInfo` 使用真实 `theme.id`，其它 LAF 使用稳定的
  class/name 组合；默认值使用 IDEA 自己的 `defaultLightLaf` / `defaultDarkLaf`，映射通过应用级
  `PropertiesComponent` 持久化。
- 保存映射时同步调用 `setPreferredLightLaf`、`setPreferredDarkLaf`；支持的 IDEA 版本还会通过
  `LafManager.autodetect` 启用“跟随系统明暗模式”，系统切换后使用同一套明亮/暗色映射。
- 右上角插件主题按钮仍保留，但现在会按已保存的精确映射切换 IDEA；IDEA 自身主题变化继续通过
  `ide.theme` SSE 实时同步给前端，避免插件和 IDEA 明暗状态分离。
- 新增 `GET /api/ide/theme` 与 `POST /api/ide/theme/settings`，前端 API、设置导航和响应式下拉选择器
  已接入；使用项目内 DropdownMenu/Switch/Button，没有原生 `select`、`confirm` 或 `alert`。
- 验证通过：`pnpm.cmd exec tsc --noEmit`、`pnpm.cmd build`、IDEA 2023.2.4 SDK 下的
  `compileKotlin`、`gradle -p idea-plugin buildPlugin`、`git diff --check`；所有手写源码仍少于 1000 行。
- 没有启动或操作用户的真实 IDEA，因此安装插件后对 `Light` / `IntelliJ Light` 的实际切换、系统主题
  自动跟随和第三方主题切换仍保留在下面的运行时点验清单中。

---

## T6 — 语气角色与专业角色分层 `[x]`

### Codex 实施记录（实际执行：2026-08-08）

- 设置页原「人格」改为「角色」，内部拆成「语气角色」和「专业角色」两个页签；原哈基米、台妹、御姐、
  甜妹和自定义语气继续保留，语气角色只负责表达方式。
- 新增架构设计师、UI/UX 设计师、前端工程师、后端工程师、数据库设计师、测试工程师、代码审阅者、
  调试与性能工程师八个轻量专业角色；提示词只描述关注点，不引入 BMAD 等固定工作流。
- 专业角色支持全局启停、单角色启停、编辑简短提示词，并可从 OpenCode 当前已加载 Skill 和已启用 MCP
  中手动建立关联；关联项被删除或停用后不会继续注入会话。
- 专业角色总开关关闭时，对话输入框底部完全不渲染角色控件；开启后显示紧凑下拉，支持“自动角色”和
  所有已启用角色，选择结果按当前项目持久化。
- 语气和专业角色作为同一个私有角色上下文发送，`stripPersonaContext` 继续在用户消息渲染前移除它，
  因此角色提示词不会出现在用户气泡；专业角色明确声明为能力偏好，禁止强迫模型套用无关流程。
- 网页实测通过：设置页两个页签、专业角色开关、八个角色、角色切换、开启后底部显示、关闭后隐藏均符合预期。

---

## T7 — 扩展 IDEA 原生工具桥接 `[x]`

### Codex 实施记录（实际执行：2026-08-08）

- 保留原有 Run/Debug、日志、Maven、Gradle 和 JCEF 浏览器工具，不安装 GitNexus、BMAD、MinMax 或其它
  外部框架；新增能力全部来自 IDEA 2023.2.4 自身 API。
- 新增 `idea_project_context`：读取项目 SDK、模块、内容根、源码根、模块依赖、打开文件和当前文件。
- 新增 `idea_editor_context`：读取当前编辑器光标、选区、语言、行数和附近源码，也可按项目文件和行号读取。
- 新增 `idea_diagnostics`：读取 IDEA Daemon/Inspection 已产生的错误、警告、位置和检查 ID，并告知分析是否完成。
- 新增 `idea_symbol`：通过 PSI、`ReferencesSearch` 和 `DefinitionsScopedSearch` 查询符号定义、引用与实现。
- 新增 `idea_navigate`：让 AI 把用户带到 IDEA 编辑器中的具体文件、行和列；新增 `idea_refresh_project` 保存
  打开的文档并刷新 VFS 索引与 Project 树。
- 文件参数统一限制在当前 IDEA 项目根目录；项目/编辑器/诊断/符号/日志/导航属于只读或低风险能力，按现有
  审批规则自动放行，运行、构建、浏览器控制和刷新等有副作用操作继续请求审批。
- 对话工具标题、输入和输出增加中文结构化渲染，项目模块、编辑器上下文、诊断列表和符号位置不再直接显示原始 JSON。
- 验证通过：`pnpm.cmd exec tsc --noEmit`、`pnpm.cmd build`、IDEA 2023.2.4 SDK 下的 `compileKotlin`、
  `gradle -p idea-plugin buildPlugin`。没有启动或操作用户的真实 IDEA，运行时 PSI/Daemon 结果仍需安装后点验。

---

## T8 — 内置桥接管理与审批模式即时生效 `[x]`

### 问题与原因

- `capybara-idea.ts` 原先既显示为普通 OpenCode 插件，又在页面上额外展示桥接状态，用户可以看到编辑、
  删除等不适用于内置插件的操作。
- 审批模式由 Kotlin 内存状态和 `permission.ask` 插件钩子实现；检查最新 OpenCode 源码后确认该钩子虽仍
  保留类型定义，但当前权限执行链路不触发它，因此“替我审批”和“完全访问”只改变了界面状态。
- 桥接文件原先在 OpenCode 启动之后才写入，插件自己启动的 OpenCode 第一次打开也无法加载 IDEA 工具；
  IDEA 关闭时还会删除全局桥接文件，导致共享服务下次启动再次丢失插件。

### Codex 实施记录（实际执行：2026-08-08）

- 插件页新增单独的“IDEA 原生桥接（内置）”行，只提供启用/停用开关；开关右侧折叠区展示 11 项
  `idea_*` 能力、Maven/Gradle 状态、Run/Debug 配置数量与安装位置。
- 通用插件列表不再返回 `capybara-idea`；Kotlin 服务端同时拒绝同名插件的保存、覆盖、通用启停与删除，
  内置桥接只能通过专用 `POST /api/ide/bridge/enabled` 调整。
- 桥接源文件改为持久保留；停用时保存为 `.disabled`，IDEA 关闭只移除当前项目的端口提示文件，不再删除
  全局桥接。HTTP 前端端口建立后、OpenCode 发现或启动前即准备桥接，因此插件管理的首次启动可直接加载。
- 审批模式改为前端直接调用 OpenCode `PATCH /session/{sessionID}` 写入会话权限，不再经过 Kotlin 中转，
  也不再要求重启服务。保存后立即使用响应中的权限规则回读校验，OpenCode 未应用时会明确报错。
- “请求批准”和“替我审批”首先追加 `* = ask`，覆盖之前可能存在的“完全访问”；随后只对白名单读取、
  诊断、问题面板和安全 IDEA 查询放行。“替我审批”额外放行文件编辑，命令、联网、构建、浏览器及未知工具
  继续产生权限询问；“完全访问”使用 `* = allow`。
- 内置桥接的每个自定义工具都显式调用 OpenCode 提供的 `context.ask(...)`：项目/编辑器/诊断/符号/日志
  和浏览器只读动作使用安全权限，Run/Debug 启动、Maven、Gradle、项目刷新以及浏览器点击、输入、脚本等
  有副作用动作使用各自的权限名，确保它们与文件、命令、联网工具一样受三档审批模式控制。
- 新会话和没有显式权限规则的旧会话会自动写入“请求批准”，避免界面显示请求批准、OpenCode 实际沿用
  Agent 默认权限。重复选择同一模式不会继续追加规则。
- 删除了 `ApprovalModeService.kt`、`/api/approval-mode` 路由和桥接插件中的无效 `permission.ask` 钩子。
- 浏览器窄侧栏实测通过：内置行、开关、折叠能力列表及三种审批选项正常显示，无横向溢出；未连接真实
  OpenCode，因此权限询问面板的实际触发仍需在安装后的 IDEA 会话中点验。

---

## T9 — 让模型主动识别并调用 IDEA 原生能力 `[x]`

### 问题与原因

- OpenCode 会把桥接插件注册的 `idea_*` 工具及描述交给模型，但工具定义本身没有稳定说明当前会话正运行在
  IntelliJ IDEA 内，也没有告诉模型哪些场景应优先使用 IDE 上下文，因此模型经常把这些工具当作可忽略的附加能力。
- `idea_browser` 只有状态和页面控制动作，没有打开窗口的动作；窗口关闭时只能让用户手动从工具菜单打开，
  模型无法完成“发现未打开 → 主动打开 → 检查页面”的完整流程。

### Codex 实施记录（实际执行：2026-08-08）

- 内置 `capybara-idea.ts` 增加 OpenCode 最新插件钩子 `experimental.chat.system.transform`。仅当当前工作区存在
  `.idea/capybara-ai-port` 时，向每次模型请求注入一段精简 IDEA 环境说明；全局 OpenCode 在非 IDEA 项目中
  加载该插件时不会误报运行环境。
- 环境说明明确项目/编辑器上下文、诊断、符号索引、代码定位、项目刷新、Run/Debug、日志、Maven、Gradle
  和水豚浏览器的适用场景，同时要求模型不要为了展示能力而无意义调用 IDEA 工具。
- `idea_browser` 新增受审批控制的 `open` 动作，可在 IDEA 事件线程中主动打开或置前独立 JCEF 窗口，支持
  同时传入 URL；工具描述和插件页能力说明同步更新，不再要求用户先手动进入工具菜单。
- 系统环境只注入带 `sessionID` 的真实会话，不影响 OpenCode 内部的 Agent 生成请求。验证通过：
  `pnpm.cmd exec tsc --noEmit`、`pnpm.cmd build`、
  `gradle -p idea-plugin buildPlugin -PintellijLocalPath="E:\software\IntelliJ IDEA 2023.2.4" --no-daemon`。
- 运行时仍需安装本次生成的新插件包并重启 OpenCode 服务；OpenCode 只在进程启动时加载
  `capybara-idea.ts`，仅刷新前端不会让已经运行的旧进程获得新系统 hook 和 `open` 动作。

---

## T10 — 审批模式菜单关闭后清除悬停高亮 `[x]`

### 问题与原因

- `cmdk` 会在菜单内部保留当前选中项；用户只把鼠标移到某一审批模式、没有点击确认便关闭菜单时，下一次打开仍可能看到该项带着悬停背景。
- 真实审批模式与菜单内的临时键盘/鼠标高亮是两种状态，不能共用同一个选中样式；当前模式只应以右侧勾选标识，临时高亮应在菜单关闭时销毁。

### Codex 实施记录（实际执行：2026-08-08）

- `ApprovalModePicker.tsx` 新增受控的 `activeMode` 临时高亮状态，菜单打开、关闭、点击外部关闭和完成选择时都会清空；重新打开时不继承上一次鼠标位置。
- 压掉 `cmdk` 自动选中第一项产生的背景，只在真实 `onMouseMove` 或方向键操作后显示高亮；鼠标离开菜单也会立即清除。
- 上下方向键现在移动临时高亮，Enter 只确认当前临时项；当前已保存的审批模式仍使用右侧勾选显示，不伪装成悬停状态。
- 在 `http://127.0.0.1:4173/` 完成网页复测：悬停“完全访问”后点击外部关闭，再次打开三项背景均为透明，未出现残留高亮。
- 验证通过：`pnpm.cmd exec tsc --noEmit`、`pnpm.cmd build`、
  `gradle -p idea-plugin buildPlugin -PintellijLocalPath="E:\software\IntelliJ IDEA 2023.2.4" --no-daemon`；
  `git diff --check` 无错误，手写源码均未超过 1000 行，也没有调用原生 `confirm()` / `alert()`。

---

## T11 — IDEA 原生工具窗顶栏动作与代码拆分 `[x]`

### Codex 实施记录（实际执行：2026-08-11）

- 新增 `CapybaraTitleActions.kt`，把状态、新会话、历史、设置、Git、主题、刷新注册为
  IDEA `ToolWindowEx.setTitleActions(...)` 原生标题动作；状态点使用 Kotlin 缓存的连接/更新状态，
  不在 `AnAction.update` 中发网络请求。
- 新增 `PluginUpdateService.kt`，将版本检查完全迁移到 Kotlin；冷缓存首次请求等待真实结果，
  并发请求共享同一个 Future，完成后触发 IDEA 动作栏刷新；前端通过 `GET /api/plugin-update`
  读取相同缓存，不再从 JCEF 直接访问发布服务。
- JCEF 加载地址增加 `nativeTitleActions=1`，硬编码隐藏 React 顶栏；原生动作通过现有
  `/events` SSE 发送 `capybara.action`，前端复用既有会话、设置、Git 和主题逻辑。Git
  保留一个不可见的 React Popover 锚点，保证 IDEA 原生 Git 动作仍打开现有 Git 面板。
- `HttpServerManager` 增加运行状态判断，并在停止时移除当前项目的活动实例；因此标题动作只
  操作当前项目的前端服务，不会误停共享的 OpenCode 服务。
- 审批/问答状态集中到 `useApprovalInteractions.ts`，消息提交、命令分流、附件模态回退和
  自动重试集中到 `usePromptSubmission.ts`；`App.tsx` 从 1161 行降至 937 行，避免重复状态
  和旧实现并存造成审批与发送竞态。所有手写源码仍少于 1000 行。
- 验证通过：`pnpm.cmd exec tsc --noEmit`、`pnpm.cmd build`、缓存 Gradle 8.14 配合
  IDEA 2023.2.4 SDK 执行的 `buildPlugin`，以及 `git diff --check`；没有新增浏览器原生
  `confirm()` / `alert()`。

---

## T13 — 顶栏主题/会话标题与模型选择状态修复 `[x]`

### 问题与原因

- IDEA 原生主题动作固定使用 `AllIcons.Actions.Show`，因此无论当前明暗状态都显示眼睛图标。
- 视觉模型设置只提供模型选择回调，没有把 `undefined` 写回偏好的入口，选中后无法停用。
- `App.tsx` 使用整个 `currentSession` 对象初始化模型；会话列表刷新产生的新对象会把刚完成的乐观模型
  选择覆盖成旧值，所以底部模型名要切换会话后才更新。
- 启用 IDEA 原生标题动作后 React 顶栏被隐藏，但当前会话名没有同步给 `ToolWindow`，原生顶栏也没有
  能触发现有重命名逻辑的入口。

### Codex 实施记录（实际执行：2026-08-11）

- 原生主题动作改为按 `UIUtil.isUnderDarcula()` 动态显示 IDEA 自带太阳/月亮图标，并同步更新为“切换为
  浅色/深色”的提示；点击仍通过既有 SSE 交给前端主题逻辑，不复制第二套切换实现。
- 视觉模型选择器右侧新增无边框清除按钮；只在已配置视觉模型时显示，点击写回 `undefined` 并恢复
  “不启用”状态。
- 模型/档位/智能体只在当前会话 ID 真正变化时初始化；同一会话的列表刷新不再覆盖
  `handleModelChange` 的即时状态，切换成功后仍回写会话列表，失败时仍恢复原选择。
- 新增 `POST /api/panel/title`，前端在会话切换或改名后把当前会话名同步到 IDEA `ToolWindow.title`；
  原生动作栏新增铅笔按钮，通过 `capybara.action` 打开项目 Dialog/Input/Button 实现的重命名弹窗。
- 网页实测通过：Laguna 切到 Big Pickle 后模型按钮立即更新且等待后不回退，随后已还原 Laguna；视觉
  模型选中后清除按钮出现，清除后按钮消失且恢复未配置；模拟 IDEA SSE 后原生标题模式能打开并取消
  “重命名会话”弹窗。
- 验证通过：`pnpm.cmd exec tsc --noEmit`、`pnpm.cmd build`、IDEA 2023.2.4 SDK 下的
  `gradle -p idea-plugin buildPlugin`；所有本轮涉及源码均少于 1000 行，也没有新增原生
  `confirm()` / `alert()`。

---

## 仍未在真实 IDEA 里验证的项（给 Codex 的提醒）

这些改动编译和打包都过了，但**没有在运行中的 IDEA 里点过**，改相关代码时请一并实测：

- 三种审批模式写入会话后是否分别拦截或放行 `edit` / `bash` / `websearch`，以及权限面板回复是否继续执行；
- `reconnectedOnly` 面板是否真的出现（需要用户自己在终端启动 OpenCode 后点重启）；
- 水豚浏览器 OSR 是否真的出画面，以及百度跨 frame 拾取、评论角标、Esc/连续启停是否符合预期
  （状态栏会显示画布尺寸）；
- 外观页选择 `Light` / `IntelliJ Light` / 第三方主题后，插件按钮和系统明暗跟随是否应用精确 LAF；
- `idea_project_context` / `idea_editor_context` / `idea_diagnostics` / `idea_symbol` 在真实项目中的返回内容；
- Git 按钮里点文件是否打开 IDEA 三栏 diff；
- 从 `opencode.jsonc` 删除供应商是否真的写回了文件；
- 工具窗口最小宽度 `stretchWidth` 是否生效。
- 原生顶栏是否按当前 IDEA 主题显示正确的太阳/月亮图标、是否展示当前会话标题，以及铅笔动作保存改名后
  是否立即刷新标题（目标 SDK 已编译通过，网页已用 SSE 模拟验证弹窗链路）。

---

## T14 — IDEA 原生多会话标签与 OpenCode V2 模型链路 `[x]`

### 问题与原因

- React 会话标签不适合 IDEA 狭窄工具窗口；用户需要标签位于 IDEA 原生工具窗顶栏，但普通网页访问仍应
  保持单会话界面，通过历史会话面板切换。
- `/api/model` 是模型目录，可能包含尚未配置凭据、当前不能调用的模型。直接渲染整个目录会让用户选择
  一个看似存在、发送时却没有输出的模型。
- OpenCode V2 的 prompt payload 不再携带模型；模型属于会话状态，必须先调用
  `POST /api/session/{sessionID}/model`，再发送 prompt。供应商密钥也应走 V2 integration/credential，不能
  明文写入 `opencode.jsonc`。
- `VirtualConversation` 给 Virtuoso 的 `scrollerRef` 每次 render 都是新函数；React 会先以 `null` 清理旧
  callback ref，再赋回元素，而回调又把两个值写入 state，形成持续重绘循环。

### Codex 实施记录（实际执行：2026-08-12）

- 新增 IDEA 原生 `NativeSessionTabsController` 和 `POST /api/panel/session-tabs`：标签支持选择、仅关闭视图、
  每标签悬停改名/关闭、长标题省略、完整标题提示、左右滚动和活动标签定位。关闭标签不会删除或停止
  OpenCode 会话，关闭活动标签后选择相邻标签，全部关闭后显示尚未落库的新对话草稿。
- 修正原生标签的标题栏挂载位置：之前把标签作为第一个 `setTitleActions` 动作注册，而 IDEA 会把整组 title
  actions 固定放在标题栏右侧，所以标签内部即使使用左对齐布局也仍会靠右。现在标签单独通过
  `ToolWindowEx.setTabActions` 挂到 IDEA 的 west toolbar，状态、新建、历史、设置等按钮继续留在
  `setTitleActions` 的右侧工具栏，形成“左侧会话标签 + 右侧命令按钮”的原生布局。
- 原生标签不再使用 `JPanel` 在横向 `BoxLayout` 下近乎无限的默认最大宽度；每个标签按省略后标题的实际
  字体宽度和操作按钮区域计算并锁定最小/首选/最大尺寸，因此短名称保持紧凑、不同名称具有不同宽度。
  标题最多显示 18 个 Unicode 字符，超出时显示前 17 个字符和省略号，完整名称继续通过 tooltip 展示；
  编辑/关闭按钮区域提前预留，悬停出现按钮时不会推动后续标签或造成标题栏抖动。
- 修复标签溢出被裁切和切换短暂卡死：标签条改为实现 `Scrollable` 的真实横向视图，显式维护所有标签的
  首选总宽度，布局完成后再把活动标签滚入视口；左右按钮按真实 `contentWidth - extentWidth` 判断状态，
  并使用固定按钮槽位避免显隐时挤动标签。标签视口不再固定为 360px，而是跟随 IDEA 工具窗口宽度扩展，
  只为右侧原生命令按钮预留空间，窄屏时才进入左右滚动。
- 原生标签点击过去会在 IDEA EDT 上同步写入并 `flush()` SSE；当前端连接稍慢时整个 IDEA UI 线程会被拖住。
  现在由项目级单线程 SSE broadcaster 按序后台发送，保持事件顺序但不阻塞标签点击和工具窗口绘制。
- 已打开会话的运行时增加 `messagesLoaded` 缓存标记；切换回已经加载过的会话时直接复用该标签的内存消息，
  仍会异步同步待审批、待办和运行状态，避免每次切换都重新拉取并解析整段消息历史。
- 标签编辑/关闭按钮不再复用标签选择监听，避免一次点击同时发送“关闭/改名”和“选择”两个动作；鼠标从
  标题移到子按钮时延后检查真实指针位置，避免按钮闪烁。上一版全局 `ToolWindow.title` 和全局改名路由已
  删除，每个会话名只存在于对应原生标签中；本项取代 T13 中的全局标题同步方案。
- `nativeTitleActions=1` 只由 IDEA JCEF 加载地址设置。仅该模式同步原生标签并显示连接页的多标签开关、
  最大数量和溢出策略；普通网页不渲染标签条、强制单标签，历史会话选择直接覆盖当前视图。
- “新建会话”先生成本地空白草稿，只有第一条消息真正提交时才调用 OpenCode 创建会话；因此连续点新建
  不会在历史记录中产生空会话。草稿、会话运行状态、消息队列和输入内容按标签隔离。
- 模型列表以 `/api/model` 的模型详情为基础，供应商目录以 `/api/provider` 为准。后续在 2026-08-13
  实测确认 `/config/providers` 不包含通过 V2 auth/运行时加载的 `deepseekCurrent`、`sensenova`，用它过滤会
  误删实际可用的自定义供应商；当前实现已移除该过滤，保留 `/api/model` 返回的有效模型。
- 普通发送、排队后发送和失败重试前统一调用 V2 `POST /api/session/{sessionID}/model`；界面切换模型也
  立即调用同一路由并乐观更新，失败恢复原值。已对照最新源码确认该路由由
  `session.switchModel` 正式提供，避免继续向 V2 prompt 发送已废弃的模型字段。
- 供应商 API Key 不再写入供应商 options；2026-08-13 进一步对照最新源码并实测后，认证改为正式 V2
  `PUT /auth/{providerID}`，删除凭据使用 `DELETE /auth/{providerID}`。自定义供应商仍先由 IDEA 桥接安全
  写入配置，再保存凭据并销毁当前工作区实例，后续请求自动按新配置重建，不停止共享的 65530 服务。
- Virtuoso 的 scroller callback ref 改为稳定的 `useCallback`，且只在元素身份真正变化时写 state，消除
  `Maximum update depth exceeded` 的持续重绘来源。网页实测先确认 65530 已连接、普通网页无标签条；测试
  随后发现该循环并完成修复，修复后的再次浏览器加载被本地 URL 安全策略拦截，因此没有伪造“复测通过”。
- IDEA 原生标签没有替用户启动或操作真实 IDEA，只完成目标 IDEA 2023.2.4 SDK 编译和插件打包；悬停、
  改名、关闭活动标签和左右滚动仍需用户安装新包后点验。

### 2026-08-13 溢出导航与切换性能补修

- 上一版把左右导航按钮包在同一个自定义标签动作内部；IDEA 压缩 west toolbar 时会把整个动作裁掉，
  于是标签已经溢出但按钮也不可见。现在注册为三个独立的原生 `setTabActions`：左箭头、标签视口、
  右箭头。两侧按钮始终保留固定位置，不可滚动时只禁用；中间标签区被压缩后仍可用箭头访问后续会话。
- 标签点击后先在 Swing EDT 本地更新激活下划线并把目标滚入视口，再通过 SSE 通知 JCEF；不再等待
  Kotlin -> SSE -> React -> HTTP -> Kotlin 的完整往返才显示选中状态。
- React 回传的标签标题列表没有变化时，Kotlin 只更新激活样式，不再销毁重建整排标签组件；改名、
  新增或关闭导致结构变化时才重建，避免每次切换都触发标题栏完整布局。
- 已加载会话切回时不再把缓存消息重新送入 `reconcileSessionMessages` 制造一份新数组；会话分组增加
  基于不可变消息数组的 `WeakMap` 缓存，已完成的长会话可以复用分组结果，减少 JCEF 主线程重复解析
  整段历史、重新创建虚拟列表/Markdown 节点造成的停顿。
- `AssistantShell` 的整组消息节点也改为依赖会话轮次、diff 映射和流式状态的 `useMemo`，在标签切换或
  非当前会话的后台状态变化时复用已有 `AssistantMessage` / Markdown React 节点，避免长对话切回时
  再次创建整棵消息树。
- 原生标签选择使用 React transition 提交，让浏览器优先响应当前交互；审批、Todo、会话 busy 状态仍在
  切换后异步校准，不改变后台会话继续接收 SSE 的行为。

### 验证

- `pnpm.cmd exec tsc --noEmit`
- `pnpm.cmd build`
- `gradle -p idea-plugin buildPlugin -PintellijLocalPath="E:\software\IntelliJ IDEA 2023.2.4" --offline --no-daemon`
- `git diff --check`；手写源码单文件均不超过 1000 行；未使用浏览器原生 `confirm()` / `alert()`。

---

## T15 — 供应商认证、模型档位即时同步与 IDEA 偏好持久化 `[x]`

### 问题与原因

- 供应商保存仍调用兼容层的 `POST /api/integration/{providerID}/connect/key`。自定义供应商 ID 不一定存在于
  integration 目录，因此保存 `deepseekCurrent` / `sensenova` 时只得到通用 server error，Key 没有更新到
  OpenCode 的正式认证存储。
- 模型设置页只从 provider catalog 查模型详情，而对话模型来自 `/api/model`。选择自定义模型时，设置页
  当下找不到 variants，回到对话后全局模型刷新又能看到档位，造成“保存后延迟出现”的错觉。
- IDEA JCEF 前端使用随机本地端口，`localStorage` 按 origin 隔离。语言、会话标签、人格、禁用技能、视觉
  模型和档位显示名虽然写入了浏览器缓存，重启 IDEA 换端口后却读不到。
- 模型新增、启停、删除只改配置文件，没有使当前 OpenCode 工作区实例失效；设置页的本地状态和对话页
  重新读取的模型目录可能短暂不一致。
- 停止生成流程仍会先调用当前 OpenCode 明确返回 503 的 `session.wait` 占位接口，再退回 active 轮询，
  带来无意义错误和延迟。

### Codex 实施记录（实际执行：2026-08-13）

- `setProviderAuth` 改为 `PUT /auth/{providerID}`，payload 为 `{ type: "api", key }`；删除凭据改为
  `DELETE /auth/{providerID}`。保存/删除后调用 `POST /instance/dispose` 让当前工作区按新认证重建。
  已在 `http://127.0.0.1:65530` 用临时探针 ID 实测 CORS 预检、PUT 和 DELETE 均返回成功，探针随后删除；
  未读取、输出或写入用户密钥。
- 删除 `/config/providers` 对 `/api/model` 的错误过滤。真实服务中 `/api/provider` 与 `/api/model` 包含
  `deepseekCurrent`、`sensenova`，而 `/config/providers` 不包含它们；当前对话模型列表保留 V2 实际模型。
- `ModelSettings` 接收 App 已加载的 `/api/model` 模型列表，并按 `providerID/modelID` 合并到 catalog；选择
  模型时立即回填上下文、最大输出、模态、reasoning/tool-call 能力和 variants。档位编辑仍保持
  `key -> 显示名称`，不把底层 JSON 参数暴露给用户。
- 所有 `ideaApi.saveProvider` 调用都检查 `success`；配置文件写入失败时立即展示真实错误，不再继续保存凭据
  或显示伪成功。模型保存、启停、删除和供应商删除成功后统一 dispose 工作区实例，使对话页立即读到新数据。
- 新增项目级 `WorkspacePreferencesService`，通过 IntelliJ `PersistentStateComponent` 保存到 workspace.xml；
  Kotlin 提供 `GET/POST /api/preferences`。IDEA 模式启动先读取持久化值并回填本地缓存，网页模式继续使用
  localStorage。保存请求串行化，避免快速切换语言/标签设置时旧请求后到覆盖新值；API Key 不进入该存储。
- 初始化拿到持久化语言后立即调用 `setLocale`，因此语言切换触发 React 根重挂载时会等待正在进行的偏好
  保存，不会重新读取旧语言。会话标签、人格、技能禁用、视觉模型和档位标签使用同一持久化对象。
- 删除未实现的 `session.wait` 调用；停止生成从一开始就轮询 `/api/session/active`，连续三次 idle 后同步消息。
- 使用现有认证对两个自定义模型做了临时会话探针并立即删除会话：消息创建、模型切换和 prompt 入队均成功；
  `deepseekCurrent` 当前存量凭据被上游以 HTTP 401 拒绝，`sensenova` 被上游以 HTTP 403 拒绝。安装新插件后
  需要在供应商页重新保存各自 Key，才能由新的 V2 auth 路由替换旧凭据。
- 网页模式最终以 `/opencode` 同源代理连接 65530 完成复测：对话底部显示 `sensenova-6.8-flash-lite`
  和“关闭”档位；模型设置页加载完成后同时列出 `deepseekCurrent` 与“商汤日日新”。首次展开
  `sensenova-6.8-flash-lite` 就直接显示 `high / low / medium / none` 及“高 / 低 / 中 / 关闭”，无需切回
  对话触发二次刷新。前端生产构建、IDEA SDK 编译和插件打包均已完成，最终 JAR 已核验包含持久化服务、
  `static/index.html` 与最新主 bundle。

### 验证

- `pnpm.cmd exec tsc --noEmit`
- `pnpm.cmd build`
- `gradle -p idea-plugin compileKotlin -PintellijLocalPath="E:\software\IntelliJ IDEA 2023.2.4" --offline --no-daemon`
- `gradle -p idea-plugin buildPlugin -PintellijLocalPath="E:\software\IntelliJ IDEA 2023.2.4" --offline --no-daemon`
- `git diff --check`；本轮涉及的手写源码单文件均不超过 1000 行；未新增浏览器原生
  `confirm()` / `alert()`。

---

## T16 — 原生标签单击/溢出导航与自定义供应商 JSONC 保存 `[x]`

### 问题与原因

- 原生标签切换通过 SSE 通知 React，React 又异步 POST 整份标签快照；多个请求可能乱序到达，旧快照会
  覆盖刚点击的活动标签。前端还使用 `startTransition` 延迟提交，用户因此经常需要点第二次。
- 左右箭头是三个彼此独立的 IDEA action，而 Kotlin 收到任意未改变活动标签的快照仍会执行
  `scrollActiveIntoView()`，用户手动滚动后会立即被拉回活动标签，看起来按钮完全无效。
- `/api/provider` 同时返回内置供应商和来源为 `config` 的用户供应商。设置页只要在目录中找到
  `deepseekCurrent` 就把它当成内置项，保存时进入“只写 V2 auth”的分支，没有调用 JSONC 写入服务。
- OpenCode 最新源码允许自定义供应商同时从 `provider.options.apiKey` 和全局 `auth.json` 获取 Key。只写
  `auth.json` 虽能运行，但不满足用户希望自定义供应商 JSONC 可见、可迁移的配置方式。

### Codex 实施记录（实际执行：2026-08-13）

- 原生标签快照增加单调递增 `revision`，Kotlin 丢弃乱序旧请求；原生点击在 `mousePressed` 阶段立即更新，
  并移除 React `startTransition`，一次点击即可同步选中标签和会话。
- 左箭头、标签视口、右箭头合并为同一个固定宽度的原生标题栏组件，导航按钮直接操作内部 viewport；仅当
  活动标签真的变化时自动滚入视图，普通快照不再撤销用户手动滚动。
- 设置页按 `/provider` 的 `source` 区分内置目录项与用户配置项；`source=config` 的 `deepseekCurrent`、
  `sensenova` 会进入完整 JSONC 保存流程。写入服务优先更新已经包含同 ID 的配置文件，避免同名配置被写到
  错误层级。
- 自定义供应商输入新 Key 时同时写入 JSONC `options.apiKey` 和 OpenCode V2 `PUT /auth/{providerID}`，随后
  dispose 当前工作区实例；内置目录供应商仍只写 V2 auth。未读取或输出任何用户密钥。
- 在 `http://127.0.0.1:65530` 用临时无效探针验证 `PUT /auth` 与 `DELETE /auth` 均为 200，探针已删除；
  检查配置时只统计供应商 ID/字段名，不输出字段值。

### 验证

- `pnpm.cmd exec tsc --noEmit`
- IDEA 2023.2.4 SDK 下的 `gradle -p idea-plugin compileKotlin --offline --no-daemon`
- `pnpm.cmd build`
- `gradle -p idea-plugin buildPlugin -PintellijLocalPath="E:\software\IntelliJ IDEA 2023.2.4" --offline --no-daemon`
- `git diff --check`；本轮涉及手写源码均少于 1000 行，未新增浏览器原生 `confirm()` / `alert()`。

---

## T18 — 根目录 `config.json` 密钥泄露修复 `[x]`

### 问题与原因

- OpenCode V2 的实例级 `PATCH /config?directory=<workspace>` 固定把合并配置写到工作区根目录的
  `config.json`。前端曾用它保存 `disabled_providers` 和 MCP，旧配置里的供应商凭据被深度合并进该文件。
- 该未跟踪文件创建于 2026-08-06 15:32:09、最后修改于 2026-08-13 17:29:46；它不是 Git 或
  `OpenCodeConfigService` 创建的，而是实例级配置接口的落盘行为。

### Codex 实施记录（实际执行：2026-08-14）

- `openCodeApi.updateConfig` 改用 V2 `PATCH /global/config`，配置只写用户级 OpenCode 配置目录，不再携带
  IDEA 项目路径调用实例级写接口。
- Kotlin 供应商保存和删除固定操作 `~/.config/opencode/opencode.jsonc` / `opencode.json`；项目级配置只
  保留审批 permission 临时覆盖，不再承载供应商凭据。
- 迁移前仅比较字段存在性与密钥 SHA-256 是否一致，不输出密钥。用户目录已有的较新供应商配置不覆盖；
  根目录独有的真实旧条目通过 `/global/config` 迁移，测试探针跳过，验证成功后删除根目录敏感副本。
- `.gitignore` 增加 `/config.json` 和备份文件保护，防止旧 OpenCode 客户端意外生成的工作区副本进入 Git。
- 实测 `/global/config` 返回 200、用户级 `opencode.jsonc` 更新，项目根目录未重新生成 `config.json`。
