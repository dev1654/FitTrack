# FitTrack web app

React 19 + TypeScript + Vite, styled with Tailwind CSS 4, server data through TanStack Query,
charts with Recharts. Talks to the API through the typed client in `packages/api-client`.

## Run it

With the API running (`docker compose up` in the repo root), from the repo root:

```powershell
npm install
npm run web:dev
```

Open <http://localhost:5173>. It calls the API at `VITE_API_URL` (see `.env.development`;
production uses `.env.production`).

```powershell
npm run web:test    # unit + screen tests (Vitest, Testing Library)
npm run web:build   # type-check and production build into web/dist
```

## Screens

| Route | What it does |
| --- | --- |
| `/` Today | Start a workout (program day, saved workout, or empty), recent workouts, log body weight |
| `/workouts/:id` | Log sets. Each exercise shows last time's sets, the suggested next target, and for barbell lifts the plates to load per side. A rest timer starts after every logged set. |
| `/programs` | Built-in programs and your saved workouts; build a new one |
| `/library` | Search 860+ exercises, or browse by machine and log straight from it |
| `/progress` | Stalled lifts, estimated 1RM trend, volume per session and per week, muscle balance, PRs, body weight |
| `/settings` | kg or lb, log out |

## Design

Chalk-grey surfaces and graphite ink, with one accent: the blue of a 20 kg competition plate.
Headings and numbers use Barlow Condensed, body text uses Barlow. The plate-loading drawing
uses real competition plate colours. Light and dark mode both follow the system setting.
Charts show one series each, with hover tooltips and a table view.
