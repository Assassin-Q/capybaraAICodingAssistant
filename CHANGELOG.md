# Changelog

## 3.0.1 - 2026-08-17

### Conversation and settings polish

- Reworked streaming auto-scroll so a new prompt follows output, upward wheel/scrollbar/touch gestures stop following immediately, reaching the bottom resumes it only during an active run, and final token usage remains visible before follow mode releases.
- Collapsed OpenCode's adjacent model and variant switch records into one model-switch divider.
- Closed transient command, model, reasoning-level, approval, role, Git, and todo overlays before opening settings.
- Added a compact sticky section navigator to Connection settings and aligned all primary section headings and icons.

### IDEA and model configuration

- Added editor/project-tree actions for copying absolute and project-relative paths; both include the real inclusive selection line range when editor text is selected.
- Fixed selection line numbers to use document offsets, preserving blank lines and avoiding visual-line errors from code folding or soft wrapping.
- Renamed the IDEA context-menu group to `Capybara AI Coding` and applied the bundled 16×16 Capybara icon in light and dark themes.
- Expanded model ID suggestions across every provider with case-sensitive fuzzy matching, a pre-indexed non-blocking search path, a scrollable full result list, focus-aware dismissal, and full hover titles for truncated model/provider names.
- Filtered every conversation, vision, and memory model picker from the saved provider/model disable lists, even when an externally managed OpenCode process still has an older configuration cached.
- Reorganized the connection settings into a clearer hierarchy and reduced the desktop settings sidebar to 160px so short navigation labels leave more room for configuration content.

## 3.0.0 - 2026-08-17

### Major rewrite

- Rebuilt the plugin interface around the OpenCode V2 API and the AI Elements conversation patterns.
- Added stable streaming Markdown, reasoning, tool-call grouping, permission prompts, question cards, todo progress, per-turn usage, context occupancy, and native IDEA diffs for changed files.
- Added native IDEA session tabs with overflow navigation, tab-only closing, in-place rename, and draft conversations that are only created after the first prompt.

### OpenCode and model management

- Updated provider authentication, models, reasoning variants, custom providers, skills, plugins, MCP, memory, and model settings for current OpenCode V2 endpoints.
- Added provider/model variant editing, user-level configuration persistence, and clear guidance when an externally managed OpenCode service must be restarted.
- Added configurable approval modes that govern file access, edits, commands, and network access from the composer.

### IDEA integration

- Added IDE-native navigation for file and code references, native modal diffs, file-tree/editor refresh after AI edits, and IDEA save dialogs for downloads.
- Added optional OpenCode bridge capabilities for project context, editor context, diagnostics, symbols, Run/Debug configurations, console output, Maven/Gradle tasks, and the standalone Capybara browser.
- Added live IDEA theme following, explicit light/dark switching, language persistence, responsive settings, and open-source project/author information.

### Reliability and performance

- Fixed duplicate sends, stream redraw flashes, stale thinking placeholders, tab-switch lag, model-selection persistence, and long-conversation performance with virtualized rendering.
- Kept sensitive provider credentials in the user OpenCode configuration rather than the project root.
