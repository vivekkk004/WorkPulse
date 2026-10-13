import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import employeeService from '../../services/employeeService';
import { toErrorMessage, toFieldErrors } from '../../services/apiClient';

export const fetchEmployees = createAsyncThunk('employees/fetch', async (params, { rejectWithValue }) => {
  try {
    return await employeeService.getEmployees(params);
  } catch (err) {
    return rejectWithValue(toErrorMessage(err));
  }
});

export const createEmployee = createAsyncThunk('employees/create', async (employee, { rejectWithValue }) => {
  try {
    return await employeeService.createEmployee(employee);
  } catch (err) {
    // Keep the per-field messages too, so the form can show each one under its input.
    return rejectWithValue({ message: toErrorMessage(err), fields: toFieldErrors(err, 'emp_code') });
  }
});

const initialState = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  filters: { department: '' },
  status: 'idle', // idle | loading | succeeded | failed
  error: null,
  createStatus: 'idle',
  createError: null,
  createFieldErrors: {},
  lastCreated: null,
};

const employeesSlice = createSlice({
  name: 'employees',
  initialState,
  reducers: {
    setEmployeeFilters(state, action) {
      state.filters = { ...state.filters, ...action.payload };
      state.page = 1;
    },
    setEmployeePage(state, action) {
      state.page = action.payload;
    },
    setEmployeePageSize(state, action) {
      state.pageSize = action.payload;
      state.page = 1;
    },
    clearCreateState(state) {
      state.createStatus = 'idle';
      state.createError = null;
      state.createFieldErrors = {};
      state.lastCreated = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchEmployees.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchEmployees.fulfilled, (state, { payload }) => {
        state.status = 'succeeded';
        state.items = payload.items;
        state.total = payload.total;
        state.page = payload.page;
        state.pageSize = payload.page_size;
      })
      .addCase(fetchEmployees.rejected, (state, { payload, error }) => {
        state.status = 'failed';
        state.error = payload || error.message;
      })
      .addCase(createEmployee.pending, (state) => {
        state.createStatus = 'loading';
        state.createError = null;
        state.createFieldErrors = {};
      })
      .addCase(createEmployee.fulfilled, (state, { payload }) => {
        state.createStatus = 'succeeded';
        state.lastCreated = payload;
      })
      .addCase(createEmployee.rejected, (state, { payload, error }) => {
        state.createStatus = 'failed';
        state.createError = payload?.message || error.message;
        state.createFieldErrors = payload?.fields || {};
      });
  },
});

export const { setEmployeeFilters, setEmployeePage, setEmployeePageSize, clearCreateState } = employeesSlice.actions;
export default employeesSlice.reducer;
