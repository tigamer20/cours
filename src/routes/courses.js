import { one, all, run, audit, transaction } from '../db.js';
import { fail, readJson, str, num, time } from '../http.js';
import {
  requireRole,
  requireCourseAccess,
  requireCourseManager,
  canManageCourse,
  visibleCourseIds,
  inList,
  isAdmin,
  isStudent,
} from '../access.js';

const COURSE_SELECT = `
  SELECT c.*, t.first_name AS teacher_first_name, t.last_name AS teacher_last_name, t.email AS teacher_email,
         (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS student_count
    FROM courses c LEFT JOIN users t ON t.id = c.teacher_id`;

function validTeacher(id) {
  if (id === null || id === undefined || id === '') return null;
  const t = one("SELECT id FROM users WHERE id = ? AND role = 'enseignant'", Number(id));
  if (!t) fail(400, 'Enseignant invalide.');
  return t.id;
}

export default function register(r) {
  r.get('/api/courses', ({ user }) => {
    const ids = visibleCourseIds(user);
    if (ids === null) return all(`${COURSE_SELECT} ORDER BY c.term DESC, c.code, c.group_name`);
    return all(`${COURSE_SELECT} WHERE c.id IN (${inList(ids)}) ORDER BY c.code, c.group_name`, ...ids);
  });

  r.post('/api/courses', async ({ req, user }) => {
    requireRole(user, 'admin');
    const b = await readJson(req);
    const code = str(b.code, 'code', { max: 30 });
    const group = str(b.group_name, 'groupe', { required: false, max: 20 }) || '01';
    const term = str(b.term, 'session', { max: 30 });
    if (one('SELECT 1 FROM courses WHERE code = ? AND group_name = ? AND term = ?', code, group, term)) {
      fail(409, 'Ce cours existe déjà pour ce groupe et cette session.');
    }
    const { lastInsertRowid } = run(
      'INSERT INTO courses (code, name, group_name, term, description, teacher_id) VALUES (?, ?, ?, ?, ?, ?)',
      code,
      str(b.name, 'nom', { max: 200 }),
      group,
      term,
      str(b.description, 'description', { required: false }),
      validTeacher(b.teacher_id),
    );
    audit(user.id, 'cours créé', `${code}-${group} ${term}`);
    return one(`${COURSE_SELECT} WHERE c.id = ?`, lastInsertRowid);
  });

  r.get('/api/courses/:id', ({ user, params }) => {
    const course = requireCourseAccess(user, params.id);
    return {
      ...one(`${COURSE_SELECT} WHERE c.id = ?`, course.id),
      can_manage: canManageCourse(user, course),
      schedule: all('SELECT * FROM schedule_slots WHERE course_id = ? ORDER BY day, start_time', course.id),
    };
  });

  r.patch('/api/courses/:id', async ({ req, user, params }) => {
    const course = requireCourseManager(user, params.id);
    const b = await readJson(req);
    const sets = [];
    const vals = [];
    if (b.description !== undefined) {
      sets.push('description = ?');
      vals.push(str(b.description, 'description', { required: false }));
    }
    // Structural fields are reserved for admins.
    if (isAdmin(user)) {
      for (const [field, label, max] of [['code', 'code', 30], ['name', 'nom', 200], ['group_name', 'groupe', 20], ['term', 'session', 30]]) {
        if (b[field] !== undefined) {
          sets.push(`${field} = ?`);
          vals.push(str(b[field], label, { max }));
        }
      }
      if (b.teacher_id !== undefined) {
        sets.push('teacher_id = ?');
        vals.push(validTeacher(b.teacher_id));
      }
    }
    if (!sets.length) fail(400, 'Aucune modification.');
    run(`UPDATE courses SET ${sets.join(', ')} WHERE id = ?`, ...vals, course.id);
    audit(user.id, 'cours modifié', `${course.code}-${course.group_name}`);
    return one(`${COURSE_SELECT} WHERE c.id = ?`, course.id);
  });

  r.delete('/api/courses/:id', ({ user, params }) => {
    requireRole(user, 'admin');
    const course = requireCourseManager(user, params.id);
    run('DELETE FROM courses WHERE id = ?', course.id);
    audit(user.id, 'cours supprimé', `${course.code}-${course.group_name} ${course.term}`);
    return { ok: true };
  });

  // --- Étudiants inscrits ---------------------------------------------------

  r.get('/api/courses/:id/students', ({ user, params }) => {
    const course = requireCourseManager(user, params.id);
    return all(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.student_number, u.program, u.active,
              (SELECT COUNT(*) FROM attendance a WHERE a.course_id = ? AND a.student_id = u.id AND a.status = 'absent') AS absences
         FROM enrollments e JOIN users u ON u.id = e.student_id
        WHERE e.course_id = ? ORDER BY u.last_name, u.first_name`,
      course.id,
      course.id,
    );
  });

  r.post('/api/courses/:id/students', async ({ req, user, params }) => {
    requireRole(user, 'admin');
    const course = requireCourseManager(user, params.id);
    const b = await readJson(req);
    const ids = Array.isArray(b.student_ids) ? b.student_ids.map(Number) : [num(b.student_id, 'étudiant')];
    transaction(() => {
      for (const id of ids) {
        if (!one("SELECT 1 FROM users WHERE id = ? AND role = 'etudiant'", id)) fail(400, 'Étudiant invalide.');
        run('INSERT OR IGNORE INTO enrollments (course_id, student_id) VALUES (?, ?)', course.id, id);
      }
    });
    audit(user.id, 'inscription', `${ids.length} étudiant(s) → ${course.code}-${course.group_name}`);
    return { ok: true };
  });

  r.delete('/api/courses/:id/students/:sid', ({ user, params }) => {
    requireRole(user, 'admin');
    const course = requireCourseManager(user, params.id);
    run('DELETE FROM enrollments WHERE course_id = ? AND student_id = ?', course.id, params.sid);
    audit(user.id, 'désinscription', `étudiant #${params.sid} ← ${course.code}-${course.group_name}`);
    return { ok: true };
  });

  // --- Horaire ----------------------------------------------------------------

  r.post('/api/courses/:id/schedule', async ({ req, user, params }) => {
    const course = requireCourseManager(user, params.id);
    const b = await readJson(req);
    const start = time(b.start_time, 'début');
    const end = time(b.end_time, 'fin');
    if (end <= start) fail(400, 'L’heure de fin doit être après le début.');
    const { lastInsertRowid } = run(
      'INSERT INTO schedule_slots (course_id, day, start_time, end_time, room) VALUES (?, ?, ?, ?, ?)',
      course.id,
      num(b.day, 'jour', { min: 1, max: 7 }),
      start,
      end,
      str(b.room, 'local', { required: false, max: 50 }),
    );
    audit(user.id, 'horaire modifié', `${course.code}-${course.group_name}`);
    return one('SELECT * FROM schedule_slots WHERE id = ?', lastInsertRowid);
  });

  r.delete('/api/schedule/:id', ({ user, params }) => {
    const slot = one('SELECT * FROM schedule_slots WHERE id = ?', params.id);
    if (!slot) fail(404, 'Plage horaire introuvable.');
    requireCourseManager(user, slot.course_id);
    run('DELETE FROM schedule_slots WHERE id = ?', slot.id);
    return { ok: true };
  });

  r.get('/api/schedule', ({ user, query }) => {
    let target = user;
    // Admins can look at anybody's timetable.
    if (isAdmin(user) && query.user_id) {
      target = one('SELECT id, role FROM users WHERE id = ?', Number(query.user_id));
      if (!target) fail(404, 'Utilisateur introuvable.');
    }
    const ids = visibleCourseIds(target);
    const filter = ids === null ? '' : `WHERE c.id IN (${inList(ids)})`;
    return all(
      `SELECT s.*, c.code, c.name, c.group_name, t.first_name AS teacher_first_name, t.last_name AS teacher_last_name
         FROM schedule_slots s JOIN courses c ON c.id = s.course_id LEFT JOIN users t ON t.id = c.teacher_id
         ${filter} ORDER BY s.day, s.start_time`,
      ...(ids || []),
    );
  });

  // --- Absences ---------------------------------------------------------------

  r.get('/api/courses/:id/attendance', ({ user, params, query }) => {
    const course = requireCourseAccess(user, params.id);
    if (isStudent(user)) {
      return {
        records: all('SELECT date, status, note FROM attendance WHERE course_id = ? AND student_id = ? ORDER BY date DESC', course.id, user.id),
      };
    }
    requireCourseManager(user, course.id);
    const dates = all('SELECT DISTINCT date FROM attendance WHERE course_id = ? ORDER BY date DESC', course.id).map((d) => d.date);
    const result = { dates };
    if (query.date) {
      result.roster = all(
        `SELECT u.id, u.first_name, u.last_name, u.student_number, a.status, a.note
           FROM enrollments e JOIN users u ON u.id = e.student_id
           LEFT JOIN attendance a ON a.course_id = e.course_id AND a.student_id = u.id AND a.date = ?
          WHERE e.course_id = ? ORDER BY u.last_name, u.first_name`,
        query.date,
        course.id,
      );
    }
    result.summary = all(
      `SELECT u.id, u.first_name, u.last_name,
              SUM(a.status = 'absent') AS absent, SUM(a.status = 'retard') AS retard,
              SUM(a.status = 'motive') AS motive, SUM(a.status = 'present') AS present
         FROM enrollments e JOIN users u ON u.id = e.student_id
         LEFT JOIN attendance a ON a.course_id = e.course_id AND a.student_id = u.id
        WHERE e.course_id = ? GROUP BY u.id ORDER BY u.last_name, u.first_name`,
      course.id,
    );
    return result;
  });

  r.put('/api/courses/:id/attendance', async ({ req, user, params }) => {
    const course = requireCourseManager(user, params.id);
    const b = await readJson(req);
    if (typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) fail(400, 'Date invalide.');
    if (!Array.isArray(b.records)) fail(400, 'Liste de présences invalide.');
    transaction(() => {
      for (const rec of b.records) {
        const sid = Number(rec.student_id);
        if (!one('SELECT 1 FROM enrollments WHERE course_id = ? AND student_id = ?', course.id, sid)) continue;
        if (!rec.status) {
          run('DELETE FROM attendance WHERE course_id = ? AND student_id = ? AND date = ?', course.id, sid, b.date);
          continue;
        }
        if (!['present', 'absent', 'retard', 'motive'].includes(rec.status)) fail(400, 'Statut invalide.');
        run(
          `INSERT INTO attendance (course_id, student_id, date, status, note) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (course_id, student_id, date) DO UPDATE SET status = excluded.status, note = excluded.note`,
          course.id,
          sid,
          b.date,
          rec.status,
          String(rec.note || '').slice(0, 500),
        );
      }
    });
    audit(user.id, 'présences saisies', `${course.code}-${course.group_name} ${b.date}`);
    return { ok: true };
  });
}
