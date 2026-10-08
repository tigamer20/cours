import { one, all, run, audit, transaction } from '../db.js';
import { fail, readJson, str, num, oneOf, date, sqlTimeToDate } from '../http.js';
import { saveUpload, sendFile } from '../files.js';
import { requireCourseAccess, requireCourseManager, isStudent, isEnrolled } from '../access.js';

const KINDS = ['examen', 'travail', 'quiz', 'projet', 'laboratoire', 'autre'];

/** Weighted average (in %) of the graded evaluations, plus the points earned on the course total. */
export function computeAverage(evaluations, scoreByEval) {
  let earned = 0;
  let weightGraded = 0;
  for (const ev of evaluations) {
    const score = scoreByEval.get(ev.id);
    if (score === null || score === undefined || !ev.max_score) continue;
    earned += (score / ev.max_score) * ev.weight;
    weightGraded += ev.weight;
  }
  return {
    average: weightGraded ? Math.round((earned / weightGraded) * 1000) / 10 : null,
    earned: Math.round(earned * 10) / 10,
    weight_graded: weightGraded,
  };
}

function getEvaluation(id) {
  const ev = one('SELECT * FROM evaluations WHERE id = ?', id);
  if (!ev) fail(404, 'Évaluation introuvable.');
  return ev;
}

function evaluationFields(b, partial) {
  const out = {};
  const has = (k) => !partial || b[k] !== undefined;
  if (has('title')) out.title = str(b.title, 'titre', { max: 200 });
  if (has('kind')) out.kind = oneOf(b.kind || 'travail', 'type', KINDS);
  if (has('weight')) out.weight = num(b.weight, 'pondération', { min: 0, max: 100 });
  if (has('max_score')) out.max_score = num(b.max_score ?? 100, 'note maximale', { min: 1, max: 10000 });
  if (has('due_at')) out.due_at = date(b.due_at, 'date de remise', { required: false });
  if (has('description')) out.description = str(b.description, 'description', { required: false });
  if (has('accepts_submissions')) out.accepts_submissions = b.accepts_submissions ? 1 : 0;
  if (has('grades_published')) out.grades_published = b.grades_published ? 1 : 0;
  return out;
}

export default function register(r) {
  // --- Documents --------------------------------------------------------------

  r.get('/api/courses/:id/documents', ({ user, params }) => {
    const course = requireCourseAccess(user, params.id);
    if (isStudent(user)) {
      return all(
        `SELECT d.id, d.title, d.description, d.created_at, f.original_name, f.mime, f.size,
                v.first_viewed_at, v.view_count, v.downloaded
           FROM documents d JOIN files f ON f.id = d.file_id
           LEFT JOIN document_views v ON v.document_id = d.id AND v.student_id = ?
          WHERE d.course_id = ? ORDER BY d.created_at DESC`,
        user.id,
        course.id,
      );
    }
    return all(
      `SELECT d.id, d.title, d.description, d.created_at, f.original_name, f.mime, f.size,
              (SELECT COUNT(*) FROM document_views v WHERE v.document_id = d.id) AS viewed_count,
              (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = d.course_id) AS student_count
         FROM documents d JOIN files f ON f.id = d.file_id
        WHERE d.course_id = ? ORDER BY d.created_at DESC`,
      course.id,
    );
  });

  r.post('/api/courses/:id/documents', async ({ req, user, params, query }) => {
    const course = requireCourseManager(user, params.id);
    const title = str(query.title, 'titre', { max: 200 });
    const description = str(query.description, 'description', { required: false });
    const fileId = await saveUpload(req, user.id);
    const { lastInsertRowid } = run(
      'INSERT INTO documents (course_id, title, description, file_id, posted_by) VALUES (?, ?, ?, ?, ?)',
      course.id,
      title,
      description,
      fileId,
      user.id,
    );
    audit(user.id, 'document publié', `« ${title} » → ${course.code}-${course.group_name}`);
    return { id: Number(lastInsertRowid) };
  });

  r.delete('/api/documents/:id', ({ user, params }) => {
    const doc = one('SELECT * FROM documents WHERE id = ?', params.id);
    if (!doc) fail(404, 'Document introuvable.');
    requireCourseManager(user, doc.course_id);
    run('DELETE FROM documents WHERE id = ?', doc.id);
    audit(user.id, 'document supprimé', `« ${doc.title} »`);
    return { ok: true };
  });

  // Who opened a document, and when.
  r.get('/api/documents/:id/views', ({ user, params }) => {
    const doc = one('SELECT * FROM documents WHERE id = ?', params.id);
    if (!doc) fail(404, 'Document introuvable.');
    requireCourseManager(user, doc.course_id);
    return all(
      `SELECT u.id, u.first_name, u.last_name, u.student_number,
              v.first_viewed_at, v.last_viewed_at, v.view_count, v.downloaded
         FROM enrollments e JOIN users u ON u.id = e.student_id
         LEFT JOIN document_views v ON v.document_id = ? AND v.student_id = u.id
        WHERE e.course_id = ? ORDER BY v.first_viewed_at IS NULL, u.last_name`,
      doc.id,
      doc.course_id,
    );
  });

  r.get('/api/documents/:id/file', ({ user, params, query, res }) => {
    const doc = one('SELECT * FROM documents WHERE id = ?', params.id);
    if (!doc) fail(404, 'Document introuvable.');
    requireCourseAccess(user, doc.course_id);
    const download = query.mode === 'download';
    if (isStudent(user)) {
      run(
        `INSERT INTO document_views (document_id, student_id, view_count, downloaded) VALUES (?, ?, 1, ?)
         ON CONFLICT (document_id, student_id) DO UPDATE SET
           view_count = view_count + 1, last_viewed_at = datetime('now'), downloaded = MAX(downloaded, excluded.downloaded)`,
        doc.id,
        user.id,
        download ? 1 : 0,
      );
      audit(user.id, download ? 'document téléchargé' : 'document consulté', `« ${doc.title} »`);
    }
    sendFile(res, doc.file_id, { inline: !download });
  });

  // --- Évaluations (plan de cours) -------------------------------------------

  r.get('/api/courses/:id/evaluations', ({ user, params }) => {
    const course = requireCourseAccess(user, params.id);
    const evaluations = all('SELECT * FROM evaluations WHERE course_id = ? ORDER BY due_at IS NULL, due_at, id', course.id);
    if (isStudent(user)) {
      for (const ev of evaluations) {
        const g = ev.grades_published
          ? one('SELECT score, comment FROM grades WHERE evaluation_id = ? AND student_id = ?', ev.id, user.id)
          : null;
        ev.my_score = g?.score ?? null;
        ev.my_comment = g?.comment ?? '';
        ev.my_submission = one(
          `SELECT s.id, s.submitted_at, s.comment, f.original_name FROM submissions s JOIN files f ON f.id = s.file_id
            WHERE s.evaluation_id = ? AND s.student_id = ? ORDER BY s.submitted_at DESC, s.id DESC LIMIT 1`,
          ev.id,
          user.id,
        ) ?? null;
      }
    } else {
      for (const ev of evaluations) {
        ev.submission_count = one('SELECT COUNT(DISTINCT student_id) AS n FROM submissions WHERE evaluation_id = ?', ev.id).n;
        ev.graded_count = one('SELECT COUNT(*) AS n FROM grades WHERE evaluation_id = ? AND score IS NOT NULL', ev.id).n;
      }
    }
    return evaluations;
  });

  r.post('/api/courses/:id/evaluations', async ({ req, user, params }) => {
    const course = requireCourseManager(user, params.id);
    const f = evaluationFields(await readJson(req), false);
    const { lastInsertRowid } = run(
      `INSERT INTO evaluations (course_id, title, kind, weight, max_score, due_at, description, accepts_submissions, grades_published)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      course.id, f.title, f.kind, f.weight, f.max_score, f.due_at, f.description, f.accepts_submissions, f.grades_published,
    );
    audit(user.id, 'évaluation ajoutée', `« ${f.title} » (${f.weight} %) → ${course.code}-${course.group_name}`);
    return one('SELECT * FROM evaluations WHERE id = ?', lastInsertRowid);
  });

  r.patch('/api/evaluations/:id', async ({ req, user, params }) => {
    const ev = getEvaluation(params.id);
    requireCourseManager(user, ev.course_id);
    const f = evaluationFields(await readJson(req), true);
    const keys = Object.keys(f);
    if (!keys.length) fail(400, 'Aucune modification.');
    run(`UPDATE evaluations SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => f[k]), ev.id);
    audit(user.id, 'évaluation modifiée', `« ${ev.title} »`);
    return one('SELECT * FROM evaluations WHERE id = ?', ev.id);
  });

  r.delete('/api/evaluations/:id', ({ user, params }) => {
    const ev = getEvaluation(params.id);
    requireCourseManager(user, ev.course_id);
    run('DELETE FROM evaluations WHERE id = ?', ev.id);
    audit(user.id, 'évaluation supprimée', `« ${ev.title} »`);
    return { ok: true };
  });

  // --- Notes ------------------------------------------------------------------

  r.get('/api/evaluations/:id/grades', ({ user, params }) => {
    const ev = getEvaluation(params.id);
    requireCourseManager(user, ev.course_id);
    const students = all(
      `SELECT u.id, u.first_name, u.last_name, u.student_number, g.score, g.comment
         FROM enrollments e JOIN users u ON u.id = e.student_id
         LEFT JOIN grades g ON g.evaluation_id = ? AND g.student_id = u.id
        WHERE e.course_id = ? ORDER BY u.last_name, u.first_name`,
      ev.id,
      ev.course_id,
    );
    for (const s of students) {
      s.submissions = all(
        `SELECT s.id, s.submitted_at, s.comment, f.original_name, f.size FROM submissions s JOIN files f ON f.id = s.file_id
          WHERE s.evaluation_id = ? AND s.student_id = ? ORDER BY s.submitted_at DESC, s.id DESC`,
        ev.id,
        s.id,
      );
      s.late = !!(ev.due_at && s.submissions[0] && sqlTimeToDate(s.submissions[0].submitted_at) > new Date(ev.due_at));
    }
    return { evaluation: ev, students };
  });

  r.put('/api/evaluations/:id/grades', async ({ req, user, params }) => {
    const ev = getEvaluation(params.id);
    const course = requireCourseManager(user, ev.course_id);
    const b = await readJson(req);
    if (!Array.isArray(b.grades)) fail(400, 'Liste de notes invalide.');
    transaction(() => {
      for (const g of b.grades) {
        const sid = Number(g.student_id);
        if (!isEnrolled(course.id, sid)) continue;
        const score = num(g.score, 'note', { required: false, min: 0, max: ev.max_score });
        run(
          `INSERT INTO grades (evaluation_id, student_id, score, comment) VALUES (?, ?, ?, ?)
           ON CONFLICT (evaluation_id, student_id) DO UPDATE SET
             score = excluded.score, comment = excluded.comment, updated_at = datetime('now')`,
          ev.id,
          sid,
          score,
          String(g.comment || '').slice(0, 2000),
        );
      }
      if (b.publish !== undefined) run('UPDATE evaluations SET grades_published = ? WHERE id = ?', b.publish ? 1 : 0, ev.id);
    });
    audit(user.id, 'notes saisies', `« ${ev.title} » ${course.code}-${course.group_name}`);
    return { ok: true };
  });

  r.get('/api/courses/:id/gradebook', ({ user, params }) => {
    const course = requireCourseAccess(user, params.id);
    const evaluations = all('SELECT * FROM evaluations WHERE course_id = ? ORDER BY due_at IS NULL, due_at, id', course.id);
    const total_weight = evaluations.reduce((s, e) => s + e.weight, 0);
    if (isStudent(user)) {
      const published = evaluations.filter((e) => e.grades_published);
      const scores = new Map(
        all('SELECT evaluation_id, score FROM grades WHERE student_id = ?', user.id).map((g) => [g.evaluation_id, g.score]),
      );
      return { evaluations, total_weight, ...computeAverage(published, scores) };
    }
    requireCourseManager(user, course.id);
    const students = all(
      `SELECT u.id, u.first_name, u.last_name, u.student_number FROM enrollments e JOIN users u ON u.id = e.student_id
        WHERE e.course_id = ? ORDER BY u.last_name, u.first_name`,
      course.id,
    );
    const grades = all(
      `SELECT g.evaluation_id, g.student_id, g.score FROM grades g JOIN evaluations e ON e.id = g.evaluation_id
        WHERE e.course_id = ?`,
      course.id,
    );
    for (const s of students) {
      const scores = new Map(grades.filter((g) => g.student_id === s.id).map((g) => [g.evaluation_id, g.score]));
      s.scores = Object.fromEntries(scores);
      Object.assign(s, computeAverage(evaluations, scores));
    }
    const averages = students.map((s) => s.average).filter((a) => a !== null);
    return {
      evaluations,
      total_weight,
      students,
      class_average: averages.length ? Math.round((averages.reduce((a, b) => a + b, 0) / averages.length) * 10) / 10 : null,
    };
  });

  // --- Remises de travaux -------------------------------------------------------

  r.post('/api/evaluations/:id/submissions', async ({ req, user, params, query }) => {
    const ev = getEvaluation(params.id);
    if (!isStudent(user)) fail(403, 'Seuls les étudiants peuvent remettre un travail.');
    requireCourseAccess(user, ev.course_id);
    if (!ev.accepts_submissions) fail(400, 'Cette évaluation n’accepte pas de remise en ligne.');
    const comment = str(query.comment, 'commentaire', { required: false, max: 2000 });
    const fileId = await saveUpload(req, user.id);
    const { lastInsertRowid } = run(
      'INSERT INTO submissions (evaluation_id, student_id, file_id, comment) VALUES (?, ?, ?, ?)',
      ev.id,
      user.id,
      fileId,
      comment,
    );
    audit(user.id, 'travail remis', `« ${ev.title} »`);
    return { id: Number(lastInsertRowid) };
  });

  r.get('/api/submissions/:id/file', ({ user, params, res }) => {
    const sub = one(
      'SELECT s.*, e.course_id FROM submissions s JOIN evaluations e ON e.id = s.evaluation_id WHERE s.id = ?',
      params.id,
    );
    if (!sub) fail(404, 'Remise introuvable.');
    if (sub.student_id !== user.id) requireCourseManager(user, sub.course_id);
    sendFile(res, sub.file_id, { inline: true });
  });
}
