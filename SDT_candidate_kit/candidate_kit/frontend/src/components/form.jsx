// Form and table primitives, ported from MyBridge 3.0 (src/components/form.tsx).
import { useEffect } from 'react';
import { Glyph, Icon } from './dashboard-ui';
import { Loader } from './ui';

export function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[2px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

const inputClass = (error, disabled) =>
  `w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 ${
    error ? 'border-red-400 focus:border-red-400 focus:ring-red-400' : 'border-gray-300 focus:border-brand focus:ring-brand'
  } ${disabled ? 'cursor-not-allowed bg-gray-100 text-gray-500' : ''}`;

export function Label({ children, required }) {
  return (
    <label className="mb-1 block text-sm font-medium text-gray-700">
      {children}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
  );
}

export function Field({ label, value, onChange, type = 'text', required = false, placeholder = '', disabled = false, hint, error, ...rest }) {
  return (
    <div>
      {label && <Label required={required}>{label}</Label>}
      <input
        type={type}
        required={required}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass(error, disabled)}
        {...rest}
      />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

export function Select({ label, value, onChange, options, required = false, placeholder, hint, className = '' }) {
  return (
    <div className={className}>
      {label && <Label required={required}>{label}</Label>}
      <select value={value} required={required} onChange={(e) => onChange(e.target.value)} className={inputClass(false, false)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

export function FormError({ message }) {
  if (!message) return null;
  return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</div>;
}

export function FormSuccess({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
      <span>{message}</span>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Dismiss" className="text-green-700/70 hover:text-green-700">
          ✕
        </button>
      )}
    </div>
  );
}

export function ModalActions({ onCancel, saving, saveLabel = 'Save', disabled = false }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
        Cancel
      </button>
      <button type="submit" disabled={saving || disabled} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60">
        {saving ? 'Saving…' : saveLabel}
      </button>
    </div>
  );
}

export function PrimaryButton({ onClick, children, disabled = false, type = 'button', icon }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
    >
      {icon && <Glyph d={icon} />}
      {children}
    </button>
  );
}

export function SecondaryButton({ onClick, children, disabled = false, type = 'button', icon }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-brand/40 hover:bg-brand/5 hover:text-brand disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-300"
    >
      {icon && <Glyph d={icon} />}
      {children}
    </button>
  );
}

/** Underline tabs (MyBridge dashboard style). */
export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="no-scrollbar mb-5 flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-800">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            value === t.key ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', onEnter }) {
  return (
    <div className="relative w-64 max-w-full">
      <Glyph d={Icon.search} className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-9 pr-3 text-sm transition-shadow focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 dark:bg-gray-900"
      />
    </div>
  );
}

/**
 * Circular pagination with rows-per-page, as in MyBridge. 1-based `page` here,
 * because the API's `page` starts at 1.
 */
export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizeOptions = [10, 20, 50, 100] }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const keep = [];
  for (let i = 1; i <= pageCount; i++) if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) keep.push(i);
  const items = [];
  let prev;
  for (const p of keep) {
    if (prev !== undefined) {
      if (p - prev === 2) items.push(prev + 1);
      else if (p - prev > 2) items.push('…');
    }
    items.push(p);
    prev = p;
  }

  const circle = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm transition-colors';
  const ghost = `${circle} border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300`;

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-100 px-3 py-3 sm:flex-row dark:border-gray-800">
      <div className="flex items-center gap-3 text-sm text-gray-500">
        <label className="flex items-center gap-2">
          <span>Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm focus:border-brand focus:outline-none dark:bg-gray-900"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span className="hidden sm:inline">
          Showing {from}–{to} of {total.toLocaleString('en-IN')} entries
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" className={ghost} onClick={() => onPageChange(1)} disabled={page <= 1} aria-label="First page">
          «
        </button>
        <button type="button" className={ghost} onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
          ‹
        </button>
        {items.map((it, idx) =>
          it === '…' ? (
            <span key={`gap-${idx}`} className={`${circle} text-gray-400`}>
              …
            </span>
          ) : (
            <button
              key={it}
              type="button"
              onClick={() => onPageChange(it)}
              aria-current={it === page ? 'page' : undefined}
              className={it === page ? `${circle} bg-brand text-white` : ghost}
            >
              {it}
            </button>
          ),
        )}
        <button type="button" className={ghost} onClick={() => onPageChange(page + 1)} disabled={page >= pageCount} aria-label="Next page">
          ›
        </button>
        <button type="button" className={ghost} onClick={() => onPageChange(pageCount)} disabled={page >= pageCount} aria-label="Last page">
          »
        </button>
      </div>
    </div>
  );
}

/**
 * Presentational table in MyBridge's DataTable style. Rows are already the current page.
 * columns: [{ key, header, render?(row), className? }]
 */
export function DataTable({ columns, rows, rowKey, loading, empty = 'No records yet.', renderExpanded }) {
  if (loading && rows.length === 0) return <Loader />;
  return (
    <div className={`table-responsive ${loading ? 'opacity-60' : ''}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50/80 text-left text-gray-500 dark:border-gray-800">
            {columns.map((c) => (
              <th key={c.key} className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider ${c.className ?? ''}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center text-sm text-gray-400">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const expanded = renderExpanded?.(row);
              return [
                <tr key={rowKey(row)} className="border-b border-gray-100 transition-colors last:border-0 hover:bg-brand/[0.04] dark:border-gray-800">
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-3.5 align-middle text-gray-700 ${c.className ?? ''}`}>
                      {c.render ? c.render(row) : (row[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>,
                expanded && (
                  <tr key={`${rowKey(row)}-x`} className="border-b border-gray-100 bg-gray-50/80 dark:border-gray-800">
                    <td colSpan={columns.length} className="px-4 py-4">
                      {expanded}
                    </td>
                  </tr>
                ),
              ];
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
