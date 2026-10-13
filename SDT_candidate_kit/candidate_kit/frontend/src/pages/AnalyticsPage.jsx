import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchDepartmentSummary, fetchDepartmentTrend, fetchEmployeeMonthly, fetchLateLeaderboard } from '../features/analytics/analyticsSlice';
import { Card, EmptyState, Loader, PageHeader, StatCard, StatRow } from '../components/ui';
import { FormError, Label, PrimaryButton, Tabs } from '../components/form';
import { Glyph, Icon, Panel } from '../components/dashboard-ui';
import TrendChart from '../components/TrendChart';
import { addDays, currentMonthIst, formatDate, formatPct, monthLabel, todayIst } from '../utils/time';

const TABS = [
  { key: 'monthly', label: 'Employee Monthly' },
  { key: 'summary', label: 'Department Summary' },
  { key: 'leaderboard', label: 'Late Leaderboard' },
  { key: 'trend', label: 'Attendance Trend' },
];

const inputCls = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:bg-gray-900';
const th = 'whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider';
const fmt = (n) => Number(n).toLocaleString('en-IN');

function FilterBar({ onSubmit, children }) {
  return (
    <Card className="mb-4 p-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex flex-wrap items-end gap-2"
      >
        {children}
        <PrimaryButton type="submit">Run report</PrimaryButton>
      </form>
    </Card>
  );
}

function Labeled({ label, children }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function EmployeeMonthly() {
  const dispatch = useDispatch();
  const { data, status, error } = useSelector((s) => s.analytics.monthly);
  const [empCode, setEmpCode] = useState('');
  const [month, setMonth] = useState(currentMonthIst());
  return (
    <>
      <FilterBar onSubmit={() => dispatch(fetchEmployeeMonthly({ empCode: empCode.trim(), month }))}>
        <Labeled label="Employee code">
          <input className={`${inputCls} w-40`} value={empCode} onChange={(e) => setEmpCode(e.target.value)} placeholder="EMP0001" required />
        </Labeled>
        <Labeled label="Month">
          <input type="month" className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)} required />
        </Labeled>
      </FilterBar>
      <FormError message={error} />
      {status === 'loading' && <Loader />}
      {data && status !== 'loading' && (
        <>
          <div className="mb-3 text-sm text-gray-500">
            <span className="font-mono font-semibold text-brand">{data.emp_code}</span> · {monthLabel(data.month)}
          </div>
          <StatRow>
            <StatCard label="Attendance" value={data.attendance_pct == null ? '—' : `${data.attendance_pct}%`} hint="present ÷ working days" tone="brand" icon={<Glyph d={Icon.check} />} />
            <StatCard label="Present days" value={data.present_days} hint={`of ${data.working_days} working days`} tone="good" icon={<Glyph d={Icon.calendar} />} />
            <StatCard label="Leave days" value={data.leave_days} tone="info" icon={<Glyph d={Icon.palm} />} />
            <StatCard label="Late arrivals" value={data.late_count} tone="warn" icon={<Glyph d={Icon.clock} />} />
            <StatCard label="Late minutes" value={fmt(data.total_late_minutes)} tone="bad" icon={<Glyph d={Icon.clock} />} />
            <StatCard label="Overtime minutes" value={fmt(data.total_overtime_minutes)} tone="muted" icon={<Glyph d={Icon.trend} />} />
          </StatRow>
        </>
      )}
      {!data && status === 'idle' && <EmptyState message="Enter an employee code and month, then run the report." />}
    </>
  );
}

function DepartmentSummary() {
  const dispatch = useDispatch();
  const { data, status, error } = useSelector((s) => s.analytics.summary);
  const [month, setMonth] = useState(data?.month ?? currentMonthIst());
  const [department, setDepartment] = useState('');
  return (
    <>
      <FilterBar onSubmit={() => dispatch(fetchDepartmentSummary({ month, department: department.trim() }))}>
        <Labeled label="Month">
          <input type="month" className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)} required />
        </Labeled>
        <Labeled label="Department (optional)">
          <input className={`${inputCls} w-48`} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="All departments" />
        </Labeled>
      </FilterBar>
      <FormError message={error} />
      {status === 'loading' && <Loader />}
      {data && status !== 'loading' && (
        <Card>
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5 dark:border-gray-800">
            <span className="text-sm font-semibold text-gray-900">{monthLabel(data.month)}</span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">{data.items.length} departments</span>
          </div>
          <div className="table-responsive">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80 text-left text-gray-500 dark:border-gray-800">
                  <th className={th}>Department</th>
                  {['Headcount', 'Present days', 'Avg work hrs', 'Late', 'Late minutes', 'Leave', 'On duty'].map((h) => (
                    <th key={h} className={`${th} text-right`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                      No department has employees in {monthLabel(data.month)}.
                    </td>
                  </tr>
                )}
                {data.items.map((d) => (
                  <tr key={d.department} className="border-b border-gray-100 last:border-0 hover:bg-brand/[0.04] dark:border-gray-800">
                    <td className="px-4 py-3.5 font-medium text-gray-900">{d.department}</td>
                    <td className="px-4 py-3.5 text-right text-gray-700">{d.headcount}</td>
                    <td className="px-4 py-3.5 text-right text-gray-700">{d.present_days}</td>
                    <td className="px-4 py-3.5 text-right text-gray-700">{d.avg_work_hours ?? '—'}</td>
                    <td className="px-4 py-3.5 text-right text-gray-700">{d.late_count}</td>
                    <td className="px-4 py-3.5 text-right text-gray-700">{fmt(d.total_late_minutes)}</td>
                    <td className="px-4 py-3.5 text-right text-gray-700">{d.leave_count}</td>
                    <td className="px-4 py-3.5 text-right text-gray-700">{d.on_duty_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

const RANK_CHIP = ['bg-amber-100 text-amber-800', 'bg-slate-200 text-slate-700', 'bg-orange-100 text-orange-800'];

function LateLeaderboard() {
  const dispatch = useDispatch();
  const { data, status, error } = useSelector((s) => s.analytics.leaderboard);
  const [month, setMonth] = useState(data?.month ?? currentMonthIst());
  const [limit, setLimit] = useState(10);
  const [department, setDepartment] = useState('');
  return (
    <>
      <FilterBar onSubmit={() => dispatch(fetchLateLeaderboard({ month, limit, department: department.trim() }))}>
        <Labeled label="Month">
          <input type="month" className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)} required />
        </Labeled>
        <Labeled label="Top (rank ≤)">
          <input type="number" min={1} max={50} className={`${inputCls} w-24`} value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
        </Labeled>
        <Labeled label="Department (optional)">
          <input className={`${inputCls} w-48`} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="All departments" />
        </Labeled>
      </FilterBar>
      <FormError message={error} />
      {status === 'loading' && <Loader />}
      {data && status !== 'loading' && (
        <Card>
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5 dark:border-gray-800">
            <span className="text-sm font-semibold text-gray-900">{monthLabel(data.month)}</span>
            <span className="text-xs text-gray-400">Ties share a rank (1, 2, 2, 4) — the list can exceed the limit.</span>
          </div>
          <div className="table-responsive">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80 text-left text-gray-500 dark:border-gray-800">
                  <th className={`${th} w-20`}>Rank</th>
                  <th className={th}>Employee</th>
                  <th className={th}>Department</th>
                  <th className={`${th} text-right`}>Late minutes</th>
                  <th className={`${th} text-right`}>Late days</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-sm text-gray-400">
                      Nobody was late in {monthLabel(data.month)}.
                    </td>
                  </tr>
                )}
                {data.items.map((r) => (
                  <tr key={r.emp_code} className="border-b border-gray-100 last:border-0 hover:bg-brand/[0.04] dark:border-gray-800">
                    <td className="px-4 py-3">
                      <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums ${RANK_CHIP[r.rank - 1] ?? 'bg-gray-100 text-gray-600'}`}>
                        {r.rank}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{r.name}</div>
                      <div className="font-mono text-xs text-brand">{r.emp_code}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.department}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-amber-700">{fmt(r.total_late_minutes)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.late_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

function DepartmentTrend() {
  const dispatch = useDispatch();
  const { data, status, error } = useSelector((s) => s.analytics.trend);
  const [department, setDepartment] = useState(data?.department ?? '');
  const [to, setTo] = useState(todayIst());
  const [from, setFrom] = useState(addDays(todayIst(), -29));
  const [showTable, setShowTable] = useState(false);
  const rates = data?.items.filter((d) => d.attendance_rate != null) ?? [];
  const avg = rates.length ? rates.reduce((s, d) => s + d.attendance_rate, 0) / rates.length : null;

  return (
    <>
      <FilterBar onSubmit={() => dispatch(fetchDepartmentTrend({ department: department.trim(), from, to }))}>
        <Labeled label="Department">
          <input className={`${inputCls} w-48`} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Engineering" required />
        </Labeled>
        <Labeled label="From">
          <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} required />
        </Labeled>
        <Labeled label="To">
          <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} required />
        </Labeled>
      </FilterBar>
      <FormError message={error} />
      {status === 'loading' && <Loader />}
      {data && status !== 'loading' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Days in range" value={data.items.length} hint={`${rates.length} working days with headcount`} tone="muted" />
            <StatCard label="Average rate" value={formatPct(avg)} hint="mean of daily rates" tone="brand" />
            <StatCard label="Latest 7-day avg" value={formatPct(data.items.at(-1)?.moving_avg_7d)} tone="good" />
            <StatCard label="Headcount (end)" value={data.items.at(-1)?.headcount ?? 0} tone="info" />
          </div>
          <Panel
            title={`${data.department} · daily attendance`}
            subtitle={`${formatDate(data.items[0].date)} → ${formatDate(data.items.at(-1).date)}`}
            icon={Icon.trend}
            action={
              <button type="button" onClick={() => setShowTable(!showTable)} className="shrink-0 text-xs font-medium text-brand hover:underline">
                {showTable ? 'Hide table' : 'Show table'}
              </button>
            }
          >
            <TrendChart items={data.items} />
          </Panel>
          {showTable && (
            <Card>
              <div className="table-responsive max-h-[480px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500 dark:border-gray-800">
                      <th className={th}>Date</th>
                      {['Headcount', 'Present', 'Late', 'Rate', '7-day avg'].map((h) => (
                        <th key={h} className={`${th} text-right`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((d) => (
                      <tr key={d.date} className={`border-b border-gray-100 last:border-0 dark:border-gray-800 ${d.is_working_day ? '' : 'bg-gray-50/80 text-gray-400'}`}>
                        <td className="px-4 py-2.5">{formatDate(d.date)}</td>
                        <td className="px-4 py-2.5 text-right">{d.headcount}</td>
                        <td className="px-4 py-2.5 text-right">{d.present_count}</td>
                        <td className="px-4 py-2.5 text-right">{d.late_count}</td>
                        <td className="px-4 py-2.5 text-right font-medium">{formatPct(d.attendance_rate)}</td>
                        <td className="px-4 py-2.5 text-right">{formatPct(d.moving_avg_7d)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
      {!data && status === 'idle' && <EmptyState message="Pick a department and a date range (up to 92 days), then run the report." />}
    </>
  );
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState('monthly');
  return (
    <div>
      <PageHeader title="Reports" subtitle="Monthly summaries, department analytics, late-comer rankings and daily trends." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'monthly' && <EmployeeMonthly />}
      {tab === 'summary' && <DepartmentSummary />}
      {tab === 'leaderboard' && <LateLeaderboard />}
      {tab === 'trend' && <DepartmentTrend />}
    </div>
  );
}
