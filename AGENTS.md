# AI Coding - Agent Guidelines

This repository contains two main components:
1. **Frontend**: React + TypeScript + Vite application (in `frontend/`)
2. **IntelliJ Plugin**: Kotlin-based IntelliJ IDEA plugin (in `idea-plugin/`, plugin name: CapybaraAICodingAssistant)

## Build & Development Commands

### Frontend (`frontend/`)

**Package Manager**: pnpm

```bash
# Install dependencies
pnpm install

# Development server
pnpm dev

# Build (includes type checking)
pnpm build

# Build without type checking
pnpm build:skip

# Preview production build
pnpm preview
```

**Type Checking**: TypeScript strict mode is enabled. Always run `tsc --noEmit` before committing:
```bash
cd frontend && pnpm exec tsc --noEmit
```

**Testing**: No test framework is currently configured. When adding tests, use Vitest (compatible with Vite).

### IntelliJ Plugin (`idea-plugin/`)

**Build Tool**: Gradle (no `gradlew` wrapper — requires Gradle installed globally)

```bash
# Build plugin
gradle build

# Run IDE with plugin for testing
gradle runIde

# Verify plugin compatibility
gradle verifyPlugin

# Compile Kotlin only (faster)
gradle compileKotlin
```

## Code Style Guidelines

### TypeScript/React

**Imports**:
- Group imports: React → Third-party → Local
- Use named imports from `antd` and `@ant-design/icons`
- Type imports: Use `import type { ... }` for type-only imports

```typescript
import React, { useState, useEffect } from 'react'
import { Button, Space, Typography } from 'antd'
import { UserOutlined, RobotOutlined } from '@ant-design/icons'
import type { Message, ChatSession } from '../types'
```

**Components**:
- Use functional components with `React.FC<Props>` typing
- Define props interfaces above component
- Export default at bottom of file

```typescript
interface ComponentNameProps {
  propName: string
  onAction?: () => void
}

const ComponentName: React.FC<ComponentNameProps> = ({ propName, onAction }) => {
  return <div>...</div>
}

export default ComponentName
```

**TypeScript**:
- Always use explicit types for function parameters and return values
- Use interfaces for object shapes, type aliases for unions
- Prefer `const` assertions for literal types
- Use optional chaining (`?.`) and nullish coalescing (`??`)

**Naming Conventions**:
- Components: PascalCase (`.tsx`)
- Hooks: camelCase with `use` prefix
- Types/Interfaces: PascalCase
- Variables/functions: camelCase
- Constants: UPPER_SNAKE_CASE

**Styling**:
- Use CSS variables for theming (`var(--text-primary)`, `var(--bg-tertiary)`)
- Inline styles via `style` prop for component-specific styles
- Use Ant Design's `ConfigProvider` for theme configuration

**Error Handling**:
- Use optional status fields in interfaces
- Handle async errors with try/catch
- Provide user feedback for error states

### Kotlin (IntelliJ Plugin)

**General**:
- Follow Kotlin coding conventions
- Use data classes for DTOs
- Prefer immutability (val over var)
- Use coroutines for async operations

**Build Configuration**:
- Target JVM: 1.8
- Kotlin version: 1.8.22
- IntelliJ Platform: 2022.3 (IC - Community Edition)

## Project Structure

```
capybaraAICodingAssistant/
├── frontend/              # React frontend application
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── chat/
│   │   │   │   ├── MessageContent.tsx  # Message rendering, OpenCodeTag, image/file modals
│   │   │   │   ├── MessageInput.tsx    # Input with contentEditable, paste handling
│   │   │   │   ├── DiffViewer.tsx      # File diff comparison (uses @pierre/diffs)
│   │   │   │   ├── CodeBlock.tsx       # Syntax highlighted code blocks (uses @pierre/diffs File)
│   │   │   │   └── ChatArea.tsx        # Message list container
│   │   │   ├── settings/
│   │   │   │   ├── ModelTab.tsx        # Provider/model management
│   │   │   │   ├── MCPTab.tsx          # MCP server management
│   │   │   │   ├── SkillsTab.tsx       # Skill config with Monaco editor
│   │   │   │   ├── ThemeTab.tsx        # Theme settings
│   │   │   │   └── PermissionsTab.tsx  # Permission rules
│   │   │   ├── SettingsDialog.tsx  # Main settings dialog with modals
│   │   │   ├── AIAssistantPanel.tsx# Main orchestrator (SSE handler, send message)
│   │   │   └── TopToolbar.tsx      # Top toolbar
│   │   ├── types/
│   │   │   └── index.ts            # All TypeScript interfaces
│   │   └── utils/
│   │       ├── kotlinApi.ts        # API client for Kotlin backend
│   │       ├── buildConflictText.ts # Conflict text builder (diff library)
│   │       └── renderSimpleDiff.ts # Simple side-by-side diff renderer (fallback)
│   ├── vite.config.ts   # Output dir: ../idea-plugin/src/main/resources/static
│   └── package.json
├── idea-plugin/           # IntelliJ IDEA plugin
│   ├── src/
│   │   └── main/
│   │       ├── kotlin/com/aicoding/plugin/
│   │       │   ├── server/
│   │       │   │   └── HttpServerManager.kt  # HTTP server, API routes, file ops
│   │       │   ├── services/                  # OpenCode service, AI services
│   │       │   ├── actions/                   # Editor context menu actions
│   │       │   └── ui/                        # JCEF panel, editor management
│   │       └── resources/
│   │           ├── META-INF/plugin.xml         # Plugin descriptor
│   │           └── Capybara.svg               # Plugin icon
│   └── build.gradle.kts
└── AGENTS.md
```

## Key Dependencies

**Frontend**:
- React 18.2 + TypeScript 5.2
- Ant Design 6.1 + Ant Design X 2.4
- Vite 5.0 (build tool)
- pnpm (package manager)
- `@pierre/diffs` — diff viewer and unresolved file merge (web components, Shadow DOM)
- `diff` — line-level and word-level diff computation
- `@ant-design/x-markdown` — Markdown rendering with custom component mapping

**Plugin**:
- Kotlin 1.8.22
- Ktor 2.1.3 (server)
- kotlinx-serialization 1.5.1

## Common Patterns

**State Management**:
- Use React `useState` for local state
- Use Ant Design X SDK providers for chat state

**Message Handling**:
- Messages have `id`, `content`, `role`, `timestamp`, `status`, `parts`
- Support streaming via SSE chunk-based updates
- Message parts: reasoning, tool (bash/read/edit/task), text, file

**Theme Support**:
- Toggle dark/light mode via `ConfigProvider`
- Use CSS variables for dynamic theming
- `body[data-theme='dark']` / `body[data-theme='light']`

**Diff & Merge**:
- `DiffViewer.tsx` uses `@pierre/diffs` `<FileDiff>` with `unsafeCSS` for JCEF compatibility
- Merge modal uses `<UnresolvedFile>` for conflict resolution UI
- `buildConflictText()` constructs conflict markers from `diffLines()`

## Important Notes

1. **No ESLint/Prettier configured**: Follow existing code style manually
2. **TypeScript strict mode**: All code must pass strict type checking
3. **No test framework**: Tests need to be set up when added
4. **Package manager**: Use pnpm for frontend, not npm or yarn
5. **Build validation**: Run `pnpm build` before committing frontend changes
6. **Kotlin build**: Use `gradle` (not `gradlew`) — no wrapper committed
7. **Frontend output**: Vite builds to `../idea-plugin/src/main/resources/static/` (not `frontend/dist/`)
8. **JCEF compatibility**: `@pierre/diffs` uses Shadow DOM / web components; `unsafeCSS` option injects CSS overrides for IntelliJ's JCEF environment
9. **MCP config**: Stored in global `~/.config/opencode/opencode.jsonc` under the `mcp` key; CRUD operations go through Kotlin backend endpoints (not OpenCode API proxy)
