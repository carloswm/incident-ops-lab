'use strict';

const { HttpError, sendError } = require('./http/errors');
const { validateIncident, validateListQuery } = require('./validation/incidents');

function createApp({ repository, checkDatabase = async () => {} }) {
  return async function handler(req, res) {
    const started = Date.now();
    const url = new URL(req.url, 'http://localhost');
    const log = (status) => console.log(JSON.stringify({ type: 'request', method: req.method, path: url.pathname, status, duration_ms: Date.now() - started }));
    const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); log(status); };
    try {
      if (req.method === 'GET' && url.pathname === '/health/live') return send(200, { status: 'live' });
      if (req.method === 'GET' && url.pathname === '/health/ready') {
        await checkDatabase();
        return send(200, { status: 'ready' });
      }
      const base = '/api/v1/incidents';
      if (req.method === 'POST' && url.pathname === base) {
        const data = validateIncident(await readBody(req), { creating: true });
        return send(201, { data: await repository.create(data) });
      }
      if (req.method === 'GET' && url.pathname === base) {
        return send(200, { data: await repository.list(validateListQuery(url.searchParams)) });
      }
      const match = url.pathname.match(/^\/api\/v1\/incidents\/(\d+)$/);
      if (match && req.method === 'GET') {
        const incident = await repository.get(Number(match[1]));
        if (!incident) throw new HttpError(404, 'not_found', 'Incident not found');
        return send(200, { data: incident });
      }
      if (match && req.method === 'PATCH') {
        const id = Number(match[1]);
        const current = await repository.get(id);
        if (!current) throw new HttpError(404, 'not_found', 'Incident not found');
        const data = validateIncident(await readBody(req), { currentStatus: current.status });
        const incident = await repository.update(id, data);
        if (!incident) throw new HttpError(404, 'not_found', 'Incident not found');
        return send(200, { data: incident });
      }
      throw new HttpError(404, 'not_found', 'Route not found');
    } catch (error) {
      sendError(res, error);
      log(error instanceof HttpError ? error.status : 500);
    }
  };
}

async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 16_384) throw new HttpError(413, 'body_too_large', 'Request body is too large');
  }
  try { return body ? JSON.parse(body) : {}; }
  catch { throw new HttpError(400, 'invalid_json', 'Request body must be valid JSON'); }
}

module.exports = { createApp };
