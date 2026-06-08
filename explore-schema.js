/**
 * Schema explorer — connects to your SQL Server and prints tables/columns
 * relevant to construction and HVAC service reporting.
 * Run: node explore-schema.js
 */

const sql = require('mssql');
const { dbConfig } = require('./config');

const KEYWORDS = [
  'customer', 'client', 'service', 'work.order', 'workorder', 'job', 'contract',
  'invoice', 'billing', 'equipment', 'tech', 'dispatch', 'part', 'inventory',
  'employee', 'schedule', 'maintenance', 'pm', 'receipt', 'payment', 'ar_',
  'quote', 'estimate', 'project', 'vendor',
];

async function exploreSchema() {
  let pool;
  try {
    console.log(`Connecting to ${dbConfig.server}...`);
    pool = await sql.connect(dbConfig);
    console.log('Connected.\n');

    // List all databases
    const dbs = await pool.request().query(`
      SELECT name FROM sys.databases
      WHERE name NOT IN ('master','tempdb','model','msdb')
      ORDER BY name
    `);
    console.log('=== DATABASES ===');
    dbs.recordset.forEach(r => console.log('  ' + r.name));

    // Use the first non-system database, or let user specify
    const targetDb = dbs.recordset[0]?.name;
    if (!targetDb) { console.log('No user databases found.'); return; }

    console.log(`\n=== TABLES IN [${targetDb}] (construction/HVAC relevant) ===`);

    const tables = await pool.request().query(`
      SELECT t.TABLE_SCHEMA, t.TABLE_NAME,
             COUNT(c.COLUMN_NAME) AS column_count
      FROM   [${targetDb}].INFORMATION_SCHEMA.TABLES  t
      JOIN   [${targetDb}].INFORMATION_SCHEMA.COLUMNS c
             ON  c.TABLE_SCHEMA = t.TABLE_SCHEMA
             AND c.TABLE_NAME   = t.TABLE_NAME
      WHERE  t.TABLE_TYPE = 'BASE TABLE'
      GROUP BY t.TABLE_SCHEMA, t.TABLE_NAME
      ORDER BY t.TABLE_NAME
    `);

    const relevant = tables.recordset.filter(t => {
      const name = t.TABLE_NAME.toLowerCase();
      return KEYWORDS.some(k => name.includes(k));
    });

    console.log(`Found ${relevant.length} relevant tables (of ${tables.recordset.length} total):\n`);
    relevant.forEach(t => {
      console.log(`  [${t.TABLE_SCHEMA}].[${t.TABLE_NAME}]  (${t.column_count} cols)`);
    });

    // Print columns for each relevant table
    console.log('\n=== COLUMN DETAILS ===');
    for (const t of relevant.slice(0, 30)) {
      const cols = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
        FROM   [${targetDb}].INFORMATION_SCHEMA.COLUMNS
        WHERE  TABLE_SCHEMA = '${t.TABLE_SCHEMA}'
          AND  TABLE_NAME   = '${t.TABLE_NAME}'
        ORDER BY ORDINAL_POSITION
      `);
      console.log(`\n  ${t.TABLE_SCHEMA}.${t.TABLE_NAME}`);
      cols.recordset.forEach(c => {
        const len = c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : '';
        console.log(`    ${c.COLUMN_NAME.padEnd(35)} ${c.DATA_TYPE}${len}  ${c.IS_NULLABLE === 'YES' ? '' : 'NOT NULL'}`);
      });
    }

  } catch (err) {
    console.error('Error:', err.message);
    console.error('\nTip: Check your .env file has the correct DB_SERVER value and the server is reachable.');
  } finally {
    if (pool) await pool.close();
  }
}

exploreSchema();
