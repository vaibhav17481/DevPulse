# DevPulse Agent Instructions

This file is the operating contract for AI agents working in this repository.
Read it before inspecting, planning, or editing code. If a request conflicts with
this document, stop and ask for clarification.

## Product purpose

DevPulse is an intelligent developer operations platform. It is intended to help
software teams understand repository activity, delivery flow, and operational
health by collecting metadata from developer tools and presenting useful
insights in one place.

The product direction is metadata-first: DevPulse is planned to work with
repository and delivery metadata rather than storing or analyzing source code.
Detailed product scope is documented in `docs/PROJECT_OVERVIEW.md`.

## Approved technology stack

| Area | Technology |
| --- | --- |
| Repository | pnpm monorepo |
| Frontend | Next.js, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | NestJS, TypeScript |
| Database | PostgreSQL, Prisma |
| Background processing | Redis, BullMQ |
| Architecture | Modular monolith with an independent worker |

Do not add frameworks, databases, queues, state managers, test frameworks, or
other major tools without explicit approval. Do not replace an approved
technology with a preferred alternative.

## Repository status

The approved architecture is larger than the current implementation. At the time
of writing, only the root pnpm workspace and foundational documentation exist.
Applications, packages, PostgreSQL, Redis, and Prisma have not been implemented
yet. Always consult `docs/PROGRESS.md` before assuming a feature exists.

## Architecture rules

DevPulse is a modular monolith with one API deployable and one independent worker
deployable. Both share domain code and one PostgreSQL database. This is not a
microservice architecture.

Planned package responsibilities:

| Path | Responsibility |
| --- | --- |
| `apps/web` | Next.js browser application |
| `apps/api` | NestJS HTTP API and job producers |
| `apps/worker` | BullMQ consumers and scheduled background work |
| `packages/shared` | Framework-agnostic types, constants, and pure utilities |
| `packages/database` | Prisma schema, migrations, and database client access |
| `packages/core` | Shared business use cases; created only when needed |

Dependency direction:

```text
packages/shared      -> no internal package dependencies
packages/database    -> may depend on shared only if necessary
packages/core        -> may depend on shared and database
apps/api             -> may depend on core, database, and shared
apps/worker          -> may depend on core, database, and shared
apps/web             -> may depend on shared only
```

Rules:

- No package may import from `apps/*`.
- Applications must not import from another application.
- `apps/web` must not access PostgreSQL or Redis directly.
- `apps/worker` must not expose a public HTTP API.
- The API and worker communicate through the database and BullMQ job contracts,
  not through direct application-to-application calls.
- Business logic shared by the API and worker belongs in `packages/core`; do not
  duplicate it in both applications.
- Keep framework-specific code at the application edge.

## TypeScript and coding conventions

- Use TypeScript everywhere. Avoid `any`; prefer precise types or `unknown` with
  explicit narrowing.
- Follow the shared strict settings in `tsconfig.base.json`.
- Use package names for cross-package imports, not relative paths across package
  boundaries or `tsconfig` path aliases that hide dependencies.
- Keep modules small and focused on one responsibility.
- Validate untrusted input at boundaries such as HTTP handlers, webhooks, and
  job payloads.
- Use explicit return types for exported functions when the type is not obvious.
- Prefer named exports and clear names over abbreviations.
- Add comments only when they explain non-obvious intent. Do not narrate code.
- Follow existing formatting and structure. Do not introduce a formatter or
  linter configuration without approval.
- Handle errors deliberately; do not swallow failures silently.
- Keep secrets and server-only configuration out of browser bundles.

## Security and privacy requirements

- Never commit secrets, tokens, private keys, passwords, or real credentials.
- Commit `.env.example` files only; never commit `.env` files.
- Only variables prefixed with `NEXT_PUBLIC_` may reach the browser.
- Treat GitHub tokens and installation credentials as highly sensitive. They must
  remain server-side and must not be logged or returned to the client.
- Enforce authentication and workspace authorization on every workspace-scoped
  operation. Never trust a `workspaceId` supplied by a client without checking
  membership.
- Prevent cross-workspace data access and test this explicitly.
- Follow the metadata-first principle: do not store repository source code,
  diffs, or file contents unless a future approved requirement explicitly allows
  it.
- Minimize collected personal data. Do not log secrets, tokens, full request
  bodies, or unnecessary personal information.
- Use least-privilege permissions for GitHub and infrastructure integrations.
- Do not add a dependency with unknown maintenance status or unnecessary
  capabilities.

## Database and migration rules

- All Prisma schema and migration files belong in `packages/database`.
- Applications and other packages must not maintain separate schemas.
- Every schema change must use a committed Prisma migration. Do not edit applied
  migrations.
- Do not use `prisma db push` for shared or production environments.
- Review destructive migrations or data-loss risks with the developer before
  applying them.
- Preserve workspace isolation in data models, queries, and unique constraints.
- Use transactions for multi-step writes that must remain consistent.
- Do not create database schemas, migrations, or models until the relevant
  milestone authorizes database implementation.
- Keep migration names descriptive and predictable.

## Testing requirements

- New functionality must include tests appropriate to its risk.
- Shared business logic requires unit tests.
- API endpoints require request-level or integration tests, including
  authorization and workspace-isolation cases.
- Database-affecting changes require tests against a real PostgreSQL instance or
  a clearly documented equivalent approved by the developer.
- Worker processors require tests for success, retry, and failure behavior.
- Do not claim something is tested unless the relevant tests were executed.
- If no test framework exists yet, propose one and wait for approval instead of
  silently adding it.

## Change discipline

- Inspect existing files before editing them.
- Work only on the explicitly assigned task.
- Do not modify unrelated files or perform opportunistic refactors.
- Preserve existing working code and public behavior unless the task requires a
  change.
- Do not install dependencies or run setup commands unless the task authorizes
  it.
- Do not add unnecessary dependencies or abstractions.
- Do not make a major architectural change without explicit developer approval.
- Update the relevant documentation and `docs/PROGRESS.md` when a milestone
  changes repository state.
- Do not commit, amend, push, or create pull requests unless explicitly asked.

## Verification and claims

Before reporting completion:

1. Run the relevant build, typecheck, lint, and test commands when available.
2. Verify the result of each command rather than assuming success.
3. Report commands that could not be run and explain why.
4. Clearly distinguish implemented behavior from planned behavior.
5. Never claim a feature is implemented, fixed, or tested unless it was verified.

## Commands and environment

Use documented root scripts from `package.json` where possible. If required
tooling is missing, report it instead of installing or configuring it without
approval. Avoid destructive commands, especially database resets, migrations
against shared environments, and forced Git operations.
