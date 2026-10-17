'use strict';

const { HttpError } = require('../http/errors');
const severities = ['low', 'medium', 'high', 'critical'];
const statuses = ['open', 'investigating', 'mitigated', 'resolved'];
const transitions = {
  open: ['investigating'],
  investigating: ['mitigated', 'resolved'],
  mitigated: ['investigating', 'resolved'],
  resolved: []
};

function validateIncident(input, { creating = false, currentStatus } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'invalid_body', 'Request body must be an object');
  }
  const value = {};
  if (creating || 'title' in input) {
    if (typeof input.title !== 'string' || input.title.trim().length < 3 || input.title.trim().length > 160) {
      throw new HttpError(400, 'invalid_title', 'Title must contain 3 to 160 characters');
    }
    value.title = input.title.trim();
  }
  if (creating || 'severity' in input) {
    if (!severities.includes(input.severity)) throw new HttpError(400, 'invalid_severity', `Severity must be one of: ${severities.join(', ')}`);
    value.severity = input.severity;
  }
  for (const key of ['description', 'owner']) {
    if (key in input) {
      if (input[key] !== null && typeof input[key] !== 'string') throw new HttpError(400, `invalid_${key}`, `${key} must be a string`);
      if (key === 'description' && input[key]?.length > 4000) throw new HttpError(400, 'invalid_description', 'Description must be at most 4000 characters');
      if (key === 'owner' && input[key]?.length > 120) throw new HttpError(400, 'invalid_owner', 'Owner must be at most 120 characters');
      value[key] = input[key];
    }
  }
  if ('status' in input) {
    if (!statuses.includes(input.status)) throw new HttpError(400, 'invalid_status', `Status must be one of: ${statuses.join(', ')}`);
    if (currentStatus && input.status !== currentStatus && !transitions[currentStatus].includes(input.status)) {
      throw new HttpError(409, 'invalid_transition', `Cannot move incident from ${currentStatus} to ${input.status}`);
    }
    value.status = input.status;
  }
  if (creating) value.status ??= 'open';
  if (Object.keys(value).length === 0) throw new HttpError(400, 'empty_update', 'Provide at least one supported field');
  return value;
}

function validateListQuery(params) {
  const limit = params.has('limit') ? Number(params.get('limit')) : 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, 'invalid_limit', 'limit must be an integer from 1 to 100');
  const status = params.get('status');
  if (status && !statuses.includes(status)) throw new HttpError(400, 'invalid_status', `Status must be one of: ${statuses.join(', ')}`);
  const severity = params.get('severity');
  if (severity && !severities.includes(severity)) throw new HttpError(400, 'invalid_severity', `Severity must be one of: ${severities.join(', ')}`);
  return { limit, status, severity };
}

module.exports = { validateIncident, validateListQuery };
