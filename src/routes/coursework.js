import { one, all, run, batch, audit } from '../db.js';
import { fail, readJson, str, num, oneOf, date, sqlTimeToDate } from '../http.js';
import { saveUpload, sendFile, getFileMeta, INLINE_SAFE } from '../files.js';
import { requireCourseAccess, requireCourseManager, isStudent, inList, STUDENT_DOC_VISIBLE } from '../access.js';
import { parseRules } from './courses.js';

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

async function getEvaluation(id) {
  const ev = await one('SELECT * FROM evaluations WHERE id = ?', id);
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

// ---------------------------------------------------------------------------
// Documents et règles de publication
// ---------------------------------------------------------------------------

const truthy = (v) => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';

/**
 * Reads publication rules from a request (JSON body or query string), falling back on
 * the course's default rules for anything not provided (only when `defaults` is given).
 */
function documentRules(input, defaults) {
  const pick = (key) => (input[key] !== undefined ? input[key] : undefined);
  const out = {};
  const bool = (key, fallback) => {
    const v = pick(key);
    if (v !== undefined) out[key] = truthy(v) ? 1 : 0;
    else if (fallback !== undefined) out[key] = fallback ? 1 : 0;
  };
  bool('allow_download', defaults?.allow_download);
  bool('require_ack', defaults?.require_ack);
  bool('notify', defaults?.notify);

  if (pick('status') !== undefined) out.status = oneOf(pick('status'), 'statut', ['draft', 'published']);
  else if (defaults) out.status = defaults.start_as_draft ? 'draft' : 'published';

  if (pick('publish_at') !== undefined) out.publish_at = date(pick('publish_at'), 'date de publication', { required: false });
  if (pick('available_until') !== undefined) out.available_until = date(pick('available_until'), 'disponible jusqu’au', { required: false });
  else if (defaults?.available_days) {
    const from = out.publish_at ? new Date(out.publish_at) : new Date();
    out.available_until = new Date(from.getTime() + defaults.available_days * 86400_000).toISOString();
  }
  if (out.publish_at && out.available_until && out.available_until <= out.publish_at) {
    fail(400, 'La date de fin de disponibilité doit être après la date de publication.');
  }

  if (pick('category') !== undefined) out.category = str(pick('category'), 'catégorie', { required: false, max: 60 });
  else if (defaults) out.category = defaults.default_category || '';

  if (pick('audience') !== undefined) out.audience = oneOf(pick('audience'), 'destinataires', ['all', 'selected']);
  return out;
}

function parseIds(v) {
  if (v === undefined || v === null || v === '') return [];
  const list = Array.isArray(v) ? v : String(v).split(',');
  return [...new Set(list.map(Number).filter(Number.isInteger))];
}

async function setAudience(doc, courseId, audience, studentIds) {
  const stmts = [['DELETE FROM document_audience WHERE document_id = ?', [doc]]];
  if (audience === 'selected') {
    if (!studentIds.length) fail(400, 'Choisissez au moins un étudiant destinataire.');
    const enrolled = new Set((await all('SELECT student_id FROM enrollments WHERE course_id = ?', courseId)).map((r) => r.student_id));
    for (const id of studentIds) {
      if (!enrolled.has(id)) fail(400, 'Un des étudiants choisis n’est pas inscrit au cours.');
      stmts.push(['INSERT INTO document_audience (document_id, student_id) VALUES (?, ?)', [doc, id]]);
    }
  }
  await batch(stmts);
}

/** Human-readable state, computed from the rules. */
function docState(d, now = new Date().toISOString()) {
  if (d.status === 'draft') return 'brouillon';
  if (d.publish_at && d.publish_at > now) return 'programme';
  if (d.available_until && d.available_until <= now) return 'expire';
  return 'publie';
}

async function getDocument(id) {
  const doc = await one('SELECT * FROM documents WHERE id = ?', id);
  if (!doc) fail(404, 'Document introuvable.');
  return doc;
}

async function requireVisibleToStudent(user, doc) {
  const now = new Date().toISOString();
  const ok = await one(`SELECT 1 AS ok FROM documents d WHERE d.id = ? AND ${STUDENT_DOC_VISIBLE}`, doc.id, now, now, user.id);
  if (!ok) fail(404, 'Ce document n’est pas disponible.');
}

let notifying = false;

/**
 * Sends the "new document" message for documents whose rules ask for it and that just
 * became visible (immediately, or when their scheduled publication date passes).
 * Called after each change and periodically; a missed tick is caught up on the next one.
 */
export async function processDocumentNotifications() {
  if (notifying) return;
  notifying = true;
  try {
    const now = new Date().toISOString();
    const due = await all(
      `SELECT d.*, c.code, c.group_name, c.teacher_id FROM documents d JOIN courses c ON c.id = d.course_id
        WHERE d.notify = 1 AND d.notified_at IS NULL AND d.status = 'published'
          AND (d.publish_at IS NULL OR d.publish_at <= ?) AND (d.available_until IS NULL OR d.available_until > ?)`,
      now,
      now,
    );
    for (const d of due) {
      // Claim it first so two runs can never send the same notification twice.
      const claim = await run('UPDATE documents SET notified_at = ? WHERE id = ? AND notified_at IS NULL', now, d.id);
      if (!claim.changes) continue;
      const sender = d.posted_by || d.teacher_id;
      if (!sender) continue;
      const recipients = d.audience === 'selected'
        ? await all('SELECT student_id FROM document_audience WHERE document_id = ?', d.id)
        : await all('SELECT student_id FROM enrollments WHERE course_id = ?', d.course_id);
      const subject = `Nouveau document : ${d.title}`;
      const body = [
        `Un nouveau document est disponible dans le cours ${d.code}-${d.group_name}.`,
        '',
        d.title,
        d.description ? `\n${d.description}` : '',
        d.require_ack ? '\nVous devez confirmer en avoir pris connaissance.' : '',
        d.available_until ? `\nDisponible jusqu’au ${new Date(d.available_until).toLocaleString('fr-CA')}.` : '',
        '',
        'Ouvrez Cartable → Cours → Documents pour le consulter.',
      ].join('\n');
      await batch(recipients.map((r) => ['INSERT INTO messages (sender_id, recipient_id, subject, body) VALUES (?, ?, ?, ?)', [sender, r.student_id, subject, body]]));
    }
  } catch (err) {
    console.error('Notifications de documents :', err.message);
  } finally {
    notifying = false;
  }
}

export default function register(r) {
  r.get('/api/courses/:id/documents', async ({ user, params }) => {
    const course = await requireCourseAccess(user, params.id);
    const now = new Date().toISOString();
    if (isStudent(user)) {
      return all(
        `SELECT d.id, d.title, d.description, d.category, d.created_at, d.publish_at, d.available_until,
                d.allow_download, d.require_ack, f.original_name, f.mime, f.size,
                v.first_viewed_at, v.view_count, v.downloaded, v.acknowledged_at
           FROM documents d JOIN files f ON f.id = d.file_id
           LEFT JOIN document_views v ON v.document_id = d.id AND v.student_id = ?
          WHERE d.course_id = ? AND ${STUDENT_DOC_VISIBLE}
          ORDER BY d.category, COALESCE(d.publish_at, d.created_at) DESC`,
        user.id,
        course.id,
        now,
        now,
        user.id,
      );
    }
    await requireCourseManager(user, course.id);
    const docs = await all(
      `SELECT d.*, f.original_name, f.mime, f.size,
              CASE WHEN d.audience = 'selected'
                   THEN (SELECT COUNT(*) FROM document_audience a WHERE a.document_id = d.id)
                   ELSE (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = d.course_id) END AS target_count,
              (SELECT COUNT(*) FROM document_views v WHERE v.document_id = d.id AND v.first_viewed_at IS NOT NULL) AS viewed_count,
              (SELECT COUNT(*) FROM document_views v WHERE v.document_id = d.id AND v.acknowledged_at IS NOT NULL) AS ack_count
         FROM documents d JOIN files f ON f.id = d.file_id
        WHERE d.course_id = ? ORDER BY d.category, COALESCE(d.publish_at, d.created_at) DESC`,
      course.id,
    );
    const audiences = await all(
      `SELECT a.document_id, a.student_id FROM document_audience a JOIN documents d ON d.id = a.document_id WHERE d.course_id = ?`,
      course.id,
    );
    return docs.map((d) => ({
      ...d,
      state: docState(d, now),
      student_ids: audiences.filter((a) => a.document_id === d.id).map((a) => a.student_id),
    }));
  });

  r.post('/api/courses/:id/documents', async ({ req, user, params, query }) => {
    const course = await requireCourseManager(user, params.id);
    const title = str(query.title, 'titre', { max: 200 });
    const description = str(query.description, 'description', { required: false });
    const rules = documentRules(query, parseRules(course.document_rules));
    const audience = rules.audience || 'all';
    const studentIds = parseIds(query.student_ids);
    if (audience === 'selected' && !studentIds.length) fail(400, 'Choisissez au moins un étudiant destinataire.');
    const fileId = await saveUpload(req, user.id);
    const { lastInsertRowid } = await run(
      `INSERT INTO documents (course_id, title, description, category, file_id, posted_by, status, publish_at, available_until,
                              allow_download, require_ack, notify, audience)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      course.id, title, description, rules.category, fileId, user.id, rules.status, rules.publish_at ?? null,
      rules.available_until ?? null, rules.allow_download, rules.require_ack, rules.notify, audience,
    );
    const id = Number(lastInsertRowid);
    if (audience === 'selected') await setAudience(id, course.id, audience, studentIds);
    audit(user.id, 'document ajouté', `« ${title} » → ${course.code}-${course.group_name} (${rules.status === 'draft' ? 'brouillon' : rules.publish_at ? 'programmé' : 'publié'})`);
    processDocumentNotifications();
    return { id };
  });

  r.patch('/api/documents/:id', async ({ req, user, params }) => {
    const doc = await getDocument(params.id);
    await requireCourseManager(user, doc.course_id);
    const b = await readJson(req);
    const f = documentRules(b);
    if (b.title !== undefined) f.title = str(b.title, 'titre', { max: 200 });
    if (b.description !== undefined) f.description = str(b.description, 'description', { required: false });
    const merged = { ...doc, ...f };
    if (merged.publish_at && merged.available_until && merged.available_until <= merged.publish_at) {
      fail(400, 'La date de fin de disponibilité doit être après la date de publication.');
    }
    // Re-arm the notification if the document is being published again later.
    if (f.notify === 1 || (f.publish_at !== undefined && f.publish_at !== doc.publish_at) || (f.status === 'published' && doc.status === 'draft')) {
      f.notified_at = null;
    }
    const keys = Object.keys(f);
    if (keys.length) {
      await run(
        `UPDATE documents SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`,
        ...keys.map((k) => f[k]),
        doc.id,
      );
    }
    if (f.audience !== undefined || b.student_ids !== undefined) {
      await setAudience(doc.id, doc.course_id, merged.audience, parseIds(b.student_ids));
    }
    audit(user.id, 'règles de document modifiées', `« ${merged.title} »`);
    processDocumentNotifications();
    return { ok: true };
  });

  r.delete('/api/documents/:id', async ({ user, params }) => {
    const doc = await getDocument(params.id);
    await requireCourseManager(user, doc.course_id);
    await run('DELETE FROM documents WHERE id = ?', doc.id);
    audit(user.id, 'document supprimé', `« ${doc.title} »`);
    return { ok: true };
  });

  // Who opened / acknowledged a document, and when.
  r.get('/api/documents/:id/views', async ({ user, params }) => {
    const doc = await getDocument(params.id);
    await requireCourseManager(user, doc.course_id);
    const targeted = doc.audience === 'selected'
      ? 'JOIN document_audience da ON da.document_id = ? AND da.student_id = u.id'
      : 'JOIN enrollments e ON e.course_id = ? AND e.student_id = u.id';
    return all(
      `SELECT u.id, u.first_name, u.last_name, u.student_number,
              v.first_viewed_at, v.last_viewed_at, v.view_count, v.downloaded, v.acknowledged_at
         FROM users u ${targeted}
         LEFT JOIN document_views v ON v.document_id = ? AND v.student_id = u.id
        ORDER BY v.first_viewed_at IS NULL, u.last_name`,
      doc.audience === 'selected' ? doc.id : doc.course_id,
      doc.id,
    );
  });

  r.get('/api/documents/:id/file', async ({ user, params, query, res }) => {
    const doc = await getDocument(params.id);
    await requireCourseAccess(user, doc.course_id);
    const download = query.mode === 'download';
    if (isStudent(user)) {
      await requireVisibleToStudent(user, doc);
      if (!doc.allow_download) {
        if (download) fail(403, 'L’enseignant a choisi la consultation seulement pour ce document.');
        const meta = await getFileMeta(doc.file_id);
        if (!INLINE_SAFE.has(meta.mime)) fail(403, 'Ce document est en consultation seulement et ne peut pas être affiché dans le navigateur.');
      }
      await run(
        `INSERT INTO document_views (document_id, student_id, first_viewed_at, last_viewed_at, view_count, downloaded)
         VALUES (?, ?, datetime('now'), datetime('now'), 1, ?)
         ON CONFLICT (document_id, student_id) DO UPDATE SET
           view_count = view_count + 1, last_viewed_at = datetime('now'),
           first_viewed_at = COALESCE(first_viewed_at, datetime('now')),
           downloaded = MAX(downloaded, excluded.downloaded)`,
        doc.id,
        user.id,
        download ? 1 : 0,
      );
      audit(user.id, download ? 'document téléchargé' : 'document consulté', `« ${doc.title} »`);
    }
    await sendFile(res, doc.file_id, { inline: !download });
  });

  r.post('/api/documents/:id/ack', async ({ user, params }) => {
    if (!isStudent(user)) fail(403, 'Seuls les étudiants confirment la lecture.');
    const doc = await getDocument(params.id);
    await requireCourseAccess(user, doc.course_id);
    await requireVisibleToStudent(user, doc);
    await run(
      `INSERT INTO document_views (document_id, student_id, acknowledged_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT (document_id, student_id) DO UPDATE SET acknowledged_at = COALESCE(acknowledged_at, datetime('now'))`,
      doc.id,
      user.id,
    );
    audit(user.id, 'lecture confirmée', `« ${doc.title} »`);
    return { ok: true };
  });

  // --- Évaluations (plan de cours) -------------------------------------------

  r.get('/api/courses/:id/evaluations', async ({ user, params }) => {
    const course = await requireCourseAccess(user, params.id);
    if (isStudent(user)) {
      const [evaluations, grades, subs] = await Promise.all([
        all('SELECT * FROM evaluations WHERE course_id = ? ORDER BY due_at IS NULL, due_at, id', course.id),
        all(
          `SELECT g.evaluation_id, g.score, g.comment FROM grades g JOIN evaluations e ON e.id = g.evaluation_id
            WHERE e.course_id = ? AND g.student_id = ? AND e.grades_published = 1`,
          course.id,
          user.id,
        ),
        all(
          `SELECT s.id, s.evaluation_id, s.submitted_at, s.comment, f.original_name
             FROM submissions s JOIN files f ON f.id = s.file_id JOIN evaluations e ON e.id = s.evaluation_id
            WHERE e.course_id = ? AND s.student_id = ? ORDER BY s.submitted_at DESC, s.id DESC`,
          course.id,
          user.id,
        ),
      ]);
      const gradeBy = new Map(grades.map((g) => [g.evaluation_id, g]));
      return evaluations.map((ev) => ({
        ...ev,
        my_score: gradeBy.get(ev.id)?.score ?? null,
        my_comment: gradeBy.get(ev.id)?.comment ?? '',
        my_submission: subs.find((s) => s.evaluation_id === ev.id) ?? null,
      }));
    }
    return all(
      `SELECT e.*,
              (SELECT COUNT(DISTINCT s.student_id) FROM submissions s WHERE s.evaluation_id = e.id) AS submission_count,
              (SELECT COUNT(*) FROM grades g WHERE g.evaluation_id = e.id AND g.score IS NOT NULL) AS graded_count
         FROM evaluations e WHERE e.course_id = ? ORDER BY e.due_at IS NULL, e.due_at, e.id`,
      course.id,
    );
  });

  r.post('/api/courses/:id/evaluations', async ({ req, user, params }) => {
    const course = await requireCourseManager(user, params.id);
    const f = evaluationFields(await readJson(req), false);
    const { lastInsertRowid } = await run(
      `INSERT INTO evaluations (course_id, title, kind, weight, max_score, due_at, description, accepts_submissions, grades_published)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      course.id, f.title, f.kind, f.weight, f.max_score, f.due_at, f.description, f.accepts_submissions, f.grades_published,
    );
    audit(user.id, 'évaluation ajoutée', `« ${f.title} » (${f.weight} %) → ${course.code}-${course.group_name}`);
    return one('SELECT * FROM evaluations WHERE id = ?', lastInsertRowid);
  });

  r.patch('/api/evaluations/:id', async ({ req, user, params }) => {
    const ev = await getEvaluation(params.id);
    await requireCourseManager(user, ev.course_id);
    const f = evaluationFields(await readJson(req), true);
    const keys = Object.keys(f);
    if (!keys.length) fail(400, 'Aucune modification.');
    await run(`UPDATE evaluations SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => f[k]), ev.id);
    audit(user.id, 'évaluation modifiée', `« ${ev.title} »`);
    return one('SELECT * FROM evaluations WHERE id = ?', ev.id);
  });

  r.delete('/api/evaluations/:id', async ({ user, params }) => {
    const ev = await getEvaluation(params.id);
    await requireCourseManager(user, ev.course_id);
    await run('DELETE FROM evaluations WHERE id = ?', ev.id);
    audit(user.id, 'évaluation supprimée', `« ${ev.title} »`);
    return { ok: true };
  });

  // --- Notes ------------------------------------------------------------------

  r.get('/api/evaluations/:id/grades', async ({ user, params }) => {
    const ev = await getEvaluation(params.id);
    await requireCourseManager(user, ev.course_id);
    const [students, subs] = await Promise.all([
      all(
        `SELECT u.id, u.first_name, u.last_name, u.student_number, g.score, g.comment
           FROM enrollments e JOIN users u ON u.id = e.student_id
           LEFT JOIN grades g ON g.evaluation_id = ? AND g.student_id = u.id
          WHERE e.course_id = ? ORDER BY u.last_name, u.first_name`,
        ev.id,
        ev.course_id,
      ),
      all(
        `SELECT s.id, s.student_id, s.submitted_at, s.comment, f.original_name, f.size FROM submissions s JOIN files f ON f.id = s.file_id
          WHERE s.evaluation_id = ? ORDER BY s.submitted_at DESC, s.id DESC`,
        ev.id,
      ),
    ]);
    for (const s of students) {
      s.submissions = subs.filter((x) => x.student_id === s.id);
      s.late = !!(ev.due_at && s.submissions[0] && sqlTimeToDate(s.submissions[0].submitted_at) > new Date(ev.due_at));
    }
    return { evaluation: ev, students };
  });

  r.put('/api/evaluations/:id/grades', async ({ req, user, params }) => {
    const ev = await getEvaluation(params.id);
    const course = await requireCourseManager(user, ev.course_id);
    const b = await readJson(req);
    if (!Array.isArray(b.grades)) fail(400, 'Liste de notes invalide.');
    const enrolled = new Set((await all('SELECT student_id FROM enrollments WHERE course_id = ?', course.id)).map((r) => r.student_id));
    const stmts = [];
    for (const g of b.grades) {
      const sid = Number(g.student_id);
      if (!enrolled.has(sid)) continue;
      const score = num(g.score, 'note', { required: false, min: 0, max: ev.max_score });
      stmts.push([
        `INSERT INTO grades (evaluation_id, student_id, score, comment) VALUES (?, ?, ?, ?)
         ON CONFLICT (evaluation_id, student_id) DO UPDATE SET
           score = excluded.score, comment = excluded.comment, updated_at = datetime('now')`,
        [ev.id, sid, score, String(g.comment || '').slice(0, 2000)],
      ]);
    }
    if (b.publish !== undefined) stmts.push(['UPDATE evaluations SET grades_published = ? WHERE id = ?', [b.publish ? 1 : 0, ev.id]]);
    await batch(stmts);
    audit(user.id, 'notes saisies', `« ${ev.title} » ${course.code}-${course.group_name}`);
    return { ok: true };
  });

  r.get('/api/courses/:id/gradebook', async ({ user, params }) => {
    const course = await requireCourseAccess(user, params.id);
    const evaluations = await all('SELECT * FROM evaluations WHERE course_id = ? ORDER BY due_at IS NULL, due_at, id', course.id);
    const total_weight = evaluations.reduce((s, e) => s + e.weight, 0);
    if (isStudent(user)) {
      const published = evaluations.filter((e) => e.grades_published);
      const ids = published.map((e) => e.id);
      const grades = ids.length
        ? await all(`SELECT evaluation_id, score FROM grades WHERE student_id = ? AND evaluation_id IN (${inList(ids)})`, user.id, ...ids)
        : [];
      return { evaluations, total_weight, ...computeAverage(published, new Map(grades.map((g) => [g.evaluation_id, g.score]))) };
    }
    await requireCourseManager(user, course.id);
    const [students, grades] = await Promise.all([
      all(
        `SELECT u.id, u.first_name, u.last_name, u.student_number FROM enrollments e JOIN users u ON u.id = e.student_id
          WHERE e.course_id = ? ORDER BY u.last_name, u.first_name`,
        course.id,
      ),
      all(
        `SELECT g.evaluation_id, g.student_id, g.score FROM grades g JOIN evaluations e ON e.id = g.evaluation_id
          WHERE e.course_id = ?`,
        course.id,
      ),
    ]);
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
    const ev = await getEvaluation(params.id);
    if (!isStudent(user)) fail(403, 'Seuls les étudiants peuvent remettre un travail.');
    await requireCourseAccess(user, ev.course_id);
    if (!ev.accepts_submissions) fail(400, 'Cette évaluation n’accepte pas de remise en ligne.');
    const comment = str(query.comment, 'commentaire', { required: false, max: 2000 });
    const fileId = await saveUpload(req, user.id);
    const { lastInsertRowid } = await run(
      'INSERT INTO submissions (evaluation_id, student_id, file_id, comment) VALUES (?, ?, ?, ?)',
      ev.id,
      user.id,
      fileId,
      comment,
    );
    audit(user.id, 'travail remis', `« ${ev.title} »`);
    return { id: Number(lastInsertRowid) };
  });

  r.get('/api/submissions/:id/file', async ({ user, params, res }) => {
    const sub = await one(
      'SELECT s.*, e.course_id FROM submissions s JOIN evaluations e ON e.id = s.evaluation_id WHERE s.id = ?',
      params.id,
    );
    if (!sub) fail(404, 'Remise introuvable.');
    if (sub.student_id !== user.id) await requireCourseManager(user, sub.course_id);
    await sendFile(res, sub.file_id, { inline: true });
  });
}
