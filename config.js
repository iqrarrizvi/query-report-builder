require('dotenv').config();

const dbConfig = {
  server:   process.env.DB_SERVER   || '',
  user:     process.env.DB_USER     || '',
  password: process.env.DB_PASSWORD || '',
  options: {
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 15000,
    requestTimeout: 60000,
  },
  pool: {
    max: 5,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

const OUTPUT_DIR = './output';

const COMPANY = {
  name:        'Jonas Reporter',
  reportTitle: 'Construction & HVAC Service Reports',
  primaryColor: '1F4E79',
  accentColor:  '2E75B6',
  headerText:   'FFFFFF',
  altRowColor:  'D6E4F0',
};

module.exports = { dbConfig, OUTPUT_DIR, COMPANY };
