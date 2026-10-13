"""
End-to-end tests against a real MongoDB (default mongodb://localhost:27017, database `attendance_test`,
which is dropped and re-seeded for every test).

    pip install -r requirements-dev.txt
    pytest -q

The data is built by hand to hit the awkward cases the rules describe: ties at the leaderboard cutoff,
employees with no logs, a mid-month joiner, a future joiner, weekend records, an overnight shift,
legacy records without history / half_day, and logs of an employee that does not exist.
"""
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

os.environ["MONGO_DB"] = os.environ.get("TEST_MONGO_DB", "attendance_test")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app, db, ensure_indexes  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))


def ist(y, mo, d, h, mi, s=0, ms=0) -> datetime:
    return datetime(y, mo, d, h, mi, s, ms * 1000, tzinfo=IST).astimezone(timezone.utc)


def ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def emp(code, dept, joined="2026-01-01", start="09:30", end="18:30", name=None):
    return {
        "emp_code": code,
        "name": name or f"Name {code}",
        "email": f"{code.lower()}@example.com",
        "department": dept,
        "shift_start": start,
        "shift_end": end,
        "joined_on": joined,
        "created_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
    }


def rec(code, day, status="PRESENT", late=0, ot=0, wh=8.0, half=False, legacy=False):
    doc = {
        "emp_code": code,
        "date": day,
        "status": status,
        "punch_in": None if status in ("ABSENT", "LEAVE") else datetime.fromisoformat(day).replace(tzinfo=timezone.utc),
        "punch_out": None,
        "work_hours": None if status in ("ABSENT", "LEAVE") else wh,
        "late_minutes": late,
        "overtime_minutes": ot,
    }
    if not legacy:
        doc["half_day"] = half
        doc["history"] = []
    return doc


@pytest.fixture()
def client():
    db.employees.drop()
    db.attendance_logs.drop()
    import app.main as main

    main._indexes_ready = False
    ensure_indexes()
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def seeded(client):
    db.employees.insert_many(
        [
            emp("EMP0001", "Eng"),
            emp("EMP0002", "Eng"),
            emp("EMP0003", "Eng", joined="2026-07-15"),  # mid-month joiner
            emp("EMP0004", "Eng"),  # no logs at all
            emp("EMP0005", "Ops", start="22:00", end="06:00"),  # overnight
            emp("EMP0006", "Ops"),
            emp("EMP0007", "Future", joined="2026-08-03"),  # joins after July
        ]
    )
    db.attendance_logs.insert_many(
        [
            rec("EMP0001", "2026-07-06", late=30),  # Mon
            rec("EMP0001", "2026-07-07", status="WFH", wh=3.5, half=True),  # half day
            rec("EMP0001", "2026-07-11", late=20, ot=45),  # Sat: counts for late/OT, not presence
            rec("EMP0001", "2026-07-08", status="LEAVE"),
            rec("EMP0002", "2026-07-06", late=50),  # 50 total -> rank 1
            rec("EMP0002", "2026-07-07", legacy=True),  # legacy: no history / half_day
            rec("EMP0003", "2026-07-15", late=50),  # ties EMP0001 (30+20) at 50 -> both rank 1? no: see test
            rec("EMP0005", "2026-07-06", late=15, ot=40, status="ON_DUTY", wh=9.25),
            rec("EMP0006", "2026-07-06", late=12),
            rec("EMP0006", "2026-07-09", status="ABSENT"),
            rec("EMP9999", "2026-07-06", late=500),  # unknown employee: ignored by analytics
            rec("EMP0001", "2026-06-30", late=99),  # previous month
        ]
    )
    return client


# --------------------------------------------------------------------------- #
# Employees
# --------------------------------------------------------------------------- #
NEW_EMP = {"emp_code": "EMP1000", "name": "A", "email": "a@x.io", "department": "Eng", "joined_on": "2026-07-01"}


def test_create_employee_and_duplicate(client):
    r = client.post("/employees", json=NEW_EMP)
    assert r.status_code == 201
    body = r.json()
    assert body["shift_start"] == "09:30" and isinstance(body["created_at"], int) and "_id" not in body
    assert client.post("/employees", json=NEW_EMP).status_code == 409


def test_concurrent_duplicate_creates(client):
    with ThreadPoolExecutor(8) as pool:
        codes = list(pool.map(lambda _: client.post("/employees", json=NEW_EMP).status_code, range(8)))
    assert sorted(codes) == [201] + [409] * 7


@pytest.mark.parametrize(
    "patch",
    [
        {"emp_code": "E1"},
        {"emp_code": "EMP1234567"},
        {"email": "nope"},
        {"shift_start": "24:00"},
        {"shift_start": "10:00", "shift_end": "10:00"},
        {"joined_on": "2026-02-30"},
        {"joined_on": "20260701"},
        {"name": ""},
        {"department": 5},
    ],
)
def test_create_employee_validation(client, patch):
    assert client.post("/employees", json={**NEW_EMP, **patch}).status_code == 422


def test_list_employees_pagination_filter_sort(seeded):
    r = seeded.get("/employees", params={"department": "Eng", "page": 1, "page_size": 3}).json()
    assert r["total"] == 4 and [e["emp_code"] for e in r["items"]] == ["EMP0001", "EMP0002", "EMP0003"]
    r = seeded.get("/employees", params={"department": "Eng", "page": 2, "page_size": 3}).json()
    assert [e["emp_code"] for e in r["items"]] == ["EMP0004"]
    assert seeded.get("/employees", params={"page": 0}).status_code == 422
    assert seeded.get("/employees", params={"page_size": 101}).status_code == 422
    assert seeded.get("/employees", params={"department": "eng"}).json()["total"] == 0  # case-sensitive


# --------------------------------------------------------------------------- #
# Punch-in (R1, R2)
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "when,late",
    [
        (ist(2026, 7, 20, 9, 40, 0), 0),
        (ist(2026, 7, 20, 9, 40, 0, ms=900), 0),  # truncated to 09:40:00
        (ist(2026, 7, 20, 9, 40, 1), 10),
        (ist(2026, 7, 20, 10, 15, 59), 45),
        (ist(2026, 7, 20, 8, 0), 0),
    ],
)
def test_punch_in_late_rule(seeded, when, late):
    r = seeded.post("/attendance/punch-in", json={"emp_code": "EMP0004", "punched_at": ms(when)})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["late_minutes"] == late
    assert body["punch_in"] % 1000 == 0 and body["date"] == "2026-07-20"
    assert body["punch_out"] is None and body["work_hours"] is None and body["history"] == []


def test_punch_in_uses_ist_date(seeded):
    # 2026-07-20 00:30 IST is still 2026-07-19 in UTC
    r = seeded.post("/attendance/punch-in", json={"emp_code": "EMP0004", "punched_at": ms(ist(2026, 7, 20, 0, 30))})
    assert r.json()["date"] == "2026-07-20"


def test_overnight_shift_date_and_late(seeded):
    # 01:00 IST on the 21st is before shift_end 06:00 -> belongs to the shift of the 20th, 180 min late
    r = seeded.post("/attendance/punch-in", json={"emp_code": "EMP0005", "punched_at": ms(ist(2026, 7, 21, 1, 0))})
    assert r.json()["date"] == "2026-07-20" and r.json()["late_minutes"] == 180
    r = seeded.post("/attendance/punch-in", json={"emp_code": "EMP0005", "punched_at": ms(ist(2026, 7, 21, 21, 55))})
    assert r.json()["date"] == "2026-07-21" and r.json()["late_minutes"] == 0


@pytest.mark.parametrize(
    "body",
    [
        {"emp_code": "EMP0004", "punched_at": 1783312500},  # seconds
        {"emp_code": "EMP0004", "punched_at": 1783312500000.0},  # float
        {"emp_code": "EMP0004", "punched_at": "1783312500000"},  # string
        {"emp_code": "EMP0004", "punched_at": 9999999999999},  # out of range
        {"emp_code": "EMP0004", "status": "ABSENT"},
        {"emp_code": "EMP0004", "punched_at": True},
        {},
    ],
)
def test_punch_in_validation(seeded, body):
    assert seeded.post("/attendance/punch-in", json=body).status_code == 422


def test_punch_in_unknown_employee_and_duplicate(seeded):
    assert seeded.post("/attendance/punch-in", json={"emp_code": "EMP4242"}).status_code == 404
    body = {"emp_code": "EMP0004", "punched_at": ms(ist(2026, 7, 20, 9, 0))}
    assert seeded.post("/attendance/punch-in", json=body).status_code == 201
    body["punched_at"] = ms(ist(2026, 7, 20, 11, 0))
    assert seeded.post("/attendance/punch-in", json=body).status_code == 409


def test_concurrent_punch_in(seeded):
    body = {"emp_code": "EMP0004", "punched_at": ms(ist(2026, 7, 20, 9, 0))}
    with ThreadPoolExecutor(10) as pool:
        codes = list(pool.map(lambda _: seeded.post("/attendance/punch-in", json=body).status_code, range(10)))
    assert sorted(codes) == [201] + [409] * 9
    assert db.attendance_logs.count_documents({"emp_code": "EMP0004", "date": "2026-07-20"}) == 1


# --------------------------------------------------------------------------- #
# Punch-out (R3, R4, R5)
# --------------------------------------------------------------------------- #
def punch(client, code, path, when):
    return client.post(f"/attendance/{path}", json={"emp_code": code, "punched_at": ms(when)})


def test_punch_out_rules(seeded):
    punch(seeded, "EMP0004", "punch-in", ist(2026, 7, 20, 9, 30))
    r = punch(seeded, "EMP0004", "punch-out", ist(2026, 7, 20, 19, 0, 59))
    body = r.json()
    assert r.status_code == 200
    assert body["overtime_minutes"] == 30 and body["work_hours"] == 9.52 and body["half_day"] is False
    assert punch(seeded, "EMP0004", "punch-out", ist(2026, 7, 20, 20, 0)).status_code == 409


def test_overtime_threshold_and_half_day_and_rounding(seeded):
    punch(seeded, "EMP0004", "punch-in", ist(2026, 7, 20, 9, 30))
    # 4h 29m 42s = 4.495h -> half-up 4.50 -> NOT a half day; overtime negative -> 0
    body = punch(seeded, "EMP0004", "punch-out", ist(2026, 7, 20, 13, 59, 42)).json()
    assert body["work_hours"] == 4.5 and body["half_day"] is False and body["overtime_minutes"] == 0

    punch(seeded, "EMP0004", "punch-in", ist(2026, 7, 21, 9, 30))
    body = punch(seeded, "EMP0004", "punch-out", ist(2026, 7, 21, 18, 59, 59)).json()  # 29m59s after end
    assert body["overtime_minutes"] == 0

    punch(seeded, "EMP0004", "punch-in", ist(2026, 7, 22, 9, 30))
    body = punch(seeded, "EMP0004", "punch-out", ist(2026, 7, 22, 13, 59, 41)).json()  # 4.4947h -> 4.49
    assert body["work_hours"] == 4.49 and body["half_day"] is True


def test_punch_out_across_midnight_overnight(seeded):
    punch(seeded, "EMP0005", "punch-in", ist(2026, 7, 20, 21, 55))
    body = punch(seeded, "EMP0005", "punch-out", ist(2026, 7, 21, 6, 40)).json()
    assert body["date"] == "2026-07-20" and body["overtime_minutes"] == 40 and body["work_hours"] == 8.75


def test_punch_out_errors(seeded):
    assert punch(seeded, "EMP4242", "punch-out", ist(2026, 7, 20, 18, 0)).status_code == 404
    assert punch(seeded, "EMP0004", "punch-out", ist(2026, 7, 20, 18, 0)).status_code == 404  # no punch-in
    punch(seeded, "EMP0004", "punch-in", ist(2026, 7, 20, 9, 30))
    assert punch(seeded, "EMP0004", "punch-out", ist(2026, 7, 20, 9, 30)).status_code == 422  # == punch_in
    assert punch(seeded, "EMP0004", "punch-out", ist(2026, 7, 21, 9, 31)).status_code == 422  # > 24h


def test_concurrent_punch_out(seeded):
    punch(seeded, "EMP0004", "punch-in", ist(2026, 7, 20, 9, 30))
    with ThreadPoolExecutor(10) as pool:
        codes = list(pool.map(lambda i: punch(seeded, "EMP0004", "punch-out", ist(2026, 7, 20, 18, i)).status_code, range(10)))
    assert sorted(codes) == [200] + [409] * 9


# --------------------------------------------------------------------------- #
# Attendance list
# --------------------------------------------------------------------------- #
def test_list_attendance(seeded):
    r = seeded.get("/attendance", params={"date_from": "2026-07-06", "date_to": "2026-07-06", "page_size": 2}).json()
    assert r["total"] == 5 and [i["emp_code"] for i in r["items"]] == ["EMP0001", "EMP0002"]
    r = seeded.get("/attendance", params={"date_from": "2026-07-06", "date_to": "2026-07-06", "page": 3, "page_size": 2}).json()
    assert [i["emp_code"] for i in r["items"]] == ["EMP9999"]
    r = seeded.get("/attendance", params={"emp_code": "EMP0001"}).json()
    assert [i["date"] for i in r["items"]] == ["2026-07-11", "2026-07-08", "2026-07-07", "2026-07-06", "2026-06-30"]
    legacy = seeded.get("/attendance", params={"emp_code": "EMP0002", "date_from": "2026-07-07"}).json()["items"][0]
    assert legacy["half_day"] is False and legacy["history"] == [] and "_id" not in legacy and "id" not in legacy
    assert seeded.get("/attendance", params={"status": "LEAVE"}).json()["total"] == 1
    assert seeded.get("/attendance", params={"status": "late"}).status_code == 422
    assert seeded.get("/attendance", params={"date_from": "2026-07-10", "date_to": "2026-07-01"}).status_code == 422
    assert seeded.get("/attendance", params={"date_from": "07/01/2026"}).status_code == 422


# --------------------------------------------------------------------------- #
# Regularization
# --------------------------------------------------------------------------- #
FIX = {"reason": "biometric glitch", "regularized_by": "hr.admin"}


def test_regularize_recomputes_and_appends_history(seeded):
    punch(seeded, "EMP0004", "punch-in", ist(2026, 7, 20, 10, 5))
    punch(seeded, "EMP0004", "punch-out", ist(2026, 7, 20, 18, 30))
    r = seeded.patch("/attendance/EMP0004/2026-07-20", json={**FIX, "punch_in": ms(ist(2026, 7, 20, 9, 28)), "work_hours": 99})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["late_minutes"] == 0 and body["work_hours"] == 9.03
    (entry,) = body["history"]
    assert entry["by"] == "hr.admin" and isinstance(entry["at"], int)
    assert entry["changes"] == {
        "punch_in": {"from": ms(ist(2026, 7, 20, 10, 5)), "to": ms(ist(2026, 7, 20, 9, 28))},
        "late_minutes": {"from": 35, "to": 0},
        "work_hours": {"from": 8.42, "to": 9.03},
    }
    stored = db.attendance_logs.find_one({"emp_code": "EMP0004", "date": "2026-07-20"})
    assert isinstance(stored["history"][0]["changes"]["punch_in"]["from"], datetime)

    r = seeded.patch("/attendance/EMP0004/2026-07-20", json={**FIX, "status": "LEAVE"})
    body = r.json()
    assert body["punch_in"] is None and body["work_hours"] is None and len(body["history"]) == 2
    assert body["history"][1]["changes"]["status"] == {"from": "PRESENT", "to": "LEAVE"}


def test_regularize_rules(seeded):
    base = "/attendance/EMP0006/2026-07-09"  # ABSENT record
    assert seeded.patch(base, json={**FIX, "status": "LEAVE", "punch_in": ms(ist(2026, 7, 9, 9, 0))}).status_code == 422
    assert seeded.patch(base, json={**FIX, "status": "PRESENT"}).status_code == 422  # needs punch_in
    assert seeded.patch(base, json={**FIX, "status": "ABSENT"}).status_code == 422  # changes nothing
    assert seeded.patch(base, json={**FIX, "status": "PRESENT", "punch_in": ms(ist(2026, 7, 10, 9, 0))}).status_code == 422
    assert seeded.patch(base, json={**FIX, "status": None}).status_code == 422
    assert seeded.patch(base, json={"status": "LEAVE", "reason": "shrt", "regularized_by": "x"}).status_code == 422
    r = seeded.patch(
        base,
        json={**FIX, "status": "PRESENT", "punch_in": ms(ist(2026, 7, 9, 9, 50)), "punch_out": ms(ist(2026, 7, 9, 12, 0))},
    )
    assert r.status_code == 200 and r.json()["late_minutes"] == 20 and r.json()["half_day"] is True
    assert seeded.patch(base, json={**FIX, "punch_out": ms(ist(2026, 7, 9, 9, 0))}).status_code == 422  # before in
    assert seeded.patch("/attendance/EMP0006/2026-07-01", json={**FIX, "status": "LEAVE"}).status_code == 404
    assert seeded.patch("/attendance/EMP4242/2026-07-09", json={**FIX, "status": "LEAVE"}).status_code == 404
    assert seeded.patch("/attendance/EMP0006/2026-7-9", json={**FIX, "status": "LEAVE"}).status_code == 422


def test_regularize_legacy_record_without_history(seeded):
    r = seeded.patch("/attendance/EMP0002/2026-07-07", json={**FIX, "status": "WFH"})
    assert r.status_code == 200 and len(r.json()["history"]) == 1


def test_concurrent_regularizations_keep_all_history(seeded):
    statuses = ["WFH", "ON_DUTY", "PRESENT", "WFH", "ON_DUTY", "PRESENT", "WFH", "ON_DUTY"]
    with ThreadPoolExecutor(8) as pool:
        codes = list(
            pool.map(lambda s: seeded.patch("/attendance/EMP0006/2026-07-06", json={**FIX, "status": s}).status_code, statuses)
        )
    stored = db.attendance_logs.find_one({"emp_code": "EMP0006", "date": "2026-07-06"})
    assert set(codes) <= {200, 409, 422}
    assert len(stored["history"]) == codes.count(200)  # every 200 left exactly one entry


# --------------------------------------------------------------------------- #
# Analytics
# --------------------------------------------------------------------------- #
def test_employee_monthly(seeded):
    r = seeded.get("/analytics/employees/EMP0001/monthly", params={"month": "2026-07"}).json()
    # present: Mon 1 + Tue WFH half 0.5; Sat record excluded; LEAVE not present
    assert r == {
        "emp_code": "EMP0001",
        "month": "2026-07",
        "working_days": 23,
        "present_days": 1.5,
        "leave_days": 1,
        "late_count": 2,
        "total_late_minutes": 50,
        "total_overtime_minutes": 45,
        "attendance_pct": 6.52,
    }
    r = seeded.get("/analytics/employees/EMP0003/monthly", params={"month": "2026-07"}).json()
    assert r["working_days"] == 13  # 15th (Wed) .. 31st
    r = seeded.get("/analytics/employees/EMP0007/monthly", params={"month": "2026-07"}).json()
    assert r["working_days"] == 0 and r["attendance_pct"] is None and r["present_days"] == 0
    assert seeded.get("/analytics/employees/EMP4242/monthly", params={"month": "2026-07"}).status_code == 404
    assert seeded.get("/analytics/employees/EMP0001/monthly", params={"month": "2026-13"}).status_code == 422
    assert seeded.get("/analytics/employees/EMP0001/monthly").status_code == 422


def test_department_summary(seeded):
    r = seeded.get("/analytics/departments/summary", params={"month": "2026-07"}).json()
    items = {i["department"]: i for i in r["items"]}
    assert list(items) == ["Eng", "Ops"]  # Future (joins in August) omitted
    eng = items["Eng"]
    assert eng["headcount"] == 4  # includes EMP0004 with no logs
    assert eng["present_days"] == 4.5  # EMP1: 1.5, EMP2: 2, EMP3: 1
    # present records with work_hours: 8, 3.5, 8 (Sat), 8, 8, 8 -> 43.5 / 6 = 7.25
    assert eng["avg_work_hours"] == 7.25
    assert eng["late_count"] == 4 and eng["total_late_minutes"] == 150 and eng["leave_count"] == 1
    ops = items["Ops"]
    assert ops["headcount"] == 2 and ops["on_duty_count"] == 1 and ops["present_days"] == 2
    r = seeded.get("/analytics/departments/summary", params={"month": "2026-07", "department": "Ops"}).json()
    assert [i["department"] for i in r["items"]] == ["Ops"]
    r = seeded.get("/analytics/departments/summary", params={"month": "2026-08"}).json()
    assert {i["department"]: i["headcount"] for i in r["items"]} == {"Eng": 4, "Future": 1, "Ops": 2}


def test_late_leaderboard_ties(seeded):
    r = seeded.get("/analytics/leaderboard/late", params={"month": "2026-07", "limit": 1}).json()
    # EMP0001 (30+20), EMP0002 (50), EMP0003 (50) tie at 50 -> all rank 1; EMP9999 ignored
    assert [(i["rank"], i["emp_code"]) for i in r["items"]] == [(1, "EMP0001"), (1, "EMP0002"), (1, "EMP0003")]
    r = seeded.get("/analytics/leaderboard/late", params={"month": "2026-07", "limit": 4}).json()
    assert [(i["rank"], i["emp_code"]) for i in r["items"]] == [
        (1, "EMP0001"), (1, "EMP0002"), (1, "EMP0003"), (4, "EMP0005"),
    ]
    r = seeded.get("/analytics/leaderboard/late", params={"month": "2026-07", "limit": 50}).json()
    assert [(i["rank"], i["emp_code"]) for i in r["items"]][-2:] == [(4, "EMP0005"), (5, "EMP0006")]
    first = r["items"][0]
    assert first["name"] == "Name EMP0001" and first["department"] == "Eng" and first["late_count"] == 2
    r = seeded.get("/analytics/leaderboard/late", params={"month": "2026-07", "department": "Ops"}).json()
    assert [(i["rank"], i["emp_code"]) for i in r["items"]] == [(1, "EMP0005"), (2, "EMP0006")]
    assert seeded.get("/analytics/leaderboard/late", params={"month": "2026-07", "limit": 51}).status_code == 422


def test_department_trend(seeded):
    r = seeded.get("/analytics/departments/Eng/trend", params={"from": "2026-07-04", "to": "2026-07-16"})
    assert r.status_code == 200
    items = r.json()["items"]
    assert [i["date"] for i in items] == [f"2026-07-{d:02d}" for d in range(4, 17)]
    by_day = {i["date"]: i for i in items}
    assert by_day["2026-07-04"] == {
        "date": "2026-07-04", "is_working_day": False, "headcount": 3, "present_count": 0,
        "late_count": 0, "attendance_rate": None, "moving_avg_7d": None,
    }
    mon = by_day["2026-07-06"]
    assert mon["present_count"] == 2 and mon["late_count"] == 2 and mon["attendance_rate"] == 0.6667
    assert mon["moving_avg_7d"] == 0.6667  # only non-null rate in its window
    tue = by_day["2026-07-07"]
    assert tue["present_count"] == 1.5 and tue["attendance_rate"] == 0.5 and tue["moving_avg_7d"] == 0.5834
    sat = by_day["2026-07-11"]
    assert sat["present_count"] == 1 and sat["attendance_rate"] is None and sat["late_count"] == 1
    assert by_day["2026-07-08"]["attendance_rate"] == 0.0  # working day with no presence
    assert by_day["2026-07-14"]["headcount"] == 3 and by_day["2026-07-15"]["headcount"] == 4
    # 07-10 window = 07-04..07-10, rates .6667 .5 0 0 0 -> mean 0.23334 -> 0.2333
    assert by_day["2026-07-10"]["moving_avg_7d"] == 0.2333

    assert seeded.get("/analytics/departments/Nope/trend", params={"from": "2026-07-01", "to": "2026-07-02"}).status_code == 404
    assert seeded.get("/analytics/departments/Eng/trend", params={"from": "2026-07-02", "to": "2026-07-01"}).status_code == 422
    assert seeded.get("/analytics/departments/Eng/trend", params={"from": "2026-07-01", "to": "2026-09-30"}).status_code == 200
    assert seeded.get("/analytics/departments/Eng/trend", params={"from": "2026-07-01", "to": "2026-10-01"}).status_code == 422
    assert seeded.get("/analytics/departments/Eng/trend", params={"from": "2026-07-01"}).status_code == 422


def test_trend_department_nobody_joined_yet(seeded):
    items = seeded.get("/analytics/departments/Future/trend", params={"from": "2026-07-01", "to": "2026-07-03"}).json()["items"]
    assert [(i["headcount"], i["attendance_rate"], i["moving_avg_7d"]) for i in items] == [(0, None, None)] * 3


# --------------------------------------------------------------------------- #
# Explain
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "endpoint,params",
    [
        ("attendance_list", {}),
        ("attendance_list", {"emp_code": "EMP0001"}),
        ("attendance_list", {"status": "LEAVE"}),
        ("employee_monthly", {"emp_code": "EMP0001", "month": "2026-07"}),
        ("department_summary", {"month": "2026-07"}),
        ("department_summary", {"month": "2026-07", "department": "Eng"}),
        ("late_leaderboard", {"month": "2026-07"}),
        ("department_trend", {"department": "Eng", "from": "2026-07-01", "to": "2026-07-31"}),
    ],
)
def test_explain_uses_indexes(seeded, endpoint, params):
    r = seeded.get(f"/admin/explain/{endpoint}", params=params)
    assert r.status_code == 200, r.text
    text = r.text
    assert "IXSCAN" in text and "COLLSCAN" not in text


def test_explain_missing_params(seeded):
    assert seeded.get("/admin/explain/employee_monthly", params={"month": "2026-07"}).status_code == 422
    assert seeded.get("/admin/explain/department_trend", params={"department": "Eng"}).status_code == 422
    assert seeded.get("/admin/explain/nope").status_code == 422


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}
