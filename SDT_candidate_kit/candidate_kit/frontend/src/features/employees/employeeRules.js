// Client-side copy of the EmployeeCreate rules in openapi.yaml, so the form can explain a problem
// before the request is sent. The API remains the authority: it re-validates everything.

const EMP_CODE = /^EMP[0-9]{4,6}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

function isRealDate(value) {
  if (!DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Returns { field: message } for every rule the form breaks; empty object when valid. */
export function validateEmployee(form) {
  const e = {};
  if (!form.emp_code) e.emp_code = 'Employee code is required.';
  else if (!EMP_CODE.test(form.emp_code)) e.emp_code = 'Use EMP followed by 4–6 digits, e.g. EMP0001.';

  if (!form.name.trim()) e.name = 'Name is required.';
  else if (form.name.length > 100) e.name = 'At most 100 characters.';

  if (!form.email) e.email = 'Email is required.';
  else if (form.email.length > 120) e.email = 'At most 120 characters.';
  else if (!EMAIL.test(form.email)) e.email = 'Enter a valid email address, e.g. asha@example.com.';

  if (!form.department.trim()) e.department = 'Department is required.';
  else if (form.department.length > 50) e.department = 'At most 50 characters.';

  if (!HHMM.test(form.shift_start)) e.shift_start = 'Use 24-hour HH:MM, e.g. 09:30.';
  if (!HHMM.test(form.shift_end)) e.shift_end = 'Use 24-hour HH:MM, e.g. 18:30.';
  else if (form.shift_start === form.shift_end) e.shift_end = 'Shift end must differ from shift start.';

  if (!form.joined_on) e.joined_on = 'Joining date is required.';
  else if (!isRealDate(form.joined_on)) e.joined_on = 'Enter a valid date.';

  return e;
}

/** The scope of the form, shown to the user. */
export const EMPLOYEE_RULES = [
  'Employee code is your HR code: EMP + 4–6 digits. It must be unique and cannot be changed later.',
  'Shift times are IST, 24-hour. An end at or before the start is an overnight shift (ends next day).',
  'Late is counted after a 10-minute grace from shift start; overtime from 30 minutes after shift end.',
  'Joining date sets when the employee starts counting toward headcount and working days.',
];
