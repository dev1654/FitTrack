# @fittrack/api-client

Typed client for the FitTrack API, shared by the web and mobile apps.

- `openapi.json`: the backend's API schema, exported from FastAPI.
- `src/schema.d.ts`: TypeScript types generated from it (don't edit by hand).
- `src/index.ts`: `createApiClient()` (adds the login token, handles 401) and kg/lb helpers.

## After changing the backend API

From the repo root, with `docker compose up` running:

```powershell
docker compose exec api python -m app.export_openapi
npm install
npm run api:generate
npm run api:typecheck
```

(Without Docker: `cd backend`, then `python -m app.export_openapi` with the backend's venv active.)

CI fails if `openapi.json` or `schema.d.ts` is out of date, so a stale client can't be merged.
