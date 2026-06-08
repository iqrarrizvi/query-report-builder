/**
 * Excel workbook builder — creates a polished, branded xlsx file.
 * Used by both report-generator.js (live DB data) and sample-report.js (mock data).
 */

const ExcelJS = require('exceljs');
const { COMPANY } = require('./config');
const { describeFilters } = require('./filters');

const CURRENCY_FMT = '"$"#,##0.00';
const PCT_FMT      = '0.0"%"';
const NUM_FMT      = '#,##0';
const DATE_FMT     = 'mm/dd/yyyy';

// Columns that should render as currency
const CURRENCY_KEYWORDS = [
  'revenue','cost','value','profit','total','labour','materials',
  'balance','amount','invoice','margin','budget','actual','variance',
  'jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec',
  'ytd','est.','avg wo',
];
const PCT_KEYWORDS    = ['%', 'rate', 'margin %', 'variance %', 'callback rate %'];
const NUMBER_KEYWORDS = ['qty', 'hrs', 'count', 'days', 'hours', 'wos', 'contracts'];

function detectFormat(colName) {
  const lc = colName.toLowerCase();
  if (PCT_KEYWORDS.some(k => lc.includes(k))) return PCT_FMT;
  if (CURRENCY_KEYWORDS.some(k => lc.includes(k))) return CURRENCY_FMT;
  if (NUMBER_KEYWORDS.some(k => lc.includes(k))) return NUM_FMT;
  return null;
}

function rgbFill(hexColor) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hexColor } };
}

// buildWorkbook accepts an optional filters object (from filters.js) to display
// the active filter criteria on the cover sheet and each report's subtitle row.
function buildWorkbook(reports, filters = null) {
  const wb = new ExcelJS.Workbook();
  wb.creator   = 'Jonas Construction Reports';
  wb.created   = new Date();
  wb.modified  = new Date();

  const filterSummary = filters ? describeFilters(filters) : 'No filters — showing all data';

  // ── Cover / Index Sheet ──────────────────────────────────────────────────
  const cover = wb.addWorksheet('📋 Report Index', { tabColor: { argb: 'FF' + COMPANY.primaryColor } });
  cover.views = [{ showGridLines: false }];

  cover.mergeCells('B2:J2');
  const titleCell = cover.getCell('B2');
  titleCell.value = COMPANY.reportTitle;
  titleCell.font  = { bold: true, size: 22, color: { argb: 'FF' + COMPANY.primaryColor } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  cover.getRow(2).height = 40;

  cover.mergeCells('B3:J3');
  const subCell = cover.getCell('B3');
  subCell.value = `Generated: ${new Date().toLocaleString()}`;
  subCell.font  = { italic: true, size: 11, color: { argb: 'FF555555' } };
  subCell.alignment = { horizontal: 'center' };

  // ── Filter banner on cover ──
  cover.mergeCells('B4:J4');
  const filterCell = cover.getCell('B4');
  const hasFilters = filters && (filters.companyCode || filters.customerSearch || filters.dateFrom || filters.dateTo);
  filterCell.value = `🔍 Filters: ${filterSummary}`;
  filterCell.font  = { bold: hasFilters, size: 11,
    color: { argb: hasFilters ? 'FF0D4A73' : 'FF888888' } };
  filterCell.fill  = rgbFill(hasFilters ? 'E8F4FD' : 'F5F5F5');
  filterCell.alignment = { horizontal: 'center', vertical: 'middle' };
  filterCell.border = { bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } } };
  cover.getRow(4).height = 20;

  // Header row for index table — shift down one row to accommodate filter banner
  const idxHeaders = ['#', 'Report Name', 'Description', 'Rows Returned'];
  const hRow = cover.getRow(6);
  idxHeaders.forEach((h, i) => {
    const cell = hRow.getCell(i + 2);
    cell.value = h;
    cell.font  = { bold: true, color: { argb: 'FF' + COMPANY.headerText } };
    cell.fill  = rgbFill(COMPANY.primaryColor);
    cell.border = borderAll();
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  hRow.height = 22;

  reports.forEach((r, idx) => {
    const row = cover.getRow(7 + idx);
    const vals = [r.id, r.title, r.description, r.rows ? r.rows.length : 'ERROR'];
    vals.forEach((v, i) => {
      const cell = row.getCell(i + 2);
      cell.value = v;
      cell.border = borderAll();
      cell.fill   = idx % 2 === 0 ? rgbFill('FFFFFF') : rgbFill(COMPANY.altRowColor);
      if (i === 0) cell.font = { bold: true };
      if (i === 3) cell.alignment = { horizontal: 'center' };
    });
    row.height = 18;
  });

  cover.getColumn(2).width = 5;
  cover.getColumn(3).width = 38;
  cover.getColumn(4).width = 65;
  cover.getColumn(5).width = 16;

  // ── One sheet per report ─────────────────────────────────────────────────
  // Row layout per sheet:
  //   1 — Report title (dark blue banner)
  //   2 — Description  (medium blue banner)
  //   3 — Active filters (light blue bar)
  //   4 — Column headers (frozen; auto-filter attached here)
  //   5+ — Data rows
  //   last — TOTAL row
  reports.forEach(report => {
    const safeTitle  = report.title.replace(/[\\\/\*\?\[\]:]/g, '').slice(0, 31);
    const colCount   = Math.max((report.columns || []).length, 2);
    const hasFilters = filters && (filters.companyCode || filters.customerSearch || filters.dateFrom || filters.dateTo);

    const ws = wb.addWorksheet(safeTitle, {
      tabColor: { argb: 'FF' + COMPANY.accentColor },
      views: [{ state: 'frozen', xSplit: 0, ySplit: 4, showGridLines: true }],
    });

    // Row 1 — title
    ws.mergeCells(1, 1, 1, colCount);
    const titleCell = ws.getCell('A1');
    titleCell.value = `Report ${String(report.id).padStart(2,'0')}: ${report.title}`;
    titleCell.font  = { bold: true, size: 14, color: { argb: 'FF' + COMPANY.headerText } };
    titleCell.fill  = rgbFill(COMPANY.primaryColor);
    titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(1).height = 28;

    // Row 2 — description
    ws.mergeCells(2, 1, 2, colCount);
    const descCell = ws.getCell('A2');
    descCell.value = report.error ? `⚠ Query skipped: ${report.error}` : report.description;
    descCell.font  = { italic: true, size: 10, color: { argb: 'FF' + COMPANY.headerText } };
    descCell.fill  = rgbFill(COMPANY.accentColor);
    descCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(2).height = 18;

    // Row 3 — active filters
    ws.mergeCells(3, 1, 3, colCount);
    const fCell = ws.getCell('A3');
    fCell.value = `🔍 ${filterSummary}`;
    fCell.font  = { size: 9, italic: !hasFilters, bold: hasFilters,
                    color: { argb: hasFilters ? 'FF0D4A73' : 'FF888888' } };
    fCell.fill  = rgbFill(hasFilters ? 'E8F4FD' : 'F9F9F9');
    fCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    fCell.border = { bottom: { style: 'thin', color: { argb: 'FFBBBBBB' } } };
    ws.getRow(3).height = 15;

    if (!report.columns || report.columns.length === 0) return;

    // Row 4 — column headers
    const headerRow = ws.getRow(4);
    headerRow.height = 20;
    report.columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col;
      cell.font  = { bold: true, color: { argb: 'FF' + COMPANY.headerText }, size: 10 };
      cell.fill  = rgbFill(COMPANY.primaryColor);
      cell.border = borderAll();
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
    });

    // Rows 5+ — data
    const DATA_START = 5;
    const rows = report.rows || [];
    rows.forEach((dataRow, ri) => {
      const exRow = ws.getRow(ri + DATA_START);
      const isAlt = ri % 2 !== 0;
      report.columns.forEach((col, ci) => {
        const cell = exRow.getCell(ci + 1);
        const raw  = dataRow[col];
        cell.value = raw !== undefined && raw !== null ? raw : '';
        cell.border = borderAll();
        cell.fill   = isAlt ? rgbFill(COMPANY.altRowColor) : rgbFill('FFFFFF');
        cell.alignment = { vertical: 'middle' };

        const fmt = detectFormat(col);
        if (fmt && typeof raw === 'number') {
          cell.numFmt = fmt;
          cell.alignment.horizontal = 'right';
        }
      });
      exRow.height = 16;
    });

    // Conditional formatting: highlight overdue / out-of-stock
    const statusColIdx = report.columns.findIndex(c =>
      ['Status','Days Until Expiry','Days Until Due'].includes(c));
    if (statusColIdx >= 0) {
      const colLetter = columnLetter(statusColIdx + 1);
      const lastRow   = Math.max(rows.length + DATA_START - 1, DATA_START);
      ws.addConditionalFormatting({
        ref: `${colLetter}${DATA_START}:${colLetter}${lastRow}`,
        rules: [
          {
            type: 'containsText', operator: 'containsText', text: 'OUT OF STOCK',
            style: { font: { bold: true, color: { argb: 'FFCC0000' } }, fill: rgbFill('FFE5E5') },
          },
          {
            type: 'containsText', operator: 'containsText', text: 'REORDER',
            style: { font: { bold: true, color: { argb: 'FF8B4000' } }, fill: rgbFill('FFF3CC') },
          },
        ],
      });
    }

    // Auto-size columns
    report.columns.forEach((col, i) => {
      const colObj = ws.getColumn(i + 1);
      const maxLen = rows.reduce((mx, r) => {
        const v = r[col];
        return Math.max(mx, v !== null && v !== undefined ? String(v).length : 0);
      }, col.length);
      colObj.width = Math.min(Math.max(maxLen + 2, 10), 40);
    });

    // Totals row for numeric columns
    const numericCols = report.columns
      .map((col, i) => ({ col, i, fmt: detectFormat(col) }))
      .filter(x => x.fmt === CURRENCY_FMT || x.fmt === NUM_FMT);

    if (rows.length > 1 && numericCols.length > 0) {
      const dataEnd  = rows.length + DATA_START - 1;
      const totalRow = ws.getRow(dataEnd + 1);
      totalRow.height = 18;

      numericCols.forEach(({ i, fmt }) => {
        const colLet = columnLetter(i + 1);
        const cell   = totalRow.getCell(i + 1);
        cell.value   = { formula: `SUM(${colLet}${DATA_START}:${colLet}${dataEnd})` };
        cell.numFmt  = fmt;
        cell.font    = { bold: true, color: { argb: 'FF' + COMPANY.headerText } };
        cell.fill    = rgbFill(COMPANY.primaryColor);
        cell.border  = borderAll();
        cell.alignment = { horizontal: 'right' };
      });

      // Label + fill remaining cells
      const labelCell = totalRow.getCell(1);
      if (!labelCell.value) labelCell.value = 'TOTAL';
      report.columns.forEach((_, i) => {
        const cell = totalRow.getCell(i + 1);
        if (!cell.fill || cell.fill.fgColor?.argb === 'FFFFFFFF') {
          cell.fill   = rgbFill(COMPANY.primaryColor);
          cell.border = borderAll();
          if (i === 0) cell.font = { bold: true, color: { argb: 'FF' + COMPANY.headerText } };
        }
      });
    }

    // Auto-filter on header row (row 4)
    ws.autoFilter = {
      from: { row: 4, column: 1 },
      to:   { row: 4, column: report.columns.length },
    };
  });

  return wb;
}

async function saveWorkbook(wb, filePath) {
  await wb.xlsx.writeFile(filePath);
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function borderAll() {
  const s = { style: 'thin', color: { argb: 'FFCCCCCC' } };
  return { top: s, left: s, bottom: s, right: s };
}

function columnLetter(n) {
  let result = '';
  while (n > 0) {
    n--;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

module.exports = { buildWorkbook, saveWorkbook };
