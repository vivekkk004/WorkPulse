import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  clearCreateState,
  createEmployee,
  fetchEmployees,
  setEmployeeFilters,
  setEmployeePage,
  setEmployeePageSize,
} from '../features/employees/employeesSlice';
import { Card, PageHeader, ToneBadge } from '../components/ui';
import { DataTable, Field, FormError, FormSuccess, Modal, ModalActions, Pagination, PrimaryButton, SearchInput } from '../components/form';
import { Icon } from '../components/dashboard-ui';
import { formatIst, initials, todayIst } from '../utils/time';
import { EMPLOYEE_RULES, validateEmployee } from '../features/employees/employeeRules';

const EMPTY_FORM = { emp_code: '', name: '', email: '', department: '', shift_start: '09:30', shift_end: '18:30', joined_on: todayIst() };

function AddEmployeeModal({ onClose }) {
  const dispatch = useDispatch();
  const { createStatus, createError, createFieldErrors } = useSelector((s) => s.employees);
  const [form, setForm] = useState(EMPTY_FORM);
  const [touched, setTouched] = useState({}); // a field shows its error once visited, or after a submit attempt
  const [serverErrors, setServerErrors] = useState({});

  // Server-side errors (409 duplicate code, 422 rules) land under the field they belong to.
  useEffect(() => setServerErrors(createFieldErrors), [createFieldErrors]);

  const clientErrors = validateEmployee(form);
  const errorFor = (key) => (touched[key] && clientErrors[key]) || serverErrors[key];
  const overnight = !clientErrors.shift_start && !clientErrors.shift_end && form.shift_end < form.shift_start;

  const set = (key, transform = (v) => v) => (v) => {
    setForm((f) => ({ ...f, [key]: transform(v) }));
    setServerErrors(({ [key]: _gone, ...rest }) => rest); // editing a field clears its server error
  };
  const field = (key) => ({ value: form[key], onChange: set(key), onBlur: () => setTouched((t) => ({ ...t, [key]: true })), error: errorFor(key) });

  const submit = async (e) => {
    e.preventDefault();
    setTouched(Object.fromEntries(Object.keys(EMPTY_FORM).map((k) => [k, true])));
    if (Object.keys(clientErrors).length) return;
    const result = await dispatch(createEmployee({ ...form, name: form.name.trim(), department: form.department.trim() }));
    if (createEmployee.fulfilled.match(result)) onClose(true);
  };

  // A banner only for errors no field shows (network failure, an unexpected server message).
  const fieldKeys = new Set(Object.keys(EMPTY_FORM));
  const shownOnFields = Object.keys(serverErrors).some((k) => fieldKeys.has(k));
  const banner = serverErrors._form || (createError && !shownOnFields ? createError : '');

  return (
    <Modal title="Add Employee" onClose={() => onClose(false)} wide>
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-blue-700">Scope &amp; rules</div>
          <ul className="space-y-1 text-xs text-blue-700">
            {EMPLOYEE_RULES.map((r) => (
              <li key={r} className="flex gap-2">
                <span aria-hidden="true">▸</span>
                {r}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="Employee code"
            required
            placeholder="EMP0001"
            maxLength={9}
            hint="EMP + 4–6 digits · unique · cannot be changed later"
            {...field('emp_code')}
            onChange={set('emp_code', (v) => v.toUpperCase().replace(/\s/g, ''))}
          />
          <Field label="Full name" required maxLength={100} placeholder="Asha Rao" hint="Up to 100 characters" {...field('name')} />
          <Field label="Email" type="email" required maxLength={120} placeholder="asha@example.com" {...field('email')} />
          <Field label="Department" required maxLength={50} placeholder="Engineering" hint="Exact match, case-sensitive — reports group by this name" {...field('department')} />
          <Field label="Shift start (IST)" type="time" required hint="24-hour, default 09:30" {...field('shift_start')} />
          <Field
            label="Shift end (IST)"
            type="time"
            required
            hint={overnight ? 'Overnight shift — ends the next day' : '24-hour, default 18:30'}
            {...field('shift_end')}
          />
          <Field label="Joined on" type="date" required hint="First day of employment" {...field('joined_on')} />
        </div>
        <FormError message={banner} />
        <ModalActions onCancel={() => onClose(false)} saving={createStatus === 'loading'} saveLabel="Create employee" />
      </form>
    </Modal>
  );
}

export default function EmployeesPage() {
  const dispatch = useDispatch();
  const { items, total, page, pageSize, filters, status, error, lastCreated } = useSelector((s) => s.employees);
  const [showAdd, setShowAdd] = useState(false);
  const [department, setDepartment] = useState(filters.department);

  useEffect(() => {
    dispatch(fetchEmployees({ ...filters, page, page_size: pageSize }));
  }, [dispatch, filters, page, pageSize]);

  const applyFilter = () => dispatch(setEmployeeFilters({ department: department.trim() }));

  const columns = [
    {
      key: 'name',
      header: 'Employee',
      render: (e) => (
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-semibold text-brand">
            {initials(e.name)}
          </span>
          <div className="min-w-0">
            <div className="font-medium text-gray-900">{e.name}</div>
            <div className="text-xs text-gray-500">{e.email}</div>
          </div>
        </div>
      ),
    },
    { key: 'emp_code', header: 'Code', render: (e) => <span className="font-mono text-[13px] text-brand">{e.emp_code}</span> },
    { key: 'department', header: 'Department' },
    {
      key: 'shift',
      header: 'Shift (IST)',
      render: (e) => (
        <span className="inline-flex items-center gap-2">
          <span className="tabular-nums">
            {e.shift_start} – {e.shift_end}
          </span>
          {e.shift_end <= e.shift_start && <ToneBadge label="Overnight" tone="progress" />}
        </span>
      ),
    },
    { key: 'joined_on', header: 'Joined' },
    { key: 'created_at', header: 'Created', render: (e) => <span className="text-gray-500">{formatIst(e.created_at)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle="Employee master: codes, departments and shifts used by the attendance rules."
        action={
          <PrimaryButton icon={Icon.userPlus} onClick={() => setShowAdd(true)}>
            Add Employee
          </PrimaryButton>
        }
      />

      {lastCreated && (
        <div className="mb-3">
          <FormSuccess message={`Created ${lastCreated.emp_code} — ${lastCreated.name}`} onClose={() => dispatch(clearCreateState())} />
        </div>
      )}
      {error && (
        <div className="mb-3">
          <FormError message={error} />
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-3 py-2.5 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <SearchInput value={department} onChange={setDepartment} onEnter={applyFilter} placeholder="Filter by department (exact)…" />
            <button type="button" onClick={applyFilter} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
              Apply
            </button>
            {filters.department && (
              <button
                type="button"
                onClick={() => {
                  setDepartment('');
                  dispatch(setEmployeeFilters({ department: '' }));
                }}
                className="text-sm text-brand hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
            {total.toLocaleString('en-IN')} employee{total === 1 ? '' : 's'}
          </span>
        </div>
        <DataTable columns={columns} rows={items} rowKey={(e) => e.emp_code} loading={status === 'loading'} empty="No employees match this filter." />
        {total > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={(p) => dispatch(setEmployeePage(p))}
            onPageSizeChange={(n) => dispatch(setEmployeePageSize(n))}
          />
        )}
      </Card>

      {showAdd && (
        <AddEmployeeModal
          onClose={(created) => {
            setShowAdd(false);
            if (created) dispatch(fetchEmployees({ ...filters, page, page_size: pageSize }));
            else dispatch(clearCreateState());
          }}
        />
      )}
    </div>
  );
}
