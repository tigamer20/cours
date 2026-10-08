import {
  state, api, qs, html, render, fresh, $, $$, on, formData, toast, toastError, modal, confirmDialog, openViewer,
  fullName, courseLabel, courseColor, fmtDate, fmtDateTime, fmtRelative, fmtShortDate, toLocalInput, fromLocalInput,
  todayStr, fileSize, pct, gradeBadge, KIND_LABEL, STATUS_LABEL, STATUS_COLOR, DAYS, icon, avatar, emptyState,
} from './core.js';
import { composeMessage } from './pages.js';

// ---------- Liste des cours ----------

export async function coursesPage(el) {
  el = fresh(el);
  const courses = await api('/api/courses');
  state.courses = courses;
  const isAdmin = state.me.role === 'admin';
  const teacherOf = (c) => (c.teacher_first_name ? { first_name: c.teacher_first_name, last_name: c.teacher_last_name } : null);
  render(
    el,
    html`
      <div class="page-head">
        <div><h1>${isAdmin ? 'Tous les cours' : 'Mes cours'}</h1><p class="muted">${courses.length} cours</p></div>
        <div class="actions">
          ${courses.length > 3 ? html`<div class="input-icon">${icon('search')}<input type="search" id="course-q" placeholder="Filtrer les cours…"></div>` : ''}
          ${isAdmin ? html`<a class="btn primary" href="#/admin/cours">${icon('layers')}Gérer les cours</a>` : ''}
        </div>
      </div>
      ${courses.length
        ? html`<div class="grid course-grid stagger">${courses.map((c, i) => {
            const t = teacherOf(c);
            return html`<a class="card course-card" href="#/cours/${c.id}" style="--c:${courseColor(c)};--i:${i}" data-q="${`${c.code} ${c.name} ${c.term} ${t ? fullName(t) : ''}`.toLowerCase()}">
              <div class="banner">
                <div class="code">${courseLabel(c)}</div>
                <div class="term">${c.term}</div>
                <span class="banner-icon">${icon('book')}</span>
              </div>
              <div class="body">
                <h3>${c.name}</h3>
                ${c.description ? html`<p class="muted small clamp">${c.description}</p>` : ''}
                <div class="meta">
                  ${t ? html`${avatar(t, 'sm')}<span>${fullName(t)}</span>` : html`<span>Enseignant à déterminer</span>`}
                  <span class="spacer"></span>
                  <span class="badge">${icon('users')}${c.student_count}</span>
                </div>
              </div>
            </a>`;
          })}</div>`
        : html`<div class="card">${emptyState('Aucun cours pour le moment.', 'book')}</div>`}`,
  );
  $('#course-q', el)?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    $$('.course-card', el).forEach((card) => card.classList.toggle('hidden', !card.dataset.q.includes(q)));
  });
}

// ---------- Page d'un cours ----------

const TABS = [
  ['apercu', 'Aperçu'],
  ['documents', 'Documents'],
  ['evaluations', 'Évaluations'],
  ['notes', 'Notes'],
  ['absences', 'Absences'],
  ['etudiants', 'Étudiants', true],
];

export async function coursePage(el, id, tab) {
  el = fresh(el);
  const course = await api(`/api/courses/${id}`);
  const tabs = TABS.filter(([, , managerOnly]) => !managerOnly || course.can_manage);
  if (!tabs.some(([key]) => key === tab)) tab = 'apercu';
  render(
    el,
    html`
      <div class="page-head">
        <div>
          <div class="muted small"><a href="#/cours">Cours</a> / ${courseLabel(course)}</div>
          <h1>${course.name}</h1>
          <p class="muted">${courseLabel(course)} · ${course.term} · ${course.teacher_first_name ? `${course.teacher_first_name} ${course.teacher_last_name}` : 'Enseignant à déterminer'}</p>
        </div>
      </div>
      <nav class="tabs">${tabs.map(([key, label]) => html`<a href="#/cours/${id}/${key}" class="${key === tab ? 'active' : ''}">${label}</a>`)}</nav>
      <div id="tab"></div>`,
  );
  const container = $('#tab', el);
  const reload = () => coursePage(el, id, tab);
  const views = { apercu: overviewTab, documents: documentsTab, evaluations: evaluationsTab, notes: gradesTab, absences: attendanceTab, etudiants: studentsTab };
  await views[tab](container, course, reload);
}

// ----- Aperçu -----

async function overviewTab(el, course, reload) {
  const manage = course.can_manage;
  render(
    el,
    html`
      <div class="grid cols-2">
        <div class="card">
          <div class="card-head"><h2>Description</h2>${manage ? html`<button class="small" id="edit-desc">Modifier</button>` : ''}</div>
          <p class="pre">${course.description || 'Aucune description.'}</p>
          ${course.teacher_email ? html`<p class="muted small">Enseignant : ${course.teacher_first_name} ${course.teacher_last_name} · ${course.teacher_email}</p>` : ''}
        </div>
        <div class="card">
          <div class="card-head"><h2>Horaire</h2>${manage ? html`<button class="small" id="add-slot">Ajouter une plage</button>` : ''}</div>
          ${course.schedule.length
            ? html`<ul class="list">${course.schedule.map(
                (s) => html`<li><span><strong>${DAYS[s.day]}</strong> ${s.start_time} – ${s.end_time}</span>
                  <span class="actions"><span class="badge">${s.room || 'Local à déterminer'}</span>${manage ? html`<button class="small danger" data-del-slot="${s.id}">Retirer</button>` : ''}</span></li>`,
              )}</ul>`
            : html`<div class="empty">Aucune plage horaire.</div>`}
        </div>
      </div>`,
  );
  if (!manage) return;
  $('#edit-desc', el).addEventListener('click', () =>
    modal({
      title: 'Description du cours',
      body: html`<div class="field"><textarea name="description" rows="8">${course.description}</textarea></div>`,
      onSubmit: async (form) => {
        await api(`/api/courses/${course.id}`, { method: 'PATCH', body: formData(form) });
        reload();
      },
    }),
  );
  $('#add-slot', el).addEventListener('click', () =>
    modal({
      title: 'Nouvelle plage horaire',
      body: html`
        <div class="field"><label>Jour</label><select name="day">${[1, 2, 3, 4, 5, 6, 7].map((d) => html`<option value="${d}">${DAYS[d]}</option>`)}</select></div>
        <div class="row">
          <div class="field"><label>Début</label><input type="time" name="start_time" value="08:00" required></div>
          <div class="field"><label>Fin</label><input type="time" name="end_time" value="10:00" required></div>
        </div>
        <div class="field"><label>Local</label><input name="room" placeholder="ex. B-204"></div>`,
      onSubmit: async (form) => {
        await api(`/api/courses/${course.id}/schedule`, { method: 'POST', body: formData(form) });
        reload();
      },
    }),
  );
  on(el, 'click', '[data-del-slot]', async (b) => {
    await api(`/api/schedule/${b.dataset.delSlot}`, { method: 'DELETE' });
    reload();
  });
}

// ----- Documents -----

const docFileUrl = (id, mode) => `/api/documents/${id}/file?mode=${mode}`;

async function documentsTab(el, course, reload) {
  const docs = await api(`/api/courses/${course.id}/documents`);
  const manage = course.can_manage;
  const student = state.me.role === 'etudiant';
  render(
    el,
    html`
      <div class="card">
        <div class="card-head"><h2>Documents du cours</h2>${manage ? html`<button class="primary" id="upload">Publier un document</button>` : ''}</div>
        ${docs.length
          ? html`<div class="table-wrap"><table>
              <thead><tr><th>Document</th><th>Fichier</th><th>Publié</th><th>${student ? 'Statut' : 'Consultations'}</th><th></th></tr></thead>
              <tbody>${docs.map(
                (d) => html`<tr>
                  <td><strong>${d.title}</strong>${d.description ? html`<div class="muted small">${d.description}</div>` : ''}</td>
                  <td class="small">${d.original_name}<div class="muted">${fileSize(d.size)}</div></td>
                  <td class="small nowrap">${fmtShortDate(d.created_at)}</td>
                  <td class="small">${student
                    ? d.first_viewed_at
                      ? html`<span class="badge green">Consulté</span><div class="muted">${fmtDateTime(d.first_viewed_at)}</div>`
                      : html`<span class="badge blue">Nouveau</span>`
                    : html`<button class="link" data-views="${d.id}">Vu par ${d.viewed_count}/${d.student_count}</button>
                        <div class="progress"><span style="width:${d.student_count ? (d.viewed_count / d.student_count) * 100 : 0}%"></span></div>`}</td>
                  <td class="right"><div class="actions" style="justify-content:flex-end">
                    <button class="small" data-view="${d.id}">Ouvrir</button>
                    <a class="btn small" href="${docFileUrl(d.id, 'download')}" data-dl>Télécharger</a>
                    ${manage ? html`<button class="small danger" data-del="${d.id}">Supprimer</button>` : ''}
                  </div></td>
                </tr>`,
              )}</tbody></table></div>`
          : html`<div class="empty">Aucun document publié.</div>`}
      </div>`,
  );

  on(el, 'click', '[data-view]', (b) => {
    const d = docs.find((x) => x.id === Number(b.dataset.view));
    openViewer(d.title, docFileUrl(d.id, 'view'), d.mime, docFileUrl(d.id, 'download'));
    if (student && !d.first_viewed_at) setTimeout(reload, 1500);
  });
  on(el, 'click', '[data-dl]', () => student && setTimeout(reload, 1500));
  if (!manage) return;

  on(el, 'click', '[data-del]', async (b) => {
    if (!(await confirmDialog('Supprimer ce document? Les étudiants n’y auront plus accès.'))) return;
    await api(`/api/documents/${b.dataset.del}`, { method: 'DELETE' });
    toast('Document supprimé.');
    reload();
  });
  on(el, 'click', '[data-views]', async (b) => {
    const views = await api(`/api/documents/${b.dataset.views}/views`);
    modal({
      title: 'Consultations du document',
      size: 'wide',
      body: html`<div class="table-wrap"><table>
        <thead><tr><th>Étudiant</th><th>Première consultation</th><th>Dernière</th><th>Ouvertures</th><th>Téléchargé</th></tr></thead>
        <tbody>${views.map(
          (v) => html`<tr><td>${fullName(v)} <span class="muted small">${v.student_number || ''}</span></td>
            <td>${v.first_viewed_at ? fmtDateTime(v.first_viewed_at) : html`<span class="badge red">Jamais vu</span>`}</td>
            <td>${v.last_viewed_at ? fmtDateTime(v.last_viewed_at) : '—'}</td>
            <td>${v.view_count || 0}</td><td>${v.downloaded ? 'Oui' : 'Non'}</td></tr>`,
        )}</tbody></table></div>`,
    });
  });
  $('#upload', el).addEventListener('click', () =>
    modal({
      title: 'Publier un document',
      submitLabel: 'Publier',
      body: html`
        <div class="field"><label>Titre</label><input name="title" required maxlength="200"></div>
        <div class="field"><label>Description (optionnelle)</label><textarea name="description" rows="3"></textarea></div>
        <div class="field"><label>Fichier (PDF, Word, images, ZIP… 25 Mo max.)</label><input type="file" name="file" required></div>`,
      onSubmit: async (form) => {
        const f = formData(form);
        if (!f.file) throw new Error('Choisissez un fichier.');
        if (!f.title) f.title = f.file.name.replace(/\.[^.]+$/, '');
        await api(`/api/courses/${course.id}/documents${qs({ title: f.title, description: f.description })}`, { method: 'POST', file: f.file });
        toast('Document publié.');
        reload();
      },
    }),
  );
}

// ----- Évaluations (plan de cours) -----

function evaluationForm(ev = {}) {
  return html`
    <div class="field"><label>Titre</label><input name="title" value="${ev.title || ''}" required maxlength="200"></div>
    <div class="row">
      <div class="field"><label>Type</label><select name="kind">${Object.entries(KIND_LABEL).map(([k, l]) => html`<option value="${k}" ${ev.kind === k ? 'selected' : ''}>${l}</option>`)}</select></div>
      <div class="field"><label>Pondération (%)</label><input type="number" name="weight" min="0" max="100" step="0.5" value="${ev.weight ?? ''}" required></div>
      <div class="field"><label>Noté sur</label><input type="number" name="max_score" min="1" step="0.5" value="${ev.max_score ?? 100}" required></div>
    </div>
    <div class="field"><label>Date d’échéance</label><input type="datetime-local" name="due_at" value="${toLocalInput(ev.due_at)}"></div>
    <div class="field"><label>Description / consignes</label><textarea name="description" rows="4">${ev.description || ''}</textarea></div>
    <label class="check"><input type="checkbox" name="accepts_submissions" ${ev.accepts_submissions ? 'checked' : ''}> Les étudiants remettent un fichier en ligne</label>
    <label class="check"><input type="checkbox" name="grades_published" ${ev.grades_published ? 'checked' : ''}> Notes visibles par les étudiants</label>`;
}

const evalBody = (form) => {
  const f = formData(form);
  return { ...f, due_at: fromLocalInput(f.due_at) };
};

async function evaluationsTab(el, course, reload) {
  const evals = await api(`/api/courses/${course.id}/evaluations`);
  const manage = course.can_manage;
  const student = state.me.role === 'etudiant';
  const totalWeight = evals.reduce((s, e) => s + e.weight, 0);
  const now = Date.now();

  render(
    el,
    html`
      <div class="card">
        <div class="card-head">
          <h2>Plan d’évaluation</h2>
          ${manage ? html`<button class="primary" id="add-eval">Ajouter une évaluation</button>` : ''}
        </div>
        ${manage && evals.length && totalWeight !== 100 ? html`<div class="alert">La somme des pondérations est de <strong>${totalWeight} %</strong> (devrait être 100 %).</div>` : ''}
        ${evals.length
          ? html`<div class="table-wrap"><table>
              <thead><tr><th>Évaluation</th><th>Type</th><th class="right">Poids</th><th>Échéance</th>
                ${student ? html`<th>Remise</th><th>Note</th>` : html`<th>Remises</th><th>Corrigées</th><th>Notes</th><th></th>`}</tr></thead>
              <tbody>${evals.map((e) => {
                const overdue = e.due_at && new Date(e.due_at) < now;
                return html`<tr>
                  <td><strong>${e.title}</strong>${e.description ? html`<div class="muted small pre">${e.description}</div>` : ''}</td>
                  <td><span class="badge">${KIND_LABEL[e.kind]}</span></td>
                  <td class="right nowrap">${e.weight} %</td>
                  <td class="small nowrap">${e.due_at ? html`${fmtDateTime(e.due_at)}<div class="muted">${fmtRelative(e.due_at)}</div>` : '—'}</td>
                  ${student
                    ? html`<td class="small">${e.accepts_submissions
                        ? html`${e.my_submission
                            ? html`<span class="badge green">Remis</span><div class="muted">${fmtDateTime(e.my_submission.submitted_at)}</div>
                                <a href="/api/submissions/${e.my_submission.id}/file" target="_blank" rel="noopener">${e.my_submission.original_name}</a><br>`
                            : overdue ? html`<span class="badge red">En retard</span><br>` : html`<span class="badge orange">À remettre</span><br>`}
                          <button class="small" data-submit="${e.id}" style="margin-top:.3rem">${e.my_submission ? 'Remettre à nouveau' : 'Remettre'}</button>`
                        : html`<span class="muted">En classe</span>`}</td>
                      <td class="nowrap">${e.my_score !== null
                        ? html`<strong>${e.my_score}/${e.max_score}</strong> ${gradeBadge((e.my_score / e.max_score) * 100)}${e.my_comment ? html`<div class="muted small">${e.my_comment}</div>` : ''}`
                        : html`<span class="muted">—</span>`}</td>`
                    : html`<td>${e.accepts_submissions ? `${e.submission_count}/${course.student_count}` : html`<span class="muted">—</span>`}</td>
                      <td>${e.graded_count}/${course.student_count}</td>
                      <td>${e.grades_published ? html`<span class="badge green">Publiées</span>` : html`<span class="badge">Cachées</span>`}</td>
                      <td class="right"><div class="actions" style="justify-content:flex-end">
                        <a class="btn small primary" href="#/evaluation/${e.id}">Corriger</a>
                        <button class="small" data-edit="${e.id}">Modifier</button>
                        <button class="small danger" data-del="${e.id}">Supprimer</button>
                      </div></td>`}
                </tr>`;
              })}</tbody>
              <tfoot><tr><td colspan="2">Total</td><td class="right">${totalWeight} %</td><td colspan="${student ? 3 : 5}"></td></tr></tfoot>
            </table></div>`
          : html`<div class="empty">Le plan d’évaluation n’a pas encore été publié.</div>`}
      </div>`,
  );

  on(el, 'click', '[data-submit]', (b) => {
    const ev = evals.find((x) => x.id === Number(b.dataset.submit));
    modal({
      title: `Remettre : ${ev.title}`,
      submitLabel: 'Remettre le travail',
      body: html`
        ${ev.due_at ? html`<p class="muted">Échéance : ${fmtDateTime(ev.due_at)} (${fmtRelative(ev.due_at)})</p>` : ''}
        ${ev.my_submission ? html`<div class="alert">Une nouvelle remise remplace la précédente aux yeux de l’enseignant (l’historique est conservé).</div>` : ''}
        <div class="field"><label>Fichier (25 Mo max.)</label><input type="file" name="file" required></div>
        <div class="field"><label>Commentaire (optionnel)</label><textarea name="comment" rows="3"></textarea></div>`,
      onSubmit: async (form) => {
        const f = formData(form);
        if (!f.file) throw new Error('Choisissez un fichier.');
        await api(`/api/evaluations/${ev.id}/submissions${qs({ comment: f.comment })}`, { method: 'POST', file: f.file });
        toast('Travail remis!');
        reload();
      },
    });
  });
  if (!manage) return;

  $('#add-eval', el).addEventListener('click', () =>
    modal({
      title: 'Nouvelle évaluation',
      body: evaluationForm({ accepts_submissions: 1 }),
      onSubmit: async (form) => {
        await api(`/api/courses/${course.id}/evaluations`, { method: 'POST', body: evalBody(form) });
        toast('Évaluation ajoutée.');
        reload();
      },
    }),
  );
  on(el, 'click', '[data-edit]', (b) => {
    const ev = evals.find((x) => x.id === Number(b.dataset.edit));
    modal({
      title: 'Modifier l’évaluation',
      body: evaluationForm(ev),
      onSubmit: async (form) => {
        await api(`/api/evaluations/${ev.id}`, { method: 'PATCH', body: evalBody(form) });
        reload();
      },
    });
  });
  on(el, 'click', '[data-del]', async (b) => {
    if (!(await confirmDialog('Supprimer cette évaluation ainsi que toutes ses notes et remises?'))) return;
    await api(`/api/evaluations/${b.dataset.del}`, { method: 'DELETE' });
    reload();
  });
}

// ----- Notes -----

async function gradesTab(el, course) {
  if (state.me.role === 'etudiant') {
    const [evals, book] = await Promise.all([api(`/api/courses/${course.id}/evaluations`), api(`/api/courses/${course.id}/gradebook`)]);
    const graded = evals.filter((e) => e.my_score !== null);
    render(
      el,
      html`
        <div class="stats">
          <div class="stat"><div class="value">${pct(book.average)}</div><div class="label">Moyenne actuelle (évaluations corrigées)</div></div>
          <div class="stat"><div class="value">${book.earned} / ${book.weight_graded}</div><div class="label">Points accumulés sur ${book.total_weight} %</div></div>
          <div class="stat"><div class="value">${graded.length}/${evals.length}</div><div class="label">Évaluations corrigées</div></div>
        </div>
        <div class="card"><div class="table-wrap"><table>
          <thead><tr><th>Évaluation</th><th class="right">Poids</th><th class="right">Note</th><th class="right">%</th><th>Commentaire</th></tr></thead>
          <tbody>${evals.map(
            (e) => html`<tr><td>${e.title}</td><td class="right">${e.weight} %</td>
              <td class="right nowrap">${e.my_score !== null ? `${e.my_score}/${e.max_score}` : html`<span class="muted">—</span>`}</td>
              <td class="right">${e.my_score !== null ? gradeBadge((e.my_score / e.max_score) * 100) : ''}</td>
              <td class="small">${e.my_comment}</td></tr>`,
          )}</tbody></table></div></div>`,
    );
    return;
  }

  const book = await api(`/api/courses/${course.id}/gradebook`);
  const evalAvg = (ev) => {
    const vals = book.students.map((s) => s.scores[ev.id]).filter((v) => v !== null && v !== undefined);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length / ev.max_score) * 100 : null;
  };
  render(
    el,
    html`
      <div class="card">
        <div class="card-head">
          <h2>Relevé de notes</h2>
          <div class="actions"><span class="muted small">Moyenne du groupe : <strong>${pct(book.class_average)}</strong></span><button class="small" id="csv">Exporter (CSV)</button></div>
        </div>
        ${book.students.length && book.evaluations.length
          ? html`<div class="table-wrap"><table class="matrix">
              <thead><tr><th>Étudiant</th>${book.evaluations.map((e) => html`<th><a href="#/evaluation/${e.id}" title="${e.title}">${e.title.length > 18 ? e.title.slice(0, 17) + '…' : e.title}</a><div class="muted small">${e.weight} % · /${e.max_score}</div></th>`)}<th>Moyenne</th><th>Points</th></tr></thead>
              <tbody>${book.students.map(
                (s) => html`<tr><td><a href="#/etudiants/${s.id}">${fullName(s)}</a></td>
                  ${book.evaluations.map((e) => html`<td>${s.scores[e.id] ?? html`<span class="muted">—</span>`}</td>`)}
                  <td>${gradeBadge(s.average)}</td><td>${s.earned}/${s.weight_graded}</td></tr>`,
              )}</tbody>
              <tfoot><tr><td>Moyenne</td>${book.evaluations.map((e) => html`<td>${pct(evalAvg(e))}</td>`)}<td>${pct(book.class_average)}</td><td></td></tr></tfoot>
            </table></div>`
          : html`<div class="empty">Ajoutez des évaluations et des étudiants pour voir le relevé.</div>`}
      </div>`,
  );
  $('#csv', el).addEventListener('click', () => {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Nom', 'Prénom', 'Numéro', ...book.evaluations.map((e) => `${e.title} (/${e.max_score}, ${e.weight}%)`), 'Moyenne %'],
      ...book.students.map((s) => [s.last_name, s.first_name, s.student_number, ...book.evaluations.map((e) => s.scores[e.id] ?? ''), s.average ?? '']),
    ];
    const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `notes-${courseLabel(course)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}

// ----- Absences -----

async function attendanceTab(el, course, reload, date = todayStr()) {
  if (state.me.role === 'etudiant') {
    const { records } = await api(`/api/courses/${course.id}/attendance`);
    const count = (s) => records.filter((r) => r.status === s).length;
    render(
      el,
      html`
        <div class="stats">${['absent', 'retard', 'motive', 'present'].map((s) => html`<div class="stat"><div class="value">${count(s)}</div><div class="label">${STATUS_LABEL[s]}</div></div>`)}</div>
        <div class="card"><h2>Mes présences</h2>
          ${records.length
            ? html`<ul class="list">${records.map((r) => html`<li><span>${fmtDate(r.date)}${r.note ? html` <span class="muted small">— ${r.note}</span>` : ''}</span><span class="badge ${STATUS_COLOR[r.status]}">${STATUS_LABEL[r.status]}</span></li>`)}</ul>`
            : html`<div class="empty">Aucune présence saisie.</div>`}
        </div>`,
    );
    return;
  }

  const data = await api(`/api/courses/${course.id}/attendance${qs({ date })}`);
  render(
    el,
    html`
      <div class="grid cols-2">
        <div class="card">
          <div class="card-head"><h2>Prise des présences</h2></div>
          <div class="toolbar">
            <div><label>Date du cours</label><input type="date" id="att-date" value="${date}"></div>
            <button id="all-present">Tous présents</button>
          </div>
          ${data.roster.length
            ? html`<form id="att-form"><div class="table-wrap"><table>
                <thead><tr><th>Étudiant</th><th>Statut</th><th>Note</th></tr></thead>
                <tbody>${data.roster.map(
                  (s) => html`<tr><td>${fullName(s)}</td>
                    <td><select name="status-${s.id}" data-student="${s.id}">
                      <option value="">—</option>
                      ${Object.entries(STATUS_LABEL).map(([k, l]) => html`<option value="${k}" ${s.status === k ? 'selected' : ''}>${l}</option>`)}
                    </select></td>
                    <td><input name="note-${s.id}" value="${s.note || ''}" maxlength="500" placeholder="optionnel"></td></tr>`,
                )}</tbody></table></div>
                <div class="actions" style="margin-top:1rem"><button type="submit" class="primary">Enregistrer les présences</button></div></form>`
            : html`<div class="empty">Aucun étudiant inscrit.</div>`}
        </div>
        <div>
          <div class="card">
            <h2>Bilan par étudiant</h2>
            <div class="table-wrap"><table>
              <thead><tr><th>Étudiant</th><th class="right">Absences</th><th class="right">Retards</th><th class="right">Motivées</th></tr></thead>
              <tbody>${data.summary.map(
                (s) => html`<tr><td><a href="#/etudiants/${s.id}">${fullName(s)}</a></td>
                  <td class="right">${s.absent ? html`<span class="badge ${s.absent >= 3 ? 'red' : 'orange'}">${s.absent}</span>` : 0}</td>
                  <td class="right">${s.retard || 0}</td><td class="right">${s.motive || 0}</td></tr>`,
              )}</tbody></table></div>
          </div>
          <div class="card">
            <h2>Séances saisies</h2>
            ${data.dates.length
              ? html`<div class="actions">${data.dates.map((d) => html`<button class="small ${d === date ? 'primary' : ''}" data-date="${d}">${fmtShortDate(d)}</button>`)}</div>`
              : html`<div class="empty">Aucune séance.</div>`}
          </div>
        </div>
      </div>`,
  );
  const go = (d) => attendanceTab(fresh(el), course, reload, d);
  $('#att-date', el).addEventListener('change', (e) => e.target.value && go(e.target.value));
  on(el, 'click', '[data-date]', (b) => go(b.dataset.date));
  $('#all-present', el).addEventListener('click', () => $$('select[data-student]', el).forEach((s) => (s.value = 'present')));
  $('#att-form', el)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const records = $$('select[data-student]', el).map((s) => ({
      student_id: Number(s.dataset.student),
      status: s.value,
      note: $(`[name="note-${s.dataset.student}"]`, el).value,
    }));
    try {
      await api(`/api/courses/${course.id}/attendance`, { method: 'PUT', body: { date, records } });
      toast('Présences enregistrées.');
      go(date);
    } catch (err) {
      toastError(err);
    }
  });
}

// ----- Étudiants -----

async function studentsTab(el, course, reload) {
  const students = await api(`/api/courses/${course.id}/students`);
  const isAdmin = state.me.role === 'admin';
  render(
    el,
    html`
      <div class="card">
        <div class="card-head">
          <h2>Étudiants inscrits (${students.length})</h2>
          <div class="actions">
            <button id="write-all">Écrire au groupe</button>
            ${isAdmin ? html`<button class="primary" id="enroll">Inscrire des étudiants</button>` : ''}
          </div>
        </div>
        ${students.length
          ? html`<div class="table-wrap"><table>
              <thead><tr><th>Nom</th><th>Numéro</th><th>Courriel</th><th>Programme</th><th class="right">Absences</th><th></th></tr></thead>
              <tbody>${students.map(
                (s) => html`<tr><td>${fullName(s)} ${s.active ? '' : html`<span class="badge red">Inactif</span>`}</td><td>${s.student_number || '—'}</td>
                  <td class="small">${s.email}</td><td class="small">${s.program || '—'}</td>
                  <td class="right">${s.absences}</td>
                  <td class="right"><div class="actions" style="justify-content:flex-end">
                    <a class="btn small" href="#/etudiants/${s.id}">Dossier</a>
                    ${isAdmin ? html`<button class="small danger" data-remove="${s.id}">Retirer</button>` : ''}
                  </div></td></tr>`,
              )}</tbody></table></div>`
          : html`<div class="empty">Aucun étudiant inscrit.</div>`}
      </div>`,
  );
  $('#write-all', el).addEventListener('click', () => composeMessage({ courseId: course.id, courseName: courseLabel(course) }));
  if (!isAdmin) return;

  on(el, 'click', '[data-remove]', async (b) => {
    if (!(await confirmDialog('Retirer cet étudiant du cours?'))) return;
    await api(`/api/courses/${course.id}/students/${b.dataset.remove}`, { method: 'DELETE' });
    reload();
  });
  $('#enroll', el).addEventListener('click', async () => {
    const all = await api('/api/users?role=etudiant');
    const enrolled = new Set(students.map((s) => s.id));
    const candidates = all.filter((s) => !enrolled.has(s.id) && s.active);
    const m = modal({
      title: 'Inscrire des étudiants',
      submitLabel: 'Inscrire',
      body: html`
        <div class="field"><input type="search" id="enroll-search" placeholder="Rechercher…"></div>
        <div class="recipients">${candidates.length
          ? candidates.map((s) => html`<label class="check" data-name="${(fullName(s) + ' ' + (s.student_number || '')).toLowerCase()}"><input type="checkbox" name="s" value="${s.id}"> ${fullName(s)} <span class="muted small">${s.student_number || ''}</span></label>`)
          : html`<div class="empty">Tous les étudiants sont déjà inscrits.</div>`}</div>`,
      onSubmit: async (form) => {
        const ids = $$('input[name="s"]:checked', form).map((c) => Number(c.value));
        if (!ids.length) throw new Error('Sélectionnez au moins un étudiant.');
        await api(`/api/courses/${course.id}/students`, { method: 'POST', body: { student_ids: ids } });
        toast(`${ids.length} étudiant(s) inscrit(s).`);
        reload();
      },
    });
    $('#enroll-search', m.el).addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      $$('[data-name]', m.el).forEach((l) => l.classList.toggle('hidden', !l.dataset.name.includes(q)));
    });
  });
}

// ---------- Correction d'une évaluation ----------

export async function gradingPage(el, evalId) {
  const { evaluation: ev, students } = await api(`/api/evaluations/${evalId}/grades`);
  const course = await api(`/api/courses/${ev.course_id}`);
  render(
    el,
    html`
      <div class="page-head">
        <div>
          <div class="muted small"><a href="#/cours/${course.id}/evaluations">${courseLabel(course)} — ${course.name}</a> / Correction</div>
          <h1>${ev.title}</h1>
          <p class="muted">${KIND_LABEL[ev.kind]} · ${ev.weight} % · noté sur ${ev.max_score}${ev.due_at ? ` · échéance ${fmtDateTime(ev.due_at)}` : ''}</p>
        </div>
      </div>
      <form class="card" id="grade-form">
        <div class="table-wrap"><table>
          <thead><tr><th>Étudiant</th>${ev.accepts_submissions ? html`<th>Remise</th>` : ''}<th>Note /${ev.max_score}</th><th>Commentaire</th></tr></thead>
          <tbody>${students.map(
            (s) => html`<tr>
              <td><a href="#/etudiants/${s.id}">${fullName(s)}</a><div class="muted small">${s.student_number || ''}</div></td>
              ${ev.accepts_submissions
                ? html`<td class="small">${s.submissions.length
                    ? html`<a href="/api/submissions/${s.submissions[0].id}/file" target="_blank" rel="noopener">${s.submissions[0].original_name}</a>
                        <div class="muted">${fmtDateTime(s.submissions[0].submitted_at)} ${s.late ? html`<span class="badge red">En retard</span>` : ''}
                        ${s.submissions.length > 1 ? html` · ${s.submissions.length} versions` : ''}</div>
                        ${s.submissions[0].comment ? html`<div class="muted pre">« ${s.submissions[0].comment} »</div>` : ''}`
                    : html`<span class="badge">Non remis</span>`}</td>`
                : ''}
              <td><input class="score" type="number" step="0.5" min="0" max="${ev.max_score}" data-score="${s.id}" value="${s.score ?? ''}"></td>
              <td><input data-comment="${s.id}" value="${s.comment || ''}" maxlength="2000" placeholder="Rétroaction"></td>
            </tr>`,
          )}</tbody></table></div>
        <div class="actions" style="margin-top:1rem;justify-content:space-between">
          <label class="check"><input type="checkbox" id="publish" ${ev.grades_published ? 'checked' : ''}> Notes visibles par les étudiants</label>
          <button type="submit" class="primary">Enregistrer les notes</button>
        </div>
      </form>`,
  );
  $('#grade-form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const grades = students.map((s) => ({
      student_id: s.id,
      score: $(`[data-score="${s.id}"]`, el).value,
      comment: $(`[data-comment="${s.id}"]`, el).value,
    }));
    try {
      await api(`/api/evaluations/${ev.id}/grades`, { method: 'PUT', body: { grades, publish: $('#publish', el).checked } });
      toast('Notes enregistrées.');
    } catch (err) {
      toastError(err);
    }
  });
}
