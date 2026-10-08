import { one, all, run, batch, audit, getSettings } from '../db.js';
import { fail, readJson, str, oneOf, clientIp } from '../http.js';
import {
  hashPassword,
  verifyPassword,
  validatePassword,
  createSession,
  destroySession,
  destroyUserSessions,
  checkLoginRate,
  recordLoginFailure,
  clearLoginFailures,
} from '../auth.js';
import { requireRole, isAdmin, isTeacher } from '../access.js';

const ROLES = ['admin', 'enseignant', 'etudiant'];
const PUBLIC_FIELDS =
  'id, email, role, first_name, last_name, student_number, program, phone, active, created_at, last_login_at';
const HEX = /^#[0-9a-f]{6}$/i;

/** Validates user interface preferences; unknown keys are dropped. */
function cleanPreferences(p = {}) {
  const out = {};
  if (['auto', 'light', 'dark'].includes(p.theme)) out.theme = p.theme;
  if (typeof p.accent === 'string' && HEX.test(p.accent)) out.accent = p.accent;
  if (['comfortable', 'compact'].includes(p.density)) out.density = p.density;
  if ([90, 100, 110, 120].includes(Number(p.font_scale))) out.font_scale = Number(p.font_scale);
  if (typeof p.sidebar_collapsed === 'boolean') out.sidebar_collapsed = p.sidebar_collapsed;
  if (typeof p.reduce_motion === 'boolean') out.reduce_motion = p.reduce_motion;
  if (['mesh', 'plain', 'dots'].includes(p.background)) out.background = p.background;
  if (['rounded', 'soft', 'sharp'].includes(p.corners)) out.corners = p.corners;
  return out;
}

export default function register(r) {
  // Public: branding shown on the login page.
  r.get('/api/settings', async () => {
    const s = await getSettings();
    return {
      school_name: s.school_name || '',
      tagline: s.tagline || 'Votre session, au même endroit.',
      accent: s.accent || '#6366f1',
      login_message: s.login_message || '',
    };
  });

  r.put('/api/settings', async ({ req, user }) => {
    requireRole(user, 'admin');
    const b = await readJson(req);
    const values = {
      school_name: str(b.school_name, 'nom de l’établissement', { required: false, max: 120 }),
      tagline: str(b.tagline, 'slogan', { required: false, max: 160 }),
      login_message: str(b.login_message, 'message de connexion', { required: false, max: 500 }),
    };
    if (b.accent !== undefined) {
      if (!HEX.test(b.accent)) fail(400, 'Couleur invalide.');
      values.accent = b.accent;
    }
    for (const [key, value] of Object.entries(values)) {
      await run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, value);
    }
    audit(user.id, 'paramètres de l’établissement modifiés');
    return { ok: true };
  });

  r.post('/api/login', async ({ req, res }) => {
    const body = await readJson(req);
    const email = str(body.email, 'courriel', { max: 200 }).toLowerCase();
    const password = str(body.password, 'mot de passe', { max: 200 });
    const key = `${clientIp(req)}|${email}`;
    checkLoginRate(key);
    const user = await one('SELECT * FROM users WHERE email = ?', email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      recordLoginFailure(key);
      fail(401, 'Courriel ou mot de passe invalide.');
    }
    if (!user.active) fail(403, 'Ce compte est désactivé. Contactez l’administration.');
    clearLoginFailures(key);
    await createSession(res, req, user.id);
    await run("UPDATE users SET last_login_at = datetime('now') WHERE id = ?", user.id);
    audit(user.id, 'connexion');
    return { ok: true };
  });

  r.post('/api/logout', async ({ req, res, user }) => {
    await destroySession(req, res);
    audit(user.id, 'déconnexion');
    return { ok: true };
  });

  r.get('/api/me', ({ user }) => user);

  r.put('/api/me/preferences', async ({ req, user }) => {
    const prefs = cleanPreferences(await readJson(req));
    await run('UPDATE users SET preferences = ? WHERE id = ?', JSON.stringify(prefs), user.id);
    return prefs;
  });

  r.post('/api/me/password', async ({ req, user }) => {
    const body = await readJson(req);
    const row = await one('SELECT password_hash FROM users WHERE id = ?', user.id);
    if (!verifyPassword(String(body.current || ''), row.password_hash)) fail(400, 'Mot de passe actuel invalide.');
    await run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(validatePassword(body.next)), user.id);
    audit(user.id, 'mot de passe modifié');
    return { ok: true };
  });

  // --- Administration des comptes ----------------------------------------

  r.get('/api/users', async ({ user, query }) => {
    requireRole(user, 'admin', 'enseignant');
    const where = [];
    const params = [];
    if (isTeacher(user)) {
      // Teachers only see staff plus their own students.
      where.push(`(role != 'etudiant' OR id IN (
        SELECT e.student_id FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE c.teacher_id = ?))`);
      params.push(user.id);
    }
    if (query.role) {
      where.push('role = ?');
      params.push(query.role);
    }
    if (query.q) {
      where.push("(first_name || ' ' || last_name || ' ' || email || ' ' || COALESCE(student_number, '')) LIKE ?");
      params.push(`%${query.q}%`);
    }
    const sql = `SELECT ${PUBLIC_FIELDS} FROM users ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY role, last_name, first_name`;
    return all(sql, ...params);
  });

  r.post('/api/users', async ({ req, user }) => {
    requireRole(user, 'admin');
    const b = await readJson(req);
    const email = str(b.email, 'courriel', { max: 200 }).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'Courriel invalide.');
    if (await one('SELECT 1 AS ok FROM users WHERE email = ?', email)) fail(409, 'Ce courriel est déjà utilisé.');
    const role = oneOf(b.role, 'rôle', ROLES);
    const { lastInsertRowid } = await run(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, student_number, program, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      email,
      hashPassword(validatePassword(b.password)),
      role,
      str(b.first_name, 'prénom', { max: 100 }),
      str(b.last_name, 'nom', { max: 100 }),
      str(b.student_number, 'numéro étudiant', { required: false, max: 50 }) || null,
      str(b.program, 'programme', { required: false, max: 200 }) || null,
      str(b.phone, 'téléphone', { required: false, max: 50 }) || null,
    );
    audit(user.id, 'compte créé', `${role} ${email}`);
    return one(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`, lastInsertRowid);
  });

  r.patch('/api/users/:id', async ({ req, user, params }) => {
    requireRole(user, 'admin');
    const target = await one('SELECT * FROM users WHERE id = ?', params.id);
    if (!target) fail(404, 'Utilisateur introuvable.');
    const b = await readJson(req);
    const sets = [];
    const vals = [];
    const set = (col, val) => {
      sets.push(`${col} = ?`);
      vals.push(val);
    };
    if (b.email !== undefined) {
      const email = str(b.email, 'courriel', { max: 200 }).toLowerCase();
      if (await one('SELECT 1 AS ok FROM users WHERE email = ? AND id != ?', email, target.id)) fail(409, 'Ce courriel est déjà utilisé.');
      set('email', email);
    }
    if (b.first_name !== undefined) set('first_name', str(b.first_name, 'prénom', { max: 100 }));
    if (b.last_name !== undefined) set('last_name', str(b.last_name, 'nom', { max: 100 }));
    if (b.student_number !== undefined) set('student_number', str(b.student_number, 'numéro', { required: false, max: 50 }) || null);
    if (b.program !== undefined) set('program', str(b.program, 'programme', { required: false, max: 200 }) || null);
    if (b.phone !== undefined) set('phone', str(b.phone, 'téléphone', { required: false, max: 50 }) || null);
    if (b.role !== undefined) {
      if (target.id === user.id && b.role !== 'admin') fail(400, 'Vous ne pouvez pas retirer votre propre rôle d’administrateur.');
      set('role', oneOf(b.role, 'rôle', ROLES));
    }
    if (b.active !== undefined) {
      if (target.id === user.id && !b.active) fail(400, 'Vous ne pouvez pas désactiver votre propre compte.');
      set('active', b.active ? 1 : 0);
    }
    if (b.password) set('password_hash', hashPassword(validatePassword(b.password)));
    if (!sets.length) fail(400, 'Aucune modification.');
    await run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, ...vals, target.id);
    if (b.password || b.active === false || (b.role !== undefined && b.role !== target.role)) await destroyUserSessions(target.id);
    audit(user.id, 'compte modifié', `${target.email} (${Object.keys(b).filter((k) => k !== 'password').join(', ')}${b.password ? ', mot de passe' : ''})`);
    return one(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`, target.id);
  });

  // Permanent deletion, students only: staff accounts are deactivated instead so their
  // courses, grades and documents keep an author. The admin must retype the email.
  r.delete('/api/users/:id', async ({ req, user, params }) => {
    requireRole(user, 'admin');
    const target = await one('SELECT id, email, role, first_name, last_name, student_number FROM users WHERE id = ?', params.id);
    if (!target) fail(404, 'Utilisateur introuvable.');
    if (target.role !== 'etudiant') fail(400, 'Seuls les comptes étudiants peuvent être supprimés. Désactivez plutôt ce compte.');
    const b = await readJson(req);
    if (String(b.confirm_email || '').trim().toLowerCase() !== target.email.toLowerCase()) {
      fail(400, 'Confirmation invalide : retapez le courriel exact de l’étudiant.');
    }
    // Files the student submitted are not referenced by anything else once the account is gone.
    const files = await all('SELECT file_id FROM submissions WHERE student_id = ?', target.id);
    const fileIds = files.map((f) => f.file_id);
    await batch([
      // Grades, submissions, attendance, enrollments, views, messages and sessions follow via ON DELETE CASCADE.
      ['DELETE FROM users WHERE id = ?', [target.id]],
      ...(fileIds.length ? [[`DELETE FROM files WHERE id IN (${fileIds.map(() => '?').join(',')})`, fileIds]] : []),
    ]);
    audit(user.id, 'compte étudiant supprimé', `${target.first_name} ${target.last_name} (${target.email}${target.student_number ? `, ${target.student_number}` : ''})`);
    return { ok: true };
  });

  r.get('/api/contacts', ({ user }) => {
    // People the user is allowed to write to.
    if (isAdmin(user)) {
      return all(`SELECT id, first_name, last_name, role FROM users WHERE active = 1 AND id != ? ORDER BY role, last_name`, user.id);
    }
    if (isTeacher(user)) {
      return all(
        `SELECT id, first_name, last_name, role FROM users
          WHERE active = 1 AND id != ? AND (role != 'etudiant' OR id IN (
            SELECT e.student_id FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE c.teacher_id = ?))
          ORDER BY role, last_name`,
        user.id,
        user.id,
      );
    }
    return all(
      `SELECT id, first_name, last_name, role FROM users
        WHERE active = 1 AND (role = 'admin' OR id IN (
          SELECT c.teacher_id FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.student_id = ?))
        ORDER BY role, last_name`,
      user.id,
    );
  });
}
