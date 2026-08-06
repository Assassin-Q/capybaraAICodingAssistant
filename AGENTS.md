# AGENTS.md — CapybaraAICodingAssistant

IntelliJ IDEA plugin embedding a React frontend that proxies the local OpenCode server. The plugin serves the built static frontend from the Kotlin HTTP server; no separate dev server is involved at runtime.

## Monorepo layout

```
capybaraAICodingAssistant/
├── frontend/              # React + TypeScript + Vite (Tailwind CSS)
│   └── src/
│       ├── components/
│       │   ├── ai-elements/  # Custom conversation UI (ai-elem pattern): Conversation, PromptInput, Tool, Reasoning, Attachments
│       │   ├── assistant/    # App-specific assistant widgets (shell, message, diffs, settings tabs, todos)
│       │   └── ui/           # shadcn/ui-style Radix components (button, dialog, command, etc.)
│       ├── hooks/            # SSE streaming, run lifecycle, batched events, session diffs
│       ├── lib/              # API clients: opencode.ts (OpenCode REST), idea.ts (IDEA bridge + SSE)
│       ├── types/            # (empty — types live in lib/opencodeTypes.ts)
│       └── index.css         # Tailwind CSS with JCEF-safe legacy hex colors
├── idea-plugin/           # IntelliJ plugin (Kotlin + JDK HttpServer)
│   └── src/main/kotlin/com/aicoding/plugin/
│       ├── server/HttpServerManager.kt  # Built-in HTTP server, API proxy to OpenCode, SSE bridge
│       ├── services/                     # OpenCodeServerManager, MessageService
│       ├── actions/                      # Editor context-menu actions (explain, optimize, test, add to chat)
│       ├── ui/                           # JCEF browser panel, tool-window factory
│       └── resources/META-INF/plugin.xml
└── vite.config.ts → builds to ../idea-plugin/src/main/resources/static
```

## Frontend: commands & conventions

**Package manager:** `pnpm` only (no npm/yarn; lockfile is `pnpm-lock.yaml`).

```bash
cd frontend
pnpm install          # install deps
pnpm dev              # Vite dev server on :5173, proxies /api to http://localhost:10001
pnpm build            # tsc --noEmit && vite build  (ALWAYS typecheck first)
pnpm build:skip       # vite build only (used by gradle buildFrontend task)
pnpm exec tsc --noEmit  # typecheck in isolation
```

- TypeScript strict mode is on (`tsconfig.json`). `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` are enabled — unused code won't compile.
- No ESLint or Prettier. Rely on `tsc` for correctness.
- Path alias `@/` → `./src/`. Import via `@/lib/...`, `@/components/...`, `@/hooks/...`.
- Styling: Tailwind CSS utility classes, not inline styles or CSS modules. Theme colors come from CSS custom properties defined in `index.css` (`:root` for light, `.dark` for dark). Components toggle `.dark` on `<html>` based on IDEA theme (see `App.tsx` init).
- Icons: `lucide-react` (not `@ant-design/icons`).
- shadcn/ui pattern: `cn()` from `@/lib/utils` wraps `clsx` + `tailwind-merge` for conditional classes.
- `components/ui/` components use Radix UI primitives via `Slot.Root` — follow the same forward-ref + `cva` pattern.
- JCEF compatibility: IDEA 2023.2's JCEF cannot resolve `oklch()` or `color-mix()`. `index.css` uses legacy hex colors and a comment explaining this. Do not use oklatch functions.
- Dev mode: when the IDEA bridge is unavailable, `VITE_OPENCODE_BASE_URL` and `VITE_PROJECT_PATH` env vars let the frontend run standalone against a local OpenCode instance.

## IDE bridge vs OpenCode API

- `lib/idea.ts` — calls the **Kotlin backend** (same origin, `/api`, `/opencode-info`, `/project-path`, `/save-file`, `/events` SSE). Used for project path, runtime config, file save, and IDE context events.
- `lib/opencode.ts` — calls the **OpenCode REST API** (base URL configurable; default `http://127.0.0.1:12001`). Used for sessions, models, agents, prompts, permissions, questions, todos, diffs.
- `subscribeOpenCodeEvents` and `subscribeIdeaEvents` both establish `EventSource` (SSE) connections independently.
- Event stream: OpenCode events are SSE `/api/event`; IDEA events are `/events`.
- `useBatchedOpenCodeEvents` batches stream updates (40 ms flush) to reduce re-renders.
- Preferences (persona, disabled skills) are stored in `localStorage` per project path — no backend persistence.

## Kotlin plugin: commands & conventions

**Build tool:** `gradle` (no `gradlew` wrapper — gradle must be installed globally). Version from `build.gradle.kts`.

```bash
cd idea-plugin
gradle build            # builds frontend (pnpm build:skip) then compiles plugin
gradle runIde           # launches a sandbox IDEA with the plugin installed
gradle verifyPlugin     # checks plugin.xml integrity
gradle compileKotlin    # fast compile, skips frontend build
```

- Kotlin 1.9.20, JVM toolchain 17, IntelliJ Platform 2023.2.4 (IC Community Edition).
- `build.gradle.kts` automatically runs `pnpm build:skip` (no typecheck) as a `buildFrontend` task wired into `processResources` and `jar`. The plugin version is read from `frontend/package.json`.
- `intellijLocalPath` gradle property overrides the IntelliJ platform for local sandbox testing: `gradle runIde -PintellijLocalPath=/path/to/idea`.
- Plugin ID: `com.aicoding.ai-coding-plugin`. Tool window: "水豚 AI 助手" (right anchor). Shortcut: `Ctrl+/` to toggle.
- HTTP server uses JDK built-in `com.sun.net.httpserver` (not Ktor) to avoid classloader conflicts — see the comment in `build.gradle.kts`.
- SSE clients are tracked in a `CopyOnWriteArrayList<OutputStream>`; the server broadcasts IDE context events to all connected browsers.

## Build & verification order

1. Frontend changes → run `pnpm build` or `tsc --noEmit` to verify types compile.
2. Kotlin changes → run `gradle compileKotlin` (fast) for syntax, `gradle build` for full validation including frontend bundling.
3. `gradle build` will rebuild the frontend automatically — if `pnpm build:skip` fails (e.g. missing `node_modules`), the plugin build fails too.

## Key gotchas

- Vite outputs to `../idea-plugin/src/main/resources/static/` — never `frontend/dist/`. Importing assets expecting `dist/` will break.
- The frontend references OpenCode API endpoints directly; the Kotlin backend only proxies `/api` and serves static files + IDE bridge. Do not add new OpenCode API calls through the Kotlin backend.
- MCP/Skill configs are managed by `opencode.jsonc` on disk, read/written via OpenCode REST endpoints — the Kotlin backend does not CRUD these directly.
- Session diffs come from the OpenCode `/session/{id}/diff` endpoint — no client-side diff library is used (`diff` and `@pierre/diffs` are not dependencies).
