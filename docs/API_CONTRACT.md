# DevPulse API Contract

## Document status

This document contains **proposed** API ideas. No API application, endpoints,
authentication, or validation layer has been implemented. Paths, payloads, and
status codes are placeholders for discussion and must be approved before
implementation.

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
  approved.
- Accept and return only the fields required by the contract.
- Reserve `/health` and `/health/ready` for operational checks outside the
  versioned application routes.

## Authentication conventions

The authentication mechanism is not finalized. Possible approaches include a
server-managed session or a signed token. The final choice requires approval.

Proposed rules regardless of mechanism:

- The API authenticates every protected request.
- Unauthenticated requests return `401`.
- The API resolves the current user from a trusted server-side identity, never
  from a client-supplied user identifier.
- GitHub installation tokens and other provider credentials stay server-side.
- The web application must never receive provider tokens or client secrets.
- Authentication responses must not reveal whether an unrelated account exists.

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

Proposed role names, subject to approval:

| Role | Proposed intent |
| --- | --- |
| Owner | Manage workspace ownership, members, and integrations |
| Admin | Manage integrations, repositories, and most workspace settings |
| Member | View insights and perform approved workspace actions |
| Viewer | Read-only access to approved workspace data |

The final permission matrix is an open decision.

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
| `GET` | `/api/v1/auth/github` | Start GitHub sign-in | Proposed |
| `GET` | `/api/v1/auth/github/callback` | Complete GitHub sign-in | Proposed |
| `POST` | `/api/v1/auth/logout` | End the current session | Proposed |
| `GET` | `/api/v1/auth/me` | Return the current user | Proposed |

Unconfirmed: whether GitHub is the only sign-in provider and whether sessions or
tokens are used.

### Workspaces and members

| Method | Path | Purpose | Status |
| --- | --- | --- | --- |
| `GET` | `/api/v1/workspaces` | List workspaces for the current user | Proposed |
| `POST` | `/api/v1/workspaces` | Create a workspace | Proposed |
| `GET` | `/api/v1/workspaces/:workspaceId` | Read workspace details | Proposed |
| `PATCH` | `/api/v1/workspaces/:workspaceId` | Update workspace settings | Proposed |
| `GET` | `/api/v1/workspaces/:workspaceId/members` | List workspace members | Proposed |
| `POST` | `/api/v1/workspaces/:workspaceId/members` | Invite or add a member | Proposed |
| `PATCH` | `/api/v1/workspaces/:workspaceId/members/:memberId` | Change a member role | Proposed |
| `DELETE` | `/api/v1/workspaces/:workspaceId/members/:memberId` | Remove a member | Proposed |

Unconfirmed: invitation flow, ownership transfer, and whether multiple
workspaces per user are allowed.

### GitHub integration

| Method | Path | Purpose | Status |
| --- | --- | --- | --- |
| `GET` | `/api/v1/workspaces/:workspaceId/integrations/github` | Read GitHub connection status | Proposed |
| `POST` | `/api/v1/workspaces/:workspaceId/integrations/github/connect` | Start a GitHub installation flow | Proposed |
| `DELETE` | `/api/v1/workspaces/:workspaceId/integrations/github` | Disconnect GitHub | Proposed |
| `POST` | `/api/v1/webhooks/github` | Receive signed GitHub webhook events | Proposed |

Unconfirmed: GitHub App versus OAuth app, installation callback flow, and which
webhook events are accepted.

### Repositories

| Method | Path | Purpose | Status |
| --- | --- | --- | --- |
| `GET` | `/api/v1/workspaces/:workspaceId/repositories` | List connected repositories | Proposed |
| `GET` | `/api/v1/workspaces/:workspaceId/repositories/:repositoryId` | Read repository details | Proposed |
| `POST` | `/api/v1/workspaces/:workspaceId/repositories/:repositoryId/sync` | Request a metadata refresh | Proposed |
| `GET` | `/api/v1/workspaces/:workspaceId/repositories/:repositoryId/sync-status` | Read synchronization state | Proposed |

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

## Open API decisions

- Authentication and session strategy
- Final role and permission matrix
- GitHub App versus OAuth app
- Whether the API is REST-only or includes another approved interaction style
- Versioning and deprecation policy
- Pagination and filtering conventions
- Deployment event ingestion design
- Metric endpoints and aggregation rules
- Whether a public API is offered beyond the browser application
