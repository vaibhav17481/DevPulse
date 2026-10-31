# DevPulse Database Design

## Document status

The initial PostgreSQL schema is implemented in
`packages/database/prisma/schema.prisma` using Prisma 7.10.1. The schema is
validated and the Prisma Client is generated, but no migration has been created
or applied, and no runtime database integration has been verified.

This document describes the implemented schema and the decisions that still
require product or architecture approval. It must not be read as proof that
migration or runtime database integration is complete.

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

The authentication strategy is still open. `passwordHash` and the GitHub identity
fields are nullable so the schema does not prematurely force a single provider.
Password hashes are stored instead of plaintext passwords.

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

Uniqueness: one membership per `(workspaceId, userId)`.

Every active workspace must retain at least one `OWNER`. This is an
application-level transactional invariant, not a database constraint. Ordinary
foreign keys and unique constraints cannot guarantee it across membership
changes, ownership transfer, and user deletion.

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

### Project

Represents a DevPulse project within exactly one workspace.

Implemented fields include:

- Internal UUID
- Owning workspace
- Name
- Slug unique within the workspace
- Optional description
- Internal timestamps

A project has at most one connected repository in the implemented schema. The
database enforces that a repository belongs to only one project and that a
project cannot own multiple repositories. The database cannot enforce that every
project has a repository at all times; that is an application-level invariant
until the repository connection workflow is implemented.

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

The GitHub repository identifier is globally unique. If disconnected repository
records are retained, reconnecting the same GitHub repository must reuse the
existing record. Reconnection to a different project or workspace remains an
open decision.

Disconnection changes `connectionStatus` and `disconnectedAt`; it does not delete
the repository or its historical activity. Repository data deletion is a separate
operation.

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
- A project has at most one repository.
- A repository belongs to exactly one project and one workspace.
- A repository belongs to one GitHub installation.
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

`WebhookEvent` uses optional direct references because a delivery may arrive
before its installation or repository is known. The application must keep its
optional workspace reference consistent with known installation and repository
references.

Application-level requirements remain:

- Every workspace-scoped API operation must verify membership.
- Queries must include a workspace constraint.
- Cross-workspace references must be rejected and tested.
- The at-least-one-owner rule must be enforced transactionally.
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

- Deleting a user cascades their sessions and workspace memberships.
- Deleting a workspace cascades memberships and invitations.

Historical and integration records use restrictive deletion to avoid accidental
loss:

- A workspace with projects, repositories, an installation, risk assessments, or
  recommendations cannot be deleted until those records are handled explicitly.
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

These choices keep repository disconnection separate from repository data
deletion. They also avoid indiscriminate cascade deletion of historical
engineering activity.

Retention periods are not defined in this batch. Product-level approval is still
required for raw webhook metadata, repository activity, risk evidence, and
recommendations.

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

- Every active workspace has at least one `OWNER`.
- Every project has a connected repository.
- A webhook event's optional workspace reference matches its installation and
  repository references when those are known.
- A recommendation's risk assessment belongs to the same project and workspace.
- Repository disconnection and reconnection follow an approved workflow.
- Retention periods and deletion workflows follow approved policy.

## Migration status

The schema is validated and the Prisma Client generates successfully. No migration
has been created or applied because Batch 5C explicitly defers migration work.
This conflicts with the general repository rule that every schema change must use
a committed Prisma migration; the migration remains a required follow-up before
the schema is used against a shared or production database.

## Open decisions

- Final authentication and session strategy
- Final role and permission matrix
- Invitation flow and whether email is always required
- GitHub App versus OAuth app and credential storage design
- Repository reconnection behavior after disconnection
- Whether disconnected repository records are retained indefinitely
- Retention periods for webhook events, engineering activity, evidence, and
  recommendations
- Recommendation category taxonomy
- Whether PostgreSQL row-level security is required
- Whether raw webhook payloads are ever retained
- How the at-least-one-owner invariant is enforced transactionally
- How project-to-repository connectivity is enforced as an application invariant
