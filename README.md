# Jonas Reporter

A Node.js tool for running pre-built Construction & HVAC service reports against a SQL Server database and exporting the results as a formatted Excel workbook.

Comes with two modes: a **web UI** (browser form with filters and one-click download) and a **CLI** (terminal prompts or command-line flags).

---

## What It Does

Enter a company code and optional filters (customer name, date range), then click **Generate Reports**. The app connects to your SQL Server, runs all 10 reports in sequence, and streams back a single `.xlsx` file with one tab per report — auto-sized columns, alternating row colours, frozen headers, and totals rows included.

**10 reports across one workbook:**

| # | Report |
|---|--------|
| 01 | Open Work Orders by Status |
| 02 | Accounts Receivable Aging (current / 30 / 60 / 90+ days) |
| 03 | Service Contract Renewal Pipeline |
| 04 | Equipment Service History |
| 05 | Technician Productivity Report |
| 06 | Job Cost vs. Budget |
| 07 | Monthly Revenue by Customer (12-month pivot) |
| 08 | Preventive Maintenance Schedule |
| 09 | Parts Usage & Inventory (with reorder alerts) |
| 10 | Customer Profitability Summary |

---

## Requirements

- Node.js 18+
- A Microsoft SQL Server instance with your data
- ODBC Driver 17 or 18 for SQL Server (for CLI mode)

---

## Setup

```bash
# 1. Clone and install
git clone https://github.com/iqrarrizvi/jonas-reporter.git
cd jonas-reporter
npm install

# 2. Configure your database connection
cp .env.example .env
```

Edit `.env` with your SQL Server details:

```env
DB_SERVER=your-server-name
DB_USER=your-username
DB_PASSWORD=your-password
```

> Windows Authentication is used automatically if `DB_USER` and `DB_PASSWORD` are left blank.

---

## Usage

### Web UI

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000), fill in the filters, and click **Generate Reports**. The Excel file downloads automatically.

### CLI

```bash
# Interactive (prompts for filters)
npm run reports

# With flags (no prompts)
node report-generator.js --company=ARCTIC --from=2026-01-01 --to=2026-05-31
node report-generator.js --customer="Blue Ridge"
```

### Sample report (no database needed)

```bash
npm run sample
```

Generates a demo Excel file using mock data — useful for previewing the report format without a live connection.

---

## Project Structure

```
├── server.js            # Express web UI + API
├── report-generator.js  # CLI entry point
├── reports.js           # Report definitions (SQL queries)
├── excel-builder.js     # Excel workbook formatting
├── filters.js           # Filter parsing and SQL injection helpers
├── config.js            # Database config (reads from .env)
├── sample-report.js     # Mock data demo
└── .env.example         # Environment variable template
```

---

## Tech Stack

- **Node.js / Express** — web server
- **mssql** — SQL Server client
- **ExcelJS** — Excel workbook generation
- **dotenv** — environment variable management
