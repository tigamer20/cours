import { one, all, run, audit, transaction } from '../db.js';
import { fail, readJson, str, date } from '../http.js';
import {
  requireRole,
  requireCourseManager,
  requireStudentFileAccess,
  visibleCourseIds,
  inList,
  isAdmin,
  isTeacher,
  isStudent,
} from '../access.js';
import { computeAverage } from './coursework.js';

function allowedRecipientIds(user) {
  if (isAdmin(user)) return null;
  if (isTeacher(user)) {
    return new Set(
      all(
        `SELECT id FROM users WHERE role != 'etudiant' OR id IN (
           SELECT e.student_id FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE c.teacher_id = ?)`,
        user.id,
      ).map((r) => r.id),
    );
  }
  return new Set(
    all(
      `SELECT id FROM users WHERE role = 'admin' OR id IN (
         SELECT c.teacher_id FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.student_id = ?)`,
      user.id,
    ).map((r) => r.id),
  );
}

export default function register(r) {
  // --- Tableau de bord ------------------------------------------------------

  r.get('/api/dashboard', ({ user }) => {
    const ids = visibleCourseIds(user);
    const courseFilter = ids === null ? '' : `AND c.id IN (${inList(ids)})`;
    const idParams = ids || [];
    const now = new Date().toISOString();
    const in14 = new Date(Date.now() + 14 * 86400_000).toISOString();

    const data = {
      unread_messages: one('SELECT COUNT(*) AS n FROM messages WHERE recipient_id = ? AND read_at IS NULL AND deleted_by_recipient = 0', user.id).n,
      upcoming_evaluations: all(
        `SELECT e.id, e.title, e.kind, e.weight, e.due_at, e.accepts_submissions, c.id AS course_id, c.code, c.name
           FROM evaluations e JOIN courses c ON c.id = e.course_id
          WHERE e.due_at BETWEEN ? AND ? ${courseFilter} ORDER BY e.due_at LIMIT 10`,
        now,
        in14,
        ...idParams,
      ),
      upcoming_events: all(
        `SELECT ev.id, ev.title, ev.starts_at, c.code FROM events ev LEFT JOIN courses c ON c.id = ev.course_id
          WHERE ev.starts_at BETWEEN ? AND ? AND (ev.course_id IS NULL ${ids === null ? 'OR 1' : `OR ev.course_id IN (${inList(ids)})`})
          ORDER BY ev.starts_at LIMIT 10`,
        now,
        in14,
        ...idParams,
      ),
      recent_documents: all(
        `SELECT d.id, d.title, d.created_at, c.id AS course_id, c.code FROM documents d JOIN courses c ON c.id = d.course_id
          WHERE 1 ${courseFilter} ORDER BY d.created_at DESC LIMIT 6`,
        ...idParams,
      ),
    };

    if (isStudent(user)) {
      data.absences = one("SELECT COUNT(*) AS n FROM attendance WHERE student_id = ? AND status = 'absent'", user.id).n;
      data.pending_submissions = all(
        `SELECT e.id, e.title, e.due_at, c.id AS course_id, c.code FROM evaluations e JOIN courses c ON c.id = e.course_id
          WHERE e.accepts_submissions = 1 AND (e.due_at IS NULL OR e.due_at >= ?) ${courseFilter}
            AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.evaluation_id = e.id AND s.student_id = ?)
          ORDER BY e.due_at IS NULL, e.due_at`,
        now,
        ...idParams,
        user.id,
      );
    }
    if (isTeacher(user)) {
      data.to_grade = all(
        `SELECT e.id, e.title, c.id AS course_id, c.code, COUNT(DISTINCT s.student_id) AS n
           FROM submissions s JOIN evaluations e ON e.id = s.evaluation_id JOIN courses c ON c.id = e.course_id
          WHERE c.teacher_id = ? AND NOT EXISTS (
            SELECT 1 FROM grades g WHERE g.evaluation_id = e.id AND g.student_id = s.student_id AND g.score IS NOT NULL)
          GROUP BY e.id ORDER BY e.due_at`,
        user.id,
      );
    }
    if (isAdmin(user)) {
      data.counts = one(
        `SELECT (SELECT COUNT(*) FROM users WHERE role = 'etudiant') AS students,
                (SELECT COUNT(*) FROM users WHERE role = 'enseignant') AS teachers,
                (SELECT COUNT(*) FROM users WHERE role = 'admin') AS admins,
                (SELECT COUNT(*) FROM courses) AS courses,
                (SELECT COUNT(*) FROM documents) AS documents,
                (SELECT COUNT(*) FROM submissions) AS submissions`,
      );
    }
    return data;
  });

  // --- Calendrier ---------------------------------------------------------------

  r.get('/api/calendar', ({ user, query }) => {
    const from = date(query.from, 'début');
    const to = date(query.to, 'fin');
    const ids = visibleCourseIds(user);
    const courseFilter = ids === null ? '' : `AND c.id IN (${inList(ids)})`;
    const idParams = ids || [];
    const events = all(
      `SELECT ev.*, c.code, c.group_name, u.first_name AS author_first_name, u.last_name AS author_last_name
         FROM events ev LEFT JOIN courses c ON c.id = ev.course_id LEFT JOIN users u ON u.id = ev.created_by
        WHERE ev.starts_at BETWEEN ? AND ?
          AND (ev.course_id IS NULL ${ids === null ? 'OR 1' : `OR ev.course_id IN (${inList(ids)})`})
        ORDER BY ev.starts_at`,
      from,
      to,
      ...idParams,
    ).map((e) => ({ ...e, type: 'evenement', can_delete: isAdmin(user) || e.created_by === user.id || (isTeacher(user) && e.course_id && ids.includes(e.course_id)) }));
    const evaluations = all(
      `SELECT e.id, e.title, e.kind, e.weight, e.due_at AS starts_at, c.id AS course_id, c.code, c.group_name
         FROM evaluations e JOIN courses c ON c.id = e.course_id
        WHERE e.due_at BETWEEN ? AND ? ${courseFilter} ORDER BY e.due_at`,
      from,
      to,
      ...idParams,
    ).map((e) => ({ ...e, type: 'evaluation' }));
    return [...events, ...evaluations].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  });

  r.post('/api/events', async ({ req, user }) => {
    requireRole(user, 'admin', 'enseignant');
    const b = await readJson(req);
    let courseId = b.course_id ? Number(b.course_id) : null;
    if (courseId) requireCourseManager(user, courseId);
    else if (!isAdmin(user)) fail(400, 'Choisissez un de vos cours pour cet événement.');
    const startsAt = date(b.starts_at, 'début');
    const endsAt = date(b.ends_at, 'fin', { required: false });
    if (endsAt && endsAt < startsAt) fail(400, 'La fin doit être après le début.');
    const title = str(b.title, 'titre', { max: 200 });
    const { lastInsertRowid } = run(
      'INSERT INTO events (course_id, title, description, starts_at, ends_at, created_by) VALUES (?, ?, ?, ?, ?, ?)',
      courseId,
      title,
      str(b.description, 'description', { required: false }),
      startsAt,
      endsAt,
      user.id,
    );
    audit(user.id, 'événement ajouté', `« ${title} »`);
    return one('SELECT * FROM events WHERE id = ?', lastInsertRowid);
  });

  r.delete('/api/events/:id', ({ user, params }) => {
    const ev = one('SELECT * FROM events WHERE id = ?', params.id);
    if (!ev) fail(404, 'Événement introuvable.');
    if (!isAdmin(user) && ev.created_by !== user.id) {
      if (!ev.course_id) fail(403, 'Accès refusé.');
      requireCourseManager(user, ev.course_id);
    }
    run('DELETE FROM events WHERE id = ?', ev.id);
    audit(user.id, 'événement supprimé', `« ${ev.title} »`);
    return { ok: true };
  });

  // --- Messagerie --------------------------------------------------------------

  r.get('/api/messages', ({ user, query }) => {
    if (query.box === 'sent') {
      return all(
        `SELECT m.id, m.subject, m.created_at, m.read_at, u.first_name, u.last_name, u.role
           FROM messages m JOIN users u ON u.id = m.recipient_id
          WHERE m.sender_id = ? AND m.deleted_by_sender = 0 ORDER BY m.created_at DESC, m.id DESC LIMIT 300`,
        user.id,
      );
    }
    return all(
      `SELECT m.id, m.subject, m.created_at, m.read_at, u.first_name, u.last_name, u.role
         FROM messages m JOIN users u ON u.id = m.sender_id
        WHERE m.recipient_id = ? AND m.deleted_by_recipient = 0 ORDER BY m.created_at DESC, m.id DESC LIMIT 300`,
      user.id,
    );
  });

  r.get('/api/messages/:id', ({ user, params }) => {
    const m = one(
      `SELECT m.*, s.first_name AS sender_first_name, s.last_name AS sender_last_name, s.role AS sender_role,
              r.first_name AS recipient_first_name, r.last_name AS recipient_last_name
         FROM messages m JOIN users s ON s.id = m.sender_id JOIN users r ON r.id = m.recipient_id WHERE m.id = ?`,
      params.id,
    );
    const mine = m && ((m.recipient_id === user.id && !m.deleted_by_recipient) || (m.sender_id === user.id && !m.deleted_by_sender));
    if (!mine) fail(404, 'Message introuvable.');
    if (m.recipient_id === user.id && !m.read_at) {
      run("UPDATE messages SET read_at = datetime('now') WHERE id = ?", m.id);
    }
    return m;
  });

  r.post('/api/messages', async ({ req, user }) => {
    const b = await readJson(req);
    const subject = str(b.subject, 'objet', { max: 200 });
    const body = str(b.body, 'message', { max: 20000 });
    const recipients = new Set((Array.isArray(b.recipient_ids) ? b.recipient_ids : []).map(Number));
    if (b.course_id) {
      // Send to every student of a course the user teaches.
      const course = requireCourseManager(user, Number(b.course_id));
      for (const row of all('SELECT student_id FROM enrollments WHERE course_id = ?', course.id)) recipients.add(row.student_id);
    }
    recipients.delete(user.id);
    if (!recipients.size) fail(400, 'Choisissez au moins un destinataire.');
    const allowed = allowedRecipientIds(user);
    transaction(() => {
      for (const id of recipients) {
        if (allowed && !allowed.has(id)) fail(403, 'Vous ne pouvez pas écrire à un de ces destinataires.');
        if (!one('SELECT 1 FROM users WHERE id = ? AND active = 1', id)) fail(400, 'Destinataire invalide.');
        run('INSERT INTO messages (sender_id, recipient_id, subject, body) VALUES (?, ?, ?, ?)', user.id, id, subject, body);
      }
    });
    audit(user.id, 'message envoyé', `« ${subject} » → ${recipients.size} destinataire(s)`);
    return { ok: true, sent: recipients.size };
  });

  r.delete('/api/messages/:id', ({ user, params }) => {
    const m = one('SELECT * FROM messages WHERE id = ?', params.id);
    if (!m || (m.recipient_id !== user.id && m.sender_id !== user.id)) fail(404, 'Message introuvable.');
    if (m.recipient_id === user.id) run('UPDATE messages SET deleted_by_recipient = 1 WHERE id = ?', m.id);
    if (m.sender_id === user.id) run('UPDATE messages SET deleted_by_sender = 1 WHERE id = ?', m.id);
    return { ok: true };
  });

  // --- Dossiers étudiants ----------------------------------------------------

  r.get('/api/students', ({ user, query }) => {
    requireRole(user, 'admin', 'enseignant');
    const params = [];
    let sql = `SELECT DISTINCT u.id, u.first_name, u.last_name, u.email, u.student_number, u.program, u.active
                 FROM users u`;
    if (isTeacher(user)) {
      sql += ` JOIN enrollments e ON e.student_id = u.id JOIN courses c ON c.id = e.course_id AND c.teacher_id = ?`;
      params.push(user.id);
    }
    sql += ` WHERE u.role = 'etudiant'`;
    if (query.q) {
      sql += ` AND (u.first_name || ' ' || u.last_name || ' ' || u.email || ' ' || COALESCE(u.student_number, '')) LIKE ?`;
      params.push(`%${query.q}%`);
    }
    return all(sql + ' ORDER BY u.last_name, u.first_name', ...params);
  });

  r.get('/api/students/:id/dossier', ({ user, params }) => {
    const student = requireStudentFileAccess(user, params.id);
    // Teachers only see the part of the file that concerns their own courses.
    let courses = all(
      `SELECT c.id, c.code, c.name, c.group_name, c.term, c.teacher_id, t.first_name AS teacher_first_name, t.last_name AS teacher_last_name
         FROM enrollments e JOIN courses c ON c.id = e.course_id LEFT JOIN users t ON t.id = c.teacher_id
        WHERE e.student_id = ? ORDER BY c.term DESC, c.code`,
      student.id,
    );
    if (isTeacher(user)) courses = courses.filter((c) => c.teacher_id === user.id);
    const ownView = isStudent(user);

    for (const c of courses) {
      const evaluations = all('SELECT * FROM evaluations WHERE course_id = ? ORDER BY due_at IS NULL, due_at, id', c.id);
      const visible = ownView ? evaluations.filter((e) => e.grades_published) : evaluations;
      const grades = all(
        `SELECT g.evaluation_id, g.score, g.comment FROM grades g JOIN evaluations e ON e.id = g.evaluation_id
          WHERE e.course_id = ? AND g.student_id = ?`,
        c.id,
        student.id,
      );
      const byEval = new Map(grades.map((g) => [g.evaluation_id, g]));
      c.evaluations = visible.map((e) => ({
        id: e.id,
        title: e.title,
        kind: e.kind,
        weight: e.weight,
        max_score: e.max_score,
        due_at: e.due_at,
        score: byEval.get(e.id)?.score ?? null,
        comment: byEval.get(e.id)?.comment ?? '',
        submitted_at: one(
          'SELECT MAX(submitted_at) AS t FROM submissions WHERE evaluation_id = ? AND student_id = ?',
          e.id,
          student.id,
        ).t,
      }));
      Object.assign(c, computeAverage(visible, new Map(c.evaluations.map((e) => [e.id, e.score]))));
      c.attendance = all(
        'SELECT date, status, note FROM attendance WHERE course_id = ? AND student_id = ? ORDER BY date DESC',
        c.id,
        student.id,
      );
      c.absences = c.attendance.filter((a) => a.status === 'absent').length;
      c.lates = c.attendance.filter((a) => a.status === 'retard').length;
      delete c.teacher_id;
    }

    return {
      student: {
        id: student.id,
        first_name: student.first_name,
        last_name: student.last_name,
        email: student.email,
        student_number: student.student_number,
        program: student.program,
        phone: student.phone,
        active: student.active,
        created_at: student.created_at,
        last_login_at: isStudent(user) ? undefined : student.last_login_at,
      },
      courses,
    };
  });

  // --- Administration : vue globale ------------------------------------------

  r.get('/api/admin/overview', ({ user }) => {
    requireRole(user, 'admin');
    const courses = all(
      `SELECT c.id, c.code, c.name, c.group_name, c.term, t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
              (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS students,
              (SELECT COUNT(*) FROM documents d WHERE d.course_id = c.id) AS documents,
              (SELECT COUNT(*) FROM evaluations e WHERE e.course_id = c.id) AS evaluations,
              (SELECT COALESCE(SUM(weight), 0) FROM evaluations e WHERE e.course_id = c.id) AS total_weight,
              (SELECT COUNT(*) FROM attendance a WHERE a.course_id = c.id AND a.status = 'absent') AS absences,
              (SELECT COUNT(*) FROM submissions s JOIN evaluations e ON e.id = s.evaluation_id WHERE e.course_id = c.id) AS submissions,
              (SELECT ROUND(AVG(g.score * 100.0 / e.max_score), 1) FROM grades g JOIN evaluations e ON e.id = g.evaluation_id
                WHERE e.course_id = c.id AND g.score IS NOT NULL) AS avg_percent
         FROM courses c LEFT JOIN users t ON t.id = c.teacher_id ORDER BY c.term DESC, c.code, c.group_name`,
    );
    const activity = all(
      `SELECT date(created_at) AS day, COUNT(*) AS n FROM audit_log
        WHERE created_at >= datetime('now', '-14 days') GROUP BY day ORDER BY day`,
    );
    const at_risk = all(
      `SELECT u.id, u.first_name, u.last_name, COUNT(*) AS absences
         FROM attendance a JOIN users u ON u.id = a.student_id
        WHERE a.status = 'absent' GROUP BY u.id HAVING absences >= 3 ORDER BY absences DESC LIMIT 20`,
    );
    const online = one("SELECT COUNT(DISTINCT user_id) AS n FROM audit_log WHERE created_at >= datetime('now', '-1 hour')").n;
    return { courses, activity, at_risk, online };
  });

  r.get('/api/admin/audit', ({ user, query }) => {
    requireRole(user, 'admin');
    const where = [];
    const params = [];
    if (query.user_id) {
      where.push('a.user_id = ?');
      params.push(Number(query.user_id));
    }
    if (query.role) {
      where.push('u.role = ?');
      params.push(query.role);
    }
    if (query.q) {
      where.push("(a.action || ' ' || a.details || ' ' || COALESCE(u.first_name || ' ' || u.last_name, '')) LIKE ?");
      params.push(`%${query.q}%`);
    }
    const limit = Math.min(Number(query.limit) || 200, 1000);
    return all(
      `SELECT a.id, a.action, a.details, a.created_at, u.id AS user_id, u.first_name, u.last_name, u.role
         FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY a.id DESC LIMIT ${limit}`,
      ...params,
    );
  });
}
