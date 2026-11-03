# DevPulse Development Roadmap

## Document status

The project uses a 12-phase development structure. Phase 1 is in progress; every
later phase is not started. Phase titles and scope below are working descriptions
for planning. They are not final feature requirements and require detailed
approval before implementation.

The roadmap intentionally favors small, tested milestones. A phase is not
complete until its implementation, tests, documentation, and verification are
reviewed.

## Phase 1: Foundation and Documentation

**Goal:** Establish a clean pnpm workspace, Git repository, architecture rules,
and product documentation.

Completion criteria:

- Root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, and
  `.gitignore` exist.
- Git repository is initialized on `main`.
- Agents instructions and foundational documentation are reviewed.
- No application code, database schema, or dependencies are added prematurely.
- `docs/PROGRESS.md` reflects the current state accurately.

Testing expectations:

- Workspace configuration files are syntactically valid.
- Git status and ignore rules are verified.
- Any workspace scripts run only after dependencies are installed.

Documentation:

- `AGENTS.md`
- `docs/PROJECT_OVERVIEW.md`
- `docs/ARCHITECTURE.md`
- `docs/DATABASE_DESIGN.md`
- `docs/API_CONTRACT.md`
- `docs/DEVELOPMENT_ROADMAP.md`
- `docs/PROGRESS.md`

## Phase 2: Local Infrastructure and Database Foundation

**Goal:** Prepare local PostgreSQL and Redis, create the database package, and
establish Prisma migration discipline without defining final product models.

Completion criteria:

- Docker Compose starts PostgreSQL and Redis with health checks.
- `packages/database` owns Prisma configuration and client access.
- Environment examples document `DATABASE_URL` and `REDIS_URL`.
- The first approved migration is committed if any model is introduced.
- No application connects directly to infrastructure outside the approved
  packages.

Testing expectations:

- PostgreSQL and Redis connectivity is verified.
- Prisma schema validation succeeds.
- Migration commands are documented and tested locally.
- Workspace isolation is considered in any initial model.

Documentation:

- Local setup instructions.
- Environment variable reference.
- Migration workflow.

## Phase 3: Shared Contracts and Core Skeleton

**Goal:** Create framework-agnostic shared types and the initial core package
boundaries needed by the API and worker.

Completion criteria:

- `packages/shared` contains only approved types, constants, and pure utilities.
- `packages/core` is created only if shared business logic is actually needed.
- Error, configuration, and job-contract conventions are documented.
- No framework-specific code leaks into shared packages.

Testing expectations:

- Unit tests cover pure utilities and business rules.
- Cross-package dependency direction is verified.
- Typechecking succeeds across workspace packages.

Documentation:

- Package responsibilities and public exports.
- Job contract conventions if queue contracts are introduced.

## Phase 4: Authentication and Workspace Management

**Goal:** Allow users to authenticate and manage isolated workspaces and
memberships.

Selected approach: database-backed server-side sessions.

Completion criteria:

- Approved authentication flow is implemented.
- Users can create or access only authorized workspaces.
- Workspace roles and membership rules are enforced server-side.
- Cross-workspace access attempts are denied and tested.

Testing expectations:

- Authentication integration tests.
- Authorization tests for every workspace-scoped operation.
- Explicit cross-workspace isolation tests.
- Validation tests for malformed and unauthorized requests.

Documentation:

- Authentication flow.
- Role and permission matrix.
- Workspace lifecycle rules.

## Phase 5: GitHub Metadata Integration

**Goal:** Connect GitHub using the approved least-privilege model and import
repository metadata.

Completion criteria:

- GitHub App integration is implemented.
- Installation or authorization flow is complete.
- Tokens remain server-side and are never returned to the browser.
- Repository metadata synchronization works for approved fields.
- Webhook signature verification is implemented if webhooks are used.

Testing expectations:

- Integration tests with mocked GitHub responses.
- Webhook verification tests.
- Failure and retry tests for provider errors.
- Tests proving no credentials appear in logs or API responses.

Documentation:

- GitHub setup instructions.
- Required permissions and scopes.
- Metadata fields collected and retention rules.

## Phase 6: Repository and Pull Request Metadata

**Goal:** Import and expose approved repository, pull request, review, and
related metadata.

Completion criteria:

- Synchronization is incremental and idempotent.
- Pull request and review metadata is available through workspace-scoped APIs.
- Unsafe or unsupported fields are not stored.
- Sync progress and failures are observable.

Testing expectations:

- Unit tests for mapping and validation.
- Integration tests for list and detail endpoints.
- Authorization and cross-workspace isolation tests.
- Idempotency tests for repeated synchronization.

Documentation:

- Collected metadata fields.
- API behavior and pagination.
- Synchronization and retention behavior.

## Phase 7: Background Worker and Sync Reliability

**Goal:** Run background synchronization in the independent BullMQ worker with
safe retry and failure behavior.

Completion criteria:

- `apps/worker` starts independently and exposes no HTTP server.
- API producers enqueue validated job payloads.
- Worker processors call shared business logic.
- Retries, backoff, and permanent failures are handled deliberately.
- Scheduled refreshes are introduced only if approved.

Testing expectations:

- Job success, retry, and failure tests.
- Idempotency tests for duplicate jobs.
- Tests for malformed job payloads.
- Operational logging tests that confirm secrets are not logged.

Documentation:

- Queue and job contracts.
- Retry policy and failure handling.
- Worker operation and troubleshooting.

## Phase 8: Deployment and CI Metadata

**Goal:** Add approved deployment and CI metadata if these features are confirmed
for the MVP.

Completion criteria:

- Approved ingestion method is implemented, such as webhook or API.
- Deployment and workflow records are workspace-scoped.
- Status and duration data are validated.
- Unsupported providers are rejected clearly.

Testing expectations:

- Ingestion validation and authorization tests.
- Duplicate event and idempotency tests.
- Provider failure and retry tests.
- Workspace isolation tests.

Documentation:

- Supported providers and event formats.
- Deployment lifecycle and status meanings.
- Retention rules.

## Phase 9: Metrics and Insights Backend

**Goal:** Compute and serve approved delivery metrics and insights.

Completion criteria:

- Metric definitions are documented and approved.
- Computation is deterministic and workspace-scoped.
- Expensive aggregation runs in the worker where appropriate.
- APIs return bounded, explainable results.

Testing expectations:

- Unit tests with known metric inputs and expected outputs.
- Integration tests for time ranges and empty data.
- Workspace isolation tests.
- Performance checks for agreed data volumes.

Documentation:

- Metric definitions and formulas.
- Data freshness and aggregation windows.
- API response examples and limitations.

## Phase 10: Web Application Foundation

**Goal:** Create the Next.js application shell, authentication flow, and secure
API access.

Completion criteria:

- `apps/web` renders the approved layout and navigation.
- Authentication integrates with the API without exposing secrets.
- Workspace selection respects membership.
- API calls handle loading, empty, error, and unauthorized states.
- Tailwind CSS and shadcn/ui are configured as approved.

Testing expectations:

- Component tests for critical UI states.
- Authentication and workspace-selection integration tests.
- Accessibility checks for core flows.
- Build and typecheck verification.

Documentation:

- Web setup and environment variables.
- Authentication and workspace navigation.
- UI conventions.

## Phase 11: Dashboard and Insights UI

**Goal:** Present repository activity, review flow, deployment information, and
approved insights.

Completion criteria:

- Dashboard uses approved metrics and API contracts.
- Empty, loading, and failure states are handled.
- Users only see data from authorized workspaces.
- Charts and tables remain usable on common screen sizes.

Testing expectations:

- Component and page tests for key states.
- API integration tests with mocked responses.
- Workspace-switching isolation tests.
- Accessibility and responsive checks.

Documentation:

- Dashboard feature guide.
- Metric explanations shown to users.
- Known limitations.

## Phase 12: Hardening, Deployment, and MVP Release

**Goal:** Prepare the MVP for a controlled release with adequate security,
reliability, and operational visibility.

Completion criteria:

- Production deployment configuration is approved and documented.
- CI checks cover build, typecheck, tests, and migration validation.
- Secrets are injected by the deployment environment.
- Health checks, logging, and error reporting are operational.
- Known risks and limitations are reviewed.
- MVP acceptance criteria are met.

Testing expectations:

- Full test suite passes.
- End-to-end tests cover the approved critical paths.
- Authorization and workspace-isolation regression tests pass.
- Migration and rollback procedures are reviewed.
- Smoke tests run against the deployed environment.

Documentation:

- Deployment guide.
- Operations runbook.
- Security and privacy review.
- Release notes and known limitations.

## Cross-phase expectations

- Every phase requires tests appropriate to its risk.
- Every phase updates `docs/PROGRESS.md` only after verification.
- Architecture or product decisions that are still open must be resolved before
  the phase that depends on them begins.
- Do not add a new framework or major dependency without approval.
- Do not mark a phase complete based only on written code; verification is
  required.
