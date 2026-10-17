'use strict';

const { HttpError } = require('../http/errors');

function createIncidentRepository(db) {
  return {
    async create(data) {
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(
          `INSERT INTO incidents (title, description, severity, status, owner)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [data.title, data.description || '', data.severity, data.status, data.owner || null]
        );
        const incident = result.rows[0];
        await client.query("INSERT INTO incident_events (incident_id, event_type, to_status) VALUES ($1, 'created', $2)", [incident.id, incident.status]);
        await client.query('COMMIT');
        return incident;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },
    async get(id) {
      const { rows } = await db.query('SELECT * FROM incidents WHERE id = $1', [id]);
      return rows[0] || null;
    },
    async list({ limit, status, severity }) {
      const values = [];
      const conditions = [];
      if (status) { values.push(status); conditions.push(`status = $${values.length}`); }
      if (severity) { values.push(severity); conditions.push(`severity = $${values.length}`); }
      values.push(limit);
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const { rows } = await db.query(`SELECT * FROM incidents ${where} ORDER BY created_at DESC, id DESC LIMIT $${values.length}`, values);
      return rows;
    },
    async update(id, data) {
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const found = await client.query('SELECT * FROM incidents WHERE id = $1 FOR UPDATE', [id]);
        if (!found.rows[0]) { await client.query('ROLLBACK'); return null; }
        const current = found.rows[0];
        if (data.status && data.status !== current.status) {
          const allowed = { open: ['investigating'], investigating: ['mitigated', 'resolved'], mitigated: ['investigating', 'resolved'], resolved: [] };
          if (!allowed[current.status].includes(data.status)) throw new HttpError(409, 'invalid_transition', `Cannot move incident from ${current.status} to ${data.status}`);
        }
        const fields = ['title', 'description', 'severity', 'status', 'owner'].filter(key => key in data);
        const values = fields.map(key => data[key]);
        values.push(id);
        const sets = fields.map((key, index) => `${key} = $${index + 1}`);
        sets.push('updated_at = now()');
        const updated = await client.query(`UPDATE incidents SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
        if (data.status && data.status !== current.status) {
          await client.query("INSERT INTO incident_events (incident_id, event_type, from_status, to_status) VALUES ($1, 'status_changed', $2, $3)", [id, current.status, data.status]);
        }
        await client.query('COMMIT');
        return updated.rows[0];
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    }
  };
}

module.exports = { createIncidentRepository };
