Read APPLICATION_CONTEXT.md first (what the product is), then SPEC.md in full (what to build). SPEC.md is the single source of truth for MVP scope, data, and phases. Images in /design-reference are the visual source of truth for the 11 mockup-backed screens; APPLICATION_CONTEXT.md governs vocabulary, concepts, and vision. Work strictly phase by phase. Before building any screen, open and study its reference image.

## Precedence (from APPLICATION_CONTEXT.md §13 / SPEC §1)
1. Anything the MVP renders → SPEC §7 canonical seed wins (59 entities, waves W1–W3, 27 received, 46% progress, 386 fields). Never leak POV-deck numbers into MVP screens.
2. POV-deck numbers appear ONLY inside the §9.5 Forecasting Readiness vision zone, seeded via §7.6 and labeled "Illustrative".
3. Visual design of the 11 mockup-backed screens → the PNGs in /design-reference win (with the deliberate corrections in SPEC §1).
4. Vocabulary, concepts, statuses, methodology, AI claims → APPLICATION_CONTEXT wins everywhere, including UI copy.
5. New conflict between sources → surface it and propose a reconciliation; never silently resolve.

## Hard rules
- Never hardcode a metric, count, or percentage in JSX — every number comes from the API (grep-audited at phase gates 1/2/5).
- Mockup static copy is verbatim; all other copy uses APPLICATION_CONTEXT vocabulary and the analyst insight voice (§4.4).
- Live AI features are ONLY those listed in SPEC §13/§13.1 (original three + the July-2026 expansion: Smart Assist, report narrative, clarification drafting, review brief, client-side voice capture). Every one follows the same contract — live-or-deterministic-fallback with a `source` badge; anything else AI-flavored is referenced capability with a fallback, never faked.
- Layer B is NOT built except the labeled §9.5 teaser.

## Tech stack (locked, no substitutions — SPEC §2)
Frontend: React 18 + TS strict, Vite, React Router v6, Tailwind, shadcn/ui, lucide-react, Recharts, TanStack Query v5, Zustand, sonner, framer-motion.
Backend: Python 3.11+, FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2, uvicorn, pandas + openpyxl, rapidfuzz, anthropic SDK (optional).
DB: PostgreSQL 16 (docker). Real-time sync = TanStack Query polling (4000ms) + /api/notifications/poll.

## Commands
- `docker compose up` → postgres + backend + frontend (backend entrypoint runs `alembic upgrade head` then `python -m app.seed_clean --if-empty`).
- `docker compose exec backend python -m app.checks` → consistency gate (must print ✓ per assertion). Validates the `app.seed_clean` / `planning_seed` scenario (12 entities), NOT the legacy `app.seed`.
- Frontend dev: http://localhost:5183 · Backend: http://localhost:8010 · OpenAPI: http://localhost:8010/docs
  (host ports offset from defaults to avoid collisions with sibling projects; internal container ports unchanged)

## Database safety — READ before touching the seed
Postgres persists in the `pgdata` volume, so `docker compose up`/restart/rebuild never wipe data. The entrypoint seeds only when the DB is **empty** (`seed_clean --if-empty`), so a normal run never re-seeds. The ONLY things that destroy data are **explicitly destructive** and now refuse by default:
- `app.seed_clean` is the real seed (12 entities from `planning_seed`); `app.seed` is a dead 59-entity legacy scenario. **Both TRUNCATE every table.**
- A reseed / `POST /api/demo/reset` on a **populated** DB now **refuses** unless `ALLOW_DB_RESET=true` (backend env, default false). First-run seeding of an empty DB is unaffected.
- Deliberate reset (wipes everything): set `ALLOW_DB_RESET=true`, or run `docker compose exec backend python -m app.seed_clean --force`. **Back up first.**
- Backup / restore: `scripts/db-backup.sh` → `backups/dghr-<ts>.sql`; `scripts/db-restore.sh <file>` to restore. Always back up before any reset.
- Never run `python -m app.seed` — it is the wrong (legacy) seed and it wipes real data.
