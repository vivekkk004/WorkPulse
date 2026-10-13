# Employee Attendance & Analytics API

FastAPI + MongoDB implementation of `openapi.yaml` (contract v2.0). All application code is in `app/main.py`;
the review of the starter is in `REVIEW.md`, design answers in `DECISIONS.md`.

## Run the API
```bash
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                   # MONGO_URI / MONGO_DB; real env vars win over .env
python sample_seed.py                                  # optional: the nine sample documents
uvicorn app.main:app --port 8000
```
MongoDB 6.0+ is required (`$densify`, `$setWindowFields`). Indexes are created at startup, idempotently; if MongoDB
is not reachable yet, `/health` returns 503 and creates them on the first successful ping.

## Tests
```bash
pip install -r requirements-dev.txt
pytest -q                                   # 53 tests against a real MongoDB, database `attendance_test` (dropped per test)
MONGO_DB=attendance_load python tests/generate_large_dataset.py   # ~100k records, for /admin/explain and timing
```
The tests build their own awkward data: ties at the leaderboard cutoff, employees with no logs, a mid-month and a future
joiner, weekend records, an overnight shift, legacy records without `history`/`half_day`, logs of unknown employees,
half-up rounding boundaries (4.495 h), and parallel punch-ins / punch-outs / creates / PATCHes.
On the 100k dataset every explained query is an `IXSCAN` with no `COLLSCAN`, and every endpoint answers in < 250 ms locally.

## Frontend (optional, `frontend/`)
React 18 + Redux Toolkit. `src/services/*` only define the HTTP methods; `src/features/*Slice.js` own the
`createAsyncThunk`s and state. Instants are displayed and entered in IST.
```bash
cd frontend && npm install && npm run dev   # http://localhost:5173, proxies /api -> http://127.0.0.1:8000
```

## Interpretations worth knowing
* **R1 truncation** happens on input: `punched_at` / `punch_in` / `punch_out` are floored to whole seconds before
  anything is computed or stored.
* **Punch-out** closes the latest record (by date) whose `punch_in` <= `punched_at`; by R1 an employee's dates
  increase with `punch_in`, so this is the most recent punch-in. Only `work_hours`, `overtime_minutes` and
  `half_day` are written; `late_minutes` stays as set at punch-in.
* **PATCH**: "changes nothing" means no tracked field differs after recomputation -> 422. An explicit `null`
  for `status`/`punch_in`/`punch_out` is 422 (not nullable in the contract). Concurrent edits use optimistic
  concurrency (guarded on status, punch times and history length) with up to 3 retries, then 409.
* **present_days** counts presence records on Mon-Fri inside the month (not filtered by `joined_on`);
  `leave_days`, late and overtime totals include weekend records.
* **Department summary** sums the logs of all of the department's employees; `headcount` counts only those with
  `joined_on` <= month end. Logs whose `emp_code` has no employee are ignored.
* **Trend**: the range may cover at most 92 days inclusive (e.g. 1 Jul - 30 Sep). `moving_avg_7d` averages the
  (already rounded) daily `attendance_rate` values of the current and up to 6 preceding rows in range.
* **Rounding** (R4, R8) is half-up on exact decimals: `Decimal` in Python, `Decimal128` + floor(x * 10^n + 0.5)
  inside pipelines (MongoDB's `$round` is half-to-even).
* Business-rule 422s use the same `{"detail": [{"loc", "msg", "type"}]}` shape as FastAPI validation errors.
