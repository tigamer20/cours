import { one, run, batch } from './db.js';
import { hashPassword } from './auth.js';
import { storeFile } from './files.js';

/** Demo password shared by every demo account (see README). */
export const DEMO_PASSWORD = 'demo12345';

/**
 * Runs at startup when the database has no users:
 *  - ADMIN_EMAIL + ADMIN_PASSWORD set → creates that first admin (production / Render).
 *  - otherwise, outside production (or with SEED_DEMO=true) → loads demo data.
 */
export async function bootstrap() {
  if ((await one('SELECT COUNT(*) AS n FROM users')).n > 0) return;

  const { ADMIN_EMAIL, ADMIN_PASSWORD, NODE_ENV, SEED_DEMO } = process.env;
  if (SEED_DEMO === 'true' || (NODE_ENV !== 'production' && SEED_DEMO !== 'false' && !ADMIN_EMAIL)) {
    await seedDemo();
    console.log('Données de démonstration créées (mot de passe : voir README).');
  }
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    if (ADMIN_PASSWORD.length < 8) throw new Error('ADMIN_PASSWORD doit contenir au moins 8 caractères.');
    await run(
      "INSERT OR IGNORE INTO users (email, password_hash, role, first_name, last_name) VALUES (?, ?, 'admin', 'Admin', 'Principal')",
      ADMIN_EMAIL.toLowerCase(),
      hashPassword(ADMIN_PASSWORD),
    );
    console.log(`Compte administrateur initial créé : ${ADMIN_EMAIL}`);
  }
  if ((await one('SELECT COUNT(*) AS n FROM users')).n === 0) {
    console.warn('Aucun utilisateur : définissez ADMIN_EMAIL et ADMIN_PASSWORD puis redémarrez.');
  }
}

/** Builds a tiny one-page PDF so the demo has documents to open. */
function samplePdf(title, lines) {
  const esc = (s) => s.replace(/[\\()]/g, (c) => '\\' + c);
  const text = [`BT /F1 20 Tf 72 740 Td (${esc(title)}) Tj ET`]
    .concat(lines.map((l, i) => `BT /F1 12 Tf 72 ${700 - i * 20} Td (${esc(l)}) Tj ET`))
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text, 'latin1')} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

async function seedDemo() {
  const pw = hashPassword(DEMO_PASSWORD);
  const day = 86400_000;
  const at = (days, hour = 23, minute = 59) => {
    const d = new Date(Date.now() + days * day);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };
  const isoDate = (days) => new Date(Date.now() + days * day).toISOString().slice(0, 10);
  const S = []; // statements, executed in one atomic batch (one round trip to the online database)
  const q = (sql, ...params) => S.push([sql, params]);

  q("INSERT OR REPLACE INTO settings (key, value) VALUES ('school_name', 'Cégep de démonstration')");
  q("INSERT OR REPLACE INTO settings (key, value) VALUES ('tagline', 'Votre session, au même endroit.')");

  // Users — explicit ids so the whole demo fits in one batch.
  const ADMIN = 1, PROF1 = 2, PROF2 = 3;
  const user = (id, email, role, first, last, number = null, program = null) =>
    q('INSERT INTO users (id, email, password_hash, role, first_name, last_name, student_number, program) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, email, pw, role, first, last, number, program);
  user(ADMIN, 'admin@ecole.test', 'admin', 'Alexandra', 'Gagnon');
  user(PROF1, 'prof.tremblay@ecole.test', 'enseignant', 'Marc', 'Tremblay');
  user(PROF2, 'prof.roy@ecole.test', 'enseignant', 'Julie', 'Roy');
  const students = [
    ['etudiant@ecole.test', 'Léa', 'Bouchard'],
    ['n.cote@ecole.test', 'Nathan', 'Côté'],
    ['e.pelletier@ecole.test', 'Emma', 'Pelletier'],
    ['l.morin@ecole.test', 'Liam', 'Morin'],
    ['c.lavoie@ecole.test', 'Chloé', 'Lavoie'],
    ['t.fortin@ecole.test', 'Thomas', 'Fortin'],
  ].map(([email, first, last], i) => {
    const id = 10 + i;
    user(id, email, 'etudiant', first, last, `2026${1001 + i}`, 'Techniques de l’informatique');
    return id;
  });

  const C1 = 1, C2 = 2, C3 = 3;
  const rules = JSON.stringify({ allow_download: true, require_ack: false, notify: true });
  q('INSERT INTO courses (id, code, name, group_name, term, description, teacher_id, color, document_rules) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', C1, '420-316-SH', 'Structures de données dans les jeux', '01', 'Automne 2026', 'Vecteurs, listes, piles, files, arbres et tables de hachage appliqués au jeu vidéo.', PROF1, '#6366f1', rules);
  q('INSERT INTO courses (id, code, name, group_name, term, description, teacher_id, color, document_rules) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', C2, '420-4219-SH', 'Développement Web', '01', 'Automne 2026', 'HTML, CSS, JavaScript et PHP : conception de sites responsives.', PROF2, '#0ea5e9', '{}');
  q('INSERT INTO courses (id, code, name, group_name, term, description, teacher_id, color, document_rules) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', C3, '201-103-SH', 'Mathématiques appliquées', '01', 'Automne 2026', 'Algèbre linéaire et géométrie pour la programmation.', PROF1, '#f59e0b', '{}');

  for (const s of students) {
    q('INSERT INTO enrollments VALUES (?, ?)', C1, s);
    q('INSERT INTO enrollments VALUES (?, ?)', C2, s);
  }
  for (const s of students.slice(0, 4)) q('INSERT INTO enrollments VALUES (?, ?)', C3, s);

  const slot = (c, d, s, e, room) => q('INSERT INTO schedule_slots (course_id, day, start_time, end_time, room) VALUES (?, ?, ?, ?, ?)', c, d, s, e, room);
  slot(C1, 1, '08:00', '10:00', 'B-204');
  slot(C1, 3, '13:00', '16:00', 'Lab C-110');
  slot(C2, 2, '10:00', '12:00', 'A-301');
  slot(C2, 4, '13:00', '16:00', 'Lab C-112');
  slot(C3, 5, '09:00', '11:00', 'B-108');

  let evalId = 0;
  const evaluation = (c, title, kind, weight, due, opts = {}) => {
    evalId += 1;
    q(
      `INSERT INTO evaluations (id, course_id, title, kind, weight, max_score, due_at, description, accepts_submissions, grades_published)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      evalId, c, title, kind, weight, opts.max ?? 100, due, opts.desc ?? '', opts.submit ? 1 : 0, opts.published ? 1 : 0,
    );
    return evalId;
  };
  const e1 = evaluation(C1, 'Lab 1 — Vecteur', 'laboratoire', 10, at(-20), { submit: true, published: true, desc: 'Implémenter une classe vecteur dynamique.' });
  const e2 = evaluation(C1, 'Lab 2 — Whac-a-mole', 'laboratoire', 10, at(-6), { submit: true, published: true });
  evaluation(C1, 'Examen intra', 'examen', 25, at(5, 8, 0));
  evaluation(C1, 'Lab 3 — Liste chaînée', 'laboratoire', 15, at(9), { submit: true, desc: 'Voir l’énoncé dans les documents du cours.' });
  evaluation(C1, 'Projet final', 'projet', 40, at(55), { submit: true });
  const w1 = evaluation(C2, 'TP1 — Page responsive', 'travail', 15, at(-12), { submit: true, published: true });
  evaluation(C2, 'Quiz CSS', 'quiz', 10, at(3, 10, 0), { max: 20 });
  evaluation(C2, 'TP2 — Intro PHP', 'travail', 20, at(12), { submit: true });
  evaluation(C2, 'Examen final', 'examen', 55, at(60, 13, 0));
  evaluation(C3, 'Devoir 1 — Matrices', 'travail', 20, at(7), { submit: true });
  evaluation(C3, 'Examen 1', 'examen', 30, at(14, 9, 0));
  evaluation(C3, 'Examen final', 'examen', 50, at(58, 9, 0));

  const scores = [[88, 92], [74, 80], [95, 97], [61, 70], [82, 77], [90, 85]];
  students.forEach((s, i) => {
    q('INSERT INTO grades (evaluation_id, student_id, score, comment) VALUES (?, ?, ?, ?)', e1, s, scores[i][0], i === 3 ? 'Revoir la gestion de la mémoire.' : 'Bon travail.');
    q('INSERT INTO grades (evaluation_id, student_id, score, comment) VALUES (?, ?, ?, ?)', e2, s, scores[i][1], '');
    q('INSERT INTO grades (evaluation_id, student_id, score, comment) VALUES (?, ?, ?, ?)', w1, s, 70 + ((i * 7) % 28), '');
  });

  for (const [offset, absent] of [[-14, [3]], [-7, [3, 5]], [-2, [1]]]) {
    students.forEach((s, i) => {
      const status = absent.includes(i) ? 'absent' : i === 4 && offset === -7 ? 'retard' : 'present';
      q('INSERT INTO attendance (course_id, student_id, date, status) VALUES (?, ?, ?, ?)', C1, s, isoDate(offset), status);
    });
  }

  q('INSERT INTO events (course_id, title, description, starts_at, ends_at, created_by) VALUES (NULL, ?, ?, ?, ?, ?)', 'Journée pédagogique', 'Aucun cours.', at(10, 8, 0), at(10, 17, 0), ADMIN);
  q('INSERT INTO events (course_id, title, description, starts_at, ends_at, created_by) VALUES (?, ?, ?, ?, ?, ?)', C1, 'Période de questions — intra', 'Local B-204', at(4, 15, 0), at(4, 16, 0), PROF1);
  q('INSERT INTO events (course_id, title, description, starts_at, ends_at, created_by) VALUES (?, ?, ?, ?, ?, ?)', C2, 'Conférence UX', 'Agora', at(8, 12, 0), at(8, 13, 0), PROF2);

  q('INSERT INTO messages (sender_id, recipient_id, subject, body) VALUES (?, ?, ?, ?)', PROF1, students[0], 'Bienvenue dans le cours', 'Bonjour Léa,\n\nLe plan de cours est disponible dans l’onglet Documents.\n\nMarc Tremblay');
  q('INSERT INTO messages (sender_id, recipient_id, subject, body) VALUES (?, ?, ?, ?)', students[0], PROF1, 'Question sur le lab 3', 'Bonjour, est-ce que les itérateurs inverses sont obligatoires?');
  q('INSERT INTO messages (sender_id, recipient_id, subject, body) VALUES (?, ?, ?, ?)', ADMIN, PROF1, 'Saisie des notes', 'Rappel : les notes de mi-session doivent être saisies avant la fin du mois.');
  q("INSERT INTO audit_log (user_id, action, details) VALUES (?, 'données de démonstration', 'Base initialisée')", ADMIN);

  await batch(S);

  // Documents (files are stored in chunks, outside the batch above).
  const plan = await storeFile('plan-de-cours-420-316.pdf', samplePdf('Plan de cours - 420-316-SH', [
    'Structures de donnees dans les jeux - Automne 2026',
    'Enseignant : Marc Tremblay',
    'Evaluations : Labs 35 %, Examen intra 25 %, Projet final 40 %',
    'Les travaux sont remis sur Cartable avant 23 h 59.',
  ]), PROF1);
  const lab3 = await storeFile('enonce-lab3-liste-chainee.pdf', samplePdf('Lab 3 - Liste chainee', [
    'Implementer une liste doublement chainee generique.',
    'Methodes : push_front, push_back, insert, erase, iterateurs.',
    'Remettre le projet Visual Studio compresse (.zip).',
  ]), PROF1);
  const corr = await storeFile('corrige-lab2.pdf', samplePdf('Corrige - Lab 2', ['Solution commentee du lab 2.']), PROF1);
  const flex = await storeFile('notes-flexbox.pdf', samplePdf('Notes de cours - Flexbox et Grid', [
    'display: flex; justify-content; align-items; gap',
    'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))',
  ]), PROF2);

  const D = [];
  const doc = (id, course, title, desc, category, file, by, rules = {}) =>
    D.push([
      `INSERT INTO documents (id, course_id, title, description, category, file_id, posted_by, status, publish_at, available_until, allow_download, require_ack, notify)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, course, title, desc, category, file, by, rules.status ?? 'published', rules.publish_at ?? null, rules.available_until ?? null,
        rules.allow_download ?? 1, rules.require_ack ?? 0, 0],
    ]);
  doc(1, C1, 'Plan de cours', 'Plan de cours officiel de la session. Lecture obligatoire.', 'Informations', plan, PROF1, { require_ack: 1 });
  doc(2, C1, 'Énoncé — Lab 3', 'Liste chaînée générique.', 'Laboratoires', lab3, PROF1);
  doc(3, C1, 'Corrigé — Lab 2', 'Consultation seulement, publié après la remise.', 'Laboratoires', corr, PROF1, { allow_download: 0, publish_at: at(2, 8, 0) });
  doc(4, C2, 'Notes — Flexbox et Grid', '', 'Semaine 3', flex, PROF2);
  [10, 11, 12, 13].forEach((s, i) =>
    D.push(['INSERT INTO document_views (document_id, student_id, first_viewed_at, last_viewed_at, view_count, downloaded, acknowledged_at) VALUES (1, ?, datetime(\'now\'), datetime(\'now\'), ?, ?, ?)', [s, 1 + (i % 3), i % 2, i < 2 ? new Date().toISOString() : null]]),
  );
  await batch(D);
}
