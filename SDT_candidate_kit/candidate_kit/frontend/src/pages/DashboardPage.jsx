import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchDepartmentSummary, fetchLatestMonth, fetchLateLeaderboard } from '../features/analytics/analyticsSlice';
import { PageHeader } from '../components/ui';
import { FormError } from '../components/form';
import { BarRow, C, Glyph, Icon, Kpi, MiniBar, Panel, PanelEmpty, PersonRow } from '../components/dashboard-ui';
import { Loader } from '../components/ui';
import { currentMonthIst, monthLabel } from '../utils/time';

const QUICK_ACTIONS = [
  { label: 'Add Employee', href: '#employees', icon: Icon.userPlus },
  { label: 'Punch In / Out', href: '#attendance', icon: Icon.clock },
  { label: 'Monthly Report', href: '#analytics', icon: Icon.chart },
];

const sum = (items, key) => items.reduce((s, i) => s + (i[key] ?? 0), 0);
const fmt = (n) => Number(n).toLocaleString('en-IN');

export default function DashboardPage() {
  const dispatch = useDispatch();
  const latest = useSelector((s) => s.analytics.latestMonth);
  const summary = useSelector((s) => s.analytics.summary);
  const leaderboard = useSelector((s) => s.analytics.leaderboard);
  const [month, setMonth] = useState(null);

  // Open on the month of the newest record, so the first view is never an empty month.
  useEffect(() => {
    dispatch(fetchLatestMonth());
  }, [dispatch]);
  useEffect(() => {
    if (month == null && latest.status === 'succeeded') setMonth(latest.data || currentMonthIst());
    if (month == null && latest.status === 'failed') setMonth(currentMonthIst());
  }, [latest, month]);
  useEffect(() => {
    if (!month) return;
    dispatch(fetchDepartmentSummary({ month }));
    dispatch(fetchLateLeaderboard({ month, limit: 5 }));
  }, [dispatch, month]);

  const items = summary.data?.month === month ? summary.data.items : [];
  const late = leaderboard.data?.month === month ? leaderboard.data.items : [];
  const headcount = sum(items, 'headcount');
  const presentDays = sum(items, 'present_days');
  const lateCount = sum(items, 'late_count');
  const leave = sum(items, 'leave_count');
  const onDuty = sum(items, 'on_duty_count');
  const maxPresent = Math.max(1, ...items.map((d) => d.present_days));
  const maxHours = Math.max(1, ...items.map((d) => d.avg_work_hours ?? 0));
  const loading = !month || summary.status === 'loading';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        subtitle={month ? `Attendance overview for ${monthLabel(month)}` : 'Attendance overview'}
        action={
          <input
            type="month"
            value={month ?? ''}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            aria-label="Month"
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:bg-gray-900"
          />
        }
      />

      <div className="flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((a) => (
          <a
            key={a.label}
            href={a.href}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-brand/40 hover:bg-brand/5 hover:text-brand dark:border-gray-700 dark:text-gray-300"
          >
            <Glyph d={a.icon} />
            {a.label}
          </a>
        ))}
      </div>

      <FormError message={summary.error || leaderboard.error} />

      {loading && items.length === 0 ? (
        <Loader />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Headcount" value={fmt(headcount)} sub={`${items.length} departments · joined by month end`} icon={Icon.users} href="#employees" />
            <Kpi
              label="Present Days"
              value={fmt(presentDays)}
              sub={headcount ? `${(presentDays / headcount).toFixed(1)} per employee · Mon–Fri` : 'Mon–Fri, half day = 0.5'}
              icon={Icon.check}
              href="#analytics"
            />
            <Kpi
              label="Late Arrivals"
              value={fmt(lateCount)}
              sub={`${fmt(sum(items, 'total_late_minutes'))} late minutes`}
              icon={Icon.clock}
              href="#analytics"
            />
            <Kpi
              label="Leave & On Duty"
              value={fmt(leave + onDuty)}
              sub="records this month"
              icon={Icon.palm}
              href="#attendance"
              bar={
                <MiniBar
                  parts={[
                    { label: 'Leave', value: leave, color: C.amber },
                    { label: 'On duty', value: onDuty, color: C.indigo },
                  ]}
                />
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="space-y-4 xl:col-span-2">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Panel title="Present Days by Department" subtitle="Weekday presence, half day = 0.5" icon={Icon.building} href="#analytics" linkLabel="Open reports">
                  {items.length === 0 ? (
                    <PanelEmpty text="No departments with employees this month" />
                  ) : (
                    <div className="space-y-3.5">
                      {items.map((d) => (
                        <BarRow key={d.department} label={d.department} value={d.present_days} max={maxPresent} color={C.navy} />
                      ))}
                    </div>
                  )}
                </Panel>
                <Panel title="Average Work Hours" subtitle="Per completed presence record" icon={Icon.clock}>
                  {items.length === 0 ? (
                    <PanelEmpty text="No completed records this month" />
                  ) : (
                    <div className="space-y-3.5">
                      {items.map((d) => (
                        <BarRow key={d.department} label={d.department} value={d.avg_work_hours ?? 0} max={maxHours} color={C.teal} suffix=" h" />
                      ))}
                    </div>
                  )}
                </Panel>
              </div>

              <Panel title="Department Summary" subtitle={month ? monthLabel(month) : ''} icon={Icon.chart} bodyClass="">
                <div className="table-responsive">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50/80 text-left text-gray-500 dark:border-gray-800">
                        {['Department', 'Headcount', 'Present', 'Avg hrs', 'Late', 'Late min', 'Leave', 'On duty'].map((h, i) => (
                          <th key={h} className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider ${i ? 'text-right' : ''}`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-sm text-gray-400">
                            No data for this month
                          </td>
                        </tr>
                      )}
                      {items.map((d) => (
                        <tr key={d.department} className="border-b border-gray-100 last:border-0 hover:bg-brand/[0.04] dark:border-gray-800">
                          <td className="px-4 py-3 font-medium text-gray-800">{d.department}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{d.headcount}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{d.present_days}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{d.avg_work_hours ?? '—'}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{d.late_count}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{fmt(d.total_late_minutes)}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{d.leave_count}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{d.on_duty_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>

            <div className="space-y-4">
              <Panel title="Top Late-comers" subtitle="Ties share a rank" icon={Icon.clock} count={late.length} href="#analytics" linkLabel="Leaderboard">
                {late.length === 0 ? (
                  <PanelEmpty text="Nobody was late this month" />
                ) : (
                  late.map((r) => (
                    <PersonRow
                      key={r.emp_code}
                      lead={<span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-gray-400">#{r.rank}</span>}
                      name={r.name}
                      sub={`${r.emp_code} · ${r.department}`}
                      right={
                        <span className="text-right">
                          <b className="block text-sm font-semibold tabular-nums text-amber-700">{fmt(r.total_late_minutes)} min</b>
                          {r.late_count} late days
                        </span>
                      }
                    />
                  ))
                )}
              </Panel>
              <Panel title="Attendance Rules" subtitle="How these numbers are computed" icon={Icon.idCard}>
                <ul className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
                  <li>
                    <b className="text-gray-800 dark:text-gray-200">Late</b> — more than 10:00 after shift start; minutes counted from shift start.
                  </li>
                  <li>
                    <b className="text-gray-800 dark:text-gray-200">Overtime</b> — 30+ minutes after shift end.
                  </li>
                  <li>
                    <b className="text-gray-800 dark:text-gray-200">Half day</b> — under 4.50 worked hours, counts 0.5.
                  </li>
                  <li>
                    <b className="text-gray-800 dark:text-gray-200">Headcount</b> — joined on or before the month end, logs or not.
                  </li>
                </ul>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
