// Faux serveur Turso pour les tests : implémente le sous-ensemble de « Hrana over HTTP » v2
// utilisé par src/db.js (execute, batch avec conditions, close), adossé à node:sqlite.
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';

export function startFakeTurso({ token = 'test-token' } = {}) {
  const db = new DatabaseSync(':memory:');

  const fromArg = (a) => {
    switch (a.type) {
      case 'null': return null;
      case 'integer': return BigInt(a.value);
      case 'float': return Number(a.value);
      case 'blob': return Buffer.from(a.base64, 'base64');
      default: return a.value;
    }
  };
  const toVal = (v) => {
    if (v === null || v === undefined) return { type: 'null' };
    if (typeof v === 'bigint') return { type: 'integer', value: v.toString() };
    if (typeof v === 'number') return Number.isInteger(v) ? { type: 'integer', value: String(v) } : { type: 'float', value: v };
    if (v instanceof Uint8Array) return { type: 'blob', base64: Buffer.from(v).toString('base64') };
    return { type: 'text', value: String(v) };
  };

  function execute(stmt) {
    const prepared = db.prepare(stmt.sql);
    const args = (stmt.args || []).map(fromArg);
    if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(stmt.sql)) {
      prepared.setReturnArrays?.(false);
      const rows = prepared.all(...args);
      const cols = rows.length ? Object.keys(rows[0]) : prepared.columns?.().map((c) => c.name) ?? [];
      return { cols: cols.map((name) => ({ name })), rows: rows.map((r) => cols.map((c) => toVal(r[c]))), affected_row_count: 0, last_insert_rowid: null };
    }
    const r = prepared.run(...args);
    return { cols: [], rows: [], affected_row_count: Number(r.changes), last_insert_rowid: String(r.lastInsertRowid) };
  }

  function evalCond(cond, results, errors) {
    if (!cond) return true;
    if (cond.type === 'ok') return results[cond.step] != null;
    if (cond.type === 'error') return errors[cond.step] != null;
    if (cond.type === 'not') return !evalCond(cond.cond, results, errors);
    if (cond.type === 'and') return cond.conds.every((c) => evalCond(c, results, errors));
    if (cond.type === 'or') return cond.conds.some((c) => evalCond(c, results, errors));
    throw new Error('condition inconnue');
  }

  const server = http.createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401).end('unauthorized');
      return;
    }
    if (req.method !== 'POST' || req.url !== '/v2/pipeline') {
      res.writeHead(404).end();
      return;
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const results = body.requests.map((r) => {
        try {
          if (r.type === 'close') return { type: 'ok', response: { type: 'close' } };
          if (r.type === 'execute') return { type: 'ok', response: { type: 'execute', result: execute(r.stmt) } };
          if (r.type === 'batch') {
            const stepResults = [];
            const stepErrors = [];
            r.batch.steps.forEach((step, i) => {
              stepResults[i] = null;
              stepErrors[i] = null;
              if (!evalCond(step.condition, stepResults, stepErrors)) return;
              try {
                stepResults[i] = execute(step.stmt);
              } catch (err) {
                stepErrors[i] = { message: err.message };
              }
            });
            return { type: 'ok', response: { type: 'batch', result: { step_results: stepResults, step_errors: stepErrors } } };
          }
          throw new Error(`type de requête inconnu : ${r.type}`);
        } catch (err) {
          return { type: 'error', error: { message: err.message } };
        }
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ baton: null, base_url: null, results }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}`, token, close: () => server.close() });
    });
  });
}
