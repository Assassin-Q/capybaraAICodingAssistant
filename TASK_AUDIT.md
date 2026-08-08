# Capybara AI Coding Assistant V3 - Completion Audit

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
      Navigation verified: 连接 / 模型 / 人格 / 记忆 / 技能 / 插件 / MCP / Git / IDEA / 清单.
- [x] Theme follows IDEA live and also supports an explicit plugin light/dark toggle.
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
