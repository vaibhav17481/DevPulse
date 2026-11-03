# DevPulse API

NestJS API application for DevPulse. It uses the standard NestJS module,
controller, and service structure inside the root pnpm workspace.

## Local development

Run commands from the repository root:

```bash
pnpm install
pnpm --filter api start:dev
```

The API listens on http://localhost:3001 by default. Set `PORT` to change it.

The API loads the root `.env` file at startup. `DATABASE_URL` is required before
the API can start; use `.env.example` as the template. Apply the committed Prisma
migrations to the configured database before starting the API:

```bash
pnpm --filter @devpulse/database migrate:deploy
```

## Registration endpoint

`POST /auth/register` creates an email/password account. Emails are trimmed and
lowercased, passwords must be 12-128 characters with at least one letter and one
number, and passwords are hashed with Argon2id. The endpoint returns only the
created user's `id` and `email`; it does not create a session or cookie.

## Build and run

```bash
pnpm --filter api build
pnpm --filter api start:prod
```

`start:prod` runs the compiled output from `dist/main`.

## Checks

```bash
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter api build
```

Unit tests live next to source files as `*.spec.ts`, and end-to-end tests live in
`test/`. Swagger/OpenAPI documentation will be added in a later milestone.
