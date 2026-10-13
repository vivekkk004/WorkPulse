import apiClient, { cleanParams } from './apiClient';

// Service layer: only the HTTP calls. State and thunks live in features/employees/employeesSlice.js.
const employeeService = {
  /** GET /employees?department=&page=&page_size= */
  getEmployees: (params) => apiClient.get('/employees', { params: cleanParams(params) }).then((r) => r.data),

  /** POST /employees */
  createEmployee: (employee) => apiClient.post('/employees', employee).then((r) => r.data),
};

export default employeeService;
