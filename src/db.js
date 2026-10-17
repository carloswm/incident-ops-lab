'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

async function createDatabase(connectionString) {
  let Pool;
  try { ({ Pool } = require('pg')); }
  catch { throw new Error('Database runtime requires pg; install package dependencies before starting the API'); }
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 3000 });
  const migration = await fs.readFile(path.join(__dirname, '..', 'db/migrations/001_incidents.sql'), 'utf8');
  await pool.query(migration);
  return pool;
}

module.exports = { createDatabase };
