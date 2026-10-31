# DevPulse Web

Next.js frontend for DevPulse. It uses the App Router, TypeScript, Tailwind CSS,
and ESLint inside the root pnpm workspace.

## Local development

Run commands from the repository root:

```bash
pnpm install
pnpm --filter web dev
```

Open http://localhost:3000.

## Checks

```bash
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web build
```

The main page is at `src/app/page.tsx`, and the root layout is at
`src/app/layout.tsx`.
