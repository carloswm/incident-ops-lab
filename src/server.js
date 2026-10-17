'use strict';

const http = require('node:http');
const { createApp } = require('./app');
const { createDatabase } = require('./db');
const { createIncidentRepository } = require('./repositories/incidents');

async function main() {
  const db = await createDatabase(process.env.DATABASE_URL);
  const app = createApp({ repository: createIncidentRepository(db), checkDatabase: () => db.query('SELECT 1') });
  const server = http.createServer(app);
  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ type: 'startup', port })));
  const shutdown = () => server.close(async () => { await db.end(); process.exit(0); });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(error => { console.error(JSON.stringify({ type: 'startup_error', message: error.message })); process.exit(1); });
