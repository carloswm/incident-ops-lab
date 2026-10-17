'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { createApp } = require('../src/app');

async function withApi(repository, checkDatabase, run) {
  const server = createServer(createApp({ repository, checkDatabase }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { server.close(); await once(server, 'close'); }
}

function memoryRepository() {
  const rows = new Map(); let nextId = 1;
  return {
    async create(data) { const row = { id: nextId++, ...data, created_at: 'now', updated_at: 'now' }; rows.set(row.id, row); return row; },
    async get(id) { return rows.get(id) || null; },
    async list({ limit, status, severity }) { return [...rows.values()].filter(x => (!status || x.status === status) && (!severity || x.severity === severity)).slice(0, limit); },
    async update(id, data) { if (!rows.has(id)) return null; const row = { ...rows.get(id), ...data, updated_at: 'later' }; rows.set(id, row); return row; }
  };
}

test('creates, filters, retrieves, and updates incidents', async () => {
  const repository = memoryRepository();
  await withApi(repository, async () => {}, async base => {
    const created = await fetch(`${base}/api/v1/incidents`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Checkout unavailable', severity: 'critical', owner: 'on-call' }) });
    assert.equal(created.status, 201);
    const item = (await created.json()).data;
    assert.equal(item.status, 'open');
    const list = await fetch(`${base}/api/v1/incidents?severity=critical&limit=1`);
    assert.equal((await list.json()).data.length, 1);
    assert.equal((await (await fetch(`${base}/api/v1/incidents/${item.id}`)).json()).data.title, 'Checkout unavailable');
    const updated = await fetch(`${base}/api/v1/incidents/${item.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'investigating' }) });
    assert.equal((await updated.json()).data.status, 'investigating');
  });
});

test('rejects invalid input and lifecycle transitions', async () => {
  await withApi(memoryRepository(), async () => {}, async base => {
    const invalid = await fetch(`${base}/api/v1/incidents`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'x', severity: 'urgent' }) });
    assert.equal(invalid.status, 400);
    const created = await fetch(`${base}/api/v1/incidents`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Disk full', severity: 'high' }) });
    const id = (await created.json()).data.id;
    const transition = await fetch(`${base}/api/v1/incidents/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'resolved' }) });
    assert.equal(transition.status, 409);
    assert.equal((await transition.json()).error.code, 'invalid_transition');
  });
});

test('live health is independent and readiness reports database failure', async () => {
  await withApi(memoryRepository(), async () => { throw new Error('db down'); }, async base => {
    assert.equal((await fetch(`${base}/health/live`)).status, 200);
    assert.equal((await fetch(`${base}/health/ready`)).status, 500);
  });
});
