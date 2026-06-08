/**
 * Jonas Reporter — Web UI
 * Run:  node server.js   (or: npm start)
 * Open: http://localhost:3000
 *
 * Enter a company code (e.g. I1), optional date range, click Generate.
 * The server connects to your SQL Server, runs all 10 reports filtered
 * by your inputs, and streams the Excel file back to your browser.
 *
 * Config: copy .env.example to .env and fill in DB_SERVER / DB_USER / DB_PASSWORD
 */

const express  = require('express');
const sql      = require('mssql');
const path     = require('path');
const fs       = require('fs');
const { dbConfig, OUTPUT_DIR } = require('./config');
const { buildWorkbook, saveWorkbook } = require('./excel-builder');
const { enrichFilters, describeFilters, parseDate } = require('./filters');

// Import report definitions (same SQL queries used by report-generator.js)
const REPORTS = require('./reports');

const app  = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Serve the UI ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send(buildHTML());
});

// ── Run reports endpoint ──────────────────────────────────────────────────────
app.post('/run-reports', async (req, res) => {
  const { companyCode, customerSearch, dateFrom, dateTo } = req.body;

  const filters = enrichFilters({
    companyCode:    companyCode    ? companyCode.trim().toUpperCase()  : null,
    customerSearch: customerSearch ? customerSearch.trim()             : null,
    dateFrom:       parseDate(dateFrom) || null,
    dateTo:         parseDate(dateTo)   || null,
  });

  let pool;
  try {
    pool = await sql.connect(dbConfig);
  } catch (err) {
    return res.status(503).json({
      error: `Cannot connect to ${dbConfig.server}: ${err.message}`,
      tip: 'Make sure your DB_SERVER is reachable and your .env credentials are correct.',
    });
  }

  // Discover first user database
  let targetDb;
  try {
    const dbs = await pool.request().query(
      `SELECT name FROM sys.databases WHERE name NOT IN ('master','tempdb','model','msdb') ORDER BY name`
    );
    targetDb = dbs.recordset[0]?.name;
    if (!targetDb) throw new Error('No user databases found.');
  } catch (err) {
    await pool.close();
    return res.status(500).json({ error: err.message });
  }

  // Run each report
  const results = [];
  for (const report of REPORTS) {
    try {
      const req2 = pool.request();
      filters.bindParams(req2, sql);
      const rows = await req2.query(report.sql(targetDb, filters));
      results.push({ ...report, rows: rows.recordset });
    } catch (err) {
      results.push({ ...report, rows: [], error: err.message });
    }
  }

  await pool.close();

  // Build Excel and stream back
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const label     = filters.companyCode ? `_${filters.companyCode}` : '';
  const filePath  = path.join(OUTPUT_DIR, `Jonas_Reports${label}_${timestamp}.xlsx`);

  const wb = buildWorkbook(results, filters);
  await saveWorkbook(wb, filePath);

  const filterDesc = describeFilters(filters).replace(/[^a-zA-Z0-9 |:→*]/g, '').trim();
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('X-Filter-Summary', filterDesc);
  res.sendFile(path.resolve(filePath));
});

// ── Company code lookup (typeahead) ───────────────────────────────────────────
app.get('/companies', async (req, res) => {
  let pool;
  try {
    pool = await sql.connect(dbConfig);
    const dbs = await pool.request().query(
      `SELECT name FROM sys.databases WHERE name NOT IN ('master','tempdb','model','msdb') ORDER BY name`
    );
    const db = dbs.recordset[0]?.name;
    if (!db) { await pool.close(); return res.json([]); }

    // Try common Jonas schema locations for company code lists
    const queries = [
      `SELECT DISTINCT CompanyCode AS code, CompanyName AS name FROM [${db}]..Company ORDER BY CompanyCode`,
      `SELECT DISTINCT CompNo AS code, CompName AS name FROM [${db}]..Company ORDER BY CompNo`,
      `SELECT DISTINCT CompanyCode AS code, CompanyCode AS name FROM [${db}]..Customer WHERE CompanyCode IS NOT NULL ORDER BY CompanyCode`,
    ];
    for (const q of queries) {
      try {
        const r = await pool.request().query(q);
        if (r.recordset.length > 0) {
          await pool.close();
          return res.json(r.recordset);
        }
      } catch {}
    }
    await pool.close();
    return res.json([]);
  } catch {
    if (pool) try { await pool.close(); } catch {}
    return res.json([]);
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   Jonas Reporter                                          ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║   Open in browser:  http://localhost:${PORT}               ║`);
  console.log('║   Press Ctrl+C to stop                                   ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
});

// ── HTML page ─────────────────────────────────────────────────────────────────
function buildHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Jonas Reporter</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    background: #f0f4f8;
    color: #222;
    min-height: 100vh;
  }

  /* ── Header ── */
  header {
    background: linear-gradient(135deg, #1F4E79 0%, #2E75B6 100%);
    color: #fff;
    padding: 22px 32px;
    display: flex;
    align-items: center;
    gap: 16px;
    box-shadow: 0 2px 8px rgba(0,0,0,.25);
  }
  header svg { flex-shrink: 0; }
  header h1 { font-size: 1.45rem; font-weight: 700; letter-spacing: .3px; }
  header p  { font-size: .85rem; opacity: .85; margin-top: 2px; }

  /* ── Layout ── */
  .page { max-width: 900px; margin: 0 auto; padding: 32px 20px; }

  /* ── Filter card ── */
  .card {
    background: #fff;
    border-radius: 10px;
    box-shadow: 0 1px 6px rgba(0,0,0,.1);
    padding: 28px 32px;
    margin-bottom: 24px;
  }
  .card h2 {
    font-size: 1rem;
    color: #1F4E79;
    font-weight: 700;
    margin-bottom: 20px;
    text-transform: uppercase;
    letter-spacing: .8px;
    border-bottom: 2px solid #e0eaf5;
    padding-bottom: 10px;
  }

  /* ── Form grid ── */
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field.full { grid-column: 1 / -1; }
  label {
    font-size: .78rem;
    font-weight: 600;
    color: #555;
    text-transform: uppercase;
    letter-spacing: .5px;
  }
  label span { font-weight: 400; color: #999; text-transform: none; letter-spacing: 0; }

  /* ── Company code ── */
  .company-wrap {
    position: relative;
  }
  #companyCode {
    text-transform: uppercase;
  }

  /* ── Typeahead dropdown ── */
  #suggestions {
    position: absolute;
    top: 100%;
    left: 0; right: 0;
    background: #fff;
    border: 1px solid #cde;
    border-top: none;
    border-radius: 0 0 8px 8px;
    max-height: 220px;
    overflow-y: auto;
    z-index: 99;
    display: none;
    box-shadow: 0 4px 12px rgba(0,0,0,.12);
  }
  .sug-item {
    padding: 10px 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: .9rem;
  }
  .sug-item:hover { background: #e8f4fd; }
  .sug-code { font-weight: 700; color: #1F4E79; min-width: 60px; font-size: 1rem; }
  .sug-name { color: #555; }

  /* ── Other inputs ── */
  input[type=text], input[type=date] {
    border: 1px solid #ccd;
    border-radius: 6px;
    padding: 9px 12px;
    font-size: .93rem;
    outline: none;
    width: 100%;
    transition: border-color .15s, box-shadow .15s;
    background: #fafcff;
  }
  input[type=text]:focus, input[type=date]:focus {
    border-color: #2E75B6;
    box-shadow: 0 0 0 3px rgba(46,117,182,.15);
    background: #fff;
  }

  /* ── Generate button ── */
  .btn-row { display: flex; align-items: center; gap: 16px; margin-top: 24px; }
  button[type=submit] {
    background: linear-gradient(135deg, #1F4E79, #2E75B6);
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 13px 36px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    letter-spacing: .4px;
    transition: opacity .15s, transform .1s;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  button[type=submit]:hover   { opacity: .9; transform: translateY(-1px); }
  button[type=submit]:active  { transform: translateY(0); }
  button[type=submit]:disabled { opacity: .6; cursor: not-allowed; transform: none; }

  .btn-clear {
    background: none;
    border: 1px solid #ccd;
    border-radius: 6px;
    padding: 10px 20px;
    font-size: .9rem;
    color: #666;
    cursor: pointer;
    transition: background .15s;
  }
  .btn-clear:hover { background: #f0f4f8; }

  /* ── Status / progress ── */
  #status {
    display: none;
    align-items: center;
    gap: 12px;
    padding: 14px 20px;
    border-radius: 8px;
    font-size: .93rem;
    font-weight: 500;
  }
  #status.loading  { background: #e8f4fd; color: #1F4E79; display: flex; }
  #status.success  { background: #e6f4ea; color: #1a7431; display: flex; }
  #status.error    { background: #fce8e8; color: #c0392b; display: flex; }

  .spinner {
    width: 20px; height: 20px;
    border: 3px solid rgba(31,78,121,.2);
    border-top-color: #1F4E79;
    border-radius: 50%;
    animation: spin .7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Report list preview ── */
  .reports-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
    margin-top: 8px;
  }
  .report-chip {
    background: #f0f6ff;
    border: 1px solid #d0e4f7;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: .82rem;
    color: #1F4E79;
  }
  .report-chip strong { display: block; font-size: .78rem; color: #888; font-weight: 600;
    text-transform: uppercase; letter-spacing: .5px; margin-bottom: 3px; }

  footer { text-align: center; color: #aaa; font-size: .78rem; padding: 20px; }
</style>
</head>
<body>

<header>
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
    <rect width="40" height="40" rx="8" fill="rgba(255,255,255,.15)"/>
    <path d="M8 28 L20 10 L32 28 Z" fill="none" stroke="white" stroke-width="2.5" stroke-linejoin="round"/>
    <rect x="16" y="20" width="8" height="8" fill="white" opacity=".9"/>
    <rect x="10" y="28" width="20" height="2" rx="1" fill="white" opacity=".6"/>
  </svg>
  <div>
    <h1>Jonas Reporter</h1>
    <p>Enter a company code to generate all 10 reports and download as Excel</p>
  </div>
</header>

<div class="page">

  <!-- Filter card -->
  <div class="card">
    <h2>Report Filters</h2>
    <form id="reportForm">

      <!-- Company code — big field -->
      <div class="company-wrap">
        <label for="companyCode">Company Code <span>— type to search, or enter directly (e.g. I1)</span></label>
        <input type="text" id="companyCode" name="companyCode"
               placeholder="e.g. I1" autocomplete="off" maxlength="20">
        <div id="suggestions"></div>
      </div>

      <!-- Other filters -->
      <div class="grid">
        <div class="field">
          <label for="customerSearch">Customer Name <span>optional partial match</span></label>
          <input type="text" id="customerSearch" name="customerSearch" placeholder="e.g. Arctic Air">
        </div>
        <div class="field"></div>
        <div class="field">
          <label for="dateFrom">Date From <span>optional</span></label>
          <input type="date" id="dateFrom" name="dateFrom">
        </div>
        <div class="field">
          <label for="dateTo">Date To <span>optional</span></label>
          <input type="date" id="dateTo" name="dateTo">
        </div>
      </div>

      <div class="btn-row">
        <button type="submit" id="runBtn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          Generate Reports
        </button>
        <button type="button" class="btn-clear" onclick="clearForm()">Clear</button>
        <div id="status">
          <div class="spinner" id="spinner"></div>
          <span id="statusText"></span>
        </div>
      </div>
    </form>
  </div>

  <!-- What's included -->
  <div class="card">
    <h2>Included Reports (10 tabs in Excel)</h2>
    <div class="reports-grid">
      ${[
        ['01','Open Work Orders by Status'],
        ['02','Accounts Receivable Aging'],
        ['03','Service Contract Renewal Pipeline'],
        ['04','Equipment Service History'],
        ['05','Technician Productivity Report'],
        ['06','Job Cost vs. Budget'],
        ['07','Monthly Revenue by Customer'],
        ['08','Preventive Maintenance Schedule'],
        ['09','Parts Usage &amp; Inventory'],
        ['10','Customer Profitability Summary'],
      ].map(([n, t]) => `<div class="report-chip"><strong>Report ${n}</strong>${t}</div>`).join('')}
    </div>
  </div>

</div>
<footer>Jonas Reporter</footer>

<script>
// ── Company code typeahead ────────────────────────────────────────────────────
let companies = [];

async function loadCompanies() {
  try {
    const r = await fetch('/companies');
    companies = await r.json();
  } catch {}
}
loadCompanies();

const codeInput   = document.getElementById('companyCode');
const suggestions = document.getElementById('suggestions');

codeInput.addEventListener('input', () => {
  const q = codeInput.value.trim().toUpperCase();
  if (!q || companies.length === 0) { suggestions.style.display = 'none'; return; }
  const matches = companies.filter(c =>
    c.code.toUpperCase().includes(q) || (c.name || '').toUpperCase().includes(q)
  ).slice(0, 8);
  if (matches.length === 0) { suggestions.style.display = 'none'; return; }
  suggestions.innerHTML = matches.map(c =>
    \`<div class="sug-item" onclick="selectCode('\${c.code}')">
       <span class="sug-code">\${c.code}</span>
       <span class="sug-name">\${c.name || ''}</span>
     </div>\`
  ).join('');
  suggestions.style.display = 'block';
});

document.addEventListener('click', e => {
  if (!e.target.closest('.company-wrap')) suggestions.style.display = 'none';
});

function selectCode(code) {
  codeInput.value = code;
  suggestions.style.display = 'none';
}

// ── Form submit ───────────────────────────────────────────────────────────────
document.getElementById('reportForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn    = document.getElementById('runBtn');
  const status = document.getElementById('status');
  const text   = document.getElementById('statusText');
  const spinner = document.getElementById('spinner');

  const company = codeInput.value.trim().toUpperCase();
  const label   = company ? \`Company: \${company}\` : 'all companies';

  btn.disabled = true;
  status.className = 'loading';
  spinner.style.display = 'block';
  text.textContent = \`Connecting to database and running reports for \${label}…\`;

  try {
    const body = new FormData(e.target);
    if (company) body.set('companyCode', company);

    const resp = await fetch('/run-reports', { method: 'POST', body });

    if (!resp.ok) {
      const err = await resp.json();
      status.className = 'error';
      spinner.style.display = 'none';
      text.textContent = err.error + (err.tip ? ' — ' + err.tip : '');
    } else {
      // Trigger file download
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      const cd   = resp.headers.get('Content-Disposition') || '';
      a.download = cd.match(/filename="([^"]+)"/)?.[1] || 'Jonas_Reports.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const filterHdr = resp.headers.get('X-Filter-Summary') || '';
      status.className = 'success';
      spinner.style.display = 'none';
      text.textContent = \`✓ Excel downloaded — \${filterHdr || 'all data'}\`;
    }
  } catch (err) {
    status.className = 'error';
    spinner.style.display = 'none';
    text.textContent = 'Request failed: ' + err.message;
  } finally {
    btn.disabled = false;
  }
});

function clearForm() {
  document.getElementById('reportForm').reset();
  document.getElementById('status').className = '';
  document.getElementById('status').style.display = 'none';
  suggestions.style.display = 'none';
}
</script>
</body>
</html>`;
}
