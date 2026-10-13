import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

/**
 * FastAPI errors are {"detail": "message"} or, for 422, {"detail": [{loc, msg, ...}]}.
 * Turn either into one readable string so slices can store it as-is.
 */
export function toErrorMessage(error) {
  const detail = error?.response?.data?.detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const field = Array.isArray(d.loc) ? d.loc.filter((p) => p !== 'body' && p !== 'query').join('.') : '';
        return field ? `${field}: ${d.msg}` : d.msg;
      })
      .join('; ');
  }
  if (typeof detail === 'string') return detail;
  if (error?.response) return `Request failed with status ${error.response.status}`;
  return error?.message || 'Network error';
}

/**
 * Field-level errors from a FastAPI response, keyed by field name:
 * 422 -> each detail item's last `loc` segment; 409 on create -> the unique key (`emp_code`).
 * Errors that belong to no single field (e.g. the shift_start == shift_end model rule) go under `_form`.
 */
export function toFieldErrors(error, conflictField) {
  const status = error?.response?.status;
  const detail = error?.response?.data?.detail;
  if (status === 409 && conflictField) return { [conflictField]: typeof detail === 'string' ? detail : 'Already exists' };
  if (!Array.isArray(detail)) return {};
  const out = {};
  detail.forEach((d) => {
    const loc = Array.isArray(d.loc) ? d.loc.filter((p) => p !== 'body') : [];
    const key = loc.length ? String(loc[loc.length - 1]) : '_form';
    out[key] = (d.msg || '').replace(/^Value error, /, '');
  });
  return out;
}

/** Drops empty values so optional filters are not sent as `?status=`. */
export function cleanParams(params = {}) {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined));
}

export default apiClient;
