import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import analyticsService from '../../services/analyticsService';
import attendanceService from '../../services/attendanceService';
import { toErrorMessage } from '../../services/apiClient';

export const fetchEmployeeMonthly = createAsyncThunk(
  'analytics/employeeMonthly',
  async ({ empCode, month }, { rejectWithValue }) => {
    try {
      return await analyticsService.getEmployeeMonthly(empCode, month);
    } catch (err) {
      return rejectWithValue(toErrorMessage(err));
    }
  },
);

export const fetchDepartmentSummary = createAsyncThunk(
  'analytics/departmentSummary',
  async (params, { rejectWithValue }) => {
    try {
      return await analyticsService.getDepartmentSummary(params);
    } catch (err) {
      return rejectWithValue(toErrorMessage(err));
    }
  },
);

export const fetchLateLeaderboard = createAsyncThunk(
  'analytics/lateLeaderboard',
  async (params, { rejectWithValue }) => {
    try {
      return await analyticsService.getLateLeaderboard(params);
    } catch (err) {
      return rejectWithValue(toErrorMessage(err));
    }
  },
);

export const fetchDepartmentTrend = createAsyncThunk(
  'analytics/departmentTrend',
  async ({ department, from, to }, { rejectWithValue }) => {
    try {
      return await analyticsService.getDepartmentTrend(department, from, to);
    } catch (err) {
      return rejectWithValue(toErrorMessage(err));
    }
  },
);

/** The month of the most recent attendance record, so the dashboard opens on a month that has data. */
export const fetchLatestMonth = createAsyncThunk('analytics/latestMonth', async (_, { rejectWithValue }) => {
  try {
    const page = await attendanceService.getAttendance({ page: 1, page_size: 1 });
    return page.items[0]?.date.slice(0, 7) ?? null;
  } catch (err) {
    return rejectWithValue(toErrorMessage(err));
  }
});

const section = () => ({ data: null, status: 'idle', error: null });

const initialState = {
  monthly: section(),
  summary: section(),
  leaderboard: section(),
  trend: section(),
  latestMonth: section(),
};

const analyticsSlice = createSlice({
  name: 'analytics',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    // Every analytics request has the same lifecycle; only the state key differs.
    [
      [fetchEmployeeMonthly, 'monthly'],
      [fetchDepartmentSummary, 'summary'],
      [fetchLateLeaderboard, 'leaderboard'],
      [fetchDepartmentTrend, 'trend'],
      [fetchLatestMonth, 'latestMonth'],
    ].forEach(([thunk, key]) => {
      builder
        .addCase(thunk.pending, (state) => {
          state[key].status = 'loading';
          state[key].error = null;
        })
        .addCase(thunk.fulfilled, (state, { payload }) => {
          state[key] = { data: payload, status: 'succeeded', error: null };
        })
        .addCase(thunk.rejected, (state, { payload, error }) => {
          state[key] = { data: null, status: 'failed', error: payload || error.message };
        });
    });
  },
});

export default analyticsSlice.reducer;
