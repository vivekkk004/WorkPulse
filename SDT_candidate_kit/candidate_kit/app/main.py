"""
Employee Attendance & Analytics API

Run:  uvicorn app.main:app --port 8000
Env:  MONGO_URI, MONGO_DB (a local .env is loaded for convenience; real environment variables win)

Layout of this file (everything lives here on purpose, see README.md):
  1. Configuration and MongoDB client
  2. Constants and API types (validation)
  3. Time helpers (epoch ms <-> BSON dates, IST, R1)
  4. Business-rule helpers (R2 - R5)
  5. Serialization (MongoDB document -> API shape)
  6. Indexes
  7. Query / pipeline builders, shared by the endpoints and by /admin/explain
  8. Endpoints
"""
import calendar
import json
import logging
import os
import re
import threading
from contextlib import asynccontextmanager
from datetime import date, datetime, time, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated, Any, Literal, Optional

from bson import Decimal128, json_util
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Path, Query
from pydantic import AfterValidator, BaseModel, Field, model_validator
from pymongo import ASCENDING, DESCENDING, MongoClient, ReturnDocument
from pymongo.errors import DuplicateKeyError, PyMongoError

# --------------------------------------------------------------------------- #
# 1. Configuration
# --------------------------------------------------------------------------- #
load_dotenv()  # override=False: variables already set in the environment win over .env

log = logging.getLogger("attendance")

# tz_aware=True: PyMongo returns timezone-aware UTC datetimes instead of naive ones, so every
# instant we read can be compared with the aware instants we build and converted to epoch ms.
client = MongoClient(
    os.getenv("MONGO_URI", "mongodb://localhost:27017"),
    tz_aware=True,
    tzinfo=timezone.utc,
    serverSelectionTimeoutMS=3000,
)
db = client[os.getenv("MONGO_DB", "attendance_db")]
employees_col = db["employees"]
logs_col = db["attendance_logs"]

# --------------------------------------------------------------------------- #
# 2. Constants and API types
# --------------------------------------------------------------------------- #
UTC = timezone.utc
IST = timezone(timedelta(hours=5, minutes=30))
EPOCH = datetime(1970, 1, 1, tzinfo=UTC)

GRACE_SECONDS = 10 * 60  # R2
MIN_OVERTIME_MINUTES = 30  # R3
HALF_DAY_BELOW_HOURS = 4.5  # R5
MAX_SHIFT_LENGTH = timedelta(hours=24)
MAX_TREND_DAYS = 92

PRESENCE_STATUSES = ("PRESENT", "WFH", "ON_DUTY")  # R6
ABSENCE_STATUSES = ("ABSENT", "LEAVE")

EPOCH_MS_MIN = 100_000_000_000  # anything smaller looks like seconds
EPOCH_MS_MAX = 4_102_444_800_000  # 2100-01-01

Status = Literal["PRESENT", "ABSENT", "LEAVE", "WFH", "ON_DUTY"]
PresenceStatus = Literal["PRESENT", "WFH", "ON_DUTY"]

# strict=True rejects floats (1.7e12), numeric strings ("1783312500000") and booleans with a 422.
EpochMillis = Annotated[int, Field(strict=True, ge=EPOCH_MS_MIN, le=EPOCH_MS_MAX)]

_DATE_RE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
_MONTH_RE = re.compile(r"[0-9]{4}-(0[1-9]|1[0-2])")
_HHMM_PATTERN = r"^([01][0-9]|2[0-3]):[0-5][0-9]$"


def _valid_date(value: str) -> str:
    # fromisoformat alone also accepts "20260706" and "2026-W27-1", so check the shape first.
    if not _DATE_RE.fullmatch(value):
        raise ValueError("must be a date in YYYY-MM-DD format")
    date.fromisoformat(value)  # rejects impossible dates such as 2026-02-30
    return value


def _valid_month(value: str) -> str:
    if not _MONTH_RE.fullmatch(value) or value.startswith("0000"):
        raise ValueError("must be a month in YYYY-MM format")
    return value


DateStr = Annotated[str, AfterValidator(_valid_date)]
MonthStr = Annotated[str, AfterValidator(_valid_month)]
PageParam = Annotated[int, Query(ge=1)]
PageSizeParam = Annotated[int, Query(ge=1, le=100)]
LimitParam = Annotated[int, Query(ge=1, le=50)]


class EmployeeCreate(BaseModel):
    emp_code: str = Field(pattern=r"^EMP[0-9]{4,6}$")
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(max_length=120, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    department: str = Field(min_length=1, max_length=50)
    shift_start: str = Field("09:30", pattern=_HHMM_PATTERN)
    shift_end: str = Field("18:30", pattern=_HHMM_PATTERN)
    joined_on: DateStr

    @model_validator(mode="after")
    def _shift_has_length(self):
        if self.shift_start == self.shift_end:
            raise ValueError("shift_start must differ from shift_end")
        return self


class PunchRequest(BaseModel):
    emp_code: str
    punched_at: Optional[EpochMillis] = None  # omitted -> server clock


class PunchInRequest(PunchRequest):
    status: PresenceStatus = "PRESENT"


class RegularizeRequest(BaseModel):
    # The optional fields default to None but are deliberately NOT Optional: an explicit
    # `null` is rejected with 422 (none of them is nullable in the contract), while an
    # omitted field means "unchanged". Which fields were sent is read from model_fields_set.
    # Derived fields (work_hours, ...) are not declared, so if a client sends them they are ignored.
    status: Status = None  # type: ignore[assignment]
    punch_in: EpochMillis = None  # type: ignore[assignment]
    punch_out: EpochMillis = None  # type: ignore[assignment]
    reason: str = Field(min_length=5, max_length=200)
    regularized_by: str = Field(min_length=1, max_length=50)


def unprocessable(msg: str, loc: tuple = ("body",)) -> HTTPException:
    """A business-rule 422 shaped like FastAPI's own validation errors ({"detail": [...]})."""
    return HTTPException(422, detail=[{"type": "value_error", "loc": list(loc), "msg": msg}])


def missing_param(name: str) -> HTTPException:
    return HTTPException(422, detail=[{"type": "missing", "loc": ["query", name], "msg": "Field required"}])


# --------------------------------------------------------------------------- #
# 3. Time helpers
# --------------------------------------------------------------------------- #
def ms_to_utc(ms: int) -> datetime:
    """Epoch ms -> aware UTC datetime, truncated to whole seconds (R1)."""
    return EPOCH + timedelta(seconds=ms // 1000)


def now_utc() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def utc_to_ms(dt: Optional[datetime]) -> Optional[int]:
    if dt is None:
        return None
    if dt.tzinfo is None:  # defensive: BSON dates are always UTC
        dt = dt.replace(tzinfo=UTC)
    return (dt - EPOCH) // timedelta(milliseconds=1)


def parse_hhmm(value: str) -> time:
    h, m = map(int, value.split(":"))
    return time(h, m)


def is_overnight(emp: dict) -> bool:
    # "HH:MM" strings are zero-padded, so string order is time order.
    return emp["shift_end"] <= emp["shift_start"]


def attendance_date(punch_in: datetime, emp: dict) -> date:
    """R1: IST calendar date of the punch-in; an overnight shift's early-morning punch-in
    (strictly before shift_end) belongs to the shift that started the previous day."""
    local = punch_in.astimezone(IST)
    day = local.date()
    if is_overnight(emp) and local.time() < parse_hhmm(emp["shift_end"]):
        day -= timedelta(days=1)
    return day


def shift_window(emp: dict, day: date) -> tuple[datetime, datetime]:
    """Start and end instants of the shift of attendance day `day` (end is next day for overnight shifts)."""
    start = datetime.combine(day, parse_hhmm(emp["shift_start"]), IST)
    end = datetime.combine(day, parse_hhmm(emp["shift_end"]), IST)
    if is_overnight(emp):
        end += timedelta(days=1)
    return start, end


# --------------------------------------------------------------------------- #
# 4. Business-rule helpers (R2 - R5)
# --------------------------------------------------------------------------- #
def compute_late_minutes(punch_in: datetime, emp: dict, day: date) -> int:
    """R2: late only if strictly more than 10:00 after shift start; then floor minutes since shift start."""
    shift_start, _ = shift_window(emp, day)
    seconds = int((punch_in - shift_start).total_seconds())
    return seconds // 60 if seconds > GRACE_SECONDS else 0


def compute_work_hours(punch_in: datetime, punch_out: datetime) -> float:
    """R4: seconds / 3600 rounded half-up to 2 decimals, done in Decimal (round() is banker's rounding on floats)."""
    seconds = int((punch_out - punch_in).total_seconds())
    return float((Decimal(seconds) / 3600).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def compute_overtime(punch_out: datetime, emp: dict, day: date) -> int:
    """R3: floor minutes after shift end, counted only when >= 30."""
    _, shift_end = shift_window(emp, day)
    minutes = int((punch_out - shift_end).total_seconds()) // 60
    return minutes if minutes >= MIN_OVERTIME_MINUTES else 0


def derive_fields(status: str, punch_in: Optional[datetime], punch_out: Optional[datetime], emp: dict, day: date) -> dict:
    """The four derived fields for a record in its final state (DATA_MODEL.md, 'Stored derived values')."""
    derived = {"work_hours": None, "late_minutes": 0, "overtime_minutes": 0, "half_day": False}
    if status not in PRESENCE_STATUSES or punch_in is None:
        return derived
    derived["late_minutes"] = compute_late_minutes(punch_in, emp, day)
    if punch_out is not None:
        work_hours = compute_work_hours(punch_in, punch_out)
        derived["work_hours"] = work_hours
        derived["overtime_minutes"] = compute_overtime(punch_out, emp, day)
        derived["half_day"] = work_hours < HALF_DAY_BELOW_HOURS  # R5 uses the rounded value
    return derived


def round_half_up(value: Any, places: int) -> Optional[float]:
    """R8 rounding for numbers coming back from an aggregation (float, int or Decimal128)."""
    if value is None:
        return None
    dec = value.to_decimal() if isinstance(value, Decimal128) else Decimal(str(value))
    return float(dec.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP))


# --------------------------------------------------------------------------- #
# 5. Serialization: MongoDB document -> API shape (no _id, instants as epoch ms)
# --------------------------------------------------------------------------- #
def serialize_employee(doc: dict) -> dict:
    return {
        "emp_code": doc["emp_code"],
        "name": doc["name"],
        "email": doc["email"],
        "department": doc["department"],
        "shift_start": doc["shift_start"],
        "shift_end": doc["shift_end"],
        "joined_on": doc["joined_on"],
        "created_at": utc_to_ms(doc.get("created_at")),
    }


def _api_value(value: Any) -> Any:
    return utc_to_ms(value) if isinstance(value, datetime) else value


def serialize_record(doc: dict) -> dict:
    # Legacy records may omit half_day / history / late_minutes / overtime_minutes: missing means false / [] / 0.
    return {
        "emp_code": doc["emp_code"],
        "date": doc["date"],
        "status": doc["status"],
        "punch_in": utc_to_ms(doc.get("punch_in")),
        "punch_out": utc_to_ms(doc.get("punch_out")),
        "work_hours": doc.get("work_hours"),
        "late_minutes": int(doc.get("late_minutes") or 0),
        "overtime_minutes": int(doc.get("overtime_minutes") or 0),
        "half_day": bool(doc.get("half_day") or False),
        "history": [
            {
                "at": utc_to_ms(entry.get("at")),
                "by": entry.get("by"),
                "reason": entry.get("reason"),
                "changes": {
                    field: {"from": _api_value(change.get("from")), "to": _api_value(change.get("to"))}
                    for field, change in (entry.get("changes") or {}).items()
                },
            }
            for entry in (doc.get("history") or [])
        ],
    }


def get_employee_or_404(emp_code: str) -> dict:
    emp = employees_col.find_one({"emp_code": emp_code}, {"_id": 0})
    if emp is None:
        raise HTTPException(404, f"employee {emp_code} not found")
    return emp


# --------------------------------------------------------------------------- #
# 6. Indexes (created at startup, idempotently; see DECISIONS.md)
# --------------------------------------------------------------------------- #
INDEXES = {
    "employees": [
        # Uniqueness of the business key; makes concurrent duplicate creates fail with E11000 -> 409.
        ([("emp_code", ASCENDING)], {"unique": True}),
        # GET /employees?department= sorted by emp_code; department summary and trend start here.
        ([("department", ASCENDING), ("emp_code", ASCENDING)], {}),
    ],
    "attendance_logs": [
        # One record per employee per day (race-safe punch-in), PATCH lookups, punch-out search,
        # the employee monthly summary and every per-employee $lookup in the analytics.
        ([("emp_code", ASCENDING), ("date", ASCENDING)], {"unique": True}),
        # GET /attendance default order (date desc, emp_code asc) and date-range scans (leaderboard).
        ([("date", DESCENDING), ("emp_code", ASCENDING)], {}),
        # GET /attendance?status=... (list and its count) without walking every date.
        ([("status", ASCENDING), ("date", DESCENDING), ("emp_code", ASCENDING)], {}),
    ],
}

_indexes_ready = False
_indexes_lock = threading.Lock()


def ensure_indexes() -> bool:
    """Create the indexes once. Called at startup and retried from /health if MongoDB was not up yet."""
    global _indexes_ready
    if _indexes_ready:
        return True
    with _indexes_lock:
        if _indexes_ready:
            return True
        try:
            client.admin.command("ping")
            for collection, specs in INDEXES.items():
                for keys, options in specs:
                    db[collection].create_index(keys, **options)
            _indexes_ready = True
        except PyMongoError as exc:
            log.error("could not create indexes yet: %s", exc)
    return _indexes_ready


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_indexes()
    yield


app = FastAPI(title="Employee Attendance & Analytics API", version="2.0.0", lifespan=lifespan)


# --------------------------------------------------------------------------- #
# 7. Query and pipeline builders (one source of truth for endpoints and explain)
# --------------------------------------------------------------------------- #
LATE = {"$ifNull": ["$late_minutes", 0]}
IS_PRESENT = {"$in": ["$status", list(PRESENCE_STATUSES)]}
# R5/R6: a present-status record is worth 1 day, or 0.5 when half_day is true.
PRESENCE_WEIGHT = {"$cond": [IS_PRESENT, {"$cond": [{"$eq": [{"$ifNull": ["$half_day", False]}, True]}, 0.5, 1]}, 0]}
# R7: dates are "YYYY-MM-DD" strings; parsed as UTC midnight their ISO weekday is the calendar weekday.
IS_WEEKDAY = {"$lte": [{"$isoDayOfWeek": {"$dateFromString": {"dateString": "$date", "format": "%Y-%m-%d"}}}, 5]}
PRESENT_DAY = {"$cond": [IS_WEEKDAY, PRESENCE_WEIGHT, 0]}
HAS_WORK_HOURS = {"$and": [IS_PRESENT, {"$isNumber": "$work_hours"}]}


def mongo_round_half_up(expr: Any, places: int) -> dict:
    """Half-up rounding inside a pipeline. $round is round-half-to-even, so use floor(x * 10^p + 0.5) / 10^p
    on Decimal128 values to stay exact. Null in -> null out. Values are never negative here."""
    factor = 10**places
    return {
        "$divide": [
            {"$floor": {"$add": [{"$multiply": [{"$toDecimal": expr}, factor]}, Decimal128("0.5")]}},
            factor,
        ]
    }


def month_bounds(month: str) -> tuple[str, str]:
    year, mon = map(int, month.split("-"))
    first = date(year, mon, 1)
    last = date(year, mon, calendar.monthrange(year, mon)[1])
    return first.isoformat(), last.isoformat()


def count_weekdays(start: date, end: date) -> int:
    """Mon-Fri days in [start, end] (R7). Calendar arithmetic only, no data involved."""
    if start > end:
        return 0
    full_weeks, extra = divmod((end - start).days + 1, 7)
    return full_weeks * 5 + sum(1 for i in range(extra) if (start.weekday() + i) % 7 < 5)


def attendance_list_query(
    emp_code: Optional[str], date_from: Optional[str], date_to: Optional[str], status: Optional[str]
) -> dict:
    if date_from and date_to and date_from > date_to:
        raise unprocessable("date_from must be on or before date_to", ("query", "date_from"))
    query: dict = {}
    if emp_code is not None:
        query["emp_code"] = emp_code
    if date_from or date_to:
        query["date"] = {}
        if date_from:
            query["date"]["$gte"] = date_from
        if date_to:
            query["date"]["$lte"] = date_to
    if status is not None:
        query["status"] = status
    return query


ATTENDANCE_SORT = {"date": -1, "emp_code": 1}


def employee_monthly_pipeline(emp_code: str, month: str) -> list:
    first, last = month_bounds(month)
    return [
        {"$match": {"emp_code": emp_code, "date": {"$gte": first, "$lte": last}}},
        {
            "$group": {
                "_id": None,
                "present_days": {"$sum": PRESENT_DAY},
                "leave_days": {"$sum": {"$cond": [{"$eq": ["$status", "LEAVE"]}, 1, 0]}},
                "late_count": {"$sum": {"$cond": [{"$gt": [LATE, 0]}, 1, 0]}},
                "total_late_minutes": {"$sum": LATE},
                "total_overtime_minutes": {"$sum": {"$ifNull": ["$overtime_minutes", 0]}},
            }
        },
    ]


SUMMARY_COUNTERS = ("present_days", "work_hours_sum", "work_hours_n", "late_count", "total_late_minutes", "leave_count", "on_duty_count")


def department_summary_pipeline(month: str, department: Optional[str]) -> list:
    """Runs on `attendance_logs`:
      1. the month's logs (date index) are reduced to one row per emp_code;
      2. $unionWith adds one row per employee (from `employees`), so people with zero logs exist too;
      3. grouping by emp_code merges the two: the department and joined_on come only from the
         employee row, so logs of unknown employees end up without a department and are dropped;
      4. grouping by department gives headcount (joined_on <= month end, R9) and the sums.
    work_hours is summed as Decimal128 together with a count, so the average is over records and
    exact before half-up rounding."""
    first, last = month_bounds(month)
    employee_rows: list = [{"$match": {"department": department}}] if department is not None else []
    employee_rows += [
        # Sorting on the (department, emp_code) index keeps this side an index scan as well.
        {"$sort": {"department": 1, "emp_code": 1}},
        {"$project": {"_id": "$emp_code", "department": 1, "joined_on": 1}},
    ]
    pipeline: list = [
        {"$match": {"date": {"$gte": first, "$lte": last}}},
        {
            "$group": {
                "_id": "$emp_code",
                "present_days": {"$sum": PRESENT_DAY},
                "work_hours_sum": {"$sum": {"$cond": [HAS_WORK_HOURS, {"$toDecimal": "$work_hours"}, 0]}},
                "work_hours_n": {"$sum": {"$cond": [HAS_WORK_HOURS, 1, 0]}},
                "late_count": {"$sum": {"$cond": [{"$gt": [LATE, 0]}, 1, 0]}},
                "total_late_minutes": {"$sum": LATE},
                "leave_count": {"$sum": {"$cond": [{"$eq": ["$status", "LEAVE"]}, 1, 0]}},
                "on_duty_count": {"$sum": {"$cond": [{"$eq": ["$status", "ON_DUTY"]}, 1, 0]}},
            }
        },
        {"$unionWith": {"coll": "employees", "pipeline": employee_rows}},
        {
            "$group": {
                "_id": "$_id",
                "department": {"$max": "$department"},
                "joined_on": {"$max": "$joined_on"},
                **{name: {"$sum": f"${name}"} for name in SUMMARY_COUNTERS},
            }
        },
        {"$match": {"department": {"$type": "string"}}},
        {
            "$group": {
                "_id": "$department",
                "headcount": {"$sum": {"$cond": [{"$lte": ["$joined_on", last]}, 1, 0]}},
                **{name: {"$sum": f"${name}"} for name in SUMMARY_COUNTERS},
            }
        },
        {"$match": {"headcount": {"$gt": 0}}},
        {"$sort": {"_id": 1}},
        {
            "$project": {
                "_id": 0,
                "department": "$_id",
                "headcount": 1,
                "present_days": 1,
                "avg_work_hours": {
                    "$cond": [
                        {"$gt": ["$work_hours_n", 0]},
                        {"$divide": [{"$toDecimal": "$work_hours_sum"}, "$work_hours_n"]},
                        None,
                    ]
                },
                "late_count": 1,
                "total_late_minutes": 1,
                "leave_count": 1,
                "on_duty_count": 1,
            }
        },
    ]
    return pipeline


def late_leaderboard_pipeline(month: str, limit: int, department: Optional[str]) -> list:
    """Totals per employee, joined to employees (unknown employees drop out at $unwind), ranked with
    $rank (standard competition ranking: 1, 2, 2, 4), and cut at rank <= limit, so ties at the cutoff
    are all returned."""
    first, last = month_bounds(month)
    pipeline: list = [
        {"$match": {"date": {"$gte": first, "$lte": last}, "late_minutes": {"$gt": 0}}},
        {"$group": {"_id": "$emp_code", "total_late_minutes": {"$sum": "$late_minutes"}, "late_count": {"$sum": 1}}},
        {
            "$lookup": {
                "from": "employees",
                "localField": "_id",
                "foreignField": "emp_code",
                "as": "emp",
            }
        },
        {"$unwind": "$emp"},
    ]
    if department is not None:
        pipeline.append({"$match": {"emp.department": department}})
    pipeline += [
        {"$setWindowFields": {"sortBy": {"total_late_minutes": -1}, "output": {"rank": {"$rank": {}}}}},
        {"$match": {"rank": {"$lte": limit}}},
        {"$sort": {"total_late_minutes": -1, "_id": 1}},
        {
            "$project": {
                "_id": 0,
                "rank": 1,
                "emp_code": "$_id",
                "name": "$emp.name",
                "department": "$emp.department",
                "total_late_minutes": 1,
                "late_count": 1,
            }
        },
    ]
    return pipeline


def department_trend_pipeline(department: str, date_from: str, date_to: str) -> list:
    """Runs on `employees` (for headcount, R9). Every employee contributes 'events' keyed by day:
    one join event (+1 headcount from max(joined_on, from)), one event per log in range, and a
    zero sentinel on `from` so the stream is never empty. Events are summed per day, $densify fills
    every missing calendar day, then window functions give the running headcount and the 7-row
    moving average, which never looks before `from` because nothing before `from` is in the stream."""
    lower = datetime.fromisoformat(date_from).replace(tzinfo=UTC)
    upper = datetime.fromisoformat(date_to).replace(tzinfo=UTC) + timedelta(days=1)  # bounds are [lower, upper)
    zero_event = {"date": date_from, "hc": 0, "p": 0, "l": 0}
    rate = {
        "$cond": [
            {"$and": ["$is_working_day", {"$gt": ["$headcount", 0]}]},
            mongo_round_half_up({"$divide": [{"$toDecimal": "$present_count"}, "$headcount"]}, 4),
            None,
        ]
    }
    return [
        {"$match": {"department": department}},
        {
            "$lookup": {
                "from": "attendance_logs",
                "localField": "emp_code",
                "foreignField": "emp_code",
                "pipeline": [
                    {"$match": {"date": {"$gte": date_from, "$lte": date_to}}},
                    {"$project": {"_id": 0, "date": 1, "p": PRESENCE_WEIGHT, "l": {"$cond": [{"$gt": [LATE, 0]}, 1, 0]}}},
                ],
                "as": "logs",
            }
        },
        {
            "$project": {
                "_id": 0,
                "events": {
                    "$concatArrays": [
                        [zero_event],
                        {
                            "$cond": [
                                {"$lte": ["$joined_on", date_to]},
                                [{"date": {"$max": ["$joined_on", date_from]}, "hc": 1, "p": 0, "l": 0}],
                                [],
                            ]
                        },
                        {"$map": {"input": "$logs", "in": {"date": "$$this.date", "hc": 0, "p": "$$this.p", "l": "$$this.l"}}},
                    ]
                },
            }
        },
        {"$unwind": "$events"},
        {"$group": {"_id": "$events.date", "hc": {"$sum": "$events.hc"}, "p": {"$sum": "$events.p"}, "l": {"$sum": "$events.l"}}},
        {"$project": {"_id": 0, "day": {"$dateFromString": {"dateString": "$_id", "format": "%Y-%m-%d"}}, "hc": 1, "p": 1, "l": 1}},
        {"$densify": {"field": "day", "range": {"step": 1, "unit": "day", "bounds": [lower, upper]}}},
        {
            "$setWindowFields": {
                "sortBy": {"day": 1},
                "output": {"headcount": {"$sum": {"$ifNull": ["$hc", 0]}, "window": {"documents": ["unbounded", "current"]}}},
            }
        },
        {
            "$set": {
                "present_count": {"$ifNull": ["$p", 0]},
                "late_count": {"$ifNull": ["$l", 0]},
                "is_working_day": {"$lte": [{"$isoDayOfWeek": "$day"}, 5]},
            }
        },
        {"$set": {"attendance_rate": rate}},
        {
            "$setWindowFields": {
                "sortBy": {"day": 1},
                # $avg skips nulls and returns null when the window holds no number.
                "output": {"moving_avg_7d": {"$avg": "$attendance_rate", "window": {"documents": [-6, "current"]}}},
            }
        },
        {"$sort": {"day": 1}},
        {
            "$project": {
                "_id": 0,
                "date": {"$dateToString": {"date": "$day", "format": "%Y-%m-%d"}},
                "is_working_day": "$is_working_day",
                "headcount": "$headcount",
                "present_count": "$present_count",
                "late_count": "$late_count",
                "attendance_rate": {"$toDouble": "$attendance_rate"},
                "moving_avg_7d": {"$toDouble": mongo_round_half_up("$moving_avg_7d", 4)},
            }
        },
    ]


def validate_trend_range(date_from: str, date_to: str) -> None:
    start, end = date.fromisoformat(date_from), date.fromisoformat(date_to)
    if end < start:
        raise unprocessable("`to` must be on or after `from`", ("query", "to"))
    if (end - start).days + 1 > MAX_TREND_DAYS:
        raise unprocessable(f"the range may not exceed {MAX_TREND_DAYS} days", ("query", "to"))
    if end == date.max:
        raise unprocessable("`to` is out of range", ("query", "to"))


# --------------------------------------------------------------------------- #
# 8. Endpoints
# --------------------------------------------------------------------------- #
@app.get("/health")
def health():
    try:
        client.admin.command("ping")
    except PyMongoError:
        raise HTTPException(503, "MongoDB is not reachable")
    ensure_indexes()
    return {"status": "ok"}


# ---- employees ------------------------------------------------------------- #
@app.post("/employees", status_code=201)
def create_employee(body: EmployeeCreate):
    doc = body.model_dump()
    now = datetime.now(UTC)
    doc["created_at"] = now.replace(microsecond=now.microsecond // 1000 * 1000)  # BSON keeps milliseconds
    try:
        employees_col.insert_one(doc)  # the unique index decides; no check-then-insert race
    except DuplicateKeyError:
        raise HTTPException(409, f"emp_code {body.emp_code} already exists")
    return serialize_employee(doc)


@app.get("/employees")
def list_employees(department: Optional[str] = None, page: PageParam = 1, page_size: PageSizeParam = 20):
    query = {"department": department} if department is not None else {}
    cursor = employees_col.find(query, {"_id": 0}).sort("emp_code", ASCENDING).skip((page - 1) * page_size).limit(page_size)
    items = [serialize_employee(doc) for doc in cursor]
    return {"items": items, "total": employees_col.count_documents(query), "page": page, "page_size": page_size}


# ---- attendance ------------------------------------------------------------ #
@app.post("/attendance/punch-in", status_code=201)
def punch_in(body: PunchInRequest):
    emp = get_employee_or_404(body.emp_code)
    punched_at = ms_to_utc(body.punched_at) if body.punched_at is not None else now_utc()
    day = attendance_date(punched_at, emp)
    doc = {
        "emp_code": body.emp_code,
        "date": day.isoformat(),
        "status": body.status,
        "punch_in": punched_at,
        "punch_out": None,
        **derive_fields(body.status, punched_at, None, emp, day),
        "history": [],
    }
    try:
        logs_col.insert_one(doc)  # unique (emp_code, date): of two simultaneous inserts exactly one wins
    except DuplicateKeyError:
        raise HTTPException(409, f"{body.emp_code} already has a record for {doc['date']}")
    return serialize_record(doc)


@app.post("/attendance/punch-out")
def punch_out(body: PunchRequest):
    emp = get_employee_or_404(body.emp_code)
    punched_at = ms_to_utc(body.punched_at) if body.punched_at is not None else now_utc()
    # Most recent record with punch_in <= punched_at. By R1 an employee's record dates increase with
    # their punch_in, so walking the (emp_code, date) index backwards finds it; $lte also skips the
    # null punch_in of ABSENT / LEAVE records. Works across midnight because we search by instant.
    record = logs_col.find_one(
        {"emp_code": body.emp_code, "punch_in": {"$lte": punched_at}},
        sort=[("date", DESCENDING)],
    )
    if record is None:
        raise HTTPException(404, f"no punch-in found for {body.emp_code}")
    if record.get("punch_out") is not None:
        raise HTTPException(409, f"record of {record['date']} is already punched out")
    if punched_at <= record["punch_in"]:
        raise unprocessable("punched_at must be after punch_in", ("body", "punched_at"))
    if punched_at - record["punch_in"] > MAX_SHIFT_LENGTH:
        raise unprocessable("punched_at is more than 24 hours after punch_in", ("body", "punched_at"))

    derived = derive_fields(record["status"], record["punch_in"], punched_at, emp, date.fromisoformat(record["date"]))
    derived.pop("late_minutes")  # set at punch-in; punch-out does not touch it
    updated = logs_col.find_one_and_update(
        {"_id": record["_id"], "punch_out": None},  # conditional: of two simultaneous punch-outs one matches
        {"$set": {"punch_out": punched_at, **derived}},
        projection={"_id": 0},
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        raise HTTPException(409, f"record of {record['date']} is already punched out")
    return serialize_record(updated)


@app.get("/attendance")
def list_attendance(
    emp_code: Optional[str] = None,
    date_from: Optional[DateStr] = None,
    date_to: Optional[DateStr] = None,
    status: Optional[Status] = None,
    page: PageParam = 1,
    page_size: PageSizeParam = 20,
):
    query = attendance_list_query(emp_code, date_from, date_to, status)
    cursor = logs_col.find(query, {"_id": 0}).sort(list(ATTENDANCE_SORT.items())).skip((page - 1) * page_size).limit(page_size)
    items = [serialize_record(doc) for doc in cursor]
    # An unfiltered count is answered from collection metadata instead of counting 100k documents.
    total = logs_col.count_documents(query) if query else logs_col.estimated_document_count()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


TRACKED_FIELDS = ("status", "punch_in", "punch_out", "work_hours", "late_minutes", "overtime_minutes", "half_day")


def plan_regularization(record: dict, body: RegularizeRequest, emp: dict) -> tuple[dict, dict]:
    """Apply the request to the stored record. Returns (new field values, changes for history)."""
    sent = body.model_fields_set
    day = date.fromisoformat(record["date"])
    old = {
        "status": record["status"],
        "punch_in": record.get("punch_in"),
        "punch_out": record.get("punch_out"),
        "work_hours": record.get("work_hours"),
        "late_minutes": record.get("late_minutes") or 0,
        "overtime_minutes": record.get("overtime_minutes") or 0,
        "half_day": bool(record.get("half_day") or False),
    }
    status = body.status if "status" in sent else old["status"]
    if status in ABSENCE_STATUSES:
        if "punch_in" in sent or "punch_out" in sent:
            raise unprocessable(f"status {status} clears both punch times; do not send punch_in / punch_out")
        punch_in = punch_out = None
    else:
        punch_in = ms_to_utc(body.punch_in) if "punch_in" in sent else old["punch_in"]
        punch_out = ms_to_utc(body.punch_out) if "punch_out" in sent else old["punch_out"]
        if punch_in is None:
            raise unprocessable(f"status {status} requires a punch_in", ("body", "punch_in"))
        if "punch_in" in sent and attendance_date(punch_in, emp) != day:
            raise unprocessable(f"punch_in must stay on attendance date {record['date']}", ("body", "punch_in"))
        if punch_out is not None and not (punch_in < punch_out <= punch_in + MAX_SHIFT_LENGTH):
            raise unprocessable("punch_out must be after punch_in and within 24 hours of it", ("body", "punch_out"))

    new = {"status": status, "punch_in": punch_in, "punch_out": punch_out, **derive_fields(status, punch_in, punch_out, emp, day)}
    changes = {field: {"from": old[field], "to": new[field]} for field in TRACKED_FIELDS if old[field] != new[field]}
    if not changes:
        raise unprocessable("the request changes nothing")
    return new, changes


@app.patch("/attendance/{emp_code}/{date}")
def regularize_attendance(
    emp_code: str,
    body: RegularizeRequest,
    day: Annotated[DateStr, Path(alias="date")],
):
    emp = get_employee_or_404(emp_code)
    # Optimistic concurrency: the update only applies if the record still looks exactly as it did when
    # we read it (same status, punch times and history length). A concurrent PATCH or punch-out makes
    # it miss; we then re-read and re-plan, so neither history entry is lost. 409 if it keeps losing.
    for _ in range(3):
        record = logs_col.find_one({"emp_code": emp_code, "date": day})
        if record is None:
            raise HTTPException(404, f"no attendance record for {emp_code} on {day}")
        new, changes = plan_regularization(record, body, emp)
        now = datetime.now(UTC)
        entry = {
            "at": now.replace(microsecond=now.microsecond // 1000 * 1000),
            "by": body.regularized_by,
            "reason": body.reason,
            "changes": changes,
        }
        guard = {
            "_id": record["_id"],
            "status": record["status"],
            "punch_in": record.get("punch_in"),
            "punch_out": record.get("punch_out"),
        }
        history = record.get("history")
        if isinstance(history, list):
            guard[f"history.{len(history)}"] = {"$exists": False}
            update = {"$set": new, "$push": {"history": entry}}
        else:  # legacy record without a history array
            guard["history"] = None
            update = {"$set": {**new, "history": [entry]}}
        updated = logs_col.find_one_and_update(guard, update, projection={"_id": 0}, return_document=ReturnDocument.AFTER)
        if updated is not None:
            return serialize_record(updated)
    raise HTTPException(409, "the record was modified concurrently; please retry")


# ---- analytics ------------------------------------------------------------- #
@app.get("/analytics/employees/{emp_code}/monthly")
def employee_monthly(emp_code: str, month: MonthStr):
    emp = get_employee_or_404(emp_code)
    rows = list(logs_col.aggregate(employee_monthly_pipeline(emp_code, month)))
    stats = rows[0] if rows else {}
    first, last = month_bounds(month)
    working_days = count_weekdays(max(date.fromisoformat(first), date.fromisoformat(emp["joined_on"])), date.fromisoformat(last))
    present_days = stats.get("present_days", 0)
    return {
        "emp_code": emp_code,
        "month": month,
        "working_days": working_days,
        "present_days": round_half_up(present_days, 2),
        "leave_days": int(stats.get("leave_days", 0)),
        "late_count": int(stats.get("late_count", 0)),
        "total_late_minutes": int(stats.get("total_late_minutes", 0)),
        "total_overtime_minutes": int(stats.get("total_overtime_minutes", 0)),
        "attendance_pct": round_half_up(Decimal(str(present_days)) * 100 / working_days, 2) if working_days else None,
    }


@app.get("/analytics/departments/summary")
def department_summary(month: MonthStr, department: Optional[str] = None):
    items = []
    for row in logs_col.aggregate(department_summary_pipeline(month, department)):
        items.append(
            {
                "department": row["department"],
                "headcount": int(row["headcount"]),
                "present_days": round_half_up(row["present_days"], 2),
                "avg_work_hours": round_half_up(row["avg_work_hours"], 2),
                "late_count": int(row["late_count"]),
                "total_late_minutes": int(row["total_late_minutes"]),
                "leave_count": int(row["leave_count"]),
                "on_duty_count": int(row["on_duty_count"]),
            }
        )
    return {"month": month, "items": items}


@app.get("/analytics/leaderboard/late")
def late_leaderboard(month: MonthStr, limit: LimitParam = 10, department: Optional[str] = None):
    items = [
        {
            "rank": int(row["rank"]),
            "emp_code": row["emp_code"],
            "name": row["name"],
            "department": row["department"],
            "total_late_minutes": int(row["total_late_minutes"]),
            "late_count": int(row["late_count"]),
        }
        for row in logs_col.aggregate(late_leaderboard_pipeline(month, limit, department))
    ]
    return {"month": month, "items": items}


@app.get("/analytics/departments/{department}/trend")
def department_trend(
    department: str,
    date_from: Annotated[DateStr, Query(alias="from")],
    date_to: Annotated[DateStr, Query(alias="to")],
):
    validate_trend_range(date_from, date_to)
    if employees_col.find_one({"department": department}, {"_id": 1}) is None:
        raise HTTPException(404, f"department {department} not found")
    items = list(employees_col.aggregate(department_trend_pipeline(department, date_from, date_to)))
    return {"department": department, "items": items}


# ---- admin ----------------------------------------------------------------- #
ExplainTarget = Literal["attendance_list", "employee_monthly", "department_summary", "late_leaderboard", "department_trend"]


@app.get("/admin/explain/{endpoint}")
def explain_endpoint(
    endpoint: ExplainTarget,
    emp_code: Optional[str] = None,
    month: Optional[MonthStr] = None,
    department: Optional[str] = None,
    limit: LimitParam = 10,
    date_from: Optional[DateStr] = None,
    date_to: Optional[DateStr] = None,
    status: Optional[Status] = None,
    trend_from: Annotated[Optional[DateStr], Query(alias="from")] = None,
    trend_to: Annotated[Optional[DateStr], Query(alias="to")] = None,
    page: PageParam = 1,
    page_size: PageSizeParam = 20,
):
    """Explains the exact query / pipeline the named endpoint runs, built by the same builder function."""

    def require(**params: Any) -> None:
        for name, value in params.items():
            if value is None:
                raise missing_param(name)

    if endpoint == "attendance_list":
        collection = "attendance_logs"
        command: dict = {
            "find": collection,
            "filter": attendance_list_query(emp_code, date_from, date_to, status),
            "projection": {"_id": 0},
            "sort": ATTENDANCE_SORT,
            "skip": (page - 1) * page_size,
            "limit": page_size,
        }
    elif endpoint == "employee_monthly":
        require(emp_code=emp_code, month=month)
        collection = "attendance_logs"
        command = {"aggregate": collection, "pipeline": employee_monthly_pipeline(emp_code, month), "cursor": {}}
    elif endpoint == "department_summary":
        require(month=month)
        collection = "attendance_logs"
        command = {"aggregate": collection, "pipeline": department_summary_pipeline(month, department), "cursor": {}}
    elif endpoint == "late_leaderboard":
        require(month=month)
        collection = "attendance_logs"
        command = {"aggregate": collection, "pipeline": late_leaderboard_pipeline(month, limit, department), "cursor": {}}
    else:  # department_trend
        require(department=department, **{"from": trend_from, "to": trend_to})
        validate_trend_range(trend_from, trend_to)
        collection = "employees"
        command = {"aggregate": collection, "pipeline": department_trend_pipeline(department, trend_from, trend_to), "cursor": {}}

    result = db.command({"explain": command, "verbosity": "executionStats"})
    explain = json.loads(json_util.dumps(result, json_options=json_util.RELAXED_JSON_OPTIONS))
    return {"endpoint": endpoint, "collection": collection, "explain": explain}
