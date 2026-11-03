# DevPulse

DevPulse is an intelligent developer operations platform. This repository uses a
pnpm monorepo and is being built in small, tested milestones.

## Status

The repository contains the root pnpm workspace foundation, local Docker
infrastructure for PostgreSQL and Redis, the Next.js frontend scaffold in
`apps/web`, the NestJS API with email/password registration in `apps/api`, the
independent worker scaffold in `apps/worker`, and the Prisma schema and initial
migration in `packages/database`. Login, logout, sessions, workspace
authorization, BullMQ job processing, and deployment configuration have not been
implemented yet.

## Planned architecture

- `apps/web` - Next.js, TypeScript, Tailwind CSS, shadcn/ui
- `apps/api` - NestJS modular monolith
- `apps/worker` - independent BullMQ background worker
- `packages/shared` - framework-agnostic types, constants, and utilities
- `packages/database` - PostgreSQL schema, Prisma migrations, and client access
- `packages/core` - shared business logic, created only when needed

PostgreSQL stores application data, Redis supports BullMQ, and Prisma manages
database access. The API and worker are separate processes that will share
business logic without sharing HTTP concerns.

## Repository layout

```text
DevPulse/
- apps/api/          # NestJS HTTP API
- apps/worker/       # independent Node.js background worker
- apps/web/          # Next.js frontend
- packages/database/ # Prisma schema, migrations, and client access
- docs/              # project documentation
- docker-compose.yml # local PostgreSQL and Redis services
- .env.example       # local environment variable template
- AGENTS.md          # AI agent instructions
- package.json
- pnpm-workspace.yaml
- tsconfig.base.json
```

## Prerequisites

- Node.js 22 or newer
- pnpm 10 or newer
- Docker Engine with Docker Compose v2 or newer

## Local infrastructure

PostgreSQL and Redis run as local Docker Compose services. PostgreSQL stores
application data, and Redis supports BullMQ background jobs. Both services bind
only to `127.0.0.1`, so they are reachable from the host but not from other
machines on the network.

### Configuration

Copy the example environment file before starting the services:

```bash
cp .env.example .env
```

Docker Compose reads `.env` automatically. The example contains local-only
defaults and can be used as-is. Change the passwords or ports in `.env` if they
conflict with existing software on your machine. Never commit `.env`; only
`.env.example` belongs in Git.

The Compose file supports these variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `POSTGRES_DB` | `devpulse` | Database created on first start |
| `POSTGRES_USER` | `devpulse` | PostgreSQL username |
| `POSTGRES_PASSWORD` | `devpulse_local_password` | PostgreSQL password |
| `POSTGRES_PORT` | `5432` | Host port for PostgreSQL |
| `REDIS_PASSWORD` | `devpulse_local_redis_password` | Redis password |
| `REDIS_PORT` | `6379` | Host port for Redis |

### Start and inspect

Run these commands from the repository root:

```bash
# Start PostgreSQL and Redis in the background
docker compose up -d

# Show service status and health
docker compose ps

# Follow logs for one service
docker compose logs -f postgres
docker compose logs -f redis

# Restart a service without removing it or its data
docker compose restart postgres
```

### Verify health

`docker compose ps` should report both services as `healthy`. You can also check
each service directly:

```bash
# PostgreSQL readiness check
docker compose exec postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

# PostgreSQL query
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;"'

# Redis ping
docker compose exec redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping'
```

The Redis check should return `PONG`.

### Stop and persistence

```bash
# Stop the containers but keep them and their data
docker compose stop

# Remove the containers and network but keep the named volumes
docker compose down

# Remove the containers, network, and all persisted data (destructive)
docker compose down -v
```

PostgreSQL data is stored in the named volume `devpulse_postgres_data`, and
Redis append-only data is stored in `devpulse_redis_data`. Data survives
container stops, container removal, and `docker compose down`. Only removing the
volumes with `docker compose down -v` or `docker volume rm` deletes the data.

The images are pinned to explicit versions (`postgres:17.11-alpine3.24` and
`redis:7.4.12-alpine3.21`). Redis runs with append-only persistence enabled and
`maxmemory-policy noeviction`, which BullMQ requires so queued jobs are not
silently evicted.

## Frontend

The Next.js application lives in `apps/web` and uses the App Router, TypeScript,
Tailwind CSS, and ESLint. Install dependencies once from the repository root,
then run the web app with a workspace filter:

```bash
pnpm install
pnpm --filter web dev
```

Open http://localhost:3000.

Frontend checks:

```bash
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web build
```

## Backend

The NestJS API lives in `apps/api`. It uses standard modules, controllers, and
services, with Jest and Supertest for tests. It listens on port `3001` by
default so it can run alongside the frontend.

```bash
pnpm install
pnpm --filter api start:dev
```

The API is available at http://localhost:3001. Set the `PORT` environment
variable to change it.

Backend checks:

```bash
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter api build
```

### Database migrations

The API requires `DATABASE_URL` from the root `.env`. The initial
`init_devpulse` migration is committed. Apply it to the configured development
database before starting the API:

```bash
pnpm --filter @devpulse/database migrate:deploy
pnpm --filter @devpulse/database migrate:status
```

For new local schema changes, use the Prisma development workflow with a
descriptive migration name:

```bash
pnpm --filter @devpulse/database exec prisma migrate dev --name <migration_name>
```

## Worker

The independent background worker lives in `apps/worker`. It is a standalone
Node.js process and does not start an HTTP server. It currently initializes and
waits for a shutdown signal; BullMQ job processing will be added in a later
milestone.

```bash
pnpm install
pnpm --filter worker start:dev
```

Expected startup log:

```text
[DevPulse Worker] started; no job consumer is configured yet
```

Stop the worker with `Ctrl+C`. It also handles SIGTERM for process managers.

Worker checks:

```bash
pnpm --filter worker lint
pnpm --filter worker typecheck
pnpm --filter worker test
pnpm --filter worker build
```

Build and run the compiled worker:

```bash
pnpm --filter worker build
pnpm --filter worker start:prod
```

## Workspace commands

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

Application-specific setup commands will be documented as each application is
added.

## Conventions

- Keep packages small and focused.
- Do not import from `apps/*` inside `packages/*`.
- Keep secrets out of the repository; commit `.env.example` files instead.
- Use the shared TypeScript settings from `tsconfig.base.json`.
# DevPulse
