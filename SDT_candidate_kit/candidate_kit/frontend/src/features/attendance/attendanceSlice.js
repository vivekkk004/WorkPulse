import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import attendanceService from '../../services/attendanceService';
import { toErrorMessage } from '../../services/apiClient';

export const fetchAttendance = createAsyncThunk('attendance/fetch', async (params, { rejectWithValue }) => {
  try {
    return await attendanceService.getAttendance(params);
  } catch (err) {
    return rejectWithValue(toErrorMessage(err));
  }
});

export const punchIn = createAsyncThunk('attendance/punchIn', async (body, { rejectWithValue }) => {
  try {
    return await attendanceService.punchIn(body);
  } catch (err) {
    return rejectWithValue(toErrorMessage(err));
  }
});

export const punchOut = createAsyncThunk('attendance/punchOut', async (body, { rejectWithValue }) => {
  try {
    return await attendanceService.punchOut(body);
  } catch (err) {
    return rejectWithValue(toErrorMessage(err));
  }
});

export const regularizeAttendance = createAsyncThunk(
  'attendance/regularize',
  async ({ empCode, date, body }, { rejectWithValue }) => {
    try {
      return await attendanceService.regularize(empCode, date, body);
    } catch (err) {
      return rejectWithValue(toErrorMessage(err));
    }
  },
);

const sameRecord = (a, b) => a.emp_code === b.emp_code && a.date === b.date;

const initialState = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  filters: { emp_code: '', date_from: '', date_to: '', status: '' },
  status: 'idle',
  error: null,
  // Result of the last punch-in / punch-out / regularization, shown as a banner.
  action: { status: 'idle', error: null, message: null, record: null },
};

/** Replace the record in the current page if it is there (records are keyed by emp_code + date). */
function upsertVisible(state, record) {
  const i = state.items.findIndex((r) => sameRecord(r, record));
  if (i >= 0) state.items[i] = record;
}

const attendanceSlice = createSlice({
  name: 'attendance',
  initialState,
  reducers: {
    setAttendanceFilters(state, action) {
      state.filters = { ...state.filters, ...action.payload };
      state.page = 1;
    },
    setAttendancePage(state, action) {
      state.page = action.payload;
    },
    setAttendancePageSize(state, action) {
      state.pageSize = action.payload;
      state.page = 1;
    },
    clearAttendanceAction(state) {
      state.action = initialState.action;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAttendance.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchAttendance.fulfilled, (state, { payload }) => {
        state.status = 'succeeded';
        state.items = payload.items;
        state.total = payload.total;
        state.page = payload.page;
        state.pageSize = payload.page_size;
      })
      .addCase(fetchAttendance.rejected, (state, { payload, error }) => {
        state.status = 'failed';
        state.error = payload || error.message;
      });

    const messages = {
      [punchIn.typePrefix]: (r) => `Punched in ${r.emp_code} for ${r.date}`,
      [punchOut.typePrefix]: (r) => `Punched out ${r.emp_code} (${r.date}): ${r.work_hours} h`,
      [regularizeAttendance.typePrefix]: (r) => `Regularized ${r.emp_code} on ${r.date}`,
    };
    [punchIn, punchOut, regularizeAttendance].forEach((thunk) => {
      builder
        .addCase(thunk.pending, (state) => {
          state.action = { status: 'loading', error: null, message: null, record: null };
        })
        .addCase(thunk.fulfilled, (state, { payload }) => {
          state.action = { status: 'succeeded', error: null, message: messages[thunk.typePrefix](payload), record: payload };
          upsertVisible(state, payload);
        })
        .addCase(thunk.rejected, (state, { payload, error }) => {
          state.action = { status: 'failed', error: payload || error.message, message: null, record: null };
        });
    });
  },
});

export const { setAttendanceFilters, setAttendancePage, setAttendancePageSize, clearAttendanceAction } = attendanceSlice.actions;
export default attendanceSlice.reducer;
