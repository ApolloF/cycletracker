# CycleTracker

Medication schedules, administration logs, health records and pharmacokinetic plots.

**Status: development preview, not a completed release.** See [implementation status and next steps](docs/STATUS.md). The current plotter exposes relative research curves; it does not provide validated individual blood-concentration predictions.

## Run locally

Requires Node.js 24 and pnpm 11.19.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:5173. Without `DATABASE_URL`, the API uses a development-only embedded PostgreSQL database in `.local/postgres`. Run one API process per database. Registration requires email verification; without SMTP configured, development emails are written to `.local/mail`. Open the URL from the matching verification email to finish registration. All `.local` files are excluded from Git.

To use a PostgreSQL server and local SMTP capture instead:

```sh
docker compose -f compose.dev.yaml up -d
```

Copy `.env.example` to `.env`, configure the database and SMTP settings, then run `pnpm dev`. The application loads `.env` on API startup. Restart the API after backend changes; the web UI supports hot reload.

## Verify

```sh
pnpm typecheck
pnpm build
pnpm test
pnpm exec playwright install chromium firefox webkit
pnpm test:browser
```

Stop local API and web development servers before browser tests; the test runner starts and owns both services.

Test the built app and service worker separately:

```sh
pnpm build
pnpm test:offline
```

The built app caches its code, current workspace and recent history after an online visit. Pending edits remain in IndexedDB. Offline reload/reconnection is tested separately from the development server. Windows WebKit currently has an expected offline-navigation failure; see the status report. Full browser-process restart and real iOS/Android testing remain outstanding.

Independent numerical checks require Python with NumPy and SciPy:

```sh
python -m venv .venv
# Activate .venv using the command appropriate for your shell.
python -m pip install numpy scipy
pnpm validate:reference
```

On Windows, call `pnpm.cmd` when PowerShell blocks `.ps1` launchers. The separate `scripts/verify-persistence.ts` check tests embedded database reopening and concurrent-process rejection with synthetic data.

## Layout

- `apps/web`: React/Vite UI, IndexedDB queue, service worker and chart worker.
- `apps/api`: Fastify, Better Auth, database schema, owned records and reminder worker.
- `packages/domain`: schedules, quantities, catalog capabilities and import preview.
- `packages/simulation`: deterministic numerical engine, separate from UI and storage.
- `data`: public research-search metadata, spreadsheet candidate and numerical reports.
- `tests`: domain, simulation, API isolation and browser workflows.

## Research catalog

```sh
pnpm catalog:import
```

This writes a candidate and change report without changing the accepted research snapshot. After reviewing the candidate, `pnpm catalog:import --accept` accepts that raw snapshot. Acceptance does not authorize model parameters or promote a formulation's capability. Curated model entries require separate evidence review.

See [model specification](docs/MODEL.md) and [research audit](docs/RESEARCH.md).

## Docker deployment

`compose.yaml` describes the PostgreSQL, API, reminder worker and web proxy services. Configure production secrets, SMTP, `APP_URL` and the optional OAuth/VAPID keys before use. The web service binds to localhost port 4180; put it behind an HTTPS reverse proxy. PostgreSQL and document volumes require host-level encryption.

```sh
docker compose config --quiet
docker compose up -d --build
```

Container startup, backup restoration and a live deployment still require verification. Do not treat the existence of these files as deployment evidence. Operational requirements are in [OPERATIONS.md](docs/OPERATIONS.md).

## Product conventions

Use short labels and functional instructions. No slogans, motivational copy, promotional panels or decorative captions. See [AGENTS.md](AGENTS.md).
