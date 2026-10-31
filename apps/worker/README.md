# DevPulse Worker

Independent Node.js background worker for DevPulse. It is a standalone TypeScript
process and does not start an HTTP server.

The worker currently starts, waits for a shutdown signal, and exits cleanly. It
does not consume jobs yet; Redis, BullMQ, and database integration will be added
in later milestones.

## Local development

Run commands from the repository root:

```bash
pnpm install
pnpm --filter worker start:dev
```

`start:dev` uses `tsx watch` to restart the worker after source changes. Stop it
with `Ctrl+C`.

Expected startup log:

```text
[DevPulse Worker] started; no job consumer is configured yet
```

## Build and run

```bash
pnpm --filter worker build
pnpm --filter worker start:prod
```

`start:prod` runs the compiled JavaScript from `dist/main.js`.

## Graceful shutdown

SIGINT (`Ctrl+C`) and SIGTERM are handled once. The worker logs the received
signal, stops its internal keep-alive timer, logs shutdown completion, and lets
the process exit. No external resources are closed yet because none are created
in this milestone.

## Checks

```bash
pnpm --filter worker lint
pnpm --filter worker typecheck
pnpm --filter worker test
pnpm --filter worker build
```

Tests use the Node.js built-in test runner through `tsx`.
