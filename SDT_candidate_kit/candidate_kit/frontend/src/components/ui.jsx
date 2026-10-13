// Page furniture, ported from MyBridge 3.0 (src/components/ui.tsx).

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 pb-4 dark:border-gray-800">
      <div className="min-w-0">
        <h2 className="text-[22px] font-bold leading-tight tracking-tight text-gray-900 dark:text-gray-100">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function Card({ children, className = '' }) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:shadow-none ${className}`}>
      {children}
    </div>
  );
}

const STAT_TONE = {
  brand: { surface: 'bg-brand/[0.06] dark:bg-brand/10', chip: 'bg-brand/10 text-brand' },
  good: { surface: 'bg-teal-500/[0.07] dark:bg-teal-500/10', chip: 'bg-teal-500/15 text-teal-700 dark:text-teal-300' },
  warn: { surface: 'bg-amber-500/[0.09] dark:bg-amber-500/10', chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  bad: { surface: 'bg-rose-500/[0.07] dark:bg-rose-500/10', chip: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' },
  info: { surface: 'bg-blue-500/[0.07] dark:bg-blue-500/10', chip: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  muted: { surface: 'bg-slate-500/[0.06] dark:bg-slate-500/10', chip: 'bg-slate-500/15 text-slate-600 dark:text-slate-300' },
};

export function StatCard({ label, value, hint, tone = 'brand', icon }) {
  const t = STAT_TONE[tone];
  const safe = typeof value === 'number' && Number.isNaN(value) ? '—' : value ?? '—';
  return (
    <Card className={`relative overflow-hidden p-4 ${t.surface}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</div>
          <div className="mt-2 text-[26px] font-bold leading-none tabular-nums text-gray-900 dark:text-gray-100">{safe}</div>
          {hint && <div className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">{hint}</div>}
        </div>
        {icon && <span className={`shrink-0 rounded-xl p-2.5 ${t.chip}`}>{icon}</span>}
      </div>
    </Card>
  );
}

export function StatRow({ children }) {
  return <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">{children}</div>;
}

// Statuses grouped into tone families, as in MyBridge.
const STATUS_TONE = {
  PRESENT: 'good',
  WFH: 'info',
  ON_DUTY: 'progress',
  LEAVE: 'warn',
  HALF_DAY: 'warn',
  ABSENT: 'bad',
};

const TONE_STYLES = {
  good: { chip: 'bg-teal-50 text-teal-700 ring-teal-600/20 dark:bg-teal-900/30 dark:text-teal-200 dark:ring-teal-400/20', dot: 'bg-teal-500' },
  warn: { chip: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-400/20', dot: 'bg-amber-500' },
  bad: { chip: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-900/30 dark:text-rose-200 dark:ring-rose-400/20', dot: 'bg-rose-500' },
  info: { chip: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-900/30 dark:text-blue-200 dark:ring-blue-400/20', dot: 'bg-blue-500' },
  progress: { chip: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-900/30 dark:text-indigo-200 dark:ring-indigo-400/20', dot: 'bg-indigo-500' },
  muted: { chip: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/20', dot: 'bg-slate-400' },
};

export function ToneBadge({ label, tone = 'muted' }) {
  const t = TONE_STYLES[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${t.chip}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export function StatusBadge({ status }) {
  return <ToneBadge label={status.replace(/_/g, ' ')} tone={STATUS_TONE[status] ?? 'muted'} />;
}

export function Spinner({ size = 22 }) {
  const ring = Math.max(2, Math.round(size / 8));
  const mask = `radial-gradient(farthest-side, transparent calc(100% - ${ring}px), #000 calc(100% - ${ring}px))`;
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'conic-gradient(from 90deg at 50% 50%, rgba(29,78,137,0) 0%, #1d4e89 70%, #2f6fb5 100%)',
        WebkitMask: mask,
        mask,
        animation: 'mb-spin 0.7s linear infinite',
      }}
    />
  );
}

export function Loader({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <Spinner size={26} />
      {label && <div className="text-sm font-medium text-gray-400 dark:text-gray-500">{label}</div>}
    </div>
  );
}

export function EmptyState({ message }) {
  return <div className="py-12 text-center text-sm text-gray-400 dark:text-gray-500">{message}</div>;
}

export const STATUSES = ['PRESENT', 'WFH', 'ON_DUTY', 'ABSENT', 'LEAVE'];
export const PRESENCE_STATUSES = ['PRESENT', 'WFH', 'ON_DUTY'];
