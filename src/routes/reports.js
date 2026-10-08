// Bulletins de fin de session.
// 1. Chaque enseignant finalise les résultats de son cours (note finale ajustable + commentaire).
// 2. L'admin publie le bulletin de la session; les étudiants sont avisés et peuvent le consulter / l'imprimer.
import { one, all, run, batch, audit, getSettings } from '../db.js';
import { fail, readJson, str, num } from '../http.js';
import { requireRole, requireCourseManager, isAdmin, isTeacher, isStudent, inList } from '../access.js';
import { computeAverage } from './coursework.js';

export const PASS_MARK = 60;

const round = (v) => (v === null || v === undefined ? null : Math.round(v));
const mean = (vals) => (vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null);

/**
 * Computes report-card lines for a term, in a fixed number of queries whatever the size of the school.
 * Returns { courses, byStudent: Map<studentId, lines[]> } where each line holds the final grade,
 * the group average, absences, the teacher's comment, etc.
 */
async function computeTerm(term, { courseIds = null, studentIds = null } = {}) {
  let courses = await all(
    `SELECT c.id, c.code, c.name, c.group_name, c.term, c.color, c.teacher_id, c.results_final, c.results_final_at,
            t.first_name AS teacher_first_name, t.last_name AS teacher_last_name
       FROM courses c LEFT JOIN users t ON t.id = c.teacher_id WHERE c.term = ? ORDER BY c.code, c.group_name`,
    term,
  );
  if (courseIds) courses = courses.filter((c) => courseIds.includes(c.id));
  const ids = courses.map((c) => c.id);
  if (!ids.length) return { courses, byStudent: new Map(), perCourse: new Map() };

  const [enrollments, evaluations, grades, entries, attendance] = await Promise.all([
    all(`SELECT course_id, student_id FROM enrollments WHERE course_id IN (${inList(ids)})`, ...ids),
    all(`SELECT id, course_id, weight, max_score FROM evaluations WHERE course_id IN (${inList(ids)})`, ...ids),
    all(
      `SELECT g.evaluation_id, g.student_id, g.score FROM grades g JOIN evaluations e ON e.id = g.evaluation_id
        WHERE e.course_id IN (${inList(ids)})`,
      ...ids,
    ),
    all(`SELECT course_id, student_id, final_grade, comment FROM report_entries WHERE course_id IN (${inList(ids)})`, ...ids),
    all(
      `SELECT course_id, student_id, SUM(status = 'absent') AS absences, SUM(status = 'retard') AS lates
         FROM attendance WHERE course_id IN (${inList(ids)}) GROUP BY course_id, student_id`,
      ...ids,
    ),
  ]);

  const entryKey = (c, s) => `${c}:${s}`;
  const entryBy = new Map(entries.map((e) => [entryKey(e.course_id, e.student_id), e]));
  const attBy = new Map(attendance.map((a) => [entryKey(a.course_id, a.student_id), a]));
  const perCourse = new Map(); // courseId → rows for every enrolled student

  for (const c of courses) {
    const evals = evaluations.filter((e) => e.course_id === c.id);
    const totalWeight = evals.reduce((s, e) => s + e.weight, 0);
    const evalIds = new Set(evals.map((e) => e.id));
    const rows = enrollments
      .filter((en) => en.course_id === c.id)
      .map((en) => {
        const scores = new Map(grades.filter((g) => g.student_id === en.student_id && evalIds.has(g.evaluation_id)).map((g) => [g.evaluation_id, g.score]));
        const computed = computeAverage(evals, scores);
        const entry = entryBy.get(entryKey(c.id, en.student_id));
        const att = attBy.get(entryKey(c.id, en.student_id));
        const override = entry?.final_grade ?? null;
        const final = override !== null ? override : round(computed.average);
        return {
          student_id: en.student_id,
          computed_average: computed.average,
          weight_graded: computed.weight_graded,
          total_weight: totalWeight,
          override,
          final_grade: final,
          comment: entry?.comment || '',
          absences: Number(att?.absences || 0),
          lates: Number(att?.lates || 0),
        };
      });
    const groupAverage = mean(rows.map((r) => r.final_grade).filter((g) => g !== null));
    for (const r of rows) r.group_average = groupAverage;
    perCourse.set(c.id, rows);
  }

  const byStudent = new Map();
  for (const c of courses) {
    for (const r of perCourse.get(c.id)) {
      if (studentIds && !studentIds.includes(r.student_id)) continue;
      if (!byStudent.has(r.student_id)) byStudent.set(r.student_id, []);
      byStudent.get(r.student_id).push({
        course_id: c.id,
        code: c.code,
        name: c.name,
        group_name: c.group_name,
        color: c.color,
        teacher: c.teacher_first_name ? `${c.teacher_first_name} ${c.teacher_last_name}` : '',
        final: !!c.results_final,
        final_grade: r.final_grade,
        group_average: r.group_average,
        passed: r.final_grade === null ? null : r.final_grade >= PASS_MARK,
        absences: r.absences,
        lates: r.lates,
        comment: r.comment,
        complete: r.total_weight > 0 && r.weight_graded >= r.total_weight,
      });
    }
  }
  return { courses, byStudent, perCourse };
}

async function termStatus(term) {
  return (await one('SELECT * FROM report_terms WHERE term = ?', term)) || { term, published: 0, published_at: null, message: '' };
}

/** Builds full report cards for the given students (all students of the term if null). */
async function buildBulletins(term, { studentIds = null, courseIds = null } = {}) {
  const [{ byStudent }, status, settings] = await Promise.all([computeTerm(term, { studentIds, courseIds }), termStatus(term), getSettings()]);
  const ids = [...byStudent.keys()];
  const students = ids.length
    ? await all(
        `SELECT id, first_name, last_name, student_number, program, email FROM users WHERE id IN (${inList(ids)}) ORDER BY last_name, first_name`,
        ...ids,
      )
    : [];
  return students.map((s) => {
    const lines = byStudent.get(s.id);
    const graded = lines.filter((l) => l.final_grade !== null);
    return {
      term,
      school_name: settings.school_name || '',
      published: !!status.published,
      published_at: status.published_at,
      message: status.message || '',
      student: s,
      courses: lines,
      overall_average: mean(graded.map((l) => l.final_grade)),
      passed_count: graded.filter((l) => l.passed).length,
      failed_count: graded.filter((l) => !l.passed).length,
      total_absences: lines.reduce((n, l) => n + l.absences, 0),
      all_final: lines.every((l) => l.final),
    };
  });
}

export default function register(r) {
  // Terms visible to the user, with their progress.
  r.get('/api/reports', async ({ user }) => {
    if (isStudent(user)) {
      return all(
        `SELECT DISTINCT c.term, rt.published_at FROM enrollments e JOIN courses c ON c.id = e.course_id
           JOIN report_terms rt ON rt.term = c.term AND rt.published = 1
          WHERE e.student_id = ? ORDER BY rt.published_at DESC`,
        user.id,
      );
    }
    const teacherFilter = isTeacher(user) ? 'WHERE c.teacher_id = ?' : '';
    const terms = await all(
      `SELECT c.term, COUNT(*) AS courses, SUM(c.results_final) AS finalized,
              (SELECT COUNT(DISTINCT e.student_id) FROM enrollments e JOIN courses c2 ON c2.id = e.course_id WHERE c2.term = c.term) AS students,
              COALESCE(rt.published, 0) AS published, rt.published_at, COALESCE(rt.message, '') AS message
         FROM courses c LEFT JOIN report_terms rt ON rt.term = c.term
         ${teacherFilter} GROUP BY c.term ORDER BY MAX(c.created_at) DESC, c.term DESC`,
      ...(isTeacher(user) ? [user.id] : []),
    );
    if (isTeacher(user)) {
      const mine = await all(
        `SELECT id, code, name, group_name, term, color, results_final, results_final_at FROM courses WHERE teacher_id = ? ORDER BY code`,
        user.id,
      );
      for (const t of terms) t.my_courses = mine.filter((c) => c.term === t.term);
    }
    return terms;
  });

  // Admin view of a term: every course's finalization and every student's summary.
  r.get('/api/reports/:term', async ({ user, params }) => {
    requireRole(user, 'admin');
    const term = String(params.term);
    const [bulletins, status, courses] = await Promise.all([
      buildBulletins(term),
      termStatus(term),
      all(
        `SELECT c.id, c.code, c.name, c.group_name, c.color, c.results_final, c.results_final_at,
                t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
                (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS students
           FROM courses c LEFT JOIN users t ON t.id = c.teacher_id WHERE c.term = ? ORDER BY c.code`,
        term,
      ),
    ]);
    if (!courses.length) fail(404, 'Session introuvable.');
    return {
      term,
      status,
      courses,
      students: bulletins.map((b) => ({
        ...b.student,
        overall_average: b.overall_average,
        passed_count: b.passed_count,
        failed_count: b.failed_count,
        courses: b.courses.length,
        total_absences: b.total_absences,
      })),
    };
  });

  r.put('/api/reports/:term', async ({ req, user, params }) => {
    requireRole(user, 'admin');
    const term = String(params.term);
    if (!(await one('SELECT 1 AS ok FROM courses WHERE term = ? LIMIT 1', term))) fail(404, 'Session introuvable.');
    const b = await readJson(req);
    const before = await termStatus(term);
    const message = b.message !== undefined ? str(b.message, 'message', { required: false, max: 2000 }) : before.message || '';
    const published = b.published !== undefined ? (b.published ? 1 : 0) : before.published ? 1 : 0;
    await run(
      `INSERT INTO report_terms (term, published, published_at, published_by, message) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (term) DO UPDATE SET published = excluded.published, message = excluded.message,
         published_at = CASE WHEN excluded.published = 1 AND report_terms.published = 0 THEN excluded.published_at ELSE report_terms.published_at END,
         published_by = CASE WHEN excluded.published = 1 AND report_terms.published = 0 THEN excluded.published_by ELSE report_terms.published_by END`,
      term,
      published,
      published ? new Date().toISOString() : null,
      user.id,
      message,
    );
    // Tell every student of the term when the report cards become available.
    if (published && !before.published) {
      const students = await all(
        'SELECT DISTINCT e.student_id FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE c.term = ?',
        term,
      );
      const body = `Votre bulletin de la session ${term} est maintenant disponible.\n\nOuvrez Cartable → Bulletins pour le consulter, l’imprimer ou l’enregistrer en PDF.`;
      await batch(students.map((s) => ['INSERT INTO messages (sender_id, recipient_id, subject, body) VALUES (?, ?, ?, ?)', [user.id, s.student_id, `Bulletin disponible — ${term}`, body]]));
    }
    audit(user.id, published ? 'bulletins publiés' : 'bulletins retirés', term);
    return termStatus(term);
  });

  // One student's report card. Students: only their own, once published. Teachers: preview of their courses.
  r.get('/api/reports/:term/students/:id', async ({ user, params }) => {
    const term = String(params.term);
    const studentId = Number(params.id);
    let courseIds = null;
    if (isStudent(user)) {
      if (user.id !== studentId) fail(403, 'Accès refusé.');
      if (!(await termStatus(term)).published) fail(404, 'Ce bulletin n’est pas encore publié.');
    } else if (isTeacher(user)) {
      courseIds = (await all('SELECT id FROM courses WHERE teacher_id = ? AND term = ?', user.id, term)).map((c) => c.id);
      if (!courseIds.length) fail(403, 'Accès refusé.');
    }
    const [bulletin] = await buildBulletins(term, { studentIds: [studentId], courseIds });
    if (!bulletin) fail(404, 'Aucun résultat pour cet étudiant durant cette session.');
    if (courseIds) bulletin.partial = true; // teacher preview: only their own courses
    return bulletin;
  });

  // Every report card of the term at once (admin), for printing.
  r.get('/api/reports/:term/all', async ({ user, params }) => {
    requireRole(user, 'admin');
    return buildBulletins(String(params.term));
  });

  // --- Saisie par l'enseignant ------------------------------------------------

  r.get('/api/courses/:id/report', async ({ user, params }) => {
    const course = await requireCourseManager(user, params.id);
    const [{ perCourse }, students, status] = await Promise.all([
      computeTerm(course.term, { courseIds: [course.id] }),
      all(
        `SELECT u.id, u.first_name, u.last_name, u.student_number FROM enrollments e JOIN users u ON u.id = e.student_id
          WHERE e.course_id = ? ORDER BY u.last_name, u.first_name`,
        course.id,
      ),
      termStatus(course.term),
    ]);
    const rows = perCourse.get(course.id) || [];
    return {
      course: { id: course.id, term: course.term, results_final: !!course.results_final, results_final_at: course.results_final_at },
      published: !!status.published,
      pass_mark: PASS_MARK,
      students: students.map((s) => ({ ...s, ...rows.find((r) => r.student_id === s.id) })),
    };
  });

  r.put('/api/courses/:id/report', async ({ req, user, params }) => {
    const course = await requireCourseManager(user, params.id);
    if ((await termStatus(course.term)).published && !isAdmin(user)) {
      fail(400, 'Les bulletins de cette session sont publiés. Demandez à l’administration de les retirer pour modifier les résultats.');
    }
    const b = await readJson(req);
    if (!Array.isArray(b.entries)) fail(400, 'Liste de résultats invalide.');
    const enrolled = new Set((await all('SELECT student_id FROM enrollments WHERE course_id = ?', course.id)).map((r) => r.student_id));
    const stmts = [];
    for (const e of b.entries) {
      const sid = Number(e.student_id);
      if (!enrolled.has(sid)) continue;
      const grade = num(e.final_grade, 'note finale', { required: false, min: 0, max: 100 });
      stmts.push([
        `INSERT INTO report_entries (course_id, student_id, final_grade, comment) VALUES (?, ?, ?, ?)
         ON CONFLICT (course_id, student_id) DO UPDATE SET final_grade = excluded.final_grade, comment = excluded.comment, updated_at = datetime('now')`,
        [course.id, sid, grade === null ? null : Math.round(grade), String(e.comment || '').slice(0, 1000)],
      ]);
    }
    if (b.finalize !== undefined) {
      stmts.push([
        'UPDATE courses SET results_final = ?, results_final_at = ? WHERE id = ?',
        [b.finalize ? 1 : 0, b.finalize ? new Date().toISOString() : null, course.id],
      ]);
    }
    await batch(stmts);
    audit(user.id, b.finalize ? 'résultats finaux remis' : 'résultats de bulletin saisis', `${course.code}-${course.group_name} ${course.term}`);
    return { ok: true };
  });
}
