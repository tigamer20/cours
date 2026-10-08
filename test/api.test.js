// Tests de bout en bout de l'API (lance un serveur sur une base temporaire avec les données de démo).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ecole-test-'));
const PASSWORD = 'demo12345';
let server;

class Client {
  constructor() {
    this.cookie = '';
  }
  async req(method, url, body, headers = {}) {
    const h = { 'X-Requested-With': 'fetch', ...headers };
    if (this.cookie) h.Cookie = this.cookie;
    let payload = body;
    if (body !== undefined && !(body instanceof Buffer)) {
      h['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(BASE + url, { method, headers: h, body: payload });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const text = await res.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* binary or empty */
    }
    return { status: res.status, data, headers: res.headers };
  }
  get(url) { return this.req('GET', url); }
  post(url, body, headers) { return this.req('POST', url, body, headers); }
  put(url, body) { return this.req('PUT', url, body); }
  patch(url, body) { return this.req('PATCH', url, body); }
  del(url) { return this.req('DELETE', url); }
}

async function login(email) {
  const c = new Client();
  const r = await c.post('/api/login', { email, password: PASSWORD });
  assert.equal(r.status, 200, `connexion ${email}`);
  return c;
}

let admin, prof, otherProf, student, outsider;

before(async () => {
  server = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR, NODE_ENV: 'test', SEED_DEMO: 'true' },
    stdio: 'pipe',
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  admin = await login('admin@ecole.test');
  prof = await login('prof.tremblay@ecole.test'); // cours 1 et 3
  otherProf = await login('prof.roy@ecole.test'); // cours 2
  student = await login('etudiant@ecole.test'); // cours 1, 2, 3
  outsider = await login('c.lavoie@ecole.test'); // cours 1, 2 (pas 3)
});

after(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise((r) => server.once('exit', r));
    server.kill();
    await exited;
  }
  // Windows may keep the SQLite file locked for a moment after the process exits.
  fs.rmSync(DATA_DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

test('authentification requise et mauvais mot de passe refusé', async () => {
  assert.equal((await new Client().get('/api/courses')).status, 401);
  assert.equal((await new Client().post('/api/login', { email: 'admin@ecole.test', password: 'mauvais' })).status, 401);
});

test('les requêtes sans en-tête X-Requested-With sont refusées (CSRF)', async () => {
  const r = await fetch(`${BASE}/api/logout`, { method: 'POST', headers: { Cookie: admin.cookie } });
  assert.equal(r.status, 403);
});

test('chaque rôle ne voit que ses cours', async () => {
  assert.equal((await admin.get('/api/courses')).data.length, 3);
  assert.deepEqual((await prof.get('/api/courses')).data.map((c) => c.id).sort(), [1, 3]);
  assert.deepEqual((await outsider.get('/api/courses')).data.map((c) => c.id).sort(), [1, 2]);
  assert.equal((await outsider.get('/api/courses/3')).status, 403);
  assert.equal((await otherProf.get('/api/courses/1/students')).status, 403);
});

test('seul un admin crée des comptes, de tous les rôles', async () => {
  assert.equal((await prof.post('/api/users', { email: 'x@ecole.test', password: 'motdepasse', role: 'etudiant', first_name: 'X', last_name: 'Y' })).status, 403);
  for (const role of ['etudiant', 'enseignant', 'admin']) {
    const r = await admin.post('/api/users', { email: `nouveau-${role}@ecole.test`, password: 'motdepasse1', role, first_name: 'Nouveau', last_name: role });
    assert.equal(r.status, 200, role);
    assert.equal(r.data.role, role);
    assert.equal(r.data.password_hash, undefined, 'le hash ne doit jamais sortir');
  }
  assert.equal((await admin.post('/api/users', { email: 'nouveau-admin@ecole.test', password: 'motdepasse1', role: 'admin', first_name: 'A', last_name: 'B' })).status, 409);
});

test('un compte désactivé ne peut plus se connecter', async () => {
  const created = await admin.post('/api/users', { email: 'desactive@ecole.test', password: 'motdepasse1', role: 'etudiant', first_name: 'D', last_name: 'E' });
  await admin.patch(`/api/users/${created.data.id}`, { active: false });
  const r = await new Client().post('/api/login', { email: 'desactive@ecole.test', password: 'motdepasse1' });
  assert.equal(r.status, 403);
});

test('plan d’évaluation, remise, correction et publication des notes', async () => {
  const ev = await prof.post('/api/courses/3/evaluations', {
    title: 'Test remise', kind: 'travail', weight: 10, max_score: 20, due_at: new Date(Date.now() + 86400_000).toISOString(),
    accepts_submissions: true, grades_published: false,
  });
  assert.equal(ev.status, 200);
  assert.equal((await otherProf.post('/api/courses/3/evaluations', { title: 'x', weight: 1 })).status, 403);
  assert.equal((await student.post('/api/courses/3/evaluations', { title: 'x', weight: 1 })).status, 403);

  const up = await student.post(`/api/evaluations/${ev.data.id}/submissions?comment=ok`, Buffer.from('mon travail'), {
    'X-File-Name': encodeURIComponent('travail.txt'),
    'Content-Type': 'application/octet-stream',
  });
  assert.equal(up.status, 200);
  assert.equal((await outsider.post(`/api/evaluations/${ev.data.id}/submissions`, Buffer.from('x'), { 'X-File-Name': 'x.txt' })).status, 403);

  // Le fichier remis : l'étudiant et l'enseignant oui, un autre étudiant non.
  assert.equal((await student.get(`/api/submissions/${up.data.id}/file`)).status, 200);
  assert.equal((await prof.get(`/api/submissions/${up.data.id}/file`)).status, 200);
  assert.equal((await outsider.get(`/api/submissions/${up.data.id}/file`)).status, 403);

  const studentId = (await student.get('/api/me')).data.id;
  assert.equal((await prof.put(`/api/evaluations/${ev.data.id}/grades`, { grades: [{ student_id: studentId, score: 25 }] })).status, 400, 'note > max');
  assert.equal((await prof.put(`/api/evaluations/${ev.data.id}/grades`, { grades: [{ student_id: studentId, score: 18, comment: 'Bien' }] })).status, 200);

  let mine = (await student.get('/api/courses/3/evaluations')).data.find((e) => e.id === ev.data.id);
  assert.equal(mine.my_score, null, 'note cachée tant que non publiée');
  await prof.patch(`/api/evaluations/${ev.data.id}`, { grades_published: true });
  mine = (await student.get('/api/courses/3/evaluations')).data.find((e) => e.id === ev.data.id);
  assert.equal(mine.my_score, 18);
  assert.equal(mine.my_comment, 'Bien');
});

test('documents : consultation suivie par l’enseignant', async () => {
  const docs = (await student.get('/api/courses/1/documents')).data;
  const doc = docs.find((d) => d.title === 'Énoncé — Lab 3');
  assert.equal(doc.first_viewed_at, null);
  const file = await student.get(`/api/documents/${doc.id}/file?mode=view`);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'application/pdf');
  assert.match(file.headers.get('content-disposition'), /^inline/);
  const views = (await prof.get(`/api/documents/${doc.id}/views`)).data;
  const me = (await student.get('/api/me')).data;
  assert.ok(views.find((v) => v.id === me.id).first_viewed_at);
  assert.equal((await student.get(`/api/documents/${doc.id}/views`)).status, 403);
});

test('les fichiers non sûrs sont toujours téléchargés, jamais affichés', async () => {
  const up = await prof.post('/api/courses/1/documents?title=html', Buffer.from('<script>alert(1)</script>'), { 'X-File-Name': 'page.html' });
  assert.equal(up.status, 200);
  const file = await student.get(`/api/documents/${up.data.id}/file?mode=view`);
  assert.match(file.headers.get('content-disposition'), /^attachment/);
  assert.equal(file.headers.get('content-type'), 'application/octet-stream');
});

test('présences et dossier étudiant', async () => {
  const me = (await student.get('/api/me')).data;
  const date = '2026-09-01';
  assert.equal((await prof.put('/api/courses/3/attendance', { date, records: [{ student_id: me.id, status: 'absent', note: 'malade' }] })).status, 200);
  assert.equal((await otherProf.put('/api/courses/3/attendance', { date, records: [] })).status, 403);
  const own = (await student.get('/api/courses/3/attendance')).data.records;
  assert.ok(own.some((r) => r.date === date && r.status === 'absent'));

  // L'enseignant voit le dossier de ses étudiants, limité à ses cours.
  const dossier = (await prof.get(`/api/students/${me.id}/dossier`)).data;
  assert.deepEqual(dossier.courses.map((c) => c.id).sort(), [1, 3]);
  assert.equal((await outsider.get(`/api/students/${me.id}/dossier`)).status, 403);
  assert.equal((await admin.get(`/api/students/${me.id}/dossier`)).data.courses.length, 3);
});

test('messagerie : destinataires autorisés et envoi au groupe', async () => {
  const me = (await student.get('/api/me')).data;
  const outsiderMe = (await outsider.get('/api/me')).data;
  assert.equal((await student.post('/api/messages', { recipient_ids: [outsiderMe.id], subject: 's', body: 'b' })).status, 403, 'étudiant → étudiant interdit');
  const r = await prof.post('/api/messages', { course_id: 3, subject: 'Rappel', body: 'Examen lundi' });
  assert.equal(r.status, 200);
  assert.equal(r.data.sent, 4);
  const inbox = (await student.get('/api/messages')).data;
  const msg = inbox.find((m) => m.subject === 'Rappel');
  assert.ok(msg);
  assert.equal((await outsider.get(`/api/messages/${msg.id}`)).status, 404);
  assert.equal((await student.get(`/api/messages/${msg.id}`)).data.body, 'Examen lundi');
  assert.ok(me.id);
});

test('calendrier : seuls les enseignants du cours et les admins ajoutent des événements', async () => {
  const at = new Date(Date.now() + 3 * 86400_000).toISOString();
  assert.equal((await student.post('/api/events', { course_id: 1, title: 'x', starts_at: at })).status, 403);
  assert.equal((await otherProf.post('/api/events', { course_id: 1, title: 'x', starts_at: at })).status, 403);
  assert.equal((await prof.post('/api/events', { title: 'global', starts_at: at })).status, 400, 'événement global réservé aux admins');
  assert.equal((await prof.post('/api/events', { course_id: 1, title: 'Révision', starts_at: at })).status, 200);
  const from = new Date().toISOString();
  const to = new Date(Date.now() + 30 * 86400_000).toISOString();
  const items = (await student.get(`/api/calendar?from=${from}&to=${to}`)).data;
  assert.ok(items.some((i) => i.title === 'Révision'));
});

test('journal d’activité réservé aux admins', async () => {
  assert.equal((await prof.get('/api/admin/audit')).status, 403);
  const log = (await admin.get('/api/admin/audit?q=travail%20remis')).data;
  assert.ok(log.length >= 1);
});
