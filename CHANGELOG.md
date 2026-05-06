# Changelog

All notable changes to Payroll System are documented here.

### 2026-05-10T11:45:00+05:30
- Supabase client setup; generated type-safe query helpers from schema

### 2026-05-14T14:20:00+05:30
- CSS custom properties for brand colours, spacing and typography scale

### 2026-05-20T10:05:00+05:30
- Email/password auth with session persistence and protected route wrapper

### 2026-06-03T09:30:00+05:30
- Employee CRUD: list with search/sort, detail panel, create/edit modal

### 2026-06-10T13:00:00+05:30
- Attendance marking with late flag (>9:00 AM); monthly summary grid

### 2026-06-17T16:45:00+05:30
- Leave request → manager approval flow; balance updated on approval

### 2026-06-24T11:20:00+05:30
- EPF 8%/12%, ETF 3%, overtime at 1.5×; deductions applied before net

### 2026-07-02T10:10:00+05:30
- jsPDF payslip template; bulk export zips all PDFs for the month

### 2026-07-08T14:30:00+05:30
- Monthly payroll Excel export with per-department sheet breakdown

### 2026-07-15T09:55:00+05:30
- Bar chart for monthly payroll cost; pie chart for department headcount

### 2026-07-22T11:40:00+05:30
- RLS policies per table; UI hides/shows features based on role claim

### 2026-07-28T16:00:00+05:30
- next-themes provider; toggle in navbar; system preference as default

### 2026-08-04T10:00:00+05:30
- Tests for EPF/ETF calc, overtime; E2E smoke test for login flow

### 2026-08-10T09:15:00+05:30
- README with stack table, env vars, project tree and dev setup steps

### 2026-08-13T17:30:00+05:30
- Removed redundant dev tooling from vite.config; renamed package
