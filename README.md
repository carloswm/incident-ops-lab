# Incident Operations Lab

A small incident API for practicing service operations with Node.js and PostgreSQL. The first layer runs locally; CI and AWS/Terraform are follow-up exercises.

## Start locally

Copy `.env.example` to `.env` only if you want to run the API directly on your machine. The Compose setup supplies its own local database URL and uses intentionally simple development credentials; never reuse them outside this lab.

```sh
docker compose up --build -d
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
docker compose down
```

Compose waits for PostgreSQL's `pg_isready` health check before starting the API. The named `incident-data` volume keeps local records after containers stop. `docker compose down -v` removes that practice data.

For offline tests, run `npm test`; they use Node's built-in test runner and an in-memory repository. Starting the real API requires installing the declared `pg` dependency and setting `DATABASE_URL`.

## API

- `POST /api/v1/incidents` — create with `title`, `severity`, and optional `description` and `owner`. New incidents start as `open`.
- `GET /api/v1/incidents?status=open&severity=high&limit=20` — filter and list; limit is 1–100.
- `GET /api/v1/incidents/:id` — retrieve one incident.
- `PATCH /api/v1/incidents/:id` — update supported fields. Status moves follow `open → investigating → mitigated → resolved`; investigating may also resolve directly, and mitigated may return to investigating.
- `GET /health/live` — process liveness, independent of the database.
- `GET /health/ready` — checks PostgreSQL readiness.

Responses use `{ "data": ... }` on success and a stable `{ "error": { "code", "message" } }` shape for failures. Request logs are one JSON object per request. Creation and status changes are recorded in `incident_events` in the same database transaction as the incident update.

## Design choices to practice

The service uses Node's `node:http` instead of a web framework, so routing, request parsing, response codes, and logging remain visible. A small repository interface keeps HTTP tests deterministic without a running database; PostgreSQL-specific query behavior still needs a later integration exercise.

The SQL migration uses `IF NOT EXISTS` so startup can safely apply this single schema step repeatedly. This is convenient for a one-service lab. A production system would normally track migration versions and apply schema changes as a controlled release step, rather than having every app process alter the database at startup.

The PostgreSQL transaction keeps an incident update and its status event together. List filters use fixed SQL fragments and bound values, and the page size is capped to keep a request from asking for an unbounded result. The image runs as Node's unprivileged `node` user. The Compose database password is for local practice only.
