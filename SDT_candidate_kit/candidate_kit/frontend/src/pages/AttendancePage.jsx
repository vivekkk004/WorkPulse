import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  clearAttendanceAction,
  fetchAttendance,
  punchIn,
  punchOut,
  regularizeAttendance,
  setAttendanceFilters,
  setAttendancePage,
  setAttendancePageSize,
} from '../features/attendance/attendanceSlice';
import { Card, PageHeader, PRESENCE_STATUSES, STATUSES, StatusBadge, ToneBadge } from '../components/ui';
import { DataTable, Field, FormError, FormSuccess, Label, Modal, ModalActions, Pagination, PrimaryButton, SecondaryButton, Select } from '../components/form';
import { Glyph, Icon } from '../components/dashboard-ui';
import { formatDate, formatIst, formatIstTime, istInputToMs, msToIstInput } from '../utils/time';

const statusOptions = (list) => list.map((s) => ({ value: s, label: s.replace('_', ' ') }));

function PunchModal({ mode, onClose }) {
  const dispatch = useDispatch();
  const action = useSelector((s) => s.attendance.action);
  const [empCode, setEmpCode] = useState('');
  const [when, setWhen] = useState('');
  const [status, setStatus] = useState('PRESENT');
  const isIn = mode === 'in';

  const submit = async (e) => {
    e.preventDefault();
    const punchedAt = istInputToMs(when);
    const body = { emp_code: empCode.trim(), ...(punchedAt ? { punched_at: punchedAt } : {}) };
    const thunk = isIn ? punchIn({ ...body, status }) : punchOut(body);
    const result = await dispatch(thunk);
    if (!result.error) onClose();
  };

  return (
    <Modal title={isIn ? 'Punch In' : 'Punch Out'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Employee code" value={empCode} onChange={setEmpCode} required placeholder="EMP0001" autoFocus />
        <Field label="Time (IST)" type="datetime-local" step="1" value={when} onChange={setWhen} hint="Leave empty to use the server's current time." />
        {isIn && <Select label="Status" value={status} onChange={setStatus} options={statusOptions(PRESENCE_STATUSES)} />}
        <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
          {isIn
            ? 'Late if more than 10:00 after shift start. For overnight shifts, an early-morning punch belongs to the previous day.'
            : 'Closes the latest open record. Overtime counts from 30 minutes after shift end; under 4.50 hours is a half day.'}
        </div>
        <FormError message={action.status === 'failed' ? action.error : ''} />
        <ModalActions onCancel={onClose} saving={action.status === 'loading'} saveLabel={isIn ? 'Punch in' : 'Punch out'} />
      </form>
    </Modal>
  );
}

function RegularizeModal({ record, onClose }) {
  const dispatch = useDispatch();
  const action = useSelector((s) => s.attendance.action);
  const [status, setStatus] = useState(record.status);
  const [inAt, setInAt] = useState(msToIstInput(record.punch_in));
  const [outAt, setOutAt] = useState(msToIstInput(record.punch_out));
  const [reason, setReason] = useState('');
  const [by, setBy] = useState('');
  const clears = status === 'ABSENT' || status === 'LEAVE';

  const submit = async (e) => {
    e.preventDefault();
    // Only changed fields are sent; omitted fields stay as they are.
    const body = { reason, regularized_by: by };
    if (status !== record.status) body.status = status;
    if (!clears) {
      const inMs = istInputToMs(inAt);
      const outMs = istInputToMs(outAt);
      if (inMs && inMs !== record.punch_in) body.punch_in = inMs;
      if (outMs && outMs !== record.punch_out) body.punch_out = outMs;
    }
    const result = await dispatch(regularizeAttendance({ empCode: record.emp_code, date: record.date, body }));
    if (!result.error) onClose();
  };

  return (
    <Modal title={`Regularize · ${record.emp_code} · ${formatDate(record.date)}`} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select label="Status" value={status} onChange={setStatus} options={statusOptions(STATUSES)} />
          <Field label="Punch in (IST)" type="datetime-local" step="1" value={clears ? '' : inAt} onChange={setInAt} disabled={clears} hint={clears ? 'Cleared for ABSENT / LEAVE' : undefined} />
          <Field label="Punch out (IST)" type="datetime-local" step="1" value={clears ? '' : outAt} onChange={setOutAt} disabled={clears} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Field label="Reason" value={reason} onChange={setReason} required minLength={5} maxLength={200} placeholder="e.g. biometric glitch" hint="5–200 characters" />
          </div>
          <Field label="Regularized by" value={by} onChange={setBy} required maxLength={50} placeholder="hr.admin" />
        </div>
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Late, work hours, overtime and half day are recomputed, and one audit entry is appended to the history.
        </div>
        <FormError message={action.status === 'failed' ? action.error : ''} />
        <ModalActions onCancel={onClose} saving={action.status === 'loading'} saveLabel="Save correction" />
      </form>
    </Modal>
  );
}

const changeValue = (field, v) => (v == null ? '—' : field === 'punch_in' || field === 'punch_out' ? formatIst(v) : String(v));

function HistoryModal({ record, onClose }) {
  return (
    <Modal title={`Audit trail · ${record.emp_code} · ${formatDate(record.date)}`} onClose={onClose} wide>
      {record.history.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">No manual corrections on this record.</div>
      ) : (
        <ol className="relative space-y-5 border-l border-gray-200 pl-5 dark:border-gray-800">
          {[...record.history].reverse().map((h) => (
            <li key={h.at} className="relative">
              <span className="absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand dark:border-gray-900" />
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-semibold text-gray-900">{h.by}</span>
                <span className="text-xs text-gray-400">{formatIst(h.at)} IST</span>
              </div>
              <p className="mt-0.5 text-sm text-gray-600">{h.reason}</p>
              <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
                <table className="w-full text-xs">
                  <tbody>
                    {Object.entries(h.changes).map(([field, c]) => (
                      <tr key={field} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                        <td className="w-36 bg-gray-50/80 px-3 py-1.5 font-medium text-gray-500">{field.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-1.5 text-gray-500 line-through decoration-gray-300">{changeValue(field, c.from)}</td>
                        <td className="px-3 py-1.5 font-medium text-gray-900">{changeValue(field, c.to)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

const inputCls = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand dark:bg-gray-900';

export default function AttendancePage() {
  const dispatch = useDispatch();
  const { items, total, page, pageSize, filters, status, error, action } = useSelector((s) => s.attendance);
  const [draft, setDraft] = useState(filters);
  const [modal, setModal] = useState(null); // { type: 'in' | 'out' | 'edit' | 'history', record? }

  const reload = () => dispatch(fetchAttendance({ ...filters, page, page_size: pageSize }));
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, filters, page, pageSize]);
  useEffect(() => {
    if (action.status === 'succeeded') reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action.status]);

  const openModal = (m) => {
    dispatch(clearAttendanceAction());
    setModal(m);
  };
  const apply = (e) => {
    e.preventDefault();
    dispatch(setAttendanceFilters({ ...draft, emp_code: draft.emp_code.trim() }));
  };
  const reset = () => {
    const empty = { emp_code: '', date_from: '', date_to: '', status: '' };
    setDraft(empty);
    dispatch(setAttendanceFilters(empty));
  };

  const columns = [
    { key: 'date', header: 'Date', render: (r) => <span className="whitespace-nowrap font-medium text-gray-900">{formatDate(r.date)}</span> },
    { key: 'emp_code', header: 'Employee', render: (r) => <span className="font-mono text-[13px] text-brand">{r.emp_code}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <StatusBadge status={r.status} />
          {r.half_day && <ToneBadge label="Half day" tone="warn" />}
        </span>
      ),
    },
    { key: 'punch_in', header: 'In (IST)', render: (r) => <span className="tabular-nums">{formatIstTime(r.punch_in)}</span> },
    {
      key: 'punch_out',
      header: 'Out (IST)',
      render: (r) =>
        r.punch_in && !r.punch_out ? <ToneBadge label="Open" tone="info" /> : <span className="tabular-nums">{formatIstTime(r.punch_out)}</span>,
    },
    { key: 'work_hours', header: 'Hours', className: 'text-right', render: (r) => <span className="tabular-nums">{r.work_hours ?? '—'}</span> },
    {
      key: 'late_minutes',
      header: 'Late',
      className: 'text-right',
      render: (r) => (r.late_minutes > 0 ? <span className="font-semibold tabular-nums text-amber-700">{r.late_minutes}m</span> : <span className="text-gray-300">—</span>),
    },
    {
      key: 'overtime_minutes',
      header: 'OT',
      className: 'text-right',
      render: (r) => (r.overtime_minutes > 0 ? <span className="font-semibold tabular-nums text-teal-700">{r.overtime_minutes}m</span> : <span className="text-gray-300">—</span>),
    },
    {
      key: '_actions',
      header: '',
      className: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={() => openModal({ type: 'history', record: r })}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            title="Audit trail"
          >
            <Glyph d={Icon.history} className="h-3.5 w-3.5" />
            {r.history.length}
          </button>
          <button
            type="button"
            onClick={() => openModal({ type: 'edit', record: r })}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand hover:bg-brand/5"
          >
            <Glyph d={Icon.edit} className="h-3.5 w-3.5" />
            Regularize
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Attendance"
        subtitle="Punch in and out, review daily records, and regularize them with a full audit trail."
        action={
          <>
            <SecondaryButton icon={Icon.logout} onClick={() => openModal({ type: 'out' })}>
              Punch Out
            </SecondaryButton>
            <PrimaryButton icon={Icon.login} onClick={() => openModal({ type: 'in' })}>
              Punch In
            </PrimaryButton>
          </>
        }
      />

      {action.message && !modal && (
        <div className="mb-3">
          <FormSuccess message={action.message} onClose={() => dispatch(clearAttendanceAction())} />
        </div>
      )}
      {error && (
        <div className="mb-3">
          <FormError message={error} />
        </div>
      )}

      <Card className="mb-4 p-3">
        <form onSubmit={apply} className="flex flex-wrap items-end gap-2">
          <div>
            <Label>Employee code</Label>
            <input className={`${inputCls} w-40`} value={draft.emp_code} placeholder="EMP0001" onChange={(e) => setDraft({ ...draft, emp_code: e.target.value })} />
          </div>
          <div>
            <Label>From</Label>
            <input type="date" className={inputCls} value={draft.date_from} onChange={(e) => setDraft({ ...draft, date_from: e.target.value })} />
          </div>
          <div>
            <Label>To</Label>
            <input type="date" className={inputCls} value={draft.date_to} onChange={(e) => setDraft({ ...draft, date_to: e.target.value })} />
          </div>
          <div>
            <Label>Status</Label>
            <select className={`${inputCls} w-36`} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
              <option value="">All statuses</option>
              {statusOptions(STATUSES).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <PrimaryButton type="submit">Apply</PrimaryButton>
          <button type="button" onClick={reset} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
            Reset
          </button>
        </form>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5 dark:border-gray-800">
          <span className="text-sm font-semibold text-gray-900">Daily records</span>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
            {total.toLocaleString('en-IN')} record{total === 1 ? '' : 's'}
          </span>
        </div>
        <DataTable columns={columns} rows={items} rowKey={(r) => `${r.emp_code}|${r.date}`} loading={status === 'loading'} empty="No attendance records match these filters." />
        {total > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={(p) => dispatch(setAttendancePage(p))}
            onPageSizeChange={(n) => dispatch(setAttendancePageSize(n))}
          />
        )}
      </Card>

      {(modal?.type === 'in' || modal?.type === 'out') && <PunchModal mode={modal.type} onClose={() => setModal(null)} />}
      {modal?.type === 'edit' && <RegularizeModal record={modal.record} onClose={() => setModal(null)} />}
      {modal?.type === 'history' && <HistoryModal record={modal.record} onClose={() => setModal(null)} />}
    </div>
  );
}
