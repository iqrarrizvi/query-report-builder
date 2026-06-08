/**
 * Generates a sample Excel report using realistic mock data.
 * No database connection required — run this anytime to preview the report format.
 *
 * Interactive (prompts for filters):
 *   node sample-report.js
 *
 * With CLI filters (no prompt):
 *   node sample-report.js --company=ARCTIC
 *   node sample-report.js --company=BLRDG --from=01/01/2026 --to=05/04/2026
 *   node sample-report.js --customer="Blue Ridge"
 */

const path = require('path');
const fs   = require('fs');
const { OUTPUT_DIR } = require('./config');
const { buildWorkbook, saveWorkbook } = require('./excel-builder');
const { promptFilters, filterRows }   = require('./filters');

// ── Customers with company codes ─────────────────────────────────────────────
const CUSTOMERS = [
  { name: 'Arctic Air HVAC Inc.',      code: 'ARCTIC' },
  { name: 'Blue Ridge Mechanical',     code: 'BLRDG'  },
  { name: 'Capital City Contractors',  code: 'CAPCC'  },
  { name: 'Delta Heating & Cooling',   code: 'DELTA'  },
  { name: 'Eagle HVAC Services',       code: 'EAGLE'  },
  { name: 'Frontier Mechanical Group', code: 'FRONT'  },
  { name: 'Great Lakes Service Co.',   code: 'GRTLK'  },
  { name: 'Highpoint Construction',    code: 'HIGHPT' },
  { name: 'Inland Climate Systems',    code: 'INLND'  },
  { name: 'Johnson Building Services', code: 'JOHNS'  },
  { name: 'Keystone HVAC & Plumbing',  code: 'KEYST'  },
  { name: 'Liberty Mechanical Inc.',   code: 'LIBERT' },
  { name: 'Metro HVAC Solutions',      code: 'METRO'  },
  { name: 'Northern Comfort Systems',  code: 'NORTH'  },
  { name: 'Oakview Contractors LLC',   code: 'OAKVW'  },
];

const TECHS    = ['Mike Torres', 'Sarah Kim', 'James Walton', 'Linda Patel', 'Chris Evans', 'Ana Gomez'];
const CITIES   = ['Toronto, ON', 'Mississauga, ON', 'Brampton, ON', 'Oakville, ON', 'Hamilton, ON', 'Burlington, ON'];
const STATUSES = ['Dispatched', 'In Progress', 'Parts on Order', 'Awaiting Approval', 'Scheduled'];
const SVC_TYPES = ['HVAC Repair', 'Preventive Maintenance', 'New Installation', 'Emergency Call', 'Inspection', 'Refrigerant Top-Up'];
const EQUIP_TYPES = ['Rooftop Unit', 'Split System', 'Boiler', 'Chiller', 'Air Handler', 'Heat Pump', 'VRF System'];
const MAKES    = ['Carrier', 'Trane', 'Lennox', 'York', 'Daikin', 'Mitsubishi', 'Bryant'];
const PARTS    = [
  { no:'P-001', desc:'Capacitor 35/5 MFD',          cat:'Electrical'     },
  { no:'P-002', desc:'Contactor 2-Pole 40A',         cat:'Electrical'     },
  { no:'P-003', desc:'Filter 20x20x1 MERV-8',        cat:'Filters'        },
  { no:'P-004', desc:'Blower Motor 1/2 HP',          cat:'Motors'         },
  { no:'P-005', desc:'Thermostat Digital 7-Day',     cat:'Controls'       },
  { no:'P-006', desc:'Refrigerant R-410A 25lb',      cat:'Refrigerants'   },
  { no:'P-007', desc:'Drain Pan 32x32',              cat:'Sheet Metal'    },
  { no:'P-008', desc:'Fan Belt A-Series',            cat:'Mechanical'     },
  { no:'P-009', desc:'Gas Valve 24V Universal',      cat:'Gas Components' },
  { no:'P-010', desc:'Igniter Silicon Nitride',      cat:'Ignition'       },
  { no:'P-011', desc:'Pressure Switch N.O.',         cat:'Controls'       },
  { no:'P-012', desc:'Coil Cleaner 18oz',            cat:'Chemicals'      },
  { no:'P-013', desc:'Transformer 40VA 120/24V',     cat:'Electrical'     },
  { no:'P-014', desc:'Float Switch Condensate',      cat:'Plumbing'       },
  { no:'P-015', desc:'Plenum Box 12x12x8',           cat:'Sheet Metal'    },
];
const PM_TYPES       = ['Seasonal HVAC Tune-Up', 'Annual Boiler Service', 'Quarterly Filter Change', 'Semi-Annual Inspection'];
const CONTRACT_TYPES = ['Full Coverage', 'Parts & Labour', 'Labour Only', 'Inspection Only'];
const PRIORITIES     = ['Critical', 'High', 'Normal', 'Low'];

function rnd(min, max)            { return Math.floor(Math.random() * (max - min + 1)) + min; }
function rndF(min, max, dec = 2)  { return parseFloat((Math.random() * (max - min) + min).toFixed(dec)); }
function pick(arr)                { return arr[Math.floor(Math.random() * arr.length)]; }
function pickCust()               { return pick(CUSTOMERS); }
function fmtDate(d) {
  return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function subDays(d, n) { return addDays(d, -n); }

const TODAY = new Date('2026-05-04');

// ── Report 1: Open Work Orders ────────────────────────────────────────────────
function makeReport1() {
  return Array.from({ length: 30 }, (_, i) => {
    const cust = pickCust();
    return {
      'Company Code':  cust.code,
      'WO Number':     `WO-2026-${String(i + 1).padStart(4,'0')}`,
      'Customer':       cust.name,
      'Address':       `${rnd(100,9999)} ${pick(['King St','Queen Ave','Main Blvd','Industrial Dr','Commerce Way'])}, ${pick(CITIES)}`,
      'Status':         pick(STATUSES),
      'Priority':       pick(PRIORITIES),
      'Service Type':   pick(SVC_TYPES),
      'Assigned Tech':  pick(TECHS),
      'Scheduled Date': fmtDate(addDays(TODAY, rnd(-5, 30))),
      'Days Open':      rnd(0, 45),
      'Est. Revenue':   rndF(250, 4500),
    };
  });
}

// ── Report 2: AR Aging ────────────────────────────────────────────────────────
function makeReport2() {
  return Array.from({ length: 25 }, (_, i) => {
    const cust    = pickCust();
    const ageDays = rnd(0, 110);
    const total   = rndF(500, 8000);
    const balance = rndF(total * 0.3, total);
    const invDate = fmtDate(subDays(TODAY, ageDays + rnd(0, 30)));
    const dueDate = fmtDate(subDays(TODAY, ageDays));
    return {
      'Company Code': cust.code,
      'Customer':      cust.name,
      'Invoice #':    `INV-2026-${String(i + 400).padStart(5,'0')}`,
      'Invoice Date':  invDate,
      'Due Date':      dueDate,
      'Total':         total,
      'Current':       ageDays <= 0 ? balance : 0,
      '1-30 Days':     ageDays >= 1  && ageDays <= 30 ? balance : 0,
      '31-60 Days':    ageDays >= 31 && ageDays <= 60 ? balance : 0,
      '61-90 Days':    ageDays >= 61 && ageDays <= 90 ? balance : 0,
      '90+ Days':      ageDays > 90 ? balance : 0,
    };
  });
}

// ── Report 3: Contract Renewals ───────────────────────────────────────────────
function makeReport3() {
  return Array.from({ length: 22 }, (_, i) => {
    const cust     = pickCust();
    const daysLeft = rnd(-5, 88);
    const expiry   = addDays(TODAY, daysLeft);
    return {
      'Company Code':      cust.code,
      'Customer':           cust.name,
      'Contract #':        `SC-${String(i + 100).padStart(4,'0')}`,
      'Contract Type':      pick(CONTRACT_TYPES),
      'Equipment Covered': `${pick(MAKES)} ${pick(EQUIP_TYPES)}`,
      'Start Date':         fmtDate(subDays(expiry, rnd(180, 365))),
      'Expiry Date':        fmtDate(expiry),
      'Days Until Expiry':  daysLeft,
      'Annual Value':       rndF(1200, 12000),
      'Auto-Renew':         pick(['Yes','No']),
    };
  }).sort((a,b) => a['Days Until Expiry'] - b['Days Until Expiry']);
}

// ── Report 4: Equipment Service History ──────────────────────────────────────
function makeReport4() {
  return Array.from({ length: 28 }, () => {
    const cust    = pickCust();
    const labour  = rndF(1, 8, 1);
    const parts   = rndF(0, 800);
    const svcDate = fmtDate(subDays(TODAY, rnd(0, 300)));
    return {
      'Company Code':   cust.code,
      'Customer':        cust.name,
      'Equipment ID':   `EQ-${rnd(1000,9999)}`,
      'Equipment Type':  pick(EQUIP_TYPES),
      'Make / Model':   `${pick(MAKES)} ${pick(['4SCU13','XR15','XC21','CHS','LRP14'])}`,
      'Serial #':       `SN${rnd(100000,999999)}`,
      'Install Date':    fmtDate(subDays(TODAY, rnd(365, 2500))),
      'Service Date':    svcDate,
      'WO Number':      `WO-2026-${rnd(100,999)}`,
      'Service Type':    pick(SVC_TYPES),
      'Tech':            pick(TECHS),
      'Labour Hrs':      labour,
      'Parts Cost':      parts,
      'Total Cost':      parseFloat((labour * rndF(75, 120) + parts).toFixed(2)),
    };
  });
}

// ── Report 5: Technician Productivity ────────────────────────────────────────
function makeReport5() {
  return TECHS.map(tech => {
    const wos    = rnd(12, 35);
    const hrs    = rndF(wos * 3.5, wos * 6.5, 1);
    const labour = rndF(hrs * 75, hrs * 120);
    const parts  = rndF(labour * 0.3, labour * 0.8);
    return {
      'Company Code':    'ALL',
      'Technician':       tech,
      'Trade':            pick(['HVAC','Refrigeration','Electrical','Plumbing']),
      'WOs Completed':    wos,
      'Billable Hrs':     hrs,
      'Avg Hrs/WO':       parseFloat((hrs / wos).toFixed(1)),
      'Labour Revenue':   labour,
      'Parts Revenue':    parts,
      'Total Revenue':    parseFloat((labour + parts).toFixed(2)),
      'Callback Rate %':  rndF(0, 8, 1),
    };
  }).sort((a,b) => b['Total Revenue'] - a['Total Revenue']);
}

// ── Report 6: Job Cost vs Budget ─────────────────────────────────────────────
function makeReport6() {
  const JOBS = [
    'Commercial HVAC Retrofit', 'Warehouse Rooftop Install', 'Office Tower Fit-Out',
    'Hospital Chiller Replacement', 'Retail Chain HVAC Rollout', 'School HVAC Upgrade',
    'Parking Garage Ventilation', 'Data Centre Cooling',
  ];
  return JOBS.map((jobName, i) => {
    const cust      = pickCust();
    const bLabour   = rndF(15000, 80000);
    const bMat      = rndF(20000, 150000);
    const aLabour   = parseFloat((bLabour * rndF(0.90, 1.15)).toFixed(2));
    const aMat      = parseFloat((bMat    * rndF(0.88, 1.20)).toFixed(2));
    const bTotal    = parseFloat((bLabour + bMat).toFixed(2));
    const aTotal    = parseFloat((aLabour + aMat).toFixed(2));
    return {
      'Company Code':       cust.code,
      'Job #':             `JOB-2026-${String(i + 1).padStart(3,'0')}`,
      'Job Name':           jobName,
      'Customer':           cust.name,
      'PM':                 pick(TECHS),
      'Start Date':         fmtDate(subDays(TODAY, rnd(30, 180))),
      'Budget Labour':      bLabour,
      'Actual Labour':      aLabour,
      'Budget Materials':   bMat,
      'Actual Materials':   aMat,
      'Budget Total':       bTotal,
      'Actual Total':       aTotal,
      'Variance $':         parseFloat((aTotal - bTotal).toFixed(2)),
      'Variance %':         parseFloat(((aTotal - bTotal) / bTotal * 100).toFixed(1)),
    };
  }).sort((a,b) => b['Variance %'] - a['Variance %']);
}

// ── Report 7: Monthly Revenue ─────────────────────────────────────────────────
function makeReport7() {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return CUSTOMERS.map(cust => {
    const row = { 'Company Code': cust.code, 'Customer': cust.name };
    let ytd = 0;
    MONTHS.forEach(m => {
      const v = rnd(0,1) ? rndF(800, 15000) : 0;
      row[m] = v;
      ytd += v;
    });
    row['YTD Total'] = parseFloat(ytd.toFixed(2));
    return row;
  }).sort((a,b) => b['YTD Total'] - a['YTD Total']);
}

// ── Report 8: PM Schedule ─────────────────────────────────────────────────────
function makeReport8() {
  return Array.from({ length: 28 }, () => {
    const cust      = pickCust();
    const daysUntil = rnd(-10, 60);
    const dueDate   = addDays(TODAY, daysUntil);
    const lastDone  = subDays(dueDate, rnd(85, 365));
    return {
      'Company Code':   cust.code,
      'Due Date':        fmtDate(dueDate),
      'Days Until Due':  daysUntil,
      'Customer':        cust.name,
      'Equipment':      `${pick(MAKES)} ${pick(EQUIP_TYPES)}`,
      'Serial #':       `SN${rnd(100000,999999)}`,
      'PM Type':         pick(PM_TYPES),
      'Frequency':       pick(['Annual','Semi-Annual','Quarterly','Monthly']),
      'Last Completed':  fmtDate(lastDone),
      'Assigned Tech':   pick(TECHS),
      'Contract #':     `SC-${String(rnd(100,200)).padStart(4,'0')}`,
    };
  }).sort((a,b) => a['Days Until Due'] - b['Days Until Due']);
}

// ── Report 9: Parts Usage ─────────────────────────────────────────────────────
function makeReport9() {
  return PARTS.map(p => {
    const used    = rnd(5, 85);
    const onHand  = rnd(0, 40);
    const reorder = rnd(5, 15);
    const unitCost = rndF(8, 320);
    return {
      'Company Code':    'ALL',
      'Part #':          p.no,
      'Description':     p.desc,
      'Category':        p.cat,
      'Qty Used (QTR)':  used,
      'Qty On Hand':     onHand,
      'Reorder Point':   reorder,
      'Status':          onHand <= 0 ? 'OUT OF STOCK' : onHand <= reorder ? 'REORDER NOW' : 'OK',
      'Unit Cost':       unitCost,
      'Total Cost Used': parseFloat((used * unitCost).toFixed(2)),
      'Avg per WO':      rndF(0.5, 3.5),
    };
  }).sort((a,b) => b['Qty Used (QTR)'] - a['Qty Used (QTR)']);
}

// ── Report 10: Customer Profitability ─────────────────────────────────────────
function makeReport10() {
  return CUSTOMERS.map(cust => {
    const revenue = rndF(15000, 180000);
    const cost    = rndF(revenue * 0.45, revenue * 0.75);
    const profit  = revenue - cost;
    const wos     = rnd(8, 65);
    return {
      'Company Code':    cust.code,
      'Customer':         cust.name,
      'City':             pick(CITIES),
      'Customer Type':    pick(['Commercial','Industrial','Residential','Government']),
      'WOs Completed':    wos,
      'Contracts':        rnd(0, 8),
      'YTD Revenue':      parseFloat(revenue.toFixed(2)),
      'YTD Direct Cost':  parseFloat(cost.toFixed(2)),
      'Gross Profit':     parseFloat(profit.toFixed(2)),
      'Margin %':         parseFloat((profit / revenue * 100).toFixed(1)),
      'Avg WO Value':     parseFloat((revenue / wos).toFixed(2)),
    };
  }).sort((a,b) => b['YTD Revenue'] - a['YTD Revenue']);
}

// ── Report definitions (with dateField for mock filtering) ────────────────────
function buildReports(filters) {
  const applyFilters = (rows, dateField = null) =>
    filterRows(rows, filters, { companyCodeField: 'Company Code', dateField });

  return [
    {
      id: 1, title: 'Open Work Orders by Status',
      description: 'All open service orders grouped by status and priority, with customer and assigned technician.',
      columns: ['WO Number','Customer','Address','Status','Priority','Service Type','Assigned Tech','Scheduled Date','Days Open','Est. Revenue'],
      rows: applyFilters(makeReport1(), 'Scheduled Date'),
    },
    {
      id: 2, title: 'Accounts Receivable Aging',
      description: 'Outstanding invoices bucketed into Current, 1-30, 31-60, 61-90, and 90+ day aging columns.',
      columns: ['Customer','Invoice #','Invoice Date','Due Date','Total','Current','1-30 Days','31-60 Days','61-90 Days','90+ Days'],
      rows: applyFilters(makeReport2(), 'Invoice Date'),
    },
    {
      id: 3, title: 'Service Contract Renewal Pipeline',
      description: 'Active service contracts expiring within the selected date range (default: next 90 days).',
      columns: ['Customer','Contract #','Contract Type','Equipment Covered','Start Date','Expiry Date','Days Until Expiry','Annual Value','Auto-Renew'],
      rows: applyFilters(makeReport3(), 'Expiry Date'),
    },
    {
      id: 4, title: 'Equipment Service History',
      description: 'Full service history per equipment unit — great for warranty tracking and failure patterns.',
      columns: ['Customer','Equipment ID','Equipment Type','Make / Model','Serial #','Install Date','Service Date','WO Number','Service Type','Tech','Labour Hrs','Parts Cost','Total Cost'],
      rows: applyFilters(makeReport4(), 'Service Date'),
    },
    {
      id: 5, title: 'Technician Productivity Report',
      description: 'Work orders completed, billable hours, and revenue per technician. Default: current month.',
      columns: ['Technician','Trade','WOs Completed','Billable Hrs','Avg Hrs/WO','Labour Revenue','Parts Revenue','Total Revenue','Callback Rate %'],
      rows: applyFilters(makeReport5()),
    },
    {
      id: 6, title: 'Job Cost vs. Budget',
      description: 'Actual vs. budgeted cost breakdown per construction job — flags over-budget items.',
      columns: ['Job #','Job Name','Customer','PM','Start Date','Budget Labour','Actual Labour','Budget Materials','Actual Materials','Budget Total','Actual Total','Variance $','Variance %'],
      rows: applyFilters(makeReport6(), 'Start Date'),
    },
    {
      id: 7, title: 'Monthly Revenue by Customer (12 Months)',
      description: 'Pivot of invoiced revenue per customer for each month. Default: current calendar year.',
      columns: ['Customer','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','YTD Total'],
      rows: applyFilters(makeReport7()),
    },
    {
      id: 8, title: 'Preventive Maintenance Schedule',
      description: 'PM visits due within the selected date range. Default: next 60 days plus overdue.',
      columns: ['Due Date','Days Until Due','Customer','Equipment','Serial #','PM Type','Frequency','Last Completed','Assigned Tech','Contract #'],
      rows: applyFilters(makeReport8(), 'Due Date'),
    },
    {
      id: 9, title: 'Parts Usage & Inventory Report',
      description: 'Top parts consumed in service calls this quarter, with current stock levels and reorder alerts.',
      columns: ['Part #','Description','Category','Qty Used (QTR)','Qty On Hand','Reorder Point','Status','Unit Cost','Total Cost Used','Avg per WO'],
      rows: applyFilters(makeReport9()),
    },
    {
      id: 10, title: 'Customer Profitability Summary',
      description: 'Revenue, direct cost, and gross margin per customer. Default: current year-to-date.',
      columns: ['Customer','City','Customer Type','WOs Completed','Contracts','YTD Revenue','YTD Direct Cost','Gross Profit','Margin %','Avg WO Value'],
      rows: applyFilters(makeReport10()),
    },
  ];
}

// ── Run ───────────────────────────────────────────────────────────────────────
async function run() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   Jonas Construction & HVAC — Sample Report Generator    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  const filters = await promptFilters();

  const reports = buildReports(filters);

  // Print row counts after filtering
  reports.forEach(r => {
    console.log(`  Report ${String(r.id).padStart(2,'0')}: ${r.title.padEnd(40)} ${r.rows.length} rows`);
  });

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  const filePath  = path.join(OUTPUT_DIR, `Jonas_Sample_Reports_${timestamp}.xlsx`);

  console.log('\nBuilding Excel workbook...');
  const wb = buildWorkbook(reports, filters);
  await saveWorkbook(wb, filePath);

  console.log(`\n✓ Saved: ${filePath}\n`);
}

run().catch(err => { console.error(err); process.exit(1); });
