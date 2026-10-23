# FitTrack

A full-stack strength and fitness tracker: a FastAPI backend, a scheduled data pipeline,
a React web dashboard and an Expo mobile app, all sharing one PostgreSQL database.

| Folder | What's in it | Status |
| --- | --- | --- |
| `backend/` | FastAPI API, models, migrations, seed data, tests | Week 1 done |
| `backend/app/pipeline/` | wger catalog sync + nightly analytics jobs | Week 2 done |
| `packages/api-client/` | Typed TypeScript client generated from the API schema | Week 2 done |
| `web/` | React + TypeScript web app: logging, programs, library, progress dashboard | Week 3 done |
| `mobile/` | Expo (React Native) in-gym logger | Week 4 |

## Run it locally

You need **Docker Desktop**. From this folder:

```powershell
docker compose up --build
```

That starts Postgres, applies the migrations, loads the starter catalog and built-in programs,
and serves the API at <http://localhost:8000>. Open <http://localhost:8000/docs> to try every
endpoint: call `POST /auth/signup`, copy the `access_token`, click **Authorize** and paste it.

Run the tests (inside the running API container):

```powershell
docker compose exec api pytest
```

### The web app (Node 22+)

With the API running, in a second terminal from this folder:

```powershell
npm install
npm run web:dev
```

Open <http://localhost:5173>, create an account and log a workout. See `web/README.md`.

### Without Docker for the API (Python 3.12+)

Keep Postgres in Docker and run the API directly, which is handy for debugging in VS Code:

```powershell
docker compose up -d db
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
copy .env.example .env      # then set JWT_SECRET in .env
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload
pytest
```

## API overview

All weights are stored and sent in **kilograms**; `unit_pref` on the user tells the apps
whether to display kg or lb.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/signup`, `POST /auth/login`, `GET/PATCH /auth/me` (logout = the app deletes its token) |
| Catalog | `GET /exercises` (search, muscle group, category, equipment filters), `GET /exercises/{id}`, `GET /equipment`, `GET /equipment/{id}` (with its exercises) |
| Templates | `GET /templates` (built-in programs + yours), `GET/PUT/DELETE /templates/{id}`, `POST /templates`, `POST /sessions/{id}/save-as-template` |
| Sessions | `GET/POST /sessions`, `GET/PATCH/DELETE /sessions/{id}`, `POST /sessions/{id}/sets`, `PATCH/DELETE /sets/{id}` |
| Body metrics | `GET /body-metrics`, `PUT /body-metrics` (one entry per day), `DELETE /body-metrics/{id}` |
| Progress | `GET /exercises/{id}/last` (last session's sets + next target), `GET /stats/exercises/{id}` (1RM/volume trend), `GET /stats/weekly-volume`, `GET /stats/prs`, `GET /stats/plateaus` |
| Pipeline | `GET /pipeline/runs` (recent job runs and their results) |
| Health | `GET /health` (also checks the database) |

## Data model

Ten tables: `users`, `equipment`, `exercises`, `workout_templates`, `template_exercises`,
`workout_sessions`, `set_entries`, `body_metrics`, `exercise_stats`, `pipeline_runs`.
Built-in programs are templates with no owner (`user_id` is null). `exercise_stats` is filled
by the nightly analytics job; `pipeline_runs` logs every job run.

## Data pipeline

Two scheduled jobs run on GitHub Actions against the production database:

| Job | Schedule | What it does |
| --- | --- | --- |
| Catalog sync (`app/pipeline/catalog_sync.py`) | Mondays 06:17 UTC | Pages through wger's `/exerciseinfo/` API, keeps the English name, strips HTML from instructions, maps wger muscles and equipment onto FitTrack's, and upserts on `(source, external_id)`. Unchanged rows aren't rewritten. |
| Analytics (`app/pipeline/analytics.py`) | Daily 07:43 UTC | Reads every strength set with pandas, computes each day's best estimated 1RM (Epley: weight × (1 + reps/30)), total volume, and a plateau flag (no new best in the last 3 sessions), and rebuilds `exercise_stats` in one transaction. |

Data quality checks:

- **Validation:** records without an English name, a usable name, a uuid or a muscle group are skipped, and so are duplicate names and names already in the seed catalog. Each skip is counted by reason.
- **Circuit breaker:** if wger returns fewer than 200 exercises, the sync stops without writing anything.
- **Retries:** network errors, 429s and 5xx responses are retried with exponential backoff.
- **Run log:** every run is recorded in `pipeline_runs` with its counts or its error, visible at `GET /pipeline/runs`.

Tested against all 872 real wger exercises, a sync imports 831 and skips 41 duplicates in under a second. A second run changes nothing.

Run them by hand:

```powershell
docker compose exec api python -m app.pipeline.catalog_sync --dry-run   # fetch + validate only
docker compose exec api python -m app.pipeline.catalog_sync
docker compose exec api python -m app.pipeline.analytics
```

Exercise data from [wger](https://wger.de) is licensed CC-BY-SA 4.0; imported rows keep `source = "wger"`.

Built-in programs seeded: StrongLifts 5x5 (A/B), Push/Pull/Legs, Upper/Lower, Full-Body 3x (A/B/C).

## Deploying

1. Create a free Postgres project on [Neon](https://neon.com) and copy its connection string.
2. Push this repo to GitHub.
3. On [Render](https://render.com): **New > Blueprint**, pick the repo. It reads `render.yaml`;
   paste the Neon connection string as `DATABASE_URL`. Render generates `JWT_SECRET`.
4. Open `https://<your-service>.onrender.com/health`. Free services sleep after 15 idle
   minutes, so the first request after a break takes about a minute.
5. The same Blueprint also creates `fittrack-web`, a free static site built from `web/`.
   The API accepts requests from any `fittrack-web*.onrender.com` address (`CORS_ORIGIN_REGEX`).

GitHub Actions runs on every push: `backend-ci.yml` (migrations, tests, API client up to date)
and `web-ci.yml` (type-check, build and tests for the web app).

The scheduled jobs need the Neon connection string as a repo secret: GitHub repo,
**Settings > Secrets and variables > Actions > New repository secret**, name `DATABASE_URL`.
GitHub pauses scheduled workflows after 60 days without commits; re-enable them on the Actions tab.
