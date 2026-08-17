# Changelog

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
