# DevPulse Database Design

## Document status

The initial PostgreSQL schema is implemented in
`packages/database/prisma/schema.prisma` using Prisma 7.10.1. The schema is
validated, the Prisma Client is generated, and the `init_devpulse` and
`enforce_workspace_owner_invariants` migrations are committed. They were applied
and verified against isolated PostgreSQL instances. The Docker Compose
development database has not been migrated or verified because Docker access was
unavailable.

This document describes the implemented schema and the decisions that still
require product or architecture approval. It must not be read as proof that the
Docker Compose development database is migrated or integrated.

## Implemented scope

Implemented models:

| Area | Models |
| --- | --- |
| Authentication | `User`, `Session` |
| Workspace management | `Workspace`, `WorkspaceMember`, `WorkspaceInvitation`, `Project` |
| GitHub integration | `GitHubInstallation`, `Repository`, `WebhookEvent` |
| Engineering activity | `PullRequest`, `Issue`, `WorkflowRun` |
| Intelligence | `RiskAssessment`, `Recommendation` |

`Project` was not listed explicitly in the Batch 5C model list, but it is required
by the documented relationships. It is implemented as a supporting workspace
entity.

Deferred and not implemented in this batch:

- `PullRequestReview`
- `CommitMetadata`
- `Deployment`
- `MetricSnapshot`
- `IntegrationSyncState`

## Conventions

- Internal primary keys are UUIDs.
- GitHub numeric identifiers use `BigInt` / PostgreSQL `bigint`.
- Stored timestamps use PostgreSQL `timestamptz(6)`.
- Event timestamps received from GitHub are separate from internal `createdAt`,
  `updatedAt`, and synchronization timestamps.
- Prisma fields use camelCase and are mapped to snake_case database columns with
  `@map` and `@@map`.
- Roles and meaningful state values use explicit enums.
- Raw source code, diffs, file contents, GitHub private keys, and installation
  access tokens are not stored.

## Enums

| Enum | Values |
| --- | --- |
| `WorkspaceRole` | `OWNER`, `ADMIN`, `MEMBER`, `VIEWER` |
| `InvitationStatus` | `PENDING`, `ACCEPTED`, `REVOKED`, `EXPIRED` |
| `GitHubAccountType` | `USER`, `ORGANIZATION` |
| `GitHubInstallationStatus` | `ACTIVE`, `SUSPENDED`, `DISCONNECTED` |
| `RepositoryVisibility` | `PUBLIC`, `PRIVATE`, `INTERNAL` |
| `RepositoryConnectionStatus` | `ACTIVE`, `DISCONNECTED` |
| `PullRequestState` | `OPEN`, `CLOSED`, `MERGED` |
| `IssueState` | `OPEN`, `CLOSED` |
| `WorkflowRunStatus` | `QUEUED`, `IN_PROGRESS`, `COMPLETED`, `REQUESTED`, `WAITING`, `PENDING` |
| `WorkflowRunConclusion` | `SUCCESS`, `FAILURE`, `CANCELLED`, `SKIPPED`, `TIMED_OUT`, `ACTION_REQUIRED`, `NEUTRAL`, `STALE` |
| `WebhookEventStatus` | `RECEIVED`, `PROCESSING`, `PROCESSED`, `FAILED`, `IGNORED` |
| `RecommendationStatus` | `OPEN`, `ACCEPTED`, `IN_PROGRESS`, `DISMISSED`, `COMPLETED` |

The role names follow the proposed names in `docs/API_CONTRACT.md`. The final
permission matrix remains open.

## Models

### User

Represents a person who can sign in to DevPulse.

Implemented fields include:

- Internal UUID
- Optional unique email
- Optional display name and avatar URL
- Optional unique GitHub user identifier and GitHub login
- Optional password hash
- Internal timestamps

A user can have many sessions and can belong to many workspaces through
`WorkspaceMember`.

Email/password registration and login are implemented with database-backed
server-side sessions. Session validation and logout are also implemented.
`passwordHash` and the GitHub identity fields are nullable so the schema does not
prematurely force a single provider. Passwords are hashed with Argon2id before
storage; plaintext passwords are never stored.

### Session

Represents a server-side authentication session.

Implemented fields include:

- Internal UUID
- Owning user
- Unique hashed session token
- Expiry, last-used, and revocation timestamps
- Internal timestamps

Only a hash of the session credential is stored. Raw session tokens must never be
persisted.

Sessions have a fixed seven-day lifetime. Validation requires an unrevoked,
unexpired session whose associated user still exists, and validation does not
extend `expiresAt` or update `lastUsedAt`. Logout sets `revokedAt` on the session
matching the current token hash only; it does not revoke the user's other
sessions. These behaviors require no schema change.

### Workspace

The tenant boundary.

Implemented fields include:

- Internal UUID
- Name
- Globally unique slug
- Optional description
- Internal timestamps

A workspace has members, invitations, projects, at most one GitHub installation,
repositories, webhook events, pull requests, issues, workflow runs, risk
assessments, and recommendations.

### WorkspaceMember

Links a user to a workspace and records their role.

Uniqueness: one membership per `(workspaceId, userId)`. There is no separate
active flag; the presence of the row is the membership. Removing the row removes
workspace access.

Every active workspace must retain at least one `OWNER`. Workspace creation
enforces this by inserting the workspace and the creator's `OWNER` membership in
one transaction. The `enforce_workspace_owner_invariants` migration adds two
database triggers for the remaining paths:

- A deferred constraint trigger rejects a committed workspace insert that has no
  `OWNER`. The trigger runs at transaction commit, so the normal workspace plus
  owner creation transaction succeeds.
- A `BEFORE DELETE OR UPDATE OF role` trigger rejects deleting or demoting the
  last `OWNER` while the workspace still exists. Workspace deletion is allowed
  because the parent workspace row is already removed when cascading membership
  deletes run.

The membership trigger acquires a transaction-scoped advisory lock keyed by the
workspace before counting other owners. Concurrent demotions or deletions of
different owners are therefore serialized; after the first transaction commits,
the second rechecks and is rejected if no owner remains. A hash collision can
serialize unrelated workspaces, but cannot weaken the invariant. This protection
is enforced by PostgreSQL under its default `READ COMMITTED` isolation. Higher
isolation levels may abort a conflicting transaction instead of allowing it to
proceed, but must not permit a zero-owner commit.

The trigger enforces data integrity, not actor authorization. Application code
must still verify that the authenticated user is permitted to change membership.
Current API code has no membership-management or ownership-transfer endpoint, so
the only supported membership write is `OWNER` assignment during creation.

### WorkspaceInvitation

Represents an invitation to join a workspace.

Implemented fields include:

- Internal UUID
- Workspace
- Invitee email
- Role to grant
- Unique invitation token hash
- Invitation status
- Optional inviter
- Expiry, acceptance, and revocation timestamps
- Internal timestamps

Only a hash of the invitation token is stored. The final invitation flow,
including whether email is always required, remains open.

### Ownership transfer (planned)

Ownership transfer is not implemented and has no endpoint. The intended safe
design is one transaction that:

1. Resolves the actor from the authenticated session and verifies that the actor
   is an authenticated `OWNER` of the workspace.
2. Locks the workspace or otherwise serializes membership changes for that
   workspace.
3. Promotes or adds the new `OWNER`.
4. Demotes or removes the previous `OWNER` only after the new ownership row is
   visible in the same transaction.

The database trigger still validates the final state and rejects any transaction
that would leave zero owners. Promoting the new owner before demoting the old
owner is required; the reverse order is rejected. The trigger does not replace
the actor authorization check.

### Project

Represents a minimal DevPulse project within exactly one workspace. A project is
a container for one connected GitHub repository, not a task tracker or general
project-management record.

Implemented fields include:

- Internal UUID
- Owning workspace, required
- Name
- Slug unique within the workspace
- Optional description
- Internal timestamps

The minimum MVP fields are the UUID, owning workspace, name, optional
description, and internal timestamps. The repository relationship is stored on
`Repository.projectId`, so no duplicate `Project.repositoryId` field is needed.
No project status field is recommended: repository connection state already
belongs to `Repository` and duplicating it on `Project` would create two sources
of truth. `Project.slug` is not required by the UUID-based MVP API; keeping or
removing it requires approval before the project API is implemented.

The target invariant is that every project has exactly one connected repository.
The implemented schema enforces the inverse side (one repository per project) and
at most one repository per project, but it currently allows a project with no
repository. The database cannot enforce the parent-requires-child side without a
deferred constraint trigger or an equivalent transactional invariant. Project
creation should therefore create the project and repository atomically; if the
exact-one rule is retained, a future migration should add a deferred trigger that
rejects committing a project without a repository.

A project-without-repository state is not part of the MVP. It would add empty
states, duplicate lifecycle rules, and permit repository ownership to remain
ambiguous. Project creation should wait for repository selection through the
GitHub App and insert both records in one transaction.

### GitHubInstallation

Represents the workspace's GitHub installation.

Implemented fields include:

- Internal UUID
- Owning workspace, unique
- Unique GitHub installation identifier
- GitHub account login and account type
- Installation status
- Granted permission names
- Last synchronization timestamp
- Internal timestamps

The workspace uniqueness constraint enforces at most one installation per
workspace, not only one active installation. Reconnection must reuse or replace
the existing record. GitHub installation access tokens and private keys are not
stored in this model.

### Repository

Represents a GitHub repository connected to exactly one project and workspace.

Implemented fields include:

- Internal UUID
- Owning workspace and project
- Owning GitHub installation
- Unique GitHub repository identifier
- Owner login, repository name, and full name
- Optional default branch
- Visibility and archived state
- Connection status and disconnection timestamp
- Connected and last synchronization timestamps
- Internal timestamps

The GitHub repository identifier is globally unique. A GitHub repository may
therefore be connected to only one DevPulse project at a time. If disconnected
repository records are retained, the existing record remains attached to its
project and must be reused for reconnection. Reassigning a disconnected
repository to another project or workspace is not part of the MVP and remains an
open decision; the global uniqueness constraint prevents simultaneous sharing but
does not by itself define transfer behavior.

A repository's installation is required, but the implemented foreign key checks
only `installationId`. It does not ensure that the installation belongs to the
repository's `workspaceId`. Application code must validate this today, and a
future migration should add a composite installation/workspace foreign key so a
repository cannot reference another workspace's installation.

Disconnection changes `connectionStatus` and `disconnectedAt`; it does not delete
the repository or its historical activity, and it does not delete the project.
Repository data deletion and project deletion are separate operations requiring
an approved lifecycle and retention decision.

### WebhookEvent

Represents a received GitHub webhook delivery.

Implemented fields include:

- Internal UUID
- Optional workspace, installation, and repository references
- Unique GitHub delivery identifier
- Event type and optional action
- Processing status
- Attempt count
- Safe last-error summary
- Next retry timestamp
- Received and processed timestamps
- Internal update timestamp

The unique delivery identifier provides duplicate-delivery protection. Processing
must be idempotent and must not assume events arrive in chronological order.

Raw webhook payloads are intentionally not stored. The metadata-first design
extracts only the fields needed for processing and retention. If future retry or
audit requirements need the original payload, that decision must be approved with
an explicit retention and privacy design.

### PullRequest

Stores pull request metadata for one repository.

Implemented fields include:

- Internal UUID
- Owning workspace and repository
- GitHub pull request identifier and number
- Title
- State and draft flag
- Optional author login
- Source and target branches
- GitHub created, updated, merged, and closed timestamps
- Optional additions and deletions totals
- Last synchronization timestamp
- Internal timestamps

Pull request bodies, diffs, and review comments are not stored.

### Issue

Stores issue metadata for one repository.

Implemented fields include:

- Internal UUID
- Owning workspace and repository
- GitHub issue identifier and number
- Title
- State
- Optional author login
- GitHub created, updated, and closed timestamps
- Last synchronization timestamp
- Internal timestamps

Issue bodies and comments are not stored.

### WorkflowRun

Stores GitHub Actions workflow run metadata for one repository.

Implemented fields include:

- Internal UUID
- Owning workspace and repository
- GitHub workflow run identifier
- Workflow name and optional run number
- Triggering event
- Status and optional conclusion
- Optional branch and head commit SHA
- Started and completed timestamps
- Last synchronization timestamp
- Internal timestamps

### RiskAssessment

Stores an explainable risk calculation for a project.

Implemented fields include:

- Internal UUID
- Owning workspace and project
- Decimal score
- Scoring algorithm version
- Assessment timestamp
- Structured evidence
- Internal timestamps

The workspace/project relationship uses a composite foreign key so the assessment
cannot reference a project outside its workspace. Multiple assessments per
project are allowed over time.

### Recommendation

Stores an actionable recommendation for a project.

Implemented fields include:

- Internal UUID
- Owning workspace and project
- Optional originating risk assessment
- Title and description
- Category
- Status
- Optional structured evidence
- Internal timestamps

The workspace/project relationship uses a composite foreign key. The optional
risk assessment reference does not yet enforce that the assessment belongs to the
same project and workspace at the database level; that consistency must be
enforced by the application when recommendations are created.

The category is stored as a string because the recommendation taxonomy is not
finalized. This avoids prematurely locking a product taxonomy into a database
enum.

## Relationships

- A user has many sessions.
- A user has many workspace memberships.
- A user may have sent many workspace invitations.
- A workspace has many members and invitations.
- A workspace has many projects.
- A workspace has at most one GitHub installation.
- A workspace has many repositories, webhook events, pull requests, issues,
  workflow runs, risk assessments, and recommendations.
- A project belongs to exactly one workspace.
- A project is intended to have exactly one repository; the schema currently
  enforces at most one and allows zero until the application or a future trigger
  closes that gap.
- A repository belongs to exactly one project and one workspace.
- A repository belongs to one GitHub installation, which must belong to the same
  workspace. The latter consistency rule is not currently enforced by the schema.
- A repository has many pull requests, issues, workflow runs, and webhook events.
- A webhook event may reference an installation, a repository, and a workspace.
- A project has many risk assessments and recommendations.
- A risk assessment may produce many recommendations.
- A recommendation may reference one risk assessment.

## Tenancy and workspace isolation

Workspace is the tenant boundary. The schema enforces several cross-tenant
consistency rules with composite foreign keys:

- `Repository` references `Project` by `(projectId, workspaceId)`.
- `PullRequest`, `Issue`, and `WorkflowRun` reference `Repository` by
  `(repositoryId, workspaceId)`.
- `RiskAssessment` and `Recommendation` reference `Project` by
  `(projectId, workspaceId)`.

These constraints prevent a child record from pointing at a parent in a different
workspace even if application code supplies inconsistent identifiers.

`Repository.installationId` is not yet part of a composite workspace constraint.
A direct database write can currently attach a repository in workspace A to an
installation in workspace B. Application code must reject that combination today.
The recommended Phase 8B migration is to add a unique `(id, workspaceId)` key to
`GitHubInstallation` and reference `(installationId, workspaceId)` from
`Repository`.

`WebhookEvent` uses optional direct references because a delivery may arrive
before its installation or repository is known. The application must keep its
optional workspace reference consistent with known installation and repository
references.

Application-level requirements remain:

- Every workspace-scoped API operation must verify membership.
- Queries must include a workspace constraint.
- Cross-workspace references must be rejected and tested.
- The at-least-one-owner rule is enforced by application transactions for creation
  and by database triggers for last-owner deletion/demotion and ownerless commits.
- Webhook event workspace consistency must be validated when references are
  resolved.
- Recommendation-to-risk-assessment consistency must be validated.

Whether PostgreSQL row-level security is used in addition to application checks
remains open.

## Uniqueness constraints

| Model | Constraint |
| --- | --- |
| `User` | Unique `email` |
| `User` | Unique `githubId` |
| `Session` | Unique `tokenHash` |
| `Workspace` | Unique `slug` |
| `WorkspaceMember` | Unique `(workspaceId, userId)` |
| `WorkspaceInvitation` | Unique `tokenHash` |
| `Project` | Unique `(workspaceId, slug)` |
| `Project` | Unique `(id, workspaceId)` for composite references |
| `GitHubInstallation` | Unique `workspaceId` |
| `GitHubInstallation` | Unique `githubInstallationId` |
| `Repository` | Unique `githubId` |
| `Repository` | Unique `projectId` |
| `Repository` | Unique `(projectId, workspaceId)` |
| `Repository` | Unique `(id, workspaceId)` for composite references |
| `WebhookEvent` | Unique `githubDeliveryId` |
| `PullRequest` | Unique `(repositoryId, githubId)` |
| `Issue` | Unique `(repositoryId, githubId)` |
| `WorkflowRun` | Unique `(repositoryId, githubId)` |

## Indexes

Indexes are included for foreign-key lookups, workspace-scoped queries, state
filters, retry scans, and time-based analytics.

Examples:

- Sessions: `(userId, expiresAt)` and `expiresAt`
- Memberships: `userId` and `(workspaceId, role)`
- Invitations: `(workspaceId, status)`, `email`, `expiresAt`, and `invitedById`
- Repositories: `installationId`, `(workspaceId, connectionStatus)`, and
  `lastSyncedAt`
- Webhook events: `(workspaceId, receivedAt)`, `(installationId, receivedAt)`,
  `(repositoryId, receivedAt)`, `(status, nextAttemptAt)`, and
  `(eventType, receivedAt)`
- Pull requests and issues: `(workspaceId, githubUpdatedAt)`,
  `(repositoryId, state)`, and `(repositoryId, githubCreatedAt)`
- Workflow runs: `(workspaceId, startedAt)`, `(repositoryId, status)`, and
  `(repositoryId, startedAt)`
- Risk assessments: `(workspaceId, assessedAt)` and `(projectId, assessedAt)`
- Recommendations: `(workspaceId, status)`, `(projectId, status)`, and
  `riskAssessmentId`

## Deletion behavior

Authentication and membership artifacts use cascading deletion where the child
record has no meaning without the parent:

- Deleting a user cascades their sessions and workspace memberships. A user who
  is the last `OWNER` of any workspace cannot be deleted until ownership is
  transferred or the workspace is deleted, because the cascading membership
  delete is rejected by the last-owner trigger. There is currently no user
  deletion endpoint.
- Deleting a workspace cascades memberships and invitations. The last-owner
  trigger permits this path because the workspace row is removed first.

Historical and integration records use restrictive deletion to avoid accidental
loss during direct database operations:

- A workspace with projects, repositories, an installation, risk assessments, or
  recommendations cannot be deleted by a plain database delete until those
  records are handled explicitly.
- A project with a repository, risk assessments, or recommendations cannot be
  deleted until those records are handled explicitly.
- An installation with repositories cannot be deleted until the repositories are
  disconnected or deleted explicitly.
- A repository with pull requests, issues, or workflow runs cannot be deleted
  until historical activity is handled explicitly.

Nullable references use `SetNull`:

- Webhook event references to workspace, installation, or repository
- Recommendation references to a risk assessment
- Invitation references to the inviter

Deleting a risk assessment therefore clears the optional recommendation
reference rather than deleting the recommendation.

### Workspace deletion endpoint

`DELETE /workspaces/:id` intentionally bypasses the restrictive behavior by
purging workspace-owned records explicitly inside one transaction, in dependency
order:

1. Webhook events linked to the workspace, its installation, or its repositories
2. Recommendations
3. Risk assessments
4. Pull requests
5. Issues
6. Workflow runs
7. Repositories
8. The local GitHub installation record
9. Projects
10. The workspace itself

Workspace memberships and invitations are removed by the existing cascading
foreign keys when the workspace is deleted. Every deletion is scoped to the
target workspace or to IDs belonging to that workspace, so unrelated workspaces
and other tenants are not affected. Global users, their sessions, and their
memberships in other workspaces are never deleted.

The GitHub App installation is not uninstalled through GitHub's external API.
Deleting the workspace removes only the local DevPulse installation record, so
external installation cleanup remains a separate operational task.

This workspace-deletion path is a deliberate permanent purge. It keeps repository
disconnection separate from repository data deletion while avoiding orphaned
workspace-owned rows. Retention periods for non-deletion flows, disconnected
repositories, and other historical data remain undefined and still require
product-level approval.

### Project deletion (proposed, requires approval)

Repository disconnection and project deletion are different actions:

- Disconnecting a repository changes its connection state, stops active
  synchronization, and retains the project plus historical activity.
- Deleting a project is a permanent local deletion of the project aggregate. It
  must not delete or modify the repository on GitHub and must not uninstall the
  workspace's GitHub App installation.

If permanent project deletion is approved, the recommended transaction is:

1. Verify the authenticated actor's `OWNER` or `ADMIN` membership.
2. Resolve the project by both `projectId` and `workspaceId`.
3. Delete webhook events linked to the project's repository.
4. Delete the project's recommendations and risk assessments.
5. Delete pull requests, issues, and workflow runs for the repository.
6. Delete the repository record.
7. Delete the project record.

This matches the workspace deletion purge order and leaves other projects,
workspace memberships, the GitHub installation, and external GitHub data intact.
Deleting the repository record releases its global GitHub identifier for a future
connection; that consequence requires explicit approval. If retention is required
instead, project deletion must use a softer archive/retention model and must not
use this purge.

## Webhook processing design

- `githubDeliveryId` is unique, so duplicate deliveries cannot create duplicate
  event records.
- Processing status is explicit.
- `attempts`, `lastError`, and `nextAttemptAt` support retry handling.
- `receivedAt` and `processedAt` are separate, and processing must not assume
  delivery order.
- Raw payload storage is deliberately omitted to minimize personal data and
  unnecessary metadata retention.

## Risk and recommendation provenance

`RiskAssessment` retains the score, assessment time, algorithm version, measured
evidence, project, and workspace. This supports explaining how a score was
produced without storing source code.

`Recommendation` retains title, description, category, status, optional evidence,
project, workspace, and an optional link to the assessment that produced it. This
is intentionally rule- and evidence-oriented rather than a generic AI framework.

## JSON field decisions

`RiskAssessment.evidence` and `Recommendation.evidence` use PostgreSQL `jsonb`.

This is justified because evidence is algorithm-specific and evolves faster than
the core relational schema. The JSON should contain structured metric names,
values, thresholds, time windows, and references needed to explain the result. It
must not contain source code, diffs, secrets, tokens, or unnecessary personal
data. Application code must validate and bound the evidence before writing it.

`WebhookEvent` does not store a JSON payload. The metadata-first and privacy
requirements favor extracting only required fields at ingestion time.

## Security considerations

- Passwords are represented only by a password hash.
- Session credentials are represented only by a token hash.
- Invitation tokens are represented only by a token hash.
- GitHub installation access tokens and private keys are not stored.
- GitHub installation permission names are stored without credentials.
- Webhook error summaries must not contain tokens or full request bodies.
- Repository source code, diffs, and file contents are not stored.
- Personal data is limited to optional account details, invitee email, and
  GitHub author logins.
- Workspace isolation must be enforced in application queries in addition to the
  composite foreign keys.

## Application-level invariants

The following cannot be guaranteed by the implemented Prisma schema alone:

- Every project has a connected repository. The schema currently allows zero or
  one; project creation must be atomic, and a future deferred trigger should
  enforce exactly one if the MVP keeps that rule.
- A repository's installation belongs to the same workspace as the repository.
  This gap should be closed by a composite foreign key in Phase 8B.
- A webhook event's optional workspace reference matches its installation and
  repository references when those are known.
- A recommendation's risk assessment belongs to the same project and workspace.
- Repository disconnection and reconnection follow an approved workflow.
- Retention periods and deletion workflows follow approved policy.

## Migration status

Batch 5C deferred migration work. Batch 6B created and committed the initial
`init_devpulse` migration and verified it against an isolated PostgreSQL instance.
Batch 7E added the `enforce_workspace_owner_invariants` migration and verified it
against an isolated PostgreSQL instance. The Docker Compose development database
still requires both migrations to be applied, and no shared or production
database has been migrated.

## Resolved decisions

- Authentication uses database-backed server-side sessions. Session creation,
  validation, and current-session revocation are implemented; expired/revoked
  session cleanup remains pending.
- GitHub integration uses a GitHub App.
- Every active workspace retains at least one `OWNER`. Creation assigns it
  transactionally; deferred and last-owner triggers reject ownerless workspace
  commits, last-owner deletion, and last-owner demotion. Concurrent changes are
  serialized per workspace with an advisory lock.
- Request DTOs reject membership role, `userId`, and membership fields. Role
  assignment is server-controlled.
- Workspace memberships are active by row presence; no soft-delete state exists.
- Ownership transfer is deferred and has no endpoint. Its transactional design is
  documented above.
- A Project is a minimal workspace-scoped container for exactly one connected
  GitHub repository, not a general project-management record.
- A GitHub repository cannot be connected to multiple projects or workspaces at
  the same time. Disconnected repository records remain attached to their existing
  project unless a future transfer flow is approved.
- Project creation waits for repository selection through the GitHub App and
  creates the project and repository atomically. A repo-less project creation
  state is not part of the MVP.

## Open decisions

- Final role and permission matrix
- Invitation flow and whether email is always required
- GitHub App permissions and credential storage design
- Repository reconnection behavior after disconnection
- Whether disconnected repository records are retained indefinitely
- Retention periods for webhook events, engineering activity, evidence, and
  recommendations
- Recommendation category taxonomy
- Whether PostgreSQL row-level security is required
- Whether raw webhook payloads are ever retained
- Ownership-transfer endpoint behavior, audit trail, and authorization flow
- Whether the exact-one project-to-repository rule is enforced by a deferred
  database trigger in addition to atomic application creation
- Whether `Project.slug` is retained or removed before the project API is
  implemented
- Whether project deletion permanently purges local repository metadata and
  history or uses a retention/archive model
- Whether disconnected repositories may ever be reassigned to another project or
  workspace
- Whether archived GitHub repositories may be newly connected to a project
