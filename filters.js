/**
 * Report filter collection — interactive prompt or CLI args.
 *
 * Interactive (default):
 *   node report-generator.js
 *   node sample-report.js
 *
 * CLI args (skips prompts — great for scripting):
 *   node report-generator.js --company=ARCTIC --from=2026-01-01 --to=2026-05-04
 *   node report-generator.js --company=ARCTIC --customer="Blue Ridge"
 *
 * Available flags:
 *   --company=CODE     Exact company/division code (e.g. ARCTIC, HVAC01)
 *   --customer=NAME    Partial customer name match
 *   --from=DATE        Start date  YYYY-MM-DD or MM/DD/YYYY
 *   --to=DATE          End date    YYYY-MM-DD or MM/DD/YYYY
 */

const readline = require('readline');

// ── Date parsing ──────────────────────────────────────────────────────────────
function parseDate(str) {
  if (!str || !str.trim()) return null;
  str = str.trim();
  // Accept MM/DD/YYYY or YYYY-MM-DD
  const mmddyyyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) str = `${mmddyyyy[3]}-${mmddyyyy[1].padStart(2,'0')}-${mmddyyyy[2].padStart(2,'0')}`;
  const d = new Date(str + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(d) {
  if (!d) return '';
  return d.toLocaleDateString('en-US', { month:'2-digit', day:'2-digit', year:'numeric' });
}

// ── CLI argument parser ───────────────────────────────────────────────────────
function parseArgs() {
  const raw = {};
  process.argv.slice(2).forEach(arg => {
    const m = arg.match(/^--([a-zA-Z]+)=(.+)$/);
    if (m) raw[m[1].toLowerCase()] = m[2];
  });
  return {
    companyCode:    raw.company    ? raw.company.trim().toUpperCase() : null,
    customerSearch: raw.customer   ? raw.customer.trim()             : null,
    dateFrom:       parseDate(raw.from)                               || null,
    dateTo:         parseDate(raw.to)                                 || null,
  };
}

// ── Validate input (prevent SQL injection via company code field) ──────────────
function sanitizeCode(s) {
  // Company codes are alphanumeric + dash/underscore only
  return s ? s.replace(/[^A-Z0-9\-_]/gi, '').toUpperCase().slice(0, 20) : null;
}

// ── Interactive prompt ────────────────────────────────────────────────────────
async function promptFilters() {
  // If any CLI arg was provided, skip the prompt entirely
  const cliFilters = parseArgs();
  if (cliFilters.companyCode || cliFilters.customerSearch || cliFilters.dateFrom || cliFilters.dateTo) {
    console.log('\n  Using CLI filters:');
    printFilterSummary(cliFilters);
    return enrichFilters(cliFilters);
  }

  // If stdin is not a TTY (piped, redirected, CI), skip prompts — run unfiltered
  if (!process.stdin.isTTY) {
    const empty = { companyCode: null, customerSearch: null, dateFrom: null, dateTo: null };
    console.log('\n  No filters — showing all data\n');
    return enrichFilters(empty);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

  console.log('');
  console.log('  ┌──────────────────────────────────────────────────────────┐');
  console.log('  │      Report Filters  (press Enter to skip any filter)    │');
  console.log('  └──────────────────────────────────────────────────────────┘');
  console.log('');

  const companyRaw  = await ask('  Company Code         (e.g. ARCTIC, HVAC01)  : ');
  const customerRaw = await ask('  Customer Name        (partial match)         : ');
  const fromRaw     = await ask('  Date From            (MM/DD/YYYY)            : ');
  const toRaw       = await ask('  Date To              (MM/DD/YYYY)            : ');

  rl.close();
  console.log('');

  const filters = {
    companyCode:    sanitizeCode(companyRaw.trim())  || null,
    customerSearch: customerRaw.trim()               || null,
    dateFrom:       parseDate(fromRaw)               || null,
    dateTo:         parseDate(toRaw)                 || null,
  };

  printFilterSummary(filters);
  return enrichFilters(filters);
}

function printFilterSummary(f) {
  const lines = describeFilters(f).split('  |  ');
  lines.forEach(l => console.log('    ' + l));
  console.log('');
}

// ── Enrich filter object with SQL builder helpers ─────────────────────────────
function enrichFilters(f) {
  // AND alias.CompanyCode = @companyCode
  f.company = (alias = 'c') =>
    f.companyCode ? `AND ${alias}.CompanyCode = @companyCode` : '';

  // AND alias.CustomerName LIKE @customerSearch
  f.customer = (alias = 'c') =>
    f.customerSearch ? `AND ${alias}.CustomerName LIKE @customerSearch` : '';

  // AND alias.column >= @dateFrom  AND alias.column <= @dateTo
  f.dates = (alias, col) => {
    const parts = [];
    if (f.dateFrom) parts.push(`AND ${alias}.${col} >= @dateFrom`);
    if (f.dateTo)   parts.push(`AND ${alias}.${col} <= @dateTo`);
    return parts.join('\n        ');
  };

  // Same as dates() but replaces a default fallback expression when no filter is set.
  // Used on reports that already have a hardcoded date window (e.g. current month).
  f.datesOrDefault = (alias, col, defaultFrom, defaultTo) => {
    const from = f.dateFrom ? `${alias}.${col} >= @dateFrom`  : (defaultFrom || '1=1');
    const to   = f.dateTo   ? `${alias}.${col} <= @dateTo`    : (defaultTo   || '1=1');
    return `AND ${from}\n        AND ${to}`;
  };

  // Bind all active parameters onto an mssql request object
  f.bindParams = (req, sqlTypes) => {
    if (f.companyCode)    req.input('companyCode',    sqlTypes.VarChar(20),    f.companyCode);
    if (f.dateFrom)       req.input('dateFrom',       sqlTypes.Date,           f.dateFrom);
    if (f.dateTo)         req.input('dateTo',         sqlTypes.Date,           f.dateTo);
    if (f.customerSearch) req.input('customerSearch', sqlTypes.NVarChar(200),  `%${f.customerSearch}%`);
  };

  return f;
}

// ── Human-readable filter summary ─────────────────────────────────────────────
function describeFilters(f) {
  const parts = [];
  if (f.companyCode)    parts.push(`Company: ${f.companyCode}`);
  if (f.customerSearch) parts.push(`Customer: *${f.customerSearch}*`);
  if (f.dateFrom || f.dateTo) {
    const from = f.dateFrom ? fmtDate(f.dateFrom) : 'start';
    const to   = f.dateTo   ? fmtDate(f.dateTo)   : 'today';
    parts.push(`Date range: ${from} → ${to}`);
  }
  return parts.length ? parts.join('  |  ') : 'No filters — showing all data';
}

// ── Mock-data filter helper (used by sample-report.js) ────────────────────────
// dateField: the column name in the row that holds a "MM/DD/YYYY" string
function filterRows(rows, f, { companyCodeField = 'Company Code', dateField = null } = {}) {
  return rows.filter(row => {
    if (f.companyCode && row[companyCodeField] !== f.companyCode) return false;
    if (f.customerSearch) {
      const cust = (row['Customer'] || '').toLowerCase();
      if (!cust.includes(f.customerSearch.toLowerCase())) return false;
    }
    if (dateField && row[dateField] && (f.dateFrom || f.dateTo)) {
      const d = parseDate(row[dateField]);
      if (!d) return true;
      if (f.dateFrom && d < f.dateFrom) return false;
      if (f.dateTo   && d > f.dateTo)   return false;
    }
    return true;
  });
}

module.exports = { promptFilters, enrichFilters, describeFilters, filterRows, parseDate };
