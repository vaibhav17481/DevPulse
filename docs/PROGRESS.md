# DevPulse Progress

Last updated: 2026-11-05

## Status legend

- **Completed** - implemented and verified, subject to the noted review.
- **In progress** - work exists but has not completed review.
- **Not started** - no implementation work has begun.
- **Blocked** - waiting on a decision or dependency.

## Current status

| Phase | Status | Notes |
| --- | --- | --- |
| Phase 1: Foundation and Documentation | Completed | Batches 1 and 2 complete |
| Phase 2: Local Infrastructure and Database Foundation | In progress | Batch 3 adds local PostgreSQL and Redis; Batch 5B adds the Prisma 7 database package; Batch 5C adds the initial schema; Batch 6B adds the `init_devpulse` migration; Batches 6C and 6D verify authentication and session flows, and Batches 7B through 7D verify workspace creation, listing, retrieval, updates, and deletion on isolated PostgreSQL instances; Batch 7E adds database-enforced workspace ownership invariants and an integration test. Batch 8G adds PostgreSQL integration tests for existing project/repository workspace constraints. The Docker Compose development database is not migrated or verified |
| Phase 3: Shared Contracts and Core Skeleton | Not started | No `packages/shared` or `packages/core` yet |
| Phase 4: Authentication and Workspace Management | In progress | Batch 6D adds login, database-backed session validation, an authentication guard, current-user lookup, and logout; Batch 7A adds authenticated workspace creation with an initial `OWNER` membership; Batch 7B adds membership-filtered workspace listing and retrieval; Batch 7C adds owner/admin workspace detail updates; Batch 7D adds owner-only transactional workspace deletion; Batch 7E adds database-enforced last-owner protection and documents the planned ownership-transfer design; Batch 8B adds authenticated project creation with owner/admin authorization, validation, atomic project-plus-repository creation, and a GitHub repository resolver seam. Successful project creation is blocked until GitHub App repository verification is implemented. Batch 8C adds membership-authorized, workspace-scoped project listing with repository details, deterministic ordering, and offset pagination. Batch 8D adds membership-authorized, workspace-scoped individual project retrieval with explicit repository mapping. Batch 8E adds owner/admin, workspace-scoped project updates with partial name/description validation and repository preservation. Batch 8F adds owner/admin, workspace-scoped project deletion with transaction-scoped removal of project aggregate records, local repository deletion for the project, repository-scoped webhook cleanup, preservation of GitHub installation and unrelated workspace data, and 204 No Content responses. Batch 8G hardens project creation to require an `ACTIVE` installation, expands validation and inactive-installation test coverage, and adds PostgreSQL integration tests for existing project/repository workspace constraints. Member management, invitations, role changes, ownership transfer, and broader RBAC remain unimplemented |
| Phase 5: GitHub Metadata Integration | Not started | GitHub App is the selected approach; not implemented |
| Phase 6: Repository and Pull Request Metadata | Not started | Not implemented |
| Phase 7: Background Worker and Sync Reliability | In progress | Independent worker scaffold added; BullMQ consumers and sync reliability not started |
| Phase 8: Deployment and CI Metadata | Not started | Not implemented |
| Phase 9: Metrics and Insights Backend | Not started | Not implemented |
| Phase 10: Web Application Foundation | In progress | Next.js scaffold added; authentication and UI features not started |
| Phase 11: Dashboard and Insights UI | Not started | Not implemented |
| Phase 12: Hardening, Deployment, and MVP Release | Not started | Not implemented |

## Batch history

### Batch 1: Root workspace setup

Status: **Completed**

Delivered:

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `.gitignore`
- `README.md`
- Git repository initialized on `main`

Verification reported during implementation:

- Node.js version: `v22.22.1`
- pnpm: not installed at the time of verification
- `package.json` and `tsconfig.base.json` parsed as valid JSON
- Ignore rules verified for `node_modules/`, `.env`, and generated Prisma output
- No dependencies installed
- No Git commit created

Known gaps:

- pnpm has not been installed.
- `pnpm-lock.yaml` has not been generated.
- The exact pnpm version is not pinned.

### Batch 2: Project instructions and documentation

Status: **Completed**

Created:

- `AGENTS.md`
- `docs/PROJECT_OVERVIEW.md`
- `docs/ARCHITECTURE.md`
- `docs/DATABASE_DESIGN.md`
- `docs/API_CONTRACT.md`
- `docs/DEVELOPMENT_ROADMAP.md`
- `docs/PROGRESS.md`

Verification status:

- Documentation has been written.
- No application code was created.
- No database schema or migration was created.
- No dependencies were installed.

### Batch 3: Local Docker infrastructure

Status: **Completed**

Created:

- `docker-compose.yml`
- `.env.example`

Modified:

- `README.md`
- `docs/PROGRESS.md`

Delivered:

- PostgreSQL 17.11 Alpine service with a persistent named volume
- Redis 7.4.12 Alpine service configured for BullMQ
- Health checks for both services
- Loopback-only host port bindings
- Environment-variable-based configuration with safe local defaults
- `unless-stopped` restart policies

Verification status:

- `docker compose config` parsed successfully.
- `.env` and `.env.local` are ignored; `.env.example` is not ignored.
- Docker daemon was unavailable, so containers were not started and runtime
  health checks were not executed.
- No application, Prisma schema, migration, or dependency was added.

### Batch 4A: Next.js frontend scaffolding

Status: **Completed**

Created:

- `apps/web/` Next.js application using the App Router and `src/` directory
- `apps/web/package.json`
- `apps/web/tsconfig.json`
- `apps/web/next.config.ts`
- `apps/web/eslint.config.mjs`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/README.md`
- `apps/web/AGENTS.md` generated by create-next-app
- Root `pnpm-lock.yaml`

Modified:

- `pnpm-workspace.yaml` to keep pnpm build approvals at the workspace root
- Root `README.md` to document the frontend commands
- `docs/PROGRESS.md`

Delivered:

- Next.js 16.4.3 with React 19.3.0 and TypeScript
- Tailwind CSS 4 through the Next.js Turbopack integration
- ESLint with `eslint-config-next`
- `@/*` import alias mapped to `src/*`
- TypeScript configuration extending the shared `tsconfig.base.json`
- Workspace `typecheck` script using Next.js route type generation

Verification status:

- `pnpm install` completed from the repository root.
- `pnpm --filter web lint` passed with no reported lint errors.
- `pnpm --filter web typecheck` passed.
- `pnpm --filter web build` passed and generated static routes.
- No `apps/api`, `apps/worker`, backend code, Prisma schema, or business feature
  was created.
- pnpm reports a deprecation warning for ESLint 9.39.5. ESLint 10 is not yet
  compatible with the plugins used by `eslint-config-next` 16.4.3, so ESLint 9
  remains selected.

### Batch 4B: NestJS backend scaffolding

Status: **Completed**

Created:

- `apps/api/` NestJS application
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/tsconfig.build.json`
- `apps/api/nest-cli.json`
- `apps/api/eslint.config.mjs`
- `apps/api/src/main.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/app.controller.ts`
- `apps/api/src/app.service.ts`
- `apps/api/src/app.controller.spec.ts`
- `apps/api/test/app.e2e-spec.ts`
- `apps/api/test/jest-e2e.json`
- `apps/api/README.md`

Modified:

- `pnpm-workspace.yaml` to approve the `@parcel/watcher` build required by Jest
- Root `README.md` to document backend commands and the API port
- `docs/PROGRESS.md`
- Root `pnpm-lock.yaml` after dependency installation

Delivered:

- NestJS 11.2.8 with Express
- Standard application module, controller, and service structure
- ESLint 9 with type-aware TypeScript rules
- Jest 30 unit testing and Supertest end-to-end testing
- TypeScript configuration extending the shared `tsconfig.base.json`
- Development, build, production start, lint, typecheck, and test scripts
- API default port `3001` to avoid conflicting with the frontend

Version decision:

- Nest CLI 12 now generates oxlint and Vitest and uses ESM-only packages. That
  conflicts with the approved ESLint, Jest, and Supertest stack, so the Nest 11
  line was used instead.
- The Nest scaffold's optional Prettier integration was removed because Prettier
  was not part of the approved tooling.

Verification status:

- `pnpm install` completed from the repository root after approving the
  `@parcel/watcher` build script.
- `pnpm --filter api lint` passed.
- `pnpm --filter api typecheck` passed.
- `pnpm --filter api test` passed: 1 suite and 1 test.
- `pnpm --filter api test:e2e` passed: 1 suite and 1 test.
- `pnpm --filter api build` passed.
- A production-build smoke test returned `Hello World!` from the running API.
- No worker, Prisma schema, authentication, GitHub, Redis, BullMQ, or business
  feature was added.

### Batch 4C: Independent background worker scaffolding

Status: **Completed**

Created:

- `apps/worker/` standalone Node.js application
- `apps/worker/package.json`
- `apps/worker/tsconfig.json`
- `apps/worker/tsconfig.build.json`
- `apps/worker/eslint.config.mjs`
- `apps/worker/src/main.ts`
- `apps/worker/src/worker.ts`
- `apps/worker/test/worker.test.ts`
- `apps/worker/README.md`

Modified:

- `pnpm-workspace.yaml` to approve the `esbuild` build script required by `tsx`
- Root `README.md` to document the worker commands
- `docs/PROGRESS.md`
- Root `pnpm-lock.yaml` after dependency installation

Delivered:

- Workspace package named `worker`
- Standalone TypeScript process with no HTTP server
- Clear startup logging that identifies the DevPulse worker
- Idle keep-alive timer until BullMQ owns the worker lifecycle
- Idempotent SIGINT and SIGTERM handling that clears the timer and logs shutdown
- `tsx` development runner with watch mode
- TypeScript production build using the shared root configuration
- ESLint with type-aware TypeScript rules
- Node.js built-in test runner executed through `tsx`
- Development, build, production start, lint, typecheck, and test scripts

Tooling decisions:

- The worker uses Node.js built-in tests instead of Jest because this milestone
  contains only process lifecycle behavior. Jest remains part of `apps/api`.
- `tsx` requires an approved `esbuild` build script in `pnpm-workspace.yaml`.

Verification status:

- `pnpm install` initially failed with `ERR_PNPM_IGNORED_BUILDS` for `esbuild`.
  After approving that build script, installation completed.
- `pnpm -r list --depth -1` recognizes `worker@0.0.1` as a workspace package.
- `pnpm --filter worker lint` passed.
- `pnpm --filter worker typecheck` passed.
- `pnpm --filter worker test` passed: 1 test.
- `pnpm --filter worker build` passed.
- `pnpm --filter worker start:dev` logged the startup message and occupied no
  TCP port.
- SIGINT to the worker foreground process group logged signal receipt and
  shutdown completion, and both the worker and pnpm wrapper exited.
- `pnpm --filter worker start:prod` started the compiled worker and handled
  SIGTERM. The direct worker process exited with status 0. The pnpm wrapper
  reported a lifecycle message because the wrapper's process group received the
  test signal.
- No Redis, BullMQ, Prisma, GitHub webhook, job processor, HTTP server, or
  business feature was added.

### Batch 5A: Database design and tenancy decision

Status: **Completed**

Modified:

- `docs/DATABASE_DESIGN.md`
- `docs/ARCHITECTURE.md`

Delivered:

- Finalized the MVP tenancy rule: every Project belongs to exactly one
  Workspace, and every connected GitHub Repository belongs to exactly one
  Project and therefore exactly one Workspace.
- Documented global uniqueness of the GitHub external repository identifier
  among active connections.
- Documented repository disconnection as separate from repository data deletion.
- Documented retention-policy handling for historical data after disconnection.

Verification status:

- Documentation-only change.
- No application code, Prisma schema, migration, or dependency was added.

### Batch 5B: Prisma database package

Status: **Completed**

Created:

- `packages/database/package.json`
- `packages/database/tsconfig.json`
- `packages/database/tsconfig.build.json`
- `packages/database/prisma.config.ts`
- `packages/database/prisma/schema.prisma`
- `packages/database/src/client.ts`
- `packages/database/src/index.ts`

Modified:

- `pnpm-workspace.yaml` to approve the Prisma build scripts
- `.gitignore` to ignore the generated Prisma client path
- `docs/PROGRESS.md`
- `docs/ARCHITECTURE.md`
- `docs/DATABASE_DESIGN.md` document status
- Root `pnpm-lock.yaml` after dependency installation

Delivered:

- `@devpulse/database` workspace package
- Prisma 7.10.1 with exactly pinned `@prisma/client` 7.10.1,
  `@prisma/adapter-pg` 7.10.1, `pg` 8.23.1, and `dotenv` 18.0.9
- Prisma 7 `prisma-client` generator emitting CommonJS to
  `packages/database/src/generated/prisma`
- `prisma.config.ts` loading the root `.env` and using `DATABASE_URL`
- Shared `createDatabaseClient` factory using the PostgreSQL driver adapter
- Explicit failure when `DATABASE_URL` is missing
- Package scripts for generation, build, typecheck, schema validation, schema
  formatting, migrations, and Prisma Studio
- Minimal schema scaffolding with no application models

Decisions:

- Prisma 8 is currently a release candidate, so the stable Prisma 7.10.1 line is
  pinned.
- The generated client uses CommonJS to match the existing NodeNext/CommonJS
  API and worker builds without changing their module systems.

Verification status:

- `pnpm install` completed after approving the `@prisma/engines` and `prisma`
  build scripts.
- `pnpm --filter @devpulse/database generate` passed and generated Prisma Client
  7.10.1.
- `pnpm --filter @devpulse/database db:validate` passed.
- `pnpm --filter @devpulse/database typecheck` passed.
- `pnpm --filter @devpulse/database build` passed.
- Root `pnpm typecheck` passed for all workspace projects.
- Root `pnpm build` passed for all workspace projects.
- Root `pnpm lint` passed for the existing applications. The database package has
  no lint configuration yet.
- Root `pnpm test` passed: API 1 suite/1 test and worker 1 test. The database
  package has no test framework yet.
- CommonJS smoke test required the built package, confirmed the expected exports,
  constructed a client, and resolved `$disconnect`.
- Missing-`DATABASE_URL` smoke test threw the expected error.
- Docker was unavailable, so a live PostgreSQL connection test and migrations
  were not run.
- No application models, migrations, seed data, Redis/BullMQ integration,
  authentication, or GitHub integration was added.

### Batch 5C: Initial database schema

Status: **Completed**

Created or modified:

- `packages/database/prisma/schema.prisma`
- `docs/DATABASE_DESIGN.md`
- `docs/PROGRESS.md`
- `docs/ARCHITECTURE.md` to reflect the initial schema status

Delivered:

- `User`, `Session`, `Workspace`, `WorkspaceMember`, `WorkspaceInvitation`,
  `Project`, `GitHubInstallation`, `Repository`, `WebhookEvent`, `PullRequest`,
  `Issue`, `WorkflowRun`, `RiskAssessment`, and `Recommendation` models
- Explicit enums for workspace roles, invitation state, GitHub account and
  installation state, repository visibility and connection state, pull request
  and issue state, workflow run state and conclusion, webhook processing state,
  and recommendation status
- UUID internal identifiers, `BigInt` GitHub identifiers, and PostgreSQL
  `timestamptz(6)` timestamps
- Snake_case table and column mappings with Prisma camelCase fields
- Composite foreign keys that keep repositories, engineering activity, risk
  assessments, and recommendations aligned with their owning workspace
- Unique constraints for external GitHub identifiers, workspace memberships,
  repository activity, webhook delivery IDs, and token hashes
- Indexes for workspace-scoped queries, foreign keys, state filters, retry scans,
  and time-based analytics
- Restrictive deletion behavior for historical and integration records, with
  cascading deletion limited to authentication and membership artifacts

Decisions:

- `Project` was added as a supporting model because the required relationships
  depend on it even though it was omitted from the Batch 5C model list.
- The existing Prisma 7.10.1 configuration, CommonJS generator output, adapter,
  and package conventions were preserved.
- Raw webhook payloads are not stored. Webhook events retain delivery metadata,
  status, retry information, and optional installation/repository references.
- Risk and recommendation evidence use `jsonb` because the evidence shape is
  algorithm-specific and must remain explainable without storing source code.
- Repository disconnection is represented by connection status and timestamps;
  repository data deletion remains a separate operation.
- The at-least-one-owner workspace rule was initially documented as an
  application-level transactional invariant; Batch 7E added database trigger
  enforcement.

Verification status:

- `pnpm --filter @devpulse/database db:validate` passed.
- `pnpm --filter @devpulse/database db:format` passed.
- `pnpm --filter @devpulse/database generate` passed and generated Prisma Client
  7.10.1 with the new models.
- `pnpm --filter @devpulse/database typecheck` passed.
- `pnpm --filter @devpulse/database build` passed.
- Root `pnpm typecheck` passed for all workspace projects.
- Root `pnpm build` passed for all workspace projects.
- Root `pnpm lint` passed for the existing applications. The database package has
  no lint configuration yet.
- Root `pnpm test` passed: API 1 suite/1 test and worker 1 test. The database
  package has no test framework yet.
- At the time of Batch 5C, no migration had been created or applied and no live
  PostgreSQL runtime integration had been verified. Batch 6B later added and
  verified the initial migration.
- No API endpoints, authentication logic, webhook handlers, seed data, or
  application code were added.

### Batch 6B: Email/password registration

Status: **Completed for code, migration creation, and isolated live PostgreSQL
verification.** The Docker Compose development database has not been migrated or
used for live verification because Docker access is unavailable.

Created:

- `apps/api/src/auth/auth.constants.ts`
- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/auth/auth.module.ts`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/auth/auth.types.ts`
- `apps/api/src/auth/email.ts`
- `apps/api/src/auth/password.service.ts`
- `apps/api/src/auth/dto/register.dto.ts`
- `apps/api/src/auth/auth.service.spec.ts`
- `apps/api/src/auth/password.service.spec.ts`
- `apps/api/src/database/database.module.ts`
- `apps/api/src/database/database.service.ts`
- `apps/api/src/app.setup.ts`
- `apps/api/src/environment.ts`
- `apps/api/test/auth.e2e-spec.ts`
- `packages/database/prisma/migrations/migration_lock.toml`
- `packages/database/prisma/migrations/20261102064516_init_devpulse/migration.sql`

Modified:

- `README.md`
- `apps/api/README.md`
- `apps/api/package.json`
- `apps/api/src/app.module.ts`
- `apps/api/src/main.ts`
- `apps/api/test/app.e2e-spec.ts`
- `docs/API_CONTRACT.md`
- `docs/ARCHITECTURE.md`
- `docs/DATABASE_DESIGN.md`
- `docs/DEVELOPMENT_ROADMAP.md`
- `docs/PROGRESS.md`
- `docs/PROJECT_OVERVIEW.md`
- Root `pnpm-lock.yaml` after dependency installation

Delivered:

- `POST /auth/register` endpoint with `201 Created` success responses
- Email normalization through trimming and lowercasing before validation,
  duplicate checks, and storage
- Email validation with a 320-character maximum
- Password policy requiring 12-128 characters with at least one letter and one
  number
- Unknown request fields rejected through a global NestJS `ValidationPipe`
- Argon2id password hashing using `@node-rs/argon2` 2.2.2 with 19 MiB memory,
  two passes, parallelism of one, and a 32-byte output
- Shared `@devpulse/database` client access through a NestJS database service
- Duplicate email handling through a pre-check and Prisma `P2002` unique
  constraint protection
- Safe responses containing only user `id` and `email`
- Generic error responses for unexpected database failures
- Unit tests for registration and password hashing
- HTTP integration tests using Jest, Supertest, and a mocked database service
- Initial `init_devpulse` Prisma migration for the complete Batch 5C schema
- Live registration verification against an isolated PostgreSQL instance,
  including persistence, Argon2id hash verification, normalized email, duplicate
  conflict behavior, and cleanup of the test user

Verification status:

- `pnpm --filter @devpulse/database exec prisma migrate dev --name init_devpulse`
  created and applied the initial migration against an isolated empty PostgreSQL
  18.6 database.
- `pnpm --filter @devpulse/database generate` passed.
- `pnpm --filter @devpulse/database exec prisma migrate status` reported
  `Database schema is up to date!` for the isolated verification database.
- Live verification produced `201 Created`, the response contained only `id` and
  `email`, and the stored email was normalized.
- The stored password hash was Argon2id and verified against the submitted
  password without exposing the password or hash.
- A duplicate registration using the same normalized email returned `409`.
- Exactly one test user row existed during verification; it was deleted by ID and
  the `users` table returned to zero rows.
- Root `.env` is missing, the Docker socket is not accessible to the current user,
  and the system PostgreSQL on port 5432 rejects the documented local defaults.
  The Docker Compose development database therefore remains unmigrated and
  unverified.
- `pnpm --filter api typecheck` passed.
- `pnpm --filter api lint` passed.
- `pnpm --filter api test --runInBand` passed: 3 suites and 7 tests.
- `pnpm --filter api test:e2e --runInBand` passed: 2 suites and 6 tests.
- `pnpm --filter api build` passed.
- Root `pnpm typecheck` passed.
- Root `pnpm lint` passed.
- Root `pnpm test` passed: API 3 suites/7 tests and worker 1 test.
- Root `pnpm build` passed.
- No session creation, cookies, login, logout, password reset, email
  verification, OAuth/GitHub authentication, frontend UI, or schema change was
  added.

### Batch 6C: Login, opaque sessions, and session cookies

Status: **Completed for code, tests, and isolated PostgreSQL verification.** The
Docker Compose development database remains unmigrated and unverified.

Created:

- `apps/api/src/auth/dto/login.dto.ts`
- `apps/api/src/auth/session.constants.ts`
- `apps/api/src/auth/session-cookie.ts`
- `apps/api/src/auth/session-cookie.spec.ts`
- `apps/api/src/auth/session-token.ts`
- `apps/api/src/auth/session.service.ts`
- `apps/api/src/auth/session.service.spec.ts`
- `apps/api/src/cors.ts`
- `apps/api/src/cors.spec.ts`
- `apps/api/test/auth-login.e2e-spec.ts`

Modified:

- `.env.example`
- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/auth/auth.module.ts`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/auth/auth.service.spec.ts`
- `apps/api/src/auth/auth.types.ts`
- `apps/api/src/auth/password.service.ts`
- `apps/api/src/auth/password.service.spec.ts`
- `apps/api/src/main.ts`

Delivered:

- `POST /auth/login` with normalized email lookup and Argon2id verification
- Generic `401 Invalid email or password.` responses for unknown accounts,
  incorrect passwords, and password-less accounts
- Dummy Argon2id verification for unknown accounts to reduce timing differences
- Seven-day database-backed sessions with 32-byte opaque tokens
- SHA-256 token hashes stored in PostgreSQL; raw tokens are never persisted
- HTTP-only `devpulse_session` cookie with `SameSite=Lax`, `Path=/`, and
  production-only `Secure`
- Configurable credentialed CORS through `CORS_ALLOWED_ORIGINS`, with wildcard
  and malformed origins rejected
- Login unit, cookie, CORS, and HTTP integration tests
- Isolated PostgreSQL verification of login, cookie flags, token hashing,
  session expiration, and cleanup

Verification status:

- `pnpm --filter api lint` passed.
- `pnpm --filter api typecheck` passed.
- `pnpm --filter api test --runInBand` passed: 6 suites and 24 tests.
- `pnpm --filter api test:e2e --runInBand` passed: 3 suites and 13 tests.
- `pnpm --filter api build` passed.
- Live verification against an isolated PostgreSQL 18.6 instance confirmed
  registration and login, a seven-day session, HTTP-only/Lax/path-scoped cookies,
  SHA-256-only persistence, no raw token in the response, and cleanup.
- Two expiration comparisons in the first live script used `pg` parsing that
  misread the server timezone; a follow-up Prisma check confirmed `expiresAt`
  round-tripped exactly and the cookie expiry matched the intended seven-day
  lifetime.
- No schema change, migration, or new dependency was added.

### Batch 6D: Session validation, authentication guard, current user, and logout

Status: **Completed for code, tests, and isolated PostgreSQL/HTTP verification.**
The Docker Compose development database remains unmigrated and unverified.

Created:

- `apps/api/src/auth/session-auth.guard.ts`
- `apps/api/src/auth/session-auth.guard.spec.ts`
- `apps/api/test/auth-session.e2e-spec.ts`

Modified:

- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/auth/auth.module.ts`
- `apps/api/src/auth/auth.types.ts`
- `apps/api/src/auth/session-cookie.ts`
- `apps/api/src/auth/session-cookie.spec.ts`
- `apps/api/src/auth/session-token.ts`
- `apps/api/src/auth/session.service.ts`
- `apps/api/src/auth/session.service.spec.ts`
- `docs/API_CONTRACT.md`
- `docs/ARCHITECTURE.md`
- `docs/DATABASE_DESIGN.md`
- `docs/PROGRESS.md`

Delivered:

- Reusable session validation that reads the cookie, rejects malformed tokens,
  hashes the token with SHA-256, and requires an unrevoked, unexpired session with
  an existing associated user
- No sliding expiration and no `lastUsedAt` update during validation
- Reusable `SessionAuthGuard` that attaches only a safe `id`/`email` identity and
  returns a generic `401 Authentication required.` for invalid authentication
- `GET /auth/me` returning only the authenticated user's safe identity
- `POST /auth/logout` that revokes only the current session, clears the cookie
  with matching path/security options, and returns `204` for valid, missing,
  malformed, expired, or already-revoked sessions
- Idempotent repeated logout without exposing whether a session existed
- Unit tests for token/cookie parsing, session validation, revocation, and the
  guard
- HTTP integration tests for missing, malformed, valid, expired, revoked, and
  user-missing sessions; `me`; logout; repeated logout; cookie clearing; and
  single-session revocation isolation

Verification status:

- `pnpm --filter api lint` passed.
- `pnpm --filter api typecheck` passed.
- `pnpm --filter api test --runInBand` passed: 7 suites and 43 tests.
- `pnpm --filter api test:e2e --runInBand` passed: 4 suites and 25 tests.
- `pnpm --filter api build` passed.
- Root `pnpm lint` passed.
- Root `pnpm typecheck` passed.
- Root `pnpm test` passed: API 7 suites/43 tests and worker 1 test.
- Root `pnpm build` passed.
- Live PostgreSQL/HTTP verification confirmed two concurrent sessions, safe
  `/auth/me` responses, cookie clearing with past expiry, revoked-session
  rejection, idempotent and missing-cookie logout, and that logging out one
  session did not revoke the other.
- The live test user and sessions were deleted after verification.
- No schema change, migration, new dependency, JWT, Redis session store, or
  workspace authorization was added.

### Batch 7A: Authenticated workspace creation

Status: **Completed for code, tests, and build verification.** Workspace
creation was subsequently exercised against isolated PostgreSQL during Batch 7B
live verification.

Created:

- `apps/api/src/workspaces/workspace.constants.ts`
- `apps/api/src/workspaces/workspace-slug.ts`
- `apps/api/src/workspaces/workspace-slug.spec.ts`
- `apps/api/src/workspaces/workspace.types.ts`
- `apps/api/src/workspaces/dto/create-workspace.dto.ts`
- `apps/api/src/workspaces/workspaces.service.ts`
- `apps/api/src/workspaces/workspaces.service.spec.ts`
- `apps/api/src/workspaces/workspaces.controller.ts`
- `apps/api/src/workspaces/workspaces.module.ts`
- `apps/api/test/workspaces.e2e-spec.ts`

Modified:

- `apps/api/src/app.module.ts`
- `apps/api/src/auth/auth.module.ts` to make `SessionService` available to
  modules that import the exported authentication guard

Delivered:

- Authenticated `POST /workspaces`
- Name and optional nullable description validation with trimming, length limits,
  and unknown-field rejection
- Creator identity derived only from the authenticated session context
- Atomic creation of the workspace and the creator's `OWNER` membership in one
  Prisma transaction
- Globally unique, schema-bounded slug generation from the workspace name
- Generic `500` responses that do not expose database details
- Safe creation responses containing workspace fields and the creator's role
- Unit tests for slug generation and transactional creation behavior
- HTTP tests for authentication, validation, ownership, rollback behavior, and
  response safety

Verification status:

- `pnpm --filter api lint` passed.
- `pnpm --filter api typecheck` passed.
- `pnpm --filter api test --runInBand` passed: 9 suites and 51 tests.
- `pnpm --filter api test:e2e --runInBand` passed: 5 suites and 36 tests.
- `pnpm --filter api build` passed.
- Root `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` passed.
- No schema change, migration, or new dependency was added.

### Batch 7B: Workspace listing and retrieval

Status: **Completed for code, tests, build, and isolated PostgreSQL verification.**
The Docker Compose development database remains unmigrated and unverified.

Created:

- `apps/api/src/workspaces/dto/list-workspaces-query.dto.ts`
- `apps/api/test/workspaces-list-retrieve.e2e-spec.ts`

Modified:

- `apps/api/src/workspaces/workspace.constants.ts`
- `apps/api/src/workspaces/workspace.types.ts`
- `apps/api/src/workspaces/workspaces.controller.ts`
- `apps/api/src/workspaces/workspaces.service.ts`
- `apps/api/src/workspaces/workspaces.service.spec.ts`
- `docs/API_CONTRACT.md`
- `docs/ARCHITECTURE.md`
- `docs/PROGRESS.md`

Delivered:

- Authenticated `GET /workspaces` returning only workspaces where the current
  user has an active membership
- Membership role included in each listing and retrieval response
- Database-level membership filtering with no controller-side tenant filtering
  and no N+1 relationship loading
- Deterministic newest-first ordering by workspace `createdAt` with workspace ID
  as a tie-breaker
- Validated offset pagination with `page` and `limit`, defaults of `1` and `20`,
  a maximum limit of `100`, and `total`/`totalPages` metadata
- Authenticated `GET /workspaces/:id` with UUID validation and database-level
  filtering by both authenticated user ID and workspace ID
- Identical `404 Workspace not found.` responses for nonexistent and inaccessible
  workspaces
- Explicit safe response mapping for workspace ID, name, slug, description, role,
  `createdAt`, and `updatedAt`
- Unit tests for mapping, role inclusion, pagination, empty results, not-found
  behavior, and generic failures
- HTTP tests for authentication, tenant isolation, ordering, pagination,
  invalid IDs, invalid query parameters, cross-user URL access, and response
  safety

Pagination decision:

- Workspace listing uses validated offset pagination because a user's workspace
  set is expected to be small. The general API convention still prefers cursor
  pagination for larger collections.

Verification status:

- `pnpm --filter api lint` passed.
- `pnpm --filter api typecheck` passed.
- `pnpm --filter api test --runInBand` passed: 9 suites and 58 tests.
- `pnpm --filter api test:e2e --runInBand` passed: 6 suites and 47 tests.
- `pnpm --filter api build` passed.
- Root `pnpm lint` passed.
- Root `pnpm typecheck` passed.
- Root `pnpm test` passed: API 9 suites/58 tests and worker 1 test.
- Root `pnpm build` passed.
- Live isolated PostgreSQL/HTTP verification passed with two users and three
  workspaces. It confirmed creation, owner memberships, newest-first listing,
  pagination, cross-user isolation, 401/400/404 behavior, and safe response
  fields. Test rows were deleted and the temporary PostgreSQL instance was
  removed.
- No schema change, migration, or new dependency was added.

### Batch 7C: Workspace detail updates

Status: **Completed for code, tests, lint, typecheck, and build verification.**
The Docker Compose development database remains unmigrated and unverified.

Created:

- `apps/api/src/workspaces/dto/update-workspace.dto.ts`
- `apps/api/test/workspaces-update.e2e-spec.ts`

Modified:

- `apps/api/src/workspaces/workspace.constants.ts`
- `apps/api/src/workspaces/workspaces.controller.ts`
- `apps/api/src/workspaces/workspaces.service.ts`
- `apps/api/src/workspaces/workspaces.service.spec.ts`
- `docs/API_CONTRACT.md`
- `docs/PROGRESS.md`

Delivered:

- Authenticated `PATCH /workspaces/:id`
- Optional `name` and nullable `description` updates with trimming, length
  limits, invalid-type rejection, and unknown-field rejection
- At-least-one-field validation for update requests
- Membership lookup and role authorization before the update, using only the
  authenticated user's membership
- `OWNER` and `ADMIN` updates allowed; `MEMBER` and `VIEWER` updates return `403`
- Identical `404 Workspace not found.` responses for nonexistent and
  inaccessible workspaces
- `description: null` clears the description
- Transactional membership check and workspace update
- Safe response mapping consistent with workspace retrieval, including the
  caller's membership role
- Unit tests for owner and admin updates, description clearing, forbidden and
  not-found cases, empty updates, and generic failures
- HTTP tests for authentication, role authorization, tenant isolation, empty
  bodies, invalid names and descriptions, unknown/protected fields, invalid IDs,
  unchanged fields, and response safety

Verification status:

- `pnpm --filter api typecheck` passed.
- `pnpm --filter api lint` passed.
- `pnpm --filter api test --runInBand` passed: 9 suites and 64 tests.
- `pnpm --filter api test:e2e --runInBand` passed: 7 suites and 60 tests.
- `pnpm --filter api build` passed.
- Root `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` passed.
- No schema change, migration, or new dependency was added.

### Batch 7D: Workspace deletion

Status: **Completed for code, tests, lint, typecheck, build, and isolated live
PostgreSQL verification.** The Docker Compose development database remains
unmigrated and unverified.

Created:

- `apps/api/src/workspaces/workspaces-delete.service.spec.ts`
- `apps/api/test/workspaces-delete.e2e-spec.ts`

Modified:

- `apps/api/src/workspaces/workspace.constants.ts`
- `apps/api/src/workspaces/workspaces.controller.ts`
- `apps/api/src/workspaces/workspaces.service.ts`
- `docs/API_CONTRACT.md`
- `docs/DATABASE_DESIGN.md`
- `docs/PROGRESS.md`

Delivered:

- Authenticated `DELETE /workspaces/:id` returning `204 No Content`
- `OWNER`-only deletion; `ADMIN`, `MEMBER`, and `VIEWER` receive `403`
- Identical `404 Workspace not found.` responses for nonexistent and inaccessible
  workspaces
- UUID validation through the existing route pipe
- Transactional explicit purge in dependency order: webhook events,
  recommendations, risk assessments, pull requests, issues, workflow runs,
  repositories, the local GitHub installation record, projects, then the
  workspace
- Workspace-scoped deletion filters that preserve other tenants and unrelated
  workspaces
- Preservation of global users, sessions, and memberships in other workspaces
- Cascade removal of the target workspace's memberships and invitations through
  the existing schema
- Generic `500 Unable to delete workspace.` responses with transaction rollback
  on failure
- No external GitHub App uninstallation and no schema change
- Unit tests for owner deletion, deletion order, integration-free webhook scope,
  admin/member denial, non-member not-found, and failed deletion
- HTTP tests for authentication, authorization, nonexistent workspaces, invalid
  IDs, related-record removal, tenant isolation, user/session preservation,
  deleted-workspace retrieval, and rollback behavior

Deletion decisions:

- Workspace deletion is a deliberate permanent purge of workspace-owned data.
  The database's restrictive foreign keys remain in place for direct database
  operations.
- Webhook events linked to the workspace, its installation, or its repositories
  are deleted to avoid leaving orphaned rows.
- The local GitHub installation record is deleted with the workspace. The
  external GitHub App installation is not uninstalled and needs separate
  operational cleanup.

Verification status:

- `pnpm --filter api typecheck` passed.
- `pnpm --filter api lint` passed.
- `pnpm --filter api test --runInBand` passed: 10 suites and 70 tests.
- `pnpm --filter api test:e2e --runInBand` passed: 8 suites and 68 tests.
- Root `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` passed.
- Live isolated PostgreSQL verification passed: authorization responses,
  complete workspace-owned-data purge, unrelated workspace/user/session/
  membership preservation, and forced mid-transaction failure rollback.
- No schema change, migration, or new dependency was added.

### Batch 7E: Workspace ownership and membership integrity

Status: **Completed.** The database now independently enforces the last-owner
invariant, and the deferred ownership-transfer design is documented. Member
management and ownership-transfer endpoints remain intentionally unimplemented.

Created:

- `packages/database/prisma/migrations/20261104100000_enforce_workspace_owner_invariants/migration.sql`
- `packages/database/test/workspace-ownership.test.mjs`

Modified:

- `packages/database/prisma/schema.prisma` (invariant comment only)
- `packages/database/package.json`
- `docs/ARCHITECTURE.md`
- `docs/API_CONTRACT.md`
- `docs/DATABASE_DESIGN.md`
- `docs/PROGRESS.md`

Delivered:

- Deferred constraint trigger requiring every committed workspace to have an
  `OWNER`
- Trigger rejecting deletion or demotion of the last `OWNER` while the workspace
  still exists
- Per-workspace transaction-scoped advisory lock to serialize concurrent owner
  deletions/demotions
- Migration guard that refuses to apply when existing data already contains an
  ownerless workspace
- Explicit allowance for workspace deletion cascades and documented blocking of
  user deletion while the user is a last owner
- Database integration tests for ownerless workspace commits, last-owner
  protection, transactional ownership transfer ordering, bulk demotion/deletion,
  concurrent demotions, concurrent owner deletions, and workspace-deletion
  cascades
- Documented intended ownership-transfer sequence; no endpoint was added
- No new roles, invitations, member-management UI, authentication changes, or
  new dependencies

Verification status:

- `pnpm --filter @devpulse/database migrate:deploy` passed against an isolated
  temporary PostgreSQL database.
- `pnpm --filter @devpulse/database test:integration` passed: 6 tests.
- A manual migration guard test confirmed that an ownerless pre-existing
  workspace prevents the migration from applying.
- Live API verification confirmed workspace creation still creates exactly one
  `OWNER` and workspace deletion still cascades through the protected membership
  trigger.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and
  `pnpm --filter api test:e2e --runInBand` passed at Batch 7E completion.

### Batch 8A: Project architecture and database relationship review

Status: **Completed (design review only).** No project endpoints, Prisma schema
changes, migrations, GitHub App code, or frontend code were added.

Reviewed:

- `Project`, `Repository`, `GitHubInstallation`, and workspace relationships
- Existing workspace authentication, membership checks, role checks, and
  cross-workspace isolation behavior
- Project, repository, deletion, retention, roadmap, and API documentation

Findings:

- `Project.workspaceId` is required and protected by a restrictive foreign key.
- `Repository.projectId` is required and unique, with a composite
  `(projectId, workspaceId)` foreign key, so a repository cannot point at a
  project in another workspace and a project cannot have multiple repositories.
- A project can currently commit without a repository. The schema enforces
  at-most-one, not exactly-one.
- `Repository.githubId` is globally unique, so one GitHub repository cannot be
  connected to multiple DevPulse projects or workspaces at the same time.
- `Repository.installationId` does not include the workspace in its foreign key. A
  direct database write can attach a repository in one workspace to an
  installation in another workspace.
- No reusable workspace-membership authorization helper exists; the workspace
  service repeats the membership lookup itself.
- No project API, repository-selection flow, or project lifecycle code exists.

Design decisions recorded:

- A Project is a minimal workspace-scoped container for exactly one connected
  GitHub repository, not a general project-management system.
- Project creation will be atomic with repository selection through the GitHub
  App. Repo-less project creation is not part of the MVP.
- Clients will not submit arbitrary repository metadata; canonical GitHub fields
  are derived server-side from the selected repository.
- `OWNER` and `ADMIN` may manage projects. `MEMBER` and `VIEWER` have read-only
  project access. Non-members and cross-workspace projects return `404`.
- Disconnecting a repository is separate from deleting a project.
- Project deletion is implemented as a permanent local purge. It removes
  repository-attributed webhook events, recommendations, risk assessments, pull
  requests, issues, workflow runs, the project's exclusively owned repository
  record, and the project in one transaction. It does not delete the GitHub
  repository, uninstall the GitHub App, or remove unrelated workspace data.
- `README.md`/API paths use the currently unprefixed `/workspaces` routes; project
  paths are proposed under the same convention.

Isolated PostgreSQL verification:

- A project with no repository was accepted, confirming the exact-one invariant
  is not yet enforced by the schema.
- A repository in workspace A was accepted with a GitHub installation belonging
  to workspace B, confirming the missing composite workspace constraint.
- A second repository using the same `githubId` in another project/workspace was
  rejected by `repositories_github_id_key`.

Open approvals are listed in the Batch 8A final review. No verification claims
are made for unimplemented project endpoints.

### Batch 8B: Project creation endpoint

Status: **Implemented with a repository-resolution dependency.** Adds
`POST /workspaces/:workspaceId/projects` with unit and request-level E2E
coverage. No Prisma schema or migration changes, GitHub App client, frontend
work, or new dependencies were added.

Implemented:

- Authenticated `POST /workspaces/:workspaceId/projects`.
- UUID validation for `workspaceId` and strict body validation for `name`,
  nullable `description`, and canonical decimal-string `repositoryGithubId`.
  Unknown fields are rejected.
- Workspace membership authorization reusing existing workspace semantics:
  missing/inaccessible workspaces return `404`, authenticated `MEMBER`/`VIEWER`
  callers receive `403`, and only `OWNER`/`ADMIN` may create.
- Global duplicate-repository checks with a `409` that does not reveal another
  workspace, plus a re-check inside the transaction for races.
- A `GITHUB_REPOSITORY_RESOLVER` seam. The default resolver returns a safe `503`
  because GitHub App repository verification is not implemented yet. Successful
  project creation is therefore not available until that integration exists.
- Resolution metadata validation: archived repositories return `400`, and
  installation IDs must belong to the path workspace.
- Atomic project-plus-repository creation in one transaction with rollback on
  failure. Unique failures map to `409`, foreign-key failures map to `404`, and
  unexpected failures map to `500`.
- Server-generated project slugs that are not exposed in API responses.
- Safe response mapping that omits installation IDs, tokens, slugs, and session
  data. GitHub IDs are serialized as strings.

Files added:

- `apps/api/src/projects/project.constants.ts`
- `apps/api/src/projects/project.types.ts`
- `apps/api/src/projects/project-slug.ts`
- `apps/api/src/projects/repository-resolver.ts`
- `apps/api/src/projects/dto/create-project.dto.ts`
- `apps/api/src/projects/projects.service.ts`
- `apps/api/src/projects/projects.controller.ts`
- `apps/api/src/projects/projects.module.ts`
- `apps/api/src/projects/project-slug.spec.ts`
- `apps/api/src/projects/repository-resolver.spec.ts`
- `apps/api/src/projects/projects.service.spec.ts`
- `apps/api/test/projects.e2e-spec.ts`

Modified:

- `apps/api/src/app.module.ts` registers `ProjectsModule`.
- `docs/API_CONTRACT.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_DESIGN.md`, and
  `docs/PROGRESS.md` document the implemented behavior and remaining dependency.

Verification executed on 2026-11-04:

- `pnpm --filter api typecheck` passed.
- `pnpm --filter api lint` passed.
- `pnpm --filter api test --runInBand`: 13 suites, 90 tests passed.
- `pnpm --filter api test:e2e --runInBand`: 9 suites, 83 tests passed.
- `pnpm --filter api build` passed.
- Root `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` passed.

Remaining limitations:

- Successful project creation requires a future GitHub App repository resolver.
- The GitHub installation workspace relationship is enforced in application code
  for project creation but still lacks a database composite foreign key.
- The schema still permits a repository-less project if written outside this
  endpoint; the creation path does not create one.
- Project retrieval, update, and deletion remained unimplemented at the close of
  Batch 8B.

### Batch 8C: Project listing endpoint

Status: **Implemented.** Adds `GET /workspaces/:workspaceId/projects` with unit
and request-level E2E coverage. No Prisma schema or migration changes, GitHub App
changes, frontend work, or new dependencies were added.

Implemented:

- Authenticated `GET /workspaces/:workspaceId/projects`.
- UUID validation for `workspaceId` and the established `page`/`limit` query
  validation: minimum page 1, limit 1-100, default page 1 and limit 20.
- Membership authorization before any project query. `OWNER`, `ADMIN`, `MEMBER`,
  and `VIEWER` members may list. Nonexistent workspaces and non-members both
  return `404 Workspace not found.` without querying project records.
- Both the page query and total count are constrained by the path workspace, so
  cross-workspace projects are never returned or counted.
- Deterministic ordering by `createdAt` descending, then project ID descending.
- Repository data selected with the project query instead of per-project
  follow-up queries. Missing repository relations are mapped to `null`
  defensively without hiding the project.
- Explicit response mapping that omits slugs, installation IDs, tokens,
  credentials, and session data. GitHub IDs are serialized as strings.
- Unexpected database failures map to `500 Unable to list projects.`

Files added:

- `apps/api/src/projects/dto/list-projects-query.dto.ts`
- `apps/api/src/projects/projects-list.service.spec.ts`

Modified:

- `apps/api/src/projects/project.constants.ts`
- `apps/api/src/projects/project.types.ts`
- `apps/api/src/projects/projects.service.ts`
- `apps/api/src/projects/projects.controller.ts`
- `apps/api/test/projects.e2e-spec.ts`
- `docs/API_CONTRACT.md`, `docs/ARCHITECTURE.md`, and `docs/PROGRESS.md`

Verification executed on 2026-11-04:

- `pnpm --filter api typecheck` passed.
- `pnpm --filter api lint` passed.
- `pnpm --filter api test --runInBand`: 14 suites, 97 tests passed.
- `pnpm --filter api test:e2e --runInBand`: 9 suites, 100 tests passed.
- `pnpm --filter api build` passed.
- Root `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` passed.

Remaining limitations:

- Successful project creation still requires the future GitHub App repository
  resolver.
- Project update and deletion remained unimplemented at the close of Batch 8C.
- The schema still permits a repository-less project if written outside the
  creation endpoint; listing and retrieval represent such a project with
  `repository: null`.

### Batch 8D: Individual project retrieval endpoint

Status: **Implemented.** Adds `GET /workspaces/:workspaceId/projects/:projectId`
with unit and request-level E2E coverage. No Prisma schema or migration changes,
GitHub App changes, frontend work, or new dependencies were added.

Implemented:

- Authenticated `GET /workspaces/:workspaceId/projects/:projectId`.
- UUID validation for both `workspaceId` and `projectId`.
- Membership authorization before any project lookup. `OWNER`, `ADMIN`, `MEMBER`,
  and `VIEWER` members may retrieve. Nonexistent workspaces and non-members both
  return `404 Workspace not found.` without querying project records.
- The project lookup is scoped by both the path `workspaceId` and `projectId`. A
  missing project and a project belonging to another workspace both return
  `404 Project not found.`
- Repository data is selected with the project lookup, avoiding a follow-up query.
  A missing repository relation is mapped to `null` defensively.
- Explicit response mapping shared with project listing, omitting slugs,
  installation IDs, tokens, credentials, and session data. GitHub IDs are
  serialized as strings.
- Unexpected database failures map to `500 Unable to retrieve project.`

Files added:

- `apps/api/src/projects/projects-retrieval.service.spec.ts`

Modified:

- `apps/api/src/projects/project.constants.ts`
- `apps/api/src/projects/projects.service.ts`
- `apps/api/src/projects/projects.controller.ts`
- `apps/api/test/projects.e2e-spec.ts`
- `docs/API_CONTRACT.md`, `docs/ARCHITECTURE.md`, and `docs/PROGRESS.md`

Verification executed on 2026-11-04:

- `pnpm --filter api typecheck` passed.
- `pnpm --filter api lint` passed.
- `pnpm --filter api test --runInBand`: 15 suites, 103 tests passed.
- `pnpm --filter api test:e2e --runInBand`: 9 suites, 113 tests passed.
- `pnpm --filter api build` passed.
- Root `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` passed.

Remaining limitations:

- Successful project creation still requires the future GitHub App repository
  resolver.
- Project update and deletion remained unimplemented at the close of Batch 8D.
- The schema still permits a repository-less project if written outside the
  creation endpoint; listing and retrieval represent such a project with
  `repository: null`.

### Batch 8E: Project update endpoint

Status: **Implemented.** Adds
`PATCH /workspaces/:workspaceId/projects/:projectId` with unit and request-level
E2E coverage. No Prisma schema or migration changes, GitHub App changes,
frontend work, or new dependencies were added.

Implemented:

- Authenticated `PATCH /workspaces/:workspaceId/projects/:projectId`.
- UUID validation for both `workspaceId` and `projectId`.
- Partial update validation requiring at least one of `name` or `description`.
  Empty bodies return `400 At least one of name or description must be provided.`
- `name` is trimmed, non-empty, and limited to 255 characters. `description` is
  trimmed, limited to 2000 characters, and may be `null` to clear it. Omitted
  fields are preserved.
- Unknown, immutable, and repository-assignment fields are rejected, including
  `repositoryGithubId`, `repositoryId`, `workspaceId`, `projectId`, `slug`,
  status, role, and timestamps.
- Membership authorization and the update run in one transaction. Nonexistent
  workspaces and non-members return `404 Workspace not found.` without changing
  data. `MEMBER` and `VIEWER` members receive `403`; only `OWNER` and `ADMIN` may
  update.
- The update is scoped by both the path `workspaceId` and `projectId` through the
  project compound unique key. A missing project and a project belonging to
  another workspace both return `404 Project not found.`
- Repository relationships are preserved. Repository data is selected with the
  updated project, avoiding a follow-up query.
- Explicit response mapping shared with project listing and retrieval omits slugs,
  installation IDs, tokens, credentials, and session data. GitHub IDs are
  serialized as strings.
- Prisma `P2025` failures map to `404 Project not found.` and unexpected database
  failures map to `500 Unable to update project.`

Files added:

- `apps/api/src/projects/dto/update-project.dto.ts`
- `apps/api/src/projects/projects-update.service.spec.ts`

Modified:

- `apps/api/src/projects/project.constants.ts`
- `apps/api/src/projects/projects.service.ts`
- `apps/api/src/projects/projects.controller.ts`
- `apps/api/test/projects.e2e-spec.ts`
- `docs/API_CONTRACT.md`, `docs/ARCHITECTURE.md`, and `docs/PROGRESS.md`

Verification executed on 2026-11-04:

- `pnpm --filter api typecheck` passed.
- `pnpm --filter api lint` passed.
- `pnpm --filter api test --runInBand`: 16 suites, 115 tests passed.
- `pnpm --filter api test:e2e --runInBand`: 9 suites, 138 tests passed.
- `pnpm --filter api build` passed.
- Root `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` passed.

Remaining limitations:

- Successful project creation still requires the future GitHub App repository
  resolver.
- Project deletion was unimplemented at the close of Batch 8E; Batch 8F
  implements it.
- The schema still permits a repository-less project if written outside the
  creation endpoint; listing, retrieval, and updates represent such a project
  with `repository: null`.

### Batch 8F: Project deletion endpoint

Status: **Implemented.** Adds
`DELETE /workspaces/:workspaceId/projects/:projectId` with unit and request-level
E2E coverage. No Prisma schema or migration changes, GitHub App changes,
frontend work, or new dependencies were added.

Implemented:

- Authenticated `DELETE /workspaces/:workspaceId/projects/:projectId`.
- UUID validation for both `workspaceId` and `projectId`.
- Membership and role authorization. Nonexistent workspaces and non-members
  return `404 Workspace not found.` `MEMBER` and `VIEWER` members receive `403
  You do not have permission to delete this project.` `OWNER` and `ADMIN` may
  delete.
- Deletion is scoped by both the path `workspaceId` and `projectId`. A missing
  project and a project belonging to another workspace both return `404 Project
  not found.` Repeated deletion returns the same `404`.
- One transaction resolves the project, removes webhook events linked only to the
  project's repository, removes recommendations and risk assessments scoped by
  project and workspace, removes pull requests, issues, and workflow runs scoped
  by repository and workspace, deletes the project's repository record scoped by
  repository/project/workspace, and deletes the project by its compound unique
  key.
- Webhook events that cannot be attributed to the project's repository, including
  workspace-level and other-project events, are preserved.
- The workspace, GitHub installation and credentials, users, sessions,
  memberships, other projects, unrelated repositories, and external GitHub data
  are preserved. The endpoint does not uninstall the GitHub App.
- The project's exclusively owned local repository record is permanently deleted,
  releasing its global GitHub identifier for a future connection.
- Legacy/pre-invariant projects without a repository record still delete their
  project-scoped records and the project; repository-linked records cannot be
  identified and are preserved.
- Success returns `204 No Content` with an empty body. Prisma `P2025` maps to `404
  Project not found.`; unexpected failures map to `500 Unable to delete project.`

Files added:

- `apps/api/src/projects/projects-delete.service.spec.ts`
- `apps/api/test/projects-delete.e2e-spec.ts`

Modified:

- `apps/api/src/projects/project.constants.ts`
- `apps/api/src/projects/projects.service.ts`
- `apps/api/test/projects.e2e-spec.ts`
- `docs/API_CONTRACT.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_DESIGN.md`, and
  `docs/PROGRESS.md`

Verification executed on 2026-11-05:

- `pnpm --filter api typecheck` passed.
- `pnpm --filter api lint` passed.
- `pnpm --filter api test --runInBand`: 17 suites, 124 tests passed.
- `pnpm --filter api test:e2e --runInBand`: 10 suites, 151 tests passed.
- `pnpm --filter api build` passed.

Remaining limitations:

- Successful project creation still requires the future GitHub App repository
  resolver.
- Repository disconnection and reconnection endpoints remain unimplemented.
- The schema still permits a repository-less project if written outside the
  creation endpoint; deletion preserves repository-linked records it cannot
  attribute in that legacy case.

### Batch 8G: Project management hardening review

Status: **Implemented.** A focused security and data-integrity review of the
Phase 8 project-management endpoints. Authorization, workspace isolation,
validation, error mapping, sensitive-data exposure, repository association, and
deletion behavior were reviewed. No schema or migration changes, endpoint,
role, frontend, worker, GitHub App, or dependency changes were made.

Hardened:

- Project creation now requires the resolved repository installation to have
  `ACTIVE` status in addition to belonging to the path workspace. Suspended and
  disconnected installations are rejected with
  `404 Repository not found.` before the project/repository transaction writes.
- Project update request validation coverage now explicitly rejects
  `projectId`, `userId`, `role`, `status`, `createdAt`, and `updatedAt` in
  addition to repository, workspace, and slug fields.
- Project creation request validation coverage now explicitly rejects
  `repositoryId`.
- PostgreSQL integration coverage now exercises the existing
  `(projectId, workspaceId)` repository foreign key, one-repository-per-project
  uniqueness, global GitHub repository ID uniqueness, and restrictive
  project/workspace deletion constraints.

Verified review outcomes:

- Project creation, update, and deletion authorize `OWNER` and `ADMIN` members
  and reject `MEMBER`/`VIEWER` with `403`, consistent with the approved Phase 8A
  matrix. Non-members and nonexistent workspaces return `404`.
- The Phase 8G request included a proposed role table that forbade `ADMIN`
  deletion, which conflicts with the approved Phase 8A project-management matrix.
  The approved matrix was preserved, so `ADMIN` deletion remains allowed.
- Project listing, retrieval, updates, and deletion scope queries by the path
  workspace. Cross-workspace project access returns `404`; no project data from
  another workspace is returned.
- Repository resolution is server-side. Client repository metadata and
  identifiers outside the documented creation contract are rejected.
- API responses do not expose installation IDs, GitHub credentials or tokens,
  sessions, internal slugs, or raw database errors.
- Project deletion removes only the selected project aggregate and
  repository-attributed webhook events. It preserves other projects,
  repositories, installations, memberships, sessions, and users.

Known integrity gaps retained for a future approved migration:

- `Repository.installationId` does not have a composite foreign key to
  `GitHubInstallation(id, workspaceId)`, so direct database writes can still
  attach a repository to another workspace's installation. Application creation
  rejects this case.
- The database does not require every project to have exactly one repository;
  legacy/directly written repo-less projects remain possible.
- `Recommendation.riskAssessmentId` does not enforce that the referenced risk
  assessment belongs to the same project and workspace.
- Optional webhook installation/repository/workspace consistency remains an
  application-level requirement.

Files added:

- `packages/database/test/project-integrity.test.mjs`

Modified:

- `apps/api/src/projects/projects.service.ts`
- `apps/api/src/projects/projects.service.spec.ts`
- `apps/api/test/projects.e2e-spec.ts`
- `packages/database/package.json`
- `docs/API_CONTRACT.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_DESIGN.md`, and
  `docs/PROGRESS.md`

Verification executed on 2026-11-05:

- `pnpm --filter api typecheck` passed.
- `pnpm --filter api lint` passed.
- `pnpm --filter api test --runInBand`: 17 suites, 124 tests passed.
- `pnpm --filter api test:e2e --runInBand`: 10 suites, 159 tests passed.
- `pnpm --filter api build` passed.
- `pnpm --filter @devpulse/database db:validate` passed.
- Root `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build` passed.
- Direct `node --test packages/database/test/project-integrity.test.mjs` with
  the local `DATABASE_URL`: 4 tests passed.
- The combined database integration command was executed and did not pass: 5 of
  10 tests passed. The 4 new project-integrity tests passed;
  `workspace-ownership.test.mjs` failed 5 of its 6 tests because
  `20261104100000_enforce_workspace_owner_invariants` is not applied to the
  local development database. The migration was not applied during this batch.

Remaining limitations:

- The database integrity defects above require a reviewed Prisma migration and a
  migrated disposable or development database before they can be closed and
  verified.
- Successful project creation still requires the future GitHub App repository
  resolver; the default resolver returns `503`.
- Repository disconnection and reconnection endpoints remain unimplemented.

## Implemented repository state

The repository currently contains:

```text
DevPulse/
├── .env.example
├── .gitignore
├── AGENTS.md
├── README.md
├── docker-compose.yml
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── apps/
│   ├── api/
│   │   ├── src/
│   │   ├── test/
│   │   ├── README.md
│   │   ├── eslint.config.mjs
│   │   ├── nest-cli.json
│   │   ├── package.json
│   │   ├── tsconfig.build.json
│   │   └── tsconfig.json
│   ├── worker/
│   │   ├── src/
│   │   ├── test/
│   │   ├── README.md
│   │   ├── eslint.config.mjs
│   │   ├── package.json
│   │   ├── tsconfig.build.json
│   │   └── tsconfig.json
│   └── web/
│       ├── src/app/
│       ├── AGENTS.md
│       ├── README.md
│       ├── eslint.config.mjs
│       ├── next.config.ts
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   └── database/
│       ├── prisma/
│       │   ├── migrations/
│       │   │   ├── 20261102064516_init_devpulse/
│       │   │   │   └── migration.sql
│       │   │   ├── 20261104100000_enforce_workspace_owner_invariants/
│       │   │   │   └── migration.sql
│       │   │   └── migration_lock.toml
│       │   └── schema.prisma
│       ├── src/
│       │   ├── client.ts
│       │   └── index.ts
│       ├── test/
│       │   ├── project-integrity.test.mjs
│       │   └── workspace-ownership.test.mjs
│       ├── package.json
│       ├── prisma.config.ts
│       ├── tsconfig.build.json
│       └── tsconfig.json
└── docs/
    ├── API_CONTRACT.md
    ├── ARCHITECTURE.md
    ├── DATABASE_DESIGN.md
    ├── DEVELOPMENT_ROADMAP.md
    ├── PROGRESS.md
    └── PROJECT_OVERVIEW.md
```

The following do not exist yet:

- `docker/`
- Redis or BullMQ integration
- Password reset and email verification flows
- Member invitations, member management, role changes, ownership transfer, and
  broader workspace RBAC

## Decisions

Resolved decisions:

- Authentication uses database-backed server-side sessions. Login, current-user
  lookup, session validation, and current-session logout are implemented.
- Workspace creation derives the creator from the authenticated session and
  atomically assigns the `OWNER` role.
- Workspace listing, retrieval, and updates filter by active membership in the
  database. Inaccessible and nonexistent workspaces both return `404`.
- Workspace detail updates are restricted to `OWNER` and `ADMIN` members and only
  change the name and description.
- Workspace deletion is restricted to `OWNER` members and purges workspace-owned
  data transactionally. It does not uninstall the external GitHub App
  installation.
- Every active workspace must retain at least one `OWNER`. Workspace creation
  assigns it transactionally, and database triggers reject ownerless workspace
  commits, last-owner deletion, and last-owner demotion. Concurrent changes are
  serialized per workspace with an advisory lock.
- Membership writes remain server-controlled. Request DTOs reject role,
  membership, and `userId` fields; no membership-management endpoint exists.
- Ownership transfer is deferred. Its required transactional ordering is
  documented in `DATABASE_DESIGN.md`.
- Workspace listing uses validated offset pagination because per-user workspace
  sets are expected to be small.
- Project management is restricted to `OWNER` and `ADMIN` members. Project
  deletion permanently purges the project aggregate and its exclusively owned
  local repository record transactionally, preserves the workspace, GitHub
  installation, users, sessions, memberships, other projects, unrelated
  repositories, and unattributable webhook events, and does not call GitHub to
  delete a repository or uninstall the App.
- GitHub integration uses a GitHub App.

The following decisions remain open and must be resolved before the dependent
phase begins:

- Password reset, email verification, session cleanup, and CSRF protection flows
- Workspace role and permission matrix
- Final MVP feature list
- Deployment and CI metadata scope
- Metric definitions and retention policy
- Whether database row-level security is required
- Exact pnpm version pinning
- Repository disconnection, reconnection, and retention behavior
- Invitation flow and whether email is always required
- Recommendation category taxonomy
- Ownership-transfer endpoint behavior, audit trail, and authorization flow
- Whether raw webhook payloads are ever retained
- Database-level enforcement of project-to-repository connectivity

See the open-decision sections in the architecture, database, API, and roadmap
documents for details.

## Next step

Await developer approval of the GitHub App repository-resolution design needed to
make project creation succeed. The project creation endpoint, authorization,
validation, transaction, and rollback behavior are implemented and verified with
a stubbed resolver; the default resolver currently returns `503`. Project listing,
authorization, workspace isolation, ordering, pagination, and repository mapping
are implemented and verified. Individual project retrieval, authorization,
workspace-scoped lookup, and repository mapping are implemented and verified.
Project updates, partial validation, workspace-scoped authorization, and
repository preservation are implemented and verified. Project deletion,
owner/admin authorization, workspace-scoped lookup, transaction-based aggregate
removal, local repository lifecycle handling for the deleted project, and
preservation of the GitHub installation and unrelated workspace data are
implemented and verified. The existing workspace
creation, listing, retrieval, updates, deletion, and database last-owner
invariant remain implemented and verified. The Docker Compose development database
remains unmigrated and unverified because Docker access is unavailable.

Known outstanding work includes CSRF protection for cookie-authenticated
state-changing requests, session cleanup for expired/revoked records, workspace
invitations, member management, role changes, ownership transfer endpoints,
broader RBAC, password reset, email verification, GitHub sign-in, the GitHub App
repository resolver, repository disconnection/reconnection, and external GitHub
App uninstallation or cleanup for deleted workspaces.
