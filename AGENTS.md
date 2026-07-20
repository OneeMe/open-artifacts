# Agent Engineering Rules

## Project Shape

- Use `apps/*` for deployable or runnable applications.
- Use `packages/*` for reusable libraries and infrastructure.
- Keep the repository root for workspace config, CI, scripts, docs, and agent instructions only.
- Do not put product application source directly under root `src/`.

## Web App Slot

- `apps/web` is intentionally stack-neutral.
- Do not add Next.js, Vite, React, Astro, or any other web framework until the project chooses one explicitly.
- After a stack is chosen, keep framework-specific files inside `apps/web`.

## Project Bootstrap

- From `onee-workspace`, create new products with `make create-product name=<project-name>`.
- For direct GitHub template usage, clone into the intended lowercase kebab-case directory and run `npm install`.
- `npm install` derives the project name from the clone directory and initializes package names, workspace scope, lockfile, README, dependencies, and Git hooks.
- 首次运行 `npm install` 后，必须先完成 **项目上下文** 中的全部字段再开始实现；只要仍有字段为 `TBD`，项目 setup 就不算完成。
- Do not manually search and replace `onee-product-template` or `@template/*`; keep identity changes in the install lifecycle scripts.
- Initialization is idempotent and must not overwrite custom workspace package names.

## 项目上下文

- **项目背景 / 核心问题：** AI 生成的高密度结果往往被限制在线性 Markdown、某个平台中的临时网页或不可继续维护的编译产物中。即使 Agent 能打开页面，也缺少稳定方式理解当前业务状态、执行语义动作、观察变化并把源码交还给用户。
- **长期目标：** 建立面向 Coding Agent 的 source-first Artifact Package Runtime，让人和 Agent 围绕同一个可运行网页产物协作；产物应当可运行、可观察、可操作、可审计、可复现并可直接 fork 为用户拥有的源码。
- **当前阶段目标：** 基于现有 `oa` CLI、Runtime Session 和 Video Editor Artifact，定义并验证协议中立的 Public State 与 Tool Capability Contract，由 OA Runtime 统一管理 session、revision、actor、冲突和审计，再适配 WebMCP、MCP、CLI 和浏览器验证。
- **关键结果：**
  - Artifact Package 只定义一次 Public State 和语义 Tool，人的 UI、WebMCP、MCP 与 CLI 复用同一个 Dispatcher 和 Handler。
  - Agent 能读取当前 Snapshot、持续变化和历史 revision，而不依赖 React Fiber、DOM 点击或私有 DevTools 协议。
  - 在 Video Editor 上完成“读取当前项目 → 执行语义编辑 → 权威状态更新 → 同一 UI 可见变化 → 回读与视觉验证”的端到端闭环。
  - 使用测试覆盖 Schema 校验、revision 冲突、幂等调用、actor、审计、刷新重连和不支持 WebMCP 时的正常降级。
  - 至少有另一个 Adapter 能枚举和调用同一 Tool Registry，证明 Artifact Package 没有绑定单一协议。

## Quality Gates

Before considering work complete, run the narrowest relevant check. For broad changes, run:

```bash
npm run lint
npm run test
npm run e2e
```

The deterministic quality chain is:

```text
lint -> test -> e2e
```

- `npm run lint`: deterministic static checks, including formatting, ESLint, and TypeScript.
- `npm run test`: isolated unit tests; do not call real external services or models.
- `npm run e2e`: integration tests across assembled application boundaries.
- `npm run eval`: evaluations that call real models with explicit datasets, rubrics, and pass thresholds. Do not replace those model calls with mocks.
- Run `npm run eval` explicitly or through the protected Model Eval workflow because it can consume credentials and incur model cost.
- Keep these command names stable when adopting framework-specific runners.
- `npm run build` is a separate packaging/deployment check.

## Directory Boundaries

- `apps/android`: Android product slot; keep stack-neutral until the project selects native Android or a cross-platform framework.
- `apps/ios`: iOS product slot; keep stack-neutral until the project selects native iOS or a cross-platform framework.
- `apps/web`: user-facing web product.
- `apps/server`: backend service or API runtime.
- `packages/domain`: pure business rules.
- `packages/database`: persistence schema, migrations, models, repositories.
- `packages/ui`: reusable UI primitives/components.
- `packages/config`: typed shared configuration.
- `packages/testing`: test helpers and fixtures.
- `packages/utils`: small framework-agnostic utilities.

Keep features close to the app that owns them. Extract into `packages/*` only when code is reused or represents a stable boundary.

## Pull Request Merge Policy

- Pull requests targeting `main` may use merge commits or rebase merges.
- Do not squash merge pull requests.
- With GitHub CLI, use `gh pr merge <number> --merge` or `gh pr merge <number> --rebase`; never use `--squash`.

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues in `MivoAI/open-artifacts`. External PRs are treated as a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default label strings: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` at the repo root with `docs/adr/` for architectural decisions. See `docs/agents/domain.md`.
