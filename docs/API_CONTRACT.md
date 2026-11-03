# DevPulse API Contract

## Document status

Most paths, payloads, and status codes in this document remain **proposed** and
must be approved before implementation. The email/password endpoints and initial
workspace endpoints described under "Implemented endpoints" are implemented:
registration, login, current user, logout, workspace creation, workspace
listing, workspace retrieval, workspace detail updates, and workspace deletion.
Authentication uses database-backed sessions and an HTTP-only session cookie.
Workspace creation assigns the creator an `OWNER` membership, and workspace
listing, retrieval, and updates require an active membership. Workspace updates
are limited to `OWNER` and `ADMIN` members. Workspace deletion is limited to
`OWNER` members. The database enforces that a workspace cannot commit without an
`OWNER` and that the last `OWNER` cannot be deleted or demoted. Invitations,
member management, role changes, ownership transfer, broader workspace
authorization, GitHub sign-in, and the rest of the API remain proposed and are
not implemented. The project endpoints and project-management authorization rules
in this document are Phase 8A proposals and are not implemented.

## API conventions

Proposed conventions:

- Use HTTPS for all requests.
- Use JSON request and response bodies unless a different format is explicitly
  required.
- Prefix versioned application routes with `/api/v1`.
- Use plural nouns and kebab-case paths, such as
  `/workspaces/:workspaceId/repositories`.
- Scope tenant data under a workspace path.
- Use opaque internal identifiers in URLs; do not expose database-only details.
- Return timestamps as ISO 8601 strings in UTC.
- Use cursor-based pagination for large collections unless a simpler approach is
  approved. Workspace listing currently uses validated offset pagination because
  a user's workspace set is expected to be small.
- Accept and return only the fields required by the contract.
- Reserve `/health` and `/health/ready` for operational checks outside the
  versioned application routes.

## Authentication conventions

Email/password registration and login are implemented. Login creates a
database-backed server-side session and sets an HTTP-only session cookie.
Registration does not create a session.

Implemented session rules:

- The cookie is named `devpulse_session` and uses `HttpOnly`, `SameSite=Lax`,
  `Path=/`, and a seven-day lifetime. `Secure` is enabled when the API runs in
  production.
- The raw session token is returned only through the cookie. PostgreSQL stores
  only its SHA-256 hash.
- Protected requests read the session token from the cookie, hash it, and look up
  an unrevoked, unexpired session whose associated user still exists.
- The API returns `401` with `Authentication required.` for missing, malformed,
  unknown, expired, or revoked sessions. The response does not reveal which
  condition applied.
- Session validation does not extend expiration and does not update
  `lastUsedAt`. There is no sliding-expiration policy.
- The authenticated user's safe identity is `id` and `email`; password hashes,
  session records, raw tokens, and token hashes are never returned.
- Logout revokes only the current session and does not revoke other sessions for
  the same user.
- Cookie-authenticated state-changing requests still require CSRF protection in a
  later security batch.

Proposed rules:

- The API authenticates every protected request.
- Unauthenticated requests return `401`.
- The API resolves the current user from a trusted server-side identity, never
  from a client-supplied user identifier.
- GitHub installation tokens and other provider credentials stay server-side.
- The web application must never receive provider tokens or client secrets.
- Authentication responses must not reveal whether an unrelated account exists.

## Implemented endpoints

### `POST /auth/register`

Creates a password-based user account. This endpoint does not create a session,
cookie, or token.

Request body:

```json
{
  "email": "user@example.com",
  "password": "example-password"
}
```

Validation and behavior:

- `email` is trimmed and lowercased before validation, duplicate checks, and
  storage.
- `email` must be a valid address with at most 320 characters.
- `password` must be between 12 and 128 characters and contain at least one
  letter and one number.
- Unknown request fields are rejected.
- Duplicate normalized emails return `409 Conflict`.
- Passwords are hashed with Argon2id before storage. Plaintext passwords and
  password hashes are never returned.
- Unexpected failures return a generic `500` response without database details.

Success response (`201 Created`):

```json
{
  "id": "3f6f2a5e-4a7d-4f5d-8f0a-7c2e1f9b6d10",
  "email": "user@example.com"
}
```

Error responses:

| Status | Meaning |
| --- | --- |
| `400` | Missing, malformed, or unknown request fields |
| `409` | The normalized email is already registered |
| `500` | Unexpected server failure |

### `POST /auth/login`

Authenticates an email/password account and starts a database-backed session.

Request body:

```json
{
  "email": "user@example.com",
  "password": "example-password"
}
```

Behavior:

- `email` is trimmed and lowercased before lookup.
- Unknown emails, incorrect passwords, and password-less accounts return the
  same generic `401` response: `Invalid email or password.`
- A successful login creates one seven-day session, stores only the SHA-256
  token hash, and sets the `devpulse_session` cookie. The raw token is not
  returned in the response body or persisted in PostgreSQL.
- Unexpected failures return a generic `500` response without database details.

Success response (`200 OK`):

```json
{
  "id": "3f6f2a5e-4a7d-4f5d-8f0a-7c2e1f9b6d10",
  "email": "user@example.com"
}
```

Error responses:

| Status | Meaning |
| --- | --- |
| `400` | Missing, malformed, or unknown request fields |
| `401` | Invalid email or password |
| `500` | Unexpected server failure |

### `GET /auth/me`

Requires a valid `devpulse_session` cookie. Returns the authenticated user's safe
identity only:

```json
{
  "id": "3f6f2a5e-4a7d-4f5d-8f0a-7c2e1f9b6d10",
  "email": "user@example.com"
}
```

Password hashes, session records, raw tokens, and token hashes are never
returned. Missing, malformed, unknown, expired, and revoked sessions all return
`401` with `Authentication required.`

### `POST /auth/logout`

Revokes the session identified by the current cookie and clears the
`devpulse_session` cookie with the same path, `HttpOnly`, `SameSite`, and
`Secure` policy used when it was set.

Behavior:

- Always returns `204 No Content` for valid, already-revoked, expired, malformed,
  or missing session cookies and clears the cookie. The response does not reveal
  whether a session existed.
- Revokes only the current session. Other sessions belonging to the same user
  remain valid.
- A revoked session cannot authenticate later requests.
- Repeated logout requests are idempotent.
- Unexpected database failures return `500` rather than falsely confirming a
  logout.

### `POST /workspaces`

Requires a valid `devpulse_session` cookie. Creates a workspace and an `OWNER`
membership for the authenticated user in one database transaction.

Request body:

```json
{
  "name": "Platform Engineering",
  "description": "Delivery health for the platform team"
}
```

Validation and behavior:

- `name` is required, trimmed, and limited to 255 characters.
- `description` is optional and nullable, trimmed when supplied, and limited to
  2000 characters.
- Unknown request fields, including client-supplied user or role fields, are
  rejected.
- The creator is always the authenticated user. The request cannot choose a
  different user or membership role.
- A globally unique slug is generated from the name with a random suffix. It is
  limited to the schema's 100-character slug length.
- If membership creation fails, the workspace creation is rolled back and a
  generic `500` response is returned.

Success response (`201 Created`):

```json
{
  "id": "3f6f2a5e-4a7d-4f5d-8f0a-7c2e1f9b6d10",
  "name": "Platform Engineering",
  "slug": "platform-engineering-1a2b3c4d",
  "description": "Delivery health for the platform team",
  "role": "OWNER",
  "createdAt": "2026-11-02T12:00:00.000Z"
}
```

### `GET /workspaces`

Requires a valid `devpulse_session` cookie. Returns workspaces where the current
user has an active membership, including the user's role in each workspace.

Query parameters:

| Parameter | Default | Rules |
| --- | --- | --- |
| `page` | `1` | Integer greater than or equal to `1` |
| `limit` | `20` | Integer from `1` to `100` |

Behavior:

- Membership filtering happens in the database query.
- Results are ordered newest first by workspace `createdAt`, with the workspace
  ID as a deterministic tie-breaker.
- Unknown query parameters are rejected. A client cannot select another user by
  supplying a user ID.
- Responses exclude password hashes, session data, invitation tokens, and member
  lists.

Success response (`200 OK`):

```json
{
  "items": [
    {
      "id": "3f6f2a5e-4a7d-4f5d-8f0a-7c2e1f9b6d10",
      "name": "Platform Engineering",
      "slug": "platform-engineering-1a2b3c4d",
      "description": "Delivery health for the platform team",
      "role": "OWNER",
      "createdAt": "2026-11-02T12:00:00.000Z",
      "updatedAt": "2026-11-02T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

`totalPages` is `0` when the user has no workspaces. Requesting a page beyond the
available results returns an empty `items` array.

### `GET /workspaces/:id`

Requires a valid `devpulse_session` cookie. Returns one workspace only when the
authenticated user has an active membership.

Behavior:

- `id` must be a valid UUID.
- The membership lookup filters by both authenticated user ID and workspace ID in
  the database.
- A nonexistent workspace and a workspace the user cannot access both return the
  same `404 Workspace not found.` response.
- The response includes only safe workspace fields and the requesting user's
  membership role.

Success response (`200 OK`):

```json
{
  "id": "3f6f2a5e-4a7d-4f5d-8f0a-7c2e1f9b6d10",
  "name": "Platform Engineering",
  "slug": "platform-engineering-1a2b3c4d",
  "description": "Delivery health for the platform team",
  "role": "ADMIN",
  "createdAt": "2026-11-02T12:00:00.000Z",
  "updatedAt": "2026-11-02T12:00:00.000Z"
}
```

### `PATCH /workspaces/:id`

Requires a valid `devpulse_session` cookie. Updates the name and/or description
of one workspace when the authenticated user is an `OWNER` or `ADMIN` member.

Request body:

```json
{
  "name": "Platform Engineering",
  "description": "Updated delivery health context"
}
```

Validation and behavior:

- `id` must be a valid UUID.
- At least one of `name` or `description` must be supplied.
- `name` is optional, trimmed, non-empty when supplied, and limited to 255
  characters.
- `description` is optional and nullable, trimmed when supplied, and limited to
  2000 characters. Supplying `description: null` clears the description.
- Unknown fields, invalid types, and attempts to update the workspace ID, owner,
  memberships, role, or timestamps are rejected.
- Membership and role checks happen before the update, using the authenticated
  user's membership. A client cannot supply or override its user ID or role.
- `OWNER` and `ADMIN` members may update the workspace. Other members, including
  `MEMBER` and `VIEWER`, receive `403 You do not have permission to update this
  workspace.`
- A nonexistent workspace and a workspace the user cannot access both return the
  same `404 Workspace not found.` response.
- Only the requested workspace is updated. A transaction keeps the membership
  check and update consistent.

Success response (`200 OK`):

```json
{
  "id": "3f6f2a5e-4a7d-4f5d-8f0a-7c2e1f9b6d10",
  "name": "Platform Engineering",
  "slug": "platform-engineering-1a2b3c4d",
  "description": "Updated delivery health context",
  "role": "ADMIN",
  "createdAt": "2026-11-02T12:00:00.000Z",
  "updatedAt": "2026-11-03T12:00:00.000Z"
}
```

### `DELETE /workspaces/:id`

Requires a valid `devpulse_session` cookie. Permanently deletes one workspace
and its workspace-owned data when the authenticated user is an `OWNER` member.

Behavior:

- `id` must be a valid UUID.
- Only `OWNER` members may delete the workspace. `ADMIN`, `MEMBER`, and `VIEWER`
  members receive `403 You do not have permission to delete this workspace.`
- A nonexistent workspace and a workspace the user cannot access both return the
  same `404 Workspace not found.` response.
- Deletion runs in one database transaction. If any step fails, all changes are
  rolled back and a generic `500 Unable to delete workspace.` response is
  returned.
- The transaction removes workspace-scoped webhook events, recommendations, risk
  assessments, pull requests, issues, workflow runs, repositories, the local
  GitHub installation record, projects, and then the workspace itself.
  Workspace memberships and invitations are removed by the schema's cascade.
- Only records belonging to the requested workspace are deleted. Global user
  accounts, their sessions, and memberships in other workspaces are preserved.
- The GitHub App installation is not uninstalled through GitHub's external API.
  Its local DevPulse record is deleted with the workspace, so external
  installation cleanup remains a separate operational task.
- Successful deletion returns `204 No Content` with no response body.

Error responses for workspace endpoints:

| Status | Meaning |
| --- | --- |
| `400` | Missing, malformed, or unknown request fields, an empty update body, invalid pagination, or invalid workspace ID |
| `401` | Missing or invalid authentication |
| `403` | The authenticated member lacks permission for the requested action |
| `404` | Workspace does not exist or is not accessible to the current user |
| `500` | Unexpected server failure, including a rolled-back workspace deletion |

These endpoints are currently served at `/auth/register`, `/auth/login`,
`/auth/me`, `/auth/logout`, `/workspaces`, and `/workspaces/:id`. The proposed
`/api/v1` prefix has not been applied.

## Authorization conventions

DevPulse is workspace-scoped. Proposed rules:

- Every workspace-scoped endpoint verifies that the authenticated user is a
  member of the workspace.
- Roles are checked for actions that require elevated permission.
- Access to one workspace must never grant access to another.
- Client-supplied `workspaceId` values are treated as untrusted input.
- A missing membership may be returned as `404` where confirming the workspace
  exists would leak information.
- Authorization checks belong in the API or shared business layer, not only in
  the browser.

Role names:

| Role | Proposed intent |
| --- | --- |
| Owner | Manage workspace ownership, members, and integrations |
| Admin | Manage integrations, repositories, and most workspace settings |
| Member | View insights and perform approved workspace actions |
| Viewer | Read-only access to approved workspace data |

Proposed project permissions refine this matrix: `OWNER` and `ADMIN` may manage
projects, while `MEMBER` and `VIEWER` may only list and read them. The broader
role matrix remains open.

Implemented for workspace creation, listing, retrieval, updates, and deletion:

- Workspace creation uses the authenticated session identity and atomically
  assigns the creator the `OWNER` role. Client-supplied `userId`, `role`, and
  membership fields are rejected as unknown request fields.
- Workspace membership is represented by the existence of a membership row. All
  existing workspace endpoints require that row, so removing a membership removes
  access.
- Workspace creation and update requests cannot assign or change a membership
  role. There are no membership-management endpoints yet.
- The database rejects committing a workspace without an `OWNER` and rejects
  deleting or demoting the last `OWNER`. The membership trigger serializes
  concurrent changes for the same workspace with an advisory lock; application
  code still performs actor authorization.
- Workspace listing filters by the authenticated user's memberships in the
  database query and returns that membership role.
- Workspace retrieval filters by both authenticated user ID and workspace ID in
  the database query. Nonexistent and inaccessible workspaces both return `404`.
- Workspace updates check the authenticated user's membership and role before
  updating. Only `OWNER` and `ADMIN` members may update workspace details;
  `MEMBER` and `VIEWER` members receive `403`. Non-members and nonexistent
  workspaces both return `404`.
- Workspace deletion checks the authenticated user's membership and role before
  deleting. Only `OWNER` members may delete; other members receive `403`.
  Non-members and nonexistent workspaces both return `404`.

The final permission matrix for remaining operations is an open decision.

## Validation and error handling

Proposed validation rules:

- Validate path parameters, query parameters, request bodies, and job payloads
  at system boundaries.
- Reject unknown or malformed fields instead of silently ignoring them.
- Enforce reasonable request size and pagination limits.
- Validate GitHub webhook signatures before processing webhook payloads.
- Validate queue payloads before background processing.
- Use stable machine-readable error codes plus human-readable messages.
- Do not include secrets, tokens, stack traces, or raw provider responses in API
  errors.
- Do not trust metadata received from GitHub until it has been validated.

Proposed error envelope:

```json
{
  "error": {
    "code": "WORKSPACE_NOT_FOUND",
    "message": "The requested workspace was not found.",
    "details": {},
    "requestId": "optional-correlation-id"
  }
}
```

Proposed status code usage:

| Status | Meaning |
| --- | --- |
| `200` | Successful read or update |
| `201` | Resource created |
| `202` | Background work accepted |
| `204` | Successful operation with no response body |
| `400` | Malformed request |
| `401` | Missing or invalid authentication |
| `403` | Authenticated but not permitted |
| `404` | Resource not found or intentionally hidden |
| `409` | Conflict, such as duplicate membership |
| `422` | Request is valid JSON but fails business validation |
| `429` | Rate limit exceeded |
| `500` | Unexpected server error |
| `503` | Dependency or service unavailable |

## Proposed endpoint modules

### Authentication

| Method | Path | Purpose | Status |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | Create an email/password account | Implemented |
| `POST` | `/auth/login` | Start a database-backed session | Implemented |
| `GET` | `/auth/me` | Return the current user | Implemented |
| `POST` | `/auth/logout` | Revoke the current session | Implemented |
| `GET` | `/api/v1/auth/github` | Start GitHub sign-in | Proposed |
| `GET` | `/api/v1/auth/github/callback` | Complete GitHub sign-in | Proposed |

Database-backed sessions are implemented for email/password authentication.
Whether GitHub is also a sign-in provider remains open.

### Workspaces and members

| Method | Path | Purpose | Status |
| --- | --- | --- | --- |
| `GET` | `/workspaces` | List workspaces for the current user | Implemented |
| `POST` | `/workspaces` | Create a workspace | Implemented |
| `GET` | `/workspaces/:id` | Read workspace details | Implemented |
| `PATCH` | `/workspaces/:id` | Update workspace name or description | Implemented |
| `DELETE` | `/workspaces/:id` | Permanently delete a workspace | Implemented |
| `GET` | `/api/v1/workspaces/:workspaceId/members` | List workspace members | Proposed |
| `POST` | `/api/v1/workspaces/:workspaceId/members` | Invite or add a member | Proposed |
| `PATCH` | `/api/v1/workspaces/:workspaceId/members/:memberId` | Change a member role | Proposed |
| `DELETE` | `/api/v1/workspaces/:workspaceId/members/:memberId` | Remove a member | Proposed |

Users may belong to multiple workspaces, and workspace creation, listing,
retrieval, detail updates, and deletion are implemented. The member-management
endpoints above are proposed only; they are not implemented. Invitation flow and
ownership transfer remain unconfirmed. Ownership transfer must not be added
without the transactional design described in `DATABASE_DESIGN.md`.

### GitHub integration

| Method | Path | Purpose | Status |
| --- | --- | --- | --- |
| `GET` | `/api/v1/workspaces/:workspaceId/integrations/github` | Read GitHub connection status | Proposed |
| `POST` | `/api/v1/workspaces/:workspaceId/integrations/github/connect` | Start a GitHub installation flow | Proposed |
| `DELETE` | `/api/v1/workspaces/:workspaceId/integrations/github` | Disconnect GitHub | Proposed |
| `POST` | `/api/v1/webhooks/github` | Receive signed GitHub webhook events | Proposed |

GitHub App is the selected integration approach. Installation callback flow,
permissions, and which webhook events are accepted remain open.

### Repositories

| Method | Path | Purpose | Status |
| --- | --- | --- | --- |
| `GET` | `/api/v1/workspaces/:workspaceId/repositories` | List connected repositories | Proposed |
| `GET` | `/api/v1/workspaces/:workspaceId/repositories/:repositoryId` | Read repository details | Proposed |
| `POST` | `/api/v1/workspaces/:workspaceId/repositories/:repositoryId/sync` | Request a metadata refresh | Proposed |
| `GET` | `/api/v1/workspaces/:workspaceId/repositories/:repositoryId/sync-status` | Read synchronization state | Proposed |

### Projects

Proposed paths mirror the currently unprefixed workspace endpoints. If `/api/v1`
is adopted for the public API, these paths move under that prefix.

| Method | Path | Purpose | Status |
| --- | --- | --- | --- |
| `POST` | `/workspaces/:workspaceId/projects` | Create a project and connect one GitHub repository | Proposed |
| `GET` | `/workspaces/:workspaceId/projects` | List projects in a workspace | Proposed |
| `GET` | `/workspaces/:workspaceId/projects/:projectId` | Read one project | Proposed |
| `PATCH` | `/workspaces/:workspaceId/projects/:projectId` | Update project name or description | Proposed |
| `DELETE` | `/workspaces/:workspaceId/projects/:projectId` | Permanently delete a project aggregate | Proposed |

All project endpoints require a valid `devpulse_session` cookie. Every request
checks the caller's membership in the workspace identified by the path. The path
`workspaceId` and `projectId` are untrusted input and must be UUID-validated.

| Operation | `OWNER` | `ADMIN` | `MEMBER` | `VIEWER` | Non-member |
| --- | --- | --- | --- | --- | --- |
| List/read | Allowed | Allowed | Allowed | Allowed | `404` |
| Create/update/delete | Allowed | Allowed | `403` | `403` | `404` |

Nonexistent workspaces, nonexistent projects, and projects in another workspace
all return `404`. A non-member must not be able to distinguish whether a project
exists in another workspace. Database queries must include both the project ID
and the path workspace ID for detail operations, and the workspace ID for list
operations.

#### Project response shape

```json
{
  "id": "uuid",
  "name": "Checkout API",
  "description": "Optional description",
  "repository": {
    "id": "uuid",
    "githubId": "123456789",
    "ownerLogin": "acme",
    "name": "checkout-api",
    "fullName": "acme/checkout-api",
    "defaultBranch": "main",
    "visibility": "PRIVATE",
    "isArchived": false,
    "connectionStatus": "ACTIVE",
    "connectedAt": "2026-11-04T10:00:00.000Z",
    "disconnectedAt": null,
    "lastSyncedAt": null
  },
  "createdAt": "2026-11-04T10:00:00.000Z",
  "updatedAt": "2026-11-04T10:00:00.000Z"
}
```

GitHub numeric identifiers are returned as decimal strings because they may exceed
JavaScript's safe integer range. Installation IDs, tokens, and installation
permissions are not exposed. `repository` is nullable only as defensive support
for legacy or pre-invariant data; the target MVP shape always includes one
repository. A disconnected repository remains present with
`connectionStatus: "DISCONNECTED"` and a non-null `disconnectedAt`.

#### `POST /workspaces/:workspaceId/projects`

Authorization: `OWNER` or `ADMIN`. `MEMBER` and `VIEWER` receive `403`.

Proposed request:

```json
{
  "name": "Checkout API",
  "description": "Optional description",
  "repositoryGithubId": "123456789"
}
```

Rules:

- `name` is required, trimmed, and between 1 and 255 characters.
- `description` is optional, trimmed, at most 2000 characters, and `null` clears
  it.
- `repositoryGithubId` is required and is a decimal string. It must identify a
  repository visible to the workspace's active GitHub installation. The server
  verifies the repository through GitHub and derives owner login, name, full name,
  visibility, default branch, and archived state. The client must not submit those
  fields.
- The project and repository are created in one transaction using the workspace
  from the path. The body must not contain `workspaceId`, `projectId`, `userId`,
  `role`, `slug`, status, timestamps, or repository metadata.
- New connections to an archived repository are rejected.
- The GitHub repository must not already be connected to any DevPulse project or
  workspace. The response must not reveal the identity of another workspace where
  the repository is connected.

Responses:

- `201 Created` with the project response.
- `400 Bad Request` for malformed UUIDs, fields, or validation failures.
- `401 Unauthorized` for missing or invalid authentication.
- `403 Forbidden` when the member lacks `OWNER` or `ADMIN`.
- `404 Not Found` for an inaccessible workspace or a repository that cannot be
  resolved through the workspace installation.
- `409 Conflict` when the repository is already connected or cannot be uniquely
  selected.
- `503 Service Unavailable` when GitHub cannot be queried safely.

#### `GET /workspaces/:workspaceId/projects`

Authorization: any workspace member.

Query parameters: optional `page` (minimum 1, default 1) and `limit` (1-100,
default 20). Results are ordered predictably, preferably by `createdAt` descending
then project ID descending. The count and item query must both be constrained to
the path workspace.

Response: `200 OK` with `{ "items": ProjectResponse[], "pagination": { "page",
"limit", "total", "totalPages" } }`.

Errors: `400` for invalid query values, `401`, `404` for an inaccessible
workspace, and `500` for unexpected failures.

#### `GET /workspaces/:workspaceId/projects/:projectId`

Authorization: any workspace member.

The lookup must use both `projectId` and `workspaceId`. A project that exists in a
different workspace is indistinguishable from a missing project: `404`.

Response: `200 OK` with the project response. Errors: `400` for malformed UUIDs,
`401`, `404`, and `500`.

#### `PATCH /workspaces/:workspaceId/projects/:projectId`

Authorization: `OWNER` or `ADMIN`. `MEMBER` and `VIEWER` receive `403`.

Proposed request accepts at least one of:

```json
{
  "name": "Updated project name",
  "description": "Updated description or null"
}
```

Validation matches project creation. Repository fields, repository reassignment,
`workspaceId`, `projectId`, `slug`, status, role, and timestamps are rejected as
unknown or immutable fields. The membership check and update occur in one
transaction, and the update is scoped by both project ID and workspace ID.

Response: `200 OK` with the updated project response. Errors: `400` for an empty
body or validation failure, `401`, `403`, `404`, and `500`.

#### `DELETE /workspaces/:workspaceId/projects/:projectId`

Authorization: `OWNER` or `ADMIN`. `MEMBER` and `VIEWER` receive `403`.

This permanently deletes the local DevPulse project aggregate. It does not delete
or modify the GitHub repository, and it does not uninstall the workspace's GitHub
App installation. It is distinct from repository disconnection, which retains the
project and historical metadata.

If permanent deletion is approved, one transaction deletes webhook events linked
to the project's repository, recommendations, risk assessments, pull requests,
issues, workflow runs, the repository record, and the project record, in that
order. Every step is scoped to the project and workspace. Other projects,
workspace memberships, the GitHub installation, and external GitHub data are
preserved.

Response: `204 No Content`. Errors: `400` for malformed UUIDs, `401`, `403`,
`404`, and `500`.

Confirmation of permanent-delete versus retention behavior is required before
this endpoint is implemented.

### Pull requests and reviews

| Method | Path | Purpose | Status |
| --- | --- | --- | --- |
| `GET` | `/api/v1/workspaces/:workspaceId/pull-requests` | List pull request metadata | Proposed |
| `GET` | `/api/v1/workspaces/:workspaceId/pull-requests/:pullRequestId` | Read pull request details | Proposed |
| `GET` | `/api/v1/workspaces/:workspaceId/pull-requests/:pullRequestId/reviews` | List review metadata | Proposed |

Unconfirmed: whether issue metadata, commit metadata, and review text are exposed.

### Deployments and CI metadata

| Method | Path | Purpose | Status |
| --- | --- | --- | --- |
| `GET` | `/api/v1/workspaces/:workspaceId/deployments` | List deployment metadata | Proposed |
| `GET` | `/api/v1/workspaces/:workspaceId/deployments/:deploymentId` | Read deployment details | Proposed |
| `POST` | `/api/v1/workspaces/:workspaceId/deployments` | Record an approved deployment event | Proposed |
| `GET` | `/api/v1/workspaces/:workspaceId/workflow-runs` | List CI workflow metadata | Proposed |

Unconfirmed: deployment ingestion method, provider support, and whether CI
metadata belongs in the MVP.

### Insights and metrics

| Method | Path | Purpose | Status |
| --- | --- | --- | --- |
| `GET` | `/api/v1/workspaces/:workspaceId/insights/summary` | Read high-level delivery insights | Proposed |
| `GET` | `/api/v1/workspaces/:workspaceId/metrics` | Read metric values for a time range | Proposed |
| `GET` | `/api/v1/workspaces/:workspaceId/metrics/:metricKey` | Read one metric series | Proposed |

Metric definitions, query parameters, and aggregation windows are not finalized.

### Health

| Method | Path | Purpose | Status |
| --- | --- | --- | --- |
| `GET` | `/health` | Process liveness check | Proposed |
| `GET` | `/health/ready` | Readiness check for dependencies | Proposed |

Readiness checks must not expose secrets or detailed internal configuration.

## Cross-cutting proposals

- Use idempotency keys for retryable create operations where duplicates would be
  harmful.
- Rate limit authentication, webhook, and write endpoints.
- Include a request or correlation identifier in logs and error responses.
- Log metadata about failures without logging tokens, request bodies, or
  personal data.
- Keep API responses paginated and bounded.
- Document breaking changes before changing `/api/v1` behavior.

## Resolved API decisions

- Authentication uses database-backed server-side sessions. Login, current-user
  lookup, session validation, and current-session logout are implemented.
- Session tokens are carried in an HTTP-only cookie and stored as SHA-256 hashes.
  Sessions have a fixed seven-day lifetime and are not extended on use.
- GitHub integration uses a GitHub App.
- Workspace creation derives the creator from the authenticated session, creates
  the workspace and `OWNER` membership atomically, and generates a unique slug.
- Workspace listing, retrieval, and updates filter by active membership in the
  database. Inaccessible and nonexistent workspaces both return `404`.
- Workspace detail updates are restricted to `OWNER` and `ADMIN` members. Only
  `name` and `description` can be changed; `description: null` clears the value.
- Workspace deletion is restricted to `OWNER` members and permanently removes
  workspace-owned records in a transaction. Global users, their sessions, and
  memberships in other workspaces are preserved. GitHub App uninstallation is
  not performed through the external API.
- Workspace listing uses validated offset pagination (`page`/`limit`) because a
  user's workspace set is expected to be small. Cursor pagination remains the
  preferred convention for large collections.
- Project endpoints are workspace-scoped and proposed only. `OWNER` and `ADMIN`
  may create, update, and delete projects; `MEMBER` and `VIEWER` are read-only.
  Non-members and cross-workspace project access return `404`.
- Project creation is a future atomic project-plus-repository operation driven by
  GitHub App repository selection. Clients do not submit arbitrary repository
  metadata, and repo-less project creation is not part of the MVP.
- GitHub numeric identifiers are represented as decimal strings in API payloads.

## Open API decisions

- Final role and permission matrix
- Whether the API is REST-only or includes another approved interaction style
- Versioning and deprecation policy
- Pagination and filtering conventions for collections larger than the
  workspace list
- Deployment event ingestion design
- Metric endpoints and aggregation rules
- Whether a public API is offered beyond the browser application
- Whether project creation accepts `repositoryGithubId` directly after server-side
  GitHub verification or an opaque repository-selection token
- Whether project deletion permanently purges local repository/history records or
  follows a retention/archive policy
- Whether `Project.slug` is exposed in API responses or removed
- Whether archived GitHub repositories can be newly connected to projects
