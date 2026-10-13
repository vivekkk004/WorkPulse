import apiClient, { cleanParams } from './apiClient';

// Service layer: only the HTTP calls. State and thunks live in features/analytics/analyticsSlice.js.
const analyticsService = {
  /** GET /analytics/employees/{emp_code}/monthly?month=YYYY-MM */
  getEmployeeMonthly: (empCode, month) =>
    apiClient
      .get(`/analytics/employees/${encodeURIComponent(empCode)}/monthly`, { params: { month } })
      .then((r) => r.data),

  /** GET /analytics/departments/summary?month=&department= */
  getDepartmentSummary: (params) =>
    apiClient.get('/analytics/departments/summary', { params: cleanParams(params) }).then((r) => r.data),

  /** GET /analytics/leaderboard/late?month=&limit=&department= */
  getLateLeaderboard: (params) =>
    apiClient.get('/analytics/leaderboard/late', { params: cleanParams(params) }).then((r) => r.data),

  /** GET /analytics/departments/{department}/trend?from=&to= */
  getDepartmentTrend: (department, from, to) =>
    apiClient
      .get(`/analytics/departments/${encodeURIComponent(department)}/trend`, { params: { from, to } })
      .then((r) => r.data),
};

export default analyticsService;
