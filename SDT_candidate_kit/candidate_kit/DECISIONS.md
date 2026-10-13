# DECISIONS.md

1. **Indexes.** `employees`: unique `emp_code` (business key, turns concurrent duplicate creates into 409) and
   `(department, emp_code)` (filtered, sorted employee list; the employee side of summary and trend).
   `attendance_logs`: unique `(emp_code, date)` (one record per day, PATCH, punch-out, monthly, trend lookups),
   `(date -1, emp_code 1)` (default list order, month scans for summary and leaderboard), and
   `(status, date -1, emp_code 1)` (status-filtered list and its count). I rejected `(emp_code, punch_in)` for punch-out:
   by R1 an employee's dates rise with `punch_in`, so walking the unique index by date finds the same record.

2. **Punch-in race.** Both requests compute the same `date` and call `insert_one`; there is no read first.
   The unique `(emp_code, date)` index lets one insert win; the other gets E11000, which I map to 409.

3. **Ties.** `$rank` gives competition ranks (1, 2, 2, 4) and I filter `rank <= limit` after ranking, so everyone
   tied at the cutoff is returned, ordered by `emp_code`, even if that exceeds `limit`.

4. **Headcount.** The summary `$unionWith`s one row per employee into the per-employee log totals, so people with no
   logs still exist; headcount counts those rows with `joined_on` <= month end.

5. **At 100x**, I would maintain a per-employee-per-month rollup (updated on punch/PATCH via `$merge`) so analytics
   read one small document per employee instead of every log.
