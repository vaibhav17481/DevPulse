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
