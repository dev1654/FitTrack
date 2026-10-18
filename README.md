# FitTrack

A full-stack strength and fitness tracker: a FastAPI backend, a scheduled data pipeline,
a React web dashboard and an Expo mobile app, all sharing one PostgreSQL database.

| Folder | What's in it | Status |
| --- | --- | --- |
| `backend/` | FastAPI API, SQLAlchemy models, Alembic migrations, seed data, tests | Week 1 done |
| `web/` | React + TypeScript + Vite dashboard | Week 3 |
| `mobile/` | Expo (React Native) in-gym logger | Week 4 |
| `packages/api-client/` | TypeScript types generated from the API schema | Week 2 |

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
| Health | `GET /health` (also checks the database) |

## Data model

Nine tables: `users`, `equipment`, `exercises`, `workout_templates`, `template_exercises`,
`workout_sessions`, `set_entries`, `body_metrics`, `exercise_stats`.
Built-in programs are templates with no owner (`user_id` is null). `exercise_stats` is filled
by the nightly analytics job (week 2).

Built-in programs seeded: StrongLifts 5x5 (A/B), Push/Pull/Legs, Upper/Lower, Full-Body 3x (A/B/C).

## Deploying (end of week 1)

1. Create a free Postgres project on [Neon](https://neon.com) and copy its connection string.
2. Push this repo to GitHub.
3. On [Render](https://render.com): **New > Blueprint**, pick the repo. It reads `render.yaml`;
   paste the Neon connection string as `DATABASE_URL`. Render generates `JWT_SECRET`.
4. Open `https://<your-service>.onrender.com/health`. Free services sleep after 15 idle
   minutes, so the first request after a break takes about a minute.

GitHub Actions (`.github/workflows/backend-ci.yml`) runs the migrations and tests on every push.
