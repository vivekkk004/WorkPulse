import { configureStore } from '@reduxjs/toolkit';
import employeesReducer from '../features/employees/employeesSlice';
import attendanceReducer from '../features/attendance/attendanceSlice';
import analyticsReducer from '../features/analytics/analyticsSlice';

export const store = configureStore({
  reducer: {
    employees: employeesReducer,
    attendance: attendanceReducer,
    analytics: analyticsReducer,
  },
});
