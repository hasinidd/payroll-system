# Payroll System

A comprehensive **Sri Lankan Payroll, Attendance, Leave & HR Management System** built with modern web technologies.

> - Worked on **payroll rules, salary calculations, and financial data validation** for a platform used by three enterprise clients.
> - Developed backend functionality for payroll processing using **AWS Lambda** and worked with **accuracy-sensitive financial data**.

---

## Features

- **Employee Management** — Full employee lifecycle management with profile, contract, and department support
- **Payroll Processing** — Automated salary calculation with EPF/ETF, overtime, and deductions compliant with Sri Lankan labour law
- **Attendance Tracking** — Daily attendance marking, late arrivals, and working hours summary
- **Leave Management** — Leave applications, approvals, balance tracking across Annual, Sick, Casual leave types
- **Reports & Analytics** — Monthly payroll summaries, department-wise reports, and exportable payslips (PDF/Excel)
- **Role-Based Access Control** — Admin, HR Manager, and Employee roles with row-level security
- **Dark / Light Mode** — Fully themed UI with system preference support

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript |
| UI Components | shadcn/ui + Radix UI |
| Styling | Tailwind CSS |
| Backend / Auth | Supabase (PostgreSQL, Auth, Storage, Edge Functions) |
| Forms | React Hook Form + Zod |
| Data Fetching | TanStack Query v5 |
| PDF Export | jsPDF + jsPDF-AutoTable |
| Excel Export | xlsx |
| Charts | Recharts |
| Testing | Vitest + Playwright |

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- A [Supabase](https://supabase.com) project

### Installation

```sh
# Clone the repository
git clone https://github.com/hasinidd/payroll-system.git
cd payroll-system

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Fill in your Supabase project URL and anon key in .env

# Start the development server
npm run dev
```

The app will be available at `http://localhost:8080`.

---

## Environment Variables

Create a `.env` file in the root with the following:

```env
VITE_SUPABASE_URL=https://<your-project-id>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-public-key>
```

---

## Project Structure

```
payroll-system/
├── src/
│   ├── components/       # Reusable UI components
│   ├── hooks/            # Custom React hooks
│   ├── integrations/     # Supabase client & type-safe queries
│   ├── lib/              # Utility functions
│   ├── pages/            # Route-level page components
│   └── test/             # Unit tests
├── supabase/
│   ├── functions/        # Edge functions (payroll calculations, PDF gen)
│   └── migrations/       # Database schema migrations
└── public/               # Static assets
```

---

## Running Tests

```sh
# Unit tests
npm run test

# End-to-end tests (requires running dev server)
npx playwright test
```

---

## Generating Payslips

Payslips can be generated directly from the **Payroll → Payslips** section. Bulk export to PDF or Excel is supported for all employees in a given month.

---

## Contributing

Pull requests are welcome! Please open an issue first to discuss what you'd like to change.

---

## License

MIT © 2026 Solintix
