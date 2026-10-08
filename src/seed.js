import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR, one, run, transaction } from './db.js';
import { hashPassword } from './auth.js';

/** Demo password shared by every demo account (see README). */
export const DEMO_PASSWORD = 'demo12345';

/**
 * Runs at startup when the database has no users:
 *  - ADMIN_EMAIL + ADMIN_PASSWORD set → creates that first admin (production / Render).
 *  - otherwise, outside production (or with SEED_DEMO=true) → loads demo data.
 */
export function bootstrap() {
  if (one('SELECT COUNT(*) AS n FROM users').n > 0) return;

  const { ADMIN_EMAIL, ADMIN_PASSWORD, NODE_ENV, SEED_DEMO } = process.env;
  if (SEED_DEMO === 'true' || (NODE_ENV !== 'production' && SEED_DEMO !== 'false' && !ADMIN_EMAIL)) {
    seedDemo();
    console.log(`Données de démonstration créées (mot de passe : voir README).`);
  }
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    if (ADMIN_PASSWORD.length < 8) throw new Error('ADMIN_PASSWORD doit contenir au moins 8 caractères.');
    run(
      "INSERT OR IGNORE INTO users (email, password_hash, role, first_name, last_name) VALUES (?, ?, 'admin', 'Admin', 'Principal')",
      ADMIN_EMAIL.toLowerCase(),
      hashPassword(ADMIN_PASSWORD),
    );
    console.log(`Compte administrateur initial créé : ${ADMIN_EMAIL}`);
  }
  if (one('SELECT COUNT(*) AS n FROM users').n === 0) {
    console.warn('Aucun utilisateur : définissez ADMIN_EMAIL et ADMIN_PASSWORD puis redémarrez.');
  }
}

/** Builds a tiny one-page PDF so the demo has a document to open. */
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

function storeFile(name, mime, data, userId) {
  const stored = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), data);
  return Number(
    run('INSERT INTO files (original_name, stored_name, mime, size, uploaded_by) VALUES (?, ?, ?, ?, ?)', name, stored, mime, data.length, userId)
      .lastInsertRowid,
  );
}

function seedDemo() {
  const pw = hashPassword(DEMO_PASSWORD);
  const day = 86400_000;
  const at = (days, hour = 23, minute = 59) => {
    const d = new Date(Date.now() + days * day);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };
  const isoDate = (days) => new Date(Date.now() + days * day).toISOString().slice(0, 10);

  transaction(() => {
    const user = (email, role, first, last, extra = {}) =>
      Number(
        run(
          'INSERT INTO users (email, password_hash, role, first_name, last_name, student_number, program) VALUES (?, ?, ?, ?, ?, ?, ?)',
          email, pw, role, first, last, extra.number ?? null, extra.program ?? null,
        ).lastInsertRowid,
      );

    const admin = user('admin@ecole.test', 'admin', 'Alexandra', 'Gagnon');
    const prof1 = user('prof.tremblay@ecole.test', 'enseignant', 'Marc', 'Tremblay');
    const prof2 = user('prof.roy@ecole.test', 'enseignant', 'Julie', 'Roy');
    const students = [
      ['etudiant@ecole.test', 'Léa', 'Bouchard'],
      ['n.cote@ecole.test', 'Nathan', 'Côté'],
      ['e.pelletier@ecole.test', 'Emma', 'Pelletier'],
      ['l.morin@ecole.test', 'Liam', 'Morin'],
      ['c.lavoie@ecole.test', 'Chloé', 'Lavoie'],
      ['t.fortin@ecole.test', 'Thomas', 'Fortin'],
    ].map(([email, first, last], i) =>
      user(email, 'etudiant', first, last, { number: `2026${String(1001 + i)}`, program: 'Techniques de l’informatique' }),
    );

    const course = (code, name, teacher, desc) =>
      Number(
        run('INSERT INTO courses (code, name, group_name, term, description, teacher_id) VALUES (?, ?, ?, ?, ?, ?)', code, name, '01', 'Automne 2026', desc, teacher)
          .lastInsertRowid,
      );
    const c1 = course('420-316-SH', 'Structures de données dans les jeux', prof1, 'Vecteurs, listes, piles, files, arbres et tables de hachage appliqués au jeu vidéo.');
    const c2 = course('420-4219-SH', 'Développement Web', prof2, 'HTML, CSS, JavaScript et PHP : conception de sites responsives.');
    const c3 = course('201-103-SH', 'Mathématiques appliquées', prof1, 'Algèbre linéaire et géométrie pour la programmation.');

    for (const s of students) {
      run('INSERT INTO enrollments VALUES (?, ?)', c1, s);
      run('INSERT INTO enrollments VALUES (?, ?)', c2, s);
    }
    for (const s of students.slice(0, 4)) run('INSERT INTO enrollments VALUES (?, ?)', c3, s);

    const slot = (c, d, s, e, room) => run('INSERT INTO schedule_slots (course_id, day, start_time, end_time, room) VALUES (?, ?, ?, ?, ?)', c, d, s, e, room);
    slot(c1, 1, '08:00', '10:00', 'B-204');
    slot(c1, 3, '13:00', '16:00', 'Lab C-110');
    slot(c2, 2, '10:00', '12:00', 'A-301');
    slot(c2, 4, '13:00', '16:00', 'Lab C-112');
    slot(c3, 5, '09:00', '11:00', 'B-108');

    const evaluation = (c, title, kind, weight, due, opts = {}) =>
      Number(
        run(
          `INSERT INTO evaluations (course_id, title, kind, weight, max_score, due_at, description, accepts_submissions, grades_published)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          c, title, kind, weight, opts.max ?? 100, due, opts.desc ?? '', opts.submit ? 1 : 0, opts.published ? 1 : 0,
        ).lastInsertRowid,
      );
    const e1 = evaluation(c1, 'Lab 1 — Vecteur', 'laboratoire', 10, at(-20), { submit: true, published: true, desc: 'Implémenter une classe vecteur dynamique.' });
    const e2 = evaluation(c1, 'Lab 2 — Whac-a-mole', 'laboratoire', 10, at(-6), { submit: true, published: true });
    evaluation(c1, 'Examen intra', 'examen', 25, at(5, 8, 0));
    evaluation(c1, 'Lab 3 — Liste chaînée', 'laboratoire', 15, at(9), { submit: true, desc: 'Voir l’énoncé dans les documents du cours.' });
    evaluation(c1, 'Projet final', 'projet', 40, at(55), { submit: true });
    const w1 = evaluation(c2, 'TP1 — Page responsive', 'travail', 15, at(-12), { submit: true, published: true });
    evaluation(c2, 'Quiz CSS', 'quiz', 10, at(3, 10, 0), { max: 20 });
    evaluation(c2, 'TP2 — Intro PHP', 'travail', 20, at(12), { submit: true });
    evaluation(c2, 'Examen final', 'examen', 55, at(60, 13, 0));
    evaluation(c3, 'Devoir 1 — Matrices', 'travail', 20, at(7), { submit: true });
    evaluation(c3, 'Examen 1', 'examen', 30, at(14, 9, 0));
    evaluation(c3, 'Examen final', 'examen', 50, at(58, 9, 0));

    const scores = [[88, 92], [74, 80], [95, 97], [61, 70], [82, 77], [90, 85]];
    students.forEach((s, i) => {
      run('INSERT INTO grades (evaluation_id, student_id, score, comment) VALUES (?, ?, ?, ?)', e1, s, scores[i][0], i === 3 ? 'Revoir la gestion de la mémoire.' : 'Bon travail.');
      run('INSERT INTO grades (evaluation_id, student_id, score, comment) VALUES (?, ?, ?, ?)', e2, s, scores[i][1], '');
      run('INSERT INTO grades (evaluation_id, student_id, score, comment) VALUES (?, ?, ?, ?)', w1, s, 70 + ((i * 7) % 28), '');
    });

    const planFile = storeFile('plan-de-cours-420-316.pdf', 'application/pdf', samplePdf('Plan de cours - 420-316-SH', [
      'Structures de donnees dans les jeux - Automne 2026',
      'Enseignant : Marc Tremblay',
      'Evaluations : Labs 35 %, Examen intra 25 %, Projet final 40 %',
      'Les travaux sont remis sur la plateforme avant 23 h 59.',
    ]), prof1);
    const lab3File = storeFile('enonce-lab3-liste-chainee.pdf', 'application/pdf', samplePdf('Lab 3 - Liste chainee', [
      'Implementer une liste doublement chainee generique.',
      'Methodes : push_front, push_back, insert, erase, iterateurs.',
      'Remettre le projet Visual Studio compresse (.zip).',
    ]), prof1);
    const webFile = storeFile('notes-flexbox.pdf', 'application/pdf', samplePdf('Notes de cours - Flexbox et Grid', [
      'display: flex; justify-content; align-items; gap',
      'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))',
    ]), prof2);
    const d1 = Number(run('INSERT INTO documents (course_id, title, description, file_id, posted_by) VALUES (?, ?, ?, ?, ?)', c1, 'Plan de cours', 'Plan de cours officiel de la session.', planFile, prof1).lastInsertRowid);
    run('INSERT INTO documents (course_id, title, description, file_id, posted_by) VALUES (?, ?, ?, ?, ?)', c1, 'Énoncé — Lab 3', 'Liste chaînée générique.', lab3File, prof1);
    run('INSERT INTO documents (course_id, title, description, file_id, posted_by) VALUES (?, ?, ?, ?, ?)', c2, 'Notes — Flexbox et Grid', '', webFile, prof2);
    for (const s of students.slice(0, 4)) {
      run('INSERT INTO document_views (document_id, student_id, view_count, downloaded) VALUES (?, ?, ?, ?)', d1, s, 1 + (s % 3), s % 2);
    }

    for (const [offset, absent] of [[-14, [3]], [-7, [3, 5]], [-2, [1]]]) {
      for (const s of students) {
        const status = absent.includes(students.indexOf(s)) ? 'absent' : students.indexOf(s) === 4 && offset === -7 ? 'retard' : 'present';
        run('INSERT INTO attendance (course_id, student_id, date, status) VALUES (?, ?, ?, ?)', c1, s, isoDate(offset), status);
      }
    }

    run('INSERT INTO events (course_id, title, description, starts_at, ends_at, created_by) VALUES (NULL, ?, ?, ?, ?, ?)', 'Journée pédagogique', 'Aucun cours.', at(10, 8, 0), at(10, 17, 0), admin);
    run('INSERT INTO events (course_id, title, description, starts_at, ends_at, created_by) VALUES (?, ?, ?, ?, ?, ?)', c1, 'Période de questions — intra', 'Local B-204', at(4, 15, 0), at(4, 16, 0), prof1);
    run('INSERT INTO events (course_id, title, description, starts_at, ends_at, created_by) VALUES (?, ?, ?, ?, ?, ?)', c2, 'Conférence UX', 'Agora', at(8, 12, 0), at(8, 13, 0), prof2);

    run('INSERT INTO messages (sender_id, recipient_id, subject, body) VALUES (?, ?, ?, ?)', prof1, students[0], 'Bienvenue dans le cours', 'Bonjour Léa,\n\nLe plan de cours est disponible dans l’onglet Documents.\n\nMarc Tremblay');
    run('INSERT INTO messages (sender_id, recipient_id, subject, body) VALUES (?, ?, ?, ?)', students[0], prof1, 'Question sur le lab 3', 'Bonjour, est-ce que les itérateurs inverses sont obligatoires?');
    run('INSERT INTO messages (sender_id, recipient_id, subject, body) VALUES (?, ?, ?, ?)', admin, prof1, 'Saisie des notes', 'Rappel : les notes de mi-session doivent être saisies avant la fin du mois.');

    run("INSERT INTO audit_log (user_id, action, details) VALUES (?, 'données de démonstration', 'Base initialisée')", admin);
  });
}
