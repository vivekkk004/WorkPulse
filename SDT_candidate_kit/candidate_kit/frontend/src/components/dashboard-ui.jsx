// Dashboard furniture, ported from MyBridge 3.0 (src/components/dashboard-ui.tsx).
import { initials } from '../utils/time';

/** Line icons on a common 24-grid at a common stroke weight. */
export const Icon = {
  users:
    'M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.4 4.2a3.5 3.5 0 0 1 0 6.6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2',
  check: 'M9 11.5 11.5 14 15 9.5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18',
  building: 'M4 21h16M6 21V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v16M14 9h3a1 1 0 0 1 1 1v11M9 8h2M9 12h2M9 16h2',
  calendar: 'M4 8h16M8 3v3M16 3v3M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  palm: 'M12 21v-8M12 13c-3 0-5-2-7-1 1-3 4-4 7-3M12 13c3 0 5-2 7-1-1-3-4-4-7-3M12 9V6',
  userPlus:
    'M15 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-4A3.5 3.5 0 0 0 4 17.5V19M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M18 8v6M21 11h-6',
  idCard:
    'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM8.5 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4M6 16c.5-1.5 1.4-2 2.5-2s2 .5 2.5 2M14 9h4M14 13h4',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  login: 'M10 17l5-5-5-5M15 12H3M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5',
  logout: 'M14 17l5-5-5-5M19 12H7M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5',
  edit: 'M4 20h4L19 9l-4-4L4 16v4M13.5 6.5l4 4',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14M20 20l-3.5-3.5',
  menu: 'M4 6h16M4 12h16M4 18h16',
};

export function Glyph({ d, className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** The one card. Everything on the dashboard sits in one of these. */
export function Panel({ title, subtitle, icon, count, href, linkLabel = 'View all', action, bodyClass = 'p-5', className = '', children }) {
  const header = title || action || href;
  return (
    <section className={`flex flex-col rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:shadow-none ${className}`}>
      {header && (
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-3.5 dark:border-gray-800">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/8 text-brand">
                <Glyph d={icon} />
              </span>
            )}
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                {title}
                {count != null && count > 0 && (
                  <span className="ml-2 rounded-full bg-brand/10 px-1.5 py-0.5 align-middle text-[11px] font-semibold tabular-nums text-brand">{count}</span>
                )}
              </h3>
              {subtitle && <p className="truncate text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
            </div>
          </div>
          {action ??
            (href && (
              <a href={href} className="shrink-0 whitespace-nowrap text-xs font-medium text-brand hover:underline">
                {linkLabel}
              </a>
            ))}
        </div>
      )}
      <div className={`flex-1 ${bodyClass}`}>{children}</div>
    </section>
  );
}

/** A headline number; the whole card is the link. */
export function Kpi({ label, value, sub, icon, href, bar }) {
  return (
    <a
      href={href}
      className="group flex flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-brand/40 dark:border-gray-800 dark:bg-gray-900 dark:shadow-none"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/8 text-brand">
          <Glyph d={icon} className="h-[18px] w-[18px]" />
        </span>
        <Glyph d={Icon.arrow} className="h-4 w-4 text-gray-300 transition-colors group-hover:text-brand dark:text-gray-600" />
      </div>
      <div className="mt-3.5 text-[13px] font-medium text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-0.5 text-[28px] font-bold leading-tight tracking-tight text-gray-900 dark:text-gray-100">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{sub}</div>}
      {bar && <div className="mt-3.5">{bar}</div>}
    </a>
  );
}

/** A thin stacked bar under a KPI. */
export function MiniBar({ parts }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        {total > 0 &&
          parts.map((p) => <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }} title={`${p.label}: ${p.value}`} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <span key={p.label} className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} aria-hidden="true" />
              {p.label}
              <b className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">{p.value}</b>
            </span>
          ))}
      </div>
    </>
  );
}

/** Avatar + name + secondary line. */
export function PersonRow({ name, sub, right, lead }) {
  return (
    <div className="flex items-center gap-3 border-b border-gray-50 py-2.5 last:border-0 dark:border-gray-800/60">
      {lead}
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-semibold text-brand" aria-hidden="true">
        {initials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{name}</div>
        {sub && <div className="truncate text-xs text-gray-500 dark:text-gray-400">{sub}</div>}
      </div>
      {right && <div className="shrink-0 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">{right}</div>}
    </div>
  );
}

export function PanelEmpty({ text }) {
  return <div className="py-8 text-center text-xs text-gray-400 dark:text-gray-500">{text}</div>;
}

/** A labelled horizontal bar, for the "X by Y" breakdowns. */
export function BarRow({ label, value, max, color, suffix = '' }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate text-gray-700 dark:text-gray-300">{label}</span>
        <span className="shrink-0 font-semibold tabular-nums text-gray-900 dark:text-gray-100">
          {value}
          {suffix}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div className="h-full rounded-full" style={{ width: `${Math.max((value / Math.max(max, 1)) * 100, 2)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// MyBridge's chart palette.
export const C = { navy: '#1d4e89', blue: '#2563eb', amber: '#d97706', rose: '#e11d48', indigo: '#6366f1', slate: '#94a3b8', teal: '#0d9488' };
