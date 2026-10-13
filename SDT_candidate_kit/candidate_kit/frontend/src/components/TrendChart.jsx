import { useEffect, useRef, useState } from 'react';
import { formatDate, formatPct } from '../utils/time';

const HEIGHT = 280;
const M = { top: 16, right: 16, bottom: 30, left: 44 };
// MyBridge chart palette: navy for the measure, amber for its smoothing.
const SERIES = [
  { key: 'attendance_rate', label: 'Daily attendance rate', stroke: 'stroke-[#1d4e89] dark:stroke-[#5b8fd0]', fill: 'fill-[#1d4e89] dark:fill-[#5b8fd0]', swatch: 'bg-[#1d4e89] dark:bg-[#5b8fd0]' },
  { key: 'moving_avg_7d', label: '7-day moving average', stroke: 'stroke-[#d97706]', fill: 'fill-[#d97706]', swatch: 'bg-[#d97706]' },
];

/** Runs of consecutive non-null points, so weekends leave gaps instead of fake slopes. */
function segments(points) {
  const runs = [];
  let run = [];
  points.forEach((p) => {
    if (p.y == null) {
      if (run.length) runs.push(run);
      run = [];
    } else run.push(p);
  });
  if (run.length) runs.push(run);
  return runs;
}

export default function TrendChart({ items }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!items?.length) return null;

  const innerW = width - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;
  const step = items.length > 1 ? innerW / (items.length - 1) : 0;
  const x = (i) => M.left + (items.length > 1 ? i * step : innerW / 2);
  const maxRate = Math.max(1, ...items.flatMap((d) => [d.attendance_rate ?? 0, d.moving_avg_7d ?? 0]));
  const y = (v) => M.top + innerH - (v / maxRate) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * maxRate);
  const labelEvery = Math.ceil(items.length / Math.max(2, Math.floor(innerW / 64)));

  const onMove = (e) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    setHover(Math.min(items.length - 1, Math.max(0, Math.round((px - M.left) / (step || 1)))));
  };
  const h = hover != null ? items[hover] : null;

  return (
    <div ref={wrapRef}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className={`h-[3px] w-3 rounded-full ${s.swatch}`} />
            {s.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-3 rounded-sm bg-gray-100 dark:bg-gray-800" />
          Weekend (no rate)
        </span>
      </div>
      <div className="relative">
        <svg
          width={width}
          height={HEIGHT}
          className="block overflow-visible"
          role="img"
          aria-label="Daily attendance rate and 7-day moving average; the table below has every value"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {items.map((d, i) =>
            d.is_working_day ? null : (
              <rect key={`w${d.date}`} x={x(i) - step / 2} y={M.top} width={Math.max(step, 2)} height={innerH} className="fill-gray-100 dark:fill-gray-800/60" />
            ),
          )}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className="stroke-gray-200 dark:stroke-gray-800" strokeWidth="1" />
              <text x={M.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-gray-400 text-[11px]">
                {Math.round(t * 100)}%
              </text>
            </g>
          ))}
          {items.map((d, i) =>
            i % labelEvery === 0 ? (
              <text key={d.date} x={x(i)} y={HEIGHT - 8} textAnchor="middle" className="fill-gray-400 text-[11px]">
                {d.date.slice(5)}
              </text>
            ) : null,
          )}
          {SERIES.map((s) =>
            segments(items.map((d, i) => ({ x: x(i), y: d[s.key] }))).map((run, k) => (
              <polyline
                key={`${s.key}-${k}`}
                points={run.map((p) => `${p.x},${y(p.y)}`).join(' ')}
                fill="none"
                className={s.stroke}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )),
          )}
          {items.map((d, i) =>
            d.attendance_rate == null ? null : <circle key={d.date} cx={x(i)} cy={y(d.attendance_rate)} r={3.5} className={`${SERIES[0].fill} stroke-white dark:stroke-gray-900`} strokeWidth={1.5} />,
          )}
          {h && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + innerH} className="stroke-gray-400" strokeDasharray="3 3" />
              {SERIES.map((s) =>
                h[s.key] == null ? null : <circle key={s.key} cx={x(hover)} cy={y(h[s.key])} r={5} className={`${s.fill} stroke-white dark:stroke-gray-900`} strokeWidth={2} />,
              )}
            </g>
          )}
        </svg>
        {h && (
          <div
            className="pointer-events-none absolute z-10 min-w-[210px] rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs shadow-lg dark:border-gray-700 dark:bg-gray-900"
            style={{ left: Math.min(x(hover) + 12, width - 220), top: M.top }}
          >
            <div className="mb-1.5 font-semibold text-gray-900">
              {formatDate(h.date)}
              {!h.is_working_day && <span className="ml-1.5 font-normal text-gray-400">weekend</span>}
            </div>
            {SERIES.map((s) => (
              <div key={s.key} className="flex items-center gap-2 py-0.5">
                <span className={`h-[3px] w-3 rounded-full ${s.swatch}`} />
                <span className="text-gray-600">{s.label}</span>
                <b className="ml-auto tabular-nums text-gray-900">{formatPct(h[s.key])}</b>
              </div>
            ))}
            <div className="mt-1.5 border-t border-gray-100 pt-1.5 text-gray-500 dark:border-gray-800">
              Present {h.present_count} of {h.headcount} · late {h.late_count}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
