"""
Generates a ~100k-record dataset shaped like the grader's, for checking explain plans and latency.

    MONGO_DB=attendance_load python tests/generate_large_dataset.py [records]

Drops and refills `employees` and `attendance_logs` in MONGO_DB (refuses to touch `attendance_db`).
Derived fields are computed with the app's own helpers, so the data is internally consistent.
"""
import os
import random
import sys
from datetime import date, datetime, timedelta, timezone

from dotenv import load_dotenv

load_dotenv()
if os.getenv("MONGO_DB", "attendance_db") == "attendance_db":
    sys.exit("set MONGO_DB to a scratch database, e.g. MONGO_DB=attendance_load")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.main import IST, attendance_date, db, derive_fields, ensure_indexes  # noqa: E402

TARGET = int(sys.argv[1]) if len(sys.argv) > 1 else 100_000
DEPARTMENTS = ["Engineering", "Sales", "Support", "Finance", "HR", "Operations", "Legal", "Marketing"]
SHIFTS = [("09:30", "18:30")] * 6 + [("22:00", "06:00"), ("14:00", "23:00")]
START = date(2025, 10, 1)
rng = random.Random(42)

n_employees = max(10, TARGET // 200)
employees = []
for i in range(1, n_employees + 1):
    shift_start, shift_end = rng.choice(SHIFTS)
    joined = START + timedelta(days=rng.choice([0] * 8 + [rng.randrange(0, 250)]))
    employees.append(
        {
            "emp_code": f"EMP{i:05d}",
            "name": f"Employee {i}",
            "email": f"emp{i}@example.com",
            "department": rng.choice(DEPARTMENTS),
            "shift_start": shift_start,
            "shift_end": shift_end,
            "joined_on": joined.isoformat(),
            "created_at": datetime.combine(joined, datetime.min.time(), timezone.utc),
        }
    )

records = []
day = START
while len(records) < TARGET:
    for emp in employees:
        if day.isoformat() < emp["joined_on"] or len(records) >= TARGET:
            continue
        weekend = day.weekday() >= 5
        roll = rng.random()
        if weekend and roll > 0.05:
            continue
        if roll < 0.04:
            status = "ABSENT"
        elif roll < 0.08:
            status = "LEAVE"
        elif roll < 0.12:
            continue  # weekday with no record at all
        else:
            status = rng.choice(["PRESENT"] * 8 + ["WFH", "ON_DUTY"])
        doc = {"emp_code": emp["emp_code"], "date": day.isoformat(), "status": status, "punch_in": None, "punch_out": None}
        if status in ("ABSENT", "LEAVE"):
            doc.update(derive_fields(status, None, None, emp, day))
        else:
            h, m = map(int, emp["shift_start"].split(":"))
            start = datetime(day.year, day.month, day.day, h, m, tzinfo=IST)
            punch_in = (start + timedelta(seconds=rng.randint(-1200, 3600))).astimezone(timezone.utc)
            punch_out = punch_in + timedelta(seconds=rng.randint(3 * 3600, 10 * 3600))
            doc["punch_in"], doc["punch_out"] = punch_in, punch_out
            doc.update(derive_fields(status, punch_in, punch_out, emp, attendance_date(punch_in, emp)))
        doc["history"] = []
        records.append(doc)
    day += timedelta(days=1)

db.employees.drop()
db.attendance_logs.drop()
db.employees.insert_many(employees)
for i in range(0, len(records), 10_000):
    db.attendance_logs.insert_many(records[i : i + 10_000], ordered=False)
ensure_indexes()
print(f"{len(employees)} employees, {len(records)} attendance records, {START} .. {day}")
