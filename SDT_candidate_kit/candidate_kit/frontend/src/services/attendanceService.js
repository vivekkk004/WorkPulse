import apiClient, { cleanParams } from './apiClient';

// Service layer: only the HTTP calls. State and thunks live in features/attendance/attendanceSlice.js.
const attendanceService = {
  /** GET /attendance?emp_code=&date_from=&date_to=&status=&page=&page_size= */
  getAttendance: (params) => apiClient.get('/attendance', { params: cleanParams(params) }).then((r) => r.data),

  /** POST /attendance/punch-in  body: { emp_code, punched_at?, status? } */
  punchIn: (body) => apiClient.post('/attendance/punch-in', body).then((r) => r.data),

  /** POST /attendance/punch-out  body: { emp_code, punched_at? } */
  punchOut: (body) => apiClient.post('/attendance/punch-out', body).then((r) => r.data),

  /** PATCH /attendance/{emp_code}/{date}  body: { status?, punch_in?, punch_out?, reason, regularized_by } */
  regularize: (empCode, date, body) =>
    apiClient
      .patch(`/attendance/${encodeURIComponent(empCode)}/${encodeURIComponent(date)}`, body)
      .then((r) => r.data),
};

export default attendanceService;
