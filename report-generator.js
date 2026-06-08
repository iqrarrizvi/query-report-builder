const REPORTS = require('./reports');

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function run() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   Jonas Reporter                                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // Collect filters first (may prompt user)
  const filters = await promptFilters();

  let pool;
  let targetDb;

  try {
    console.log(`Connecting to database...`);
    pool = await sql.connect(dbConfig);
    console.log('Connected.\n');

    const dbs = await pool.request().query(
      `SELECT name FROM sys.databases WHERE name NOT IN ('master','tempdb','model','msdb') ORDER BY name`
    );
    targetDb = dbs.recordset[0]?.name;
    if (!targetDb) throw new Error('No user databases found on this server.');
    console.log(`Using database: ${targetDb}\n`);

  } catch (err) {
    console.error(`\n  Cannot connect to database: ${err.message}`);
    console.error('  → Check your .env file has the correct DB_SERVER / DB_USER / DB_PASSWORD.');
    console.error('  → To generate a sample Excel with mock data, run:  node sample-report.js\n');
    process.exit(1);
  }

  // Run each report with filters applied
  const results = [];
  for (const report of REPORTS) {
    process.stdout.write(`  Running Report ${report.id.toString().padStart(2,'0')}: ${report.title} ... `);
    try {
      const req = pool.request();
      filters.bindParams(req, sql);
      const rows = await req.query(report.sql(targetDb, filters));
      results.push({ ...report, rows: rows.recordset });
      console.log(`${rows.recordset.length} rows`);
    } catch (err) {
      console.log(`SKIPPED (${err.message.split('\n')[0]})`);
      results.push({ ...report, rows: [], error: err.message });
    }
  }

  await pool.close();

  // Build and save Excel
  console.log('\nBuilding Excel workbook...');
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filePath  = path.join(OUTPUT_DIR, `Jonas_Reports_${timestamp}.xlsx`);

  const wb = buildWorkbook(results, filters);
  await saveWorkbook(wb, filePath);

  console.log(`\n✓ Saved: ${filePath}`);
  console.log('  Open the file to view all 10 reports on separate tabs.\n');
}

run().catch(err => { console.error(err); process.exit(1); });
