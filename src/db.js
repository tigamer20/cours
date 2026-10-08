// Accès à la base de données.
// - En ligne : Turso (libSQL, compatible SQLite) via son API HTTP — DATABASE_URL + DATABASE_TOKEN.
// - En local (développement, tests) : fichier SQLite avec node:sqlite.
// Les deux pilotes exposent la même API asynchrone : one / all / run / batch.
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');
export const CACHE_DIR = path.join(DATA_DIR, 'cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'enseignant', 'etudiant')),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  student_number TEXT,
  program TEXT,
  phone TEXT,
  preferences TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  group_name TEXT NOT NULL DEFAULT '01',
  term TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT,
  document_rules TEXT NOT NULL DEFAULT '{}',
  results_final INTEGER NOT NULL DEFAULT 0,
  results_final_at TEXT,
  teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (code, group_name, term)
);

CREATE TABLE IF NOT EXISTS enrollments (
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (course_id, student_id)
);

CREATE TABLE IF NOT EXISTS schedule_slots (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 7),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  room TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  chunks INTEGER NOT NULL DEFAULT 0,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS file_chunks (
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (file_id, idx)
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  file_id INTEGER NOT NULL REFERENCES files(id),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  publish_at TEXT,
  available_until TEXT,
  allow_download INTEGER NOT NULL DEFAULT 1,
  require_ack INTEGER NOT NULL DEFAULT 0,
  notify INTEGER NOT NULL DEFAULT 0,
  notified_at TEXT,
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'selected')),
  posted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS document_audience (
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, student_id)
);

CREATE TABLE IF NOT EXISTS document_views (
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_viewed_at TEXT,
  last_viewed_at TEXT,
  view_count INTEGER NOT NULL DEFAULT 0,
  downloaded INTEGER NOT NULL DEFAULT 0,
  acknowledged_at TEXT,
  PRIMARY KEY (document_id, student_id)
);

CREATE TABLE IF NOT EXISTS evaluations (
  id INTEGER PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'travail'
    CHECK (kind IN ('examen', 'travail', 'quiz', 'projet', 'laboratoire', 'autre')),
  weight REAL NOT NULL DEFAULT 0,
  max_score REAL NOT NULL DEFAULT 100,
  due_at TEXT,
  description TEXT NOT NULL DEFAULT '',
  accepts_submissions INTEGER NOT NULL DEFAULT 0,
  grades_published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS grades (
  evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score REAL,
  comment TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (evaluation_id, student_id)
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY,
  evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_id INTEGER NOT NULL REFERENCES files(id),
  comment TEXT NOT NULL DEFAULT '',
  submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendance (
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'retard', 'motive')),
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (course_id, student_id, date)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT,
  deleted_by_sender INTEGER NOT NULL DEFAULT 0,
  deleted_by_recipient INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS report_entries (
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  final_grade REAL,
  comment TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (course_id, student_id)
);

CREATE TABLE IF NOT EXISTS report_terms (
  term TEXT PRIMARY KEY,
  published INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  published_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  message TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_submissions_eval ON submissions(evaluation_id, student_id);
CREATE INDEX IF NOT EXISTS idx_documents_course ON documents(course_id);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(starts_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)
`;

// Columns added after the first version, for databases created earlier.
const MIGRATIONS = [
  ['users', 'preferences', "TEXT NOT NULL DEFAULT '{}'"],
  ['courses', 'color', 'TEXT'],
  ['courses', 'document_rules', "TEXT NOT NULL DEFAULT '{}'"],
  ['courses', 'results_final', 'INTEGER NOT NULL DEFAULT 0'],
  ['courses', 'results_final_at', 'TEXT'],
  ['files', 'chunks', 'INTEGER NOT NULL DEFAULT 0'],
  ['documents', 'category', "TEXT NOT NULL DEFAULT ''"],
  ['documents', 'status', "TEXT NOT NULL DEFAULT 'published'"],
  ['documents', 'publish_at', 'TEXT'],
  ['documents', 'available_until', 'TEXT'],
  ['documents', 'allow_download', 'INTEGER NOT NULL DEFAULT 1'],
  ['documents', 'require_ack', 'INTEGER NOT NULL DEFAULT 0'],
  ['documents', 'notify', 'INTEGER NOT NULL DEFAULT 0'],
  ['documents', 'notified_at', 'TEXT'],
  ['documents', 'audience', "TEXT NOT NULL DEFAULT 'all'"],
  ['documents', 'updated_at', 'TEXT'],
  ['document_views', 'acknowledged_at', 'TEXT'],
];

// ---------------------------------------------------------------------------
// Pilote local : node:sqlite (synchrone, enveloppé dans des promesses)
// ---------------------------------------------------------------------------

async function localDriver() {
  const { DatabaseSync } = await import('node:sqlite');
  const file = path.join(DATA_DIR, 'cartable.db');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const norm = (row) => (row ? { ...row } : row);
  const exec = (sql, params) => {
    const stmt = db.prepare(sql);
    if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql)) return { rows: stmt.all(...params).map(norm) };
    const r = stmt.run(...params);
    return { rows: [], lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) };
  };
  return {
    name: `SQLite local (${file})`,
    async all(sql, params) {
      return db.prepare(sql).all(...params).map(norm);
    },
    async run(sql, params) {
      const r = db.prepare(sql).run(...params);
      return { lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const out = statements.map(([sql, params]) => exec(sql, params));
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    async script(sql) {
      db.exec(sql);
    },
  };
}

// ---------------------------------------------------------------------------
// Pilote en ligne : Turso / libSQL, protocole « Hrana over HTTP » v2
// https://docs.turso.tech/sdk/http/reference
// ---------------------------------------------------------------------------

function tursoDriver(url, token) {
  const endpoint = url.replace(/^libsql:\/\//, 'https://').replace(/\/+$/, '') + '/v2/pipeline';

  const toArg = (v) => {
    if (v === null || v === undefined) return { type: 'null' };
    if (typeof v === 'boolean') return { type: 'integer', value: v ? '1' : '0' };
    if (typeof v === 'number') return Number.isInteger(v) ? { type: 'integer', value: String(v) } : { type: 'float', value: v };
    if (typeof v === 'bigint') return { type: 'integer', value: v.toString() };
    if (v instanceof Uint8Array) return { type: 'blob', base64: Buffer.from(v).toString('base64') };
    return { type: 'text', value: String(v) };
  };
  const fromVal = (v) => {
    switch (v.type) {
      case 'null': return null;
      case 'integer': return Number(v.value);
      case 'float': return Number(v.value);
      case 'blob': return Buffer.from(v.base64, 'base64');
      default: return v.value;
    }
  };
  const stmt = (sql, params = []) => ({ sql, args: params.map(toArg) });
  const toResult = (r) => ({
    rows: r.rows.map((row) => Object.fromEntries(r.cols.map((c, i) => [c.name, fromVal(row[i])]))),
    lastInsertRowid: r.last_insert_rowid == null ? null : Number(r.last_insert_rowid),
    changes: r.affected_row_count,
  });

  async function pipeline(requests) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          // Foreign keys are per connection: enable them on every stream so ON DELETE CASCADE works.
          body: JSON.stringify({ requests: [{ type: 'execute', stmt: stmt('PRAGMA foreign_keys = ON') }, ...requests, { type: 'close' }] }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const err = new Error(`Base de données en ligne : HTTP ${res.status} ${text.slice(0, 300)}`);
          if (res.status < 500 && res.status !== 429) err.fatal = true;
          throw err;
        }
        const data = await res.json();
        return data.results.slice(1, -1);
      } catch (err) {
        lastErr = err;
        if (err.fatal) break;
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  const unwrap = (result) => {
    if (result.type === 'error') throw new Error(`SQL : ${result.error.message}`);
    return result.response.result;
  };

  return {
    name: `Turso (${new URL(endpoint).host})`,
    async all(sql, params) {
      const [r] = await pipeline([{ type: 'execute', stmt: stmt(sql, params) }]);
      return toResult(unwrap(r)).rows;
    },
    async run(sql, params) {
      const [r] = await pipeline([{ type: 'execute', stmt: stmt(sql, params) }]);
      const out = toResult(unwrap(r));
      return { lastInsertRowid: out.lastInsertRowid, changes: out.changes };
    },
    /** Atomic: BEGIN, each step only if the previous succeeded, COMMIT — otherwise ROLLBACK. */
    async batch(statements) {
      const n = statements.length;
      const steps = [{ stmt: stmt('BEGIN') }];
      statements.forEach(([sql, params], i) => steps.push({ condition: { type: 'ok', step: i }, stmt: stmt(sql, params) }));
      steps.push({ condition: { type: 'ok', step: n }, stmt: stmt('COMMIT') });
      steps.push({ condition: { type: 'not', cond: { type: 'ok', step: n + 1 } }, stmt: stmt('ROLLBACK') });
      const [r] = await pipeline([{ type: 'batch', batch: { steps } }]);
      if (r.type === 'error') throw new Error(`SQL : ${r.error.message}`);
      const { step_results, step_errors } = r.response.result;
      const err = step_errors.find(Boolean);
      if (err) throw new Error(`SQL : ${err.message}`);
      return step_results.slice(1, n + 1).map(toResult);
    },
    async script(sql) {
      const parts = sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
      const results = await pipeline(parts.map((p) => ({ type: 'execute', stmt: stmt(p) })));
      results.forEach(unwrap);
    },
  };
}

// ---------------------------------------------------------------------------

let driver = null;

export async function openDb() {
  const { DATABASE_URL, DATABASE_TOKEN } = process.env;
  driver = DATABASE_URL ? tursoDriver(DATABASE_URL, DATABASE_TOKEN || '') : await localDriver();
  await driver.script(SCHEMA);
  for (const [table, column, def] of MIGRATIONS) {
    const cols = await driver.all(`PRAGMA table_info(${table})`, []);
    if (!cols.some((c) => c.name === column)) await driver.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`, []);
  }
  return driver.name;
}

export const isRemoteDb = () => Boolean(process.env.DATABASE_URL);

export const all = (sql, ...params) => driver.all(sql, params);
export const one = async (sql, ...params) => (await driver.all(sql, params))[0];
export const run = (sql, ...params) => driver.run(sql, params);
/** Runs [sql, params] pairs atomically (all or nothing). */
export const batch = (statements) => (statements.length ? driver.batch(statements) : Promise.resolve([]));

/** Activity log — never blocks or fails the request that triggered it. */
export function audit(userId, action, details = '') {
  run('INSERT INTO audit_log (user_id, action, details) VALUES (?, ?, ?)', userId ?? null, action, details).catch((err) =>
    console.error('Journal d’activité :', err.message),
  );
}

export async function getSettings() {
  const rows = await all('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
