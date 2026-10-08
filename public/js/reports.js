// Bulletins de fin de session : listes par rôle, saisie enseignant, publication admin, bulletin imprimable.
import {
  APP_NAME, state, api, html, render, fresh, $, $$, on, toast, toastError, confirmDialog,
  fullName, courseLabel, courseColor, fmtDate, fmtDateTime, pct, icon, avatar, emptyState, toggle,
} from './core.js';

const termUrl = (term) => encodeURIComponent(term);
const PASS = 60;

function gradeCell(g) {
  if (g === null || g === undefined) return html`<span class="muted">—</span>`;
  return html`<strong class="${g >= PASS ? '' : 'fail'}">${g}</strong>`;
}

// ---------- Liste des sessions ----------

export async function bulletinsPage(el) {
  el = fresh(el);
  const { me } = state;
  const terms = await api('/api/reports');
  const head = html`<div class="page-head"><div><h1>Bulletins</h1><p class="muted">${
    me.role === 'etudiant'
      ? 'Vos bulletins de fin de session, une fois publiés par l’administration.'
      : me.role === 'enseignant'
        ? 'Remettez les résultats finaux de vos cours pour chaque session.'
        : 'Suivez la remise des résultats et publiez les bulletins de chaque session.'
  }</p></div></div>`;

  if (me.role === 'etudiant') {
    render(
      el,
      html`${head}${terms.length
        ? html`<div class="grid cols-3 stagger">${terms.map(
            (t, i) => html`<a class="card term-card" href="#/bulletins/${termUrl(t.term)}/${me.id}" style="--i:${i}">
              <span class="term-icon">${icon('report')}</span>
              <div><h3>${t.term}</h3><p class="muted small">Publié le ${fmtDate(t.published_at)}</p></div>
              ${icon('chevronRight')}
            </a>`,
          )}</div>`
        : html`<div class="card">${emptyState('Aucun bulletin publié pour le moment.', 'report')}</div>`}`,
    );
    return;
  }

  if (me.role === 'enseignant') {
    render(
      el,
      html`${head}${terms.length
        ? terms.map(
            (t) => html`<div class="card">
              <div class="card-head"><h2>${icon('report')}${t.term}</h2>
                ${t.published ? html`<span class="badge green">${icon('check')}Bulletins publiés</span>` : html`<span class="badge">Non publiés</span>`}</div>
              <ul class="list">${t.my_courses.map(
                (c) => html`<li><span class="dot-c" style="--c:${courseColor(c)}"></span>
                  <div class="grow"><span class="title">${courseLabel(c)} — ${c.name}</span>
                    <span class="muted xs">${c.results_final ? `Résultats remis le ${fmtDateTime(c.results_final_at)}` : 'Résultats à remettre'}</span></div>
                  ${c.results_final ? html`<span class="badge green">${icon('check')}Remis</span>` : html`<span class="badge orange">À remettre</span>`}
                  <a class="btn small ${c.results_final ? '' : 'primary'}" href="#/cours/${c.id}/bulletin">${c.results_final ? 'Voir' : 'Saisir les résultats'}</a></li>`,
              )}</ul>
            </div>`,
          )
        : html`<div class="card">${emptyState('Aucun cours.', 'book')}</div>`}`,
    );
    return;
  }

  render(
    el,
    html`${head}${terms.length
      ? html`<div class="grid cols-3 stagger">${terms.map((t, i) => {
          const progress = t.courses ? Math.round((t.finalized / t.courses) * 100) : 0;
          return html`<a class="card term-card admin" href="#/bulletins/${termUrl(t.term)}" style="--i:${i}">
            <div class="row-flex"><span class="term-icon">${icon('report')}</span><h3 style="margin:0">${t.term}</h3><span class="spacer"></span>
              ${t.published ? html`<span class="badge green">Publiés</span>` : html`<span class="badge">Brouillon</span>`}</div>
            <div class="muted small">${t.finalized}/${t.courses} cours remis · ${t.students} étudiant(s)</div>
            <div class="progress ${progress === 100 ? 'green' : ''}"><span style="width:${progress}%"></span></div>
          </a>`;
        })}</div>`
      : html`<div class="card">${emptyState('Aucune session : créez d’abord des cours.', 'report')}</div>`}`,
  );
}

// ---------- Administration d'une session ----------

export async function adminTermPage(el, term) {
  el = fresh(el);
  const data = await api(`/api/reports/${termUrl(term)}`);
  const { status } = data;
  const finalized = data.courses.filter((c) => c.results_final).length;
  const reload = () => adminTermPage(el, term);
  render(
    el,
    html`
      <div class="page-head">
        <div><div class="crumbs"><a href="#/bulletins">Bulletins</a> / ${term}</div><h1>Bulletins — ${term}</h1>
          <p class="muted">${finalized}/${data.courses.length} cours ont remis leurs résultats · ${data.students.length} étudiant(s)</p></div>
        <div class="actions">
          <a class="btn" href="#/bulletins/${termUrl(term)}/tous">${icon('printer')}Imprimer tous les bulletins</a>
        </div>
      </div>
      <div class="grid cols-2">
        <form class="card" id="publish-form">
          <div class="card-head"><h2>${icon('send')}Publication</h2>
            ${status.published ? html`<span class="badge green">Publiés le ${fmtDateTime(status.published_at)}</span>` : html`<span class="badge">Non publiés</span>`}</div>
          ${finalized < data.courses.length && !status.published
            ? html`<div class="alert warn">${icon('alert')}<span>${data.courses.length - finalized} cours n’ont pas encore remis leurs résultats. Leurs notes seront provisoires.</span></div>`
            : ''}
          <div class="field"><label>Mot de la direction (affiché sur chaque bulletin)</label>
            <textarea name="message" rows="4" maxlength="2000" placeholder="ex. Félicitations pour cette session! Bon congé.">${status.message || ''}</textarea></div>
          ${toggle('published', status.published, 'Bulletins visibles par les étudiants', 'À la publication, chaque étudiant reçoit un message l’avisant que son bulletin est prêt.')}
          <button type="submit" class="primary">${icon('check')}Enregistrer</button>
        </form>
        <div class="card">
          <div class="card-head"><h2>${icon('layers')}Remise des résultats par cours</h2></div>
          <ul class="list">${data.courses.map(
            (c) => html`<li><span class="dot-c" style="--c:${courseColor(c)}"></span>
              <div class="grow"><a class="title" href="#/cours/${c.id}/bulletin">${courseLabel(c)} — ${c.name}</a>
                <span class="muted xs">${c.teacher_first_name ? `${c.teacher_first_name} ${c.teacher_last_name}` : 'Sans enseignant'} · ${c.students} étudiant(s)</span></div>
              ${c.results_final ? html`<span class="badge green">${icon('check')}Remis</span>` : html`<span class="badge orange">En attente</span>`}</li>`,
          )}</ul>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2>${icon('users')}Étudiants</h2>
          <div class="input-icon">${icon('search')}<input type="search" id="stu-q" placeholder="Rechercher…"></div></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Étudiant</th><th class="right">Cours</th><th class="right">Moyenne</th><th class="right">Réussis</th><th class="right">Échecs</th><th class="right">Absences</th><th></th></tr></thead>
          <tbody>${data.students.map(
            (s) => html`<tr data-q="${`${fullName(s)} ${s.student_number || ''}`.toLowerCase()}">
              <td><span class="person">${avatar(s, 'sm')}<span>${s.last_name}, ${s.first_name}<div class="muted xs">${s.student_number || ''}</div></span></span></td>
              <td class="right">${s.courses}</td><td class="right">${pct(s.overall_average)}</td>
              <td class="right">${s.passed_count}</td><td class="right">${s.failed_count ? html`<span class="badge red">${s.failed_count}</span>` : 0}</td>
              <td class="right">${s.total_absences}</td>
              <td class="right"><a class="btn small" href="#/bulletins/${termUrl(term)}/${s.id}">${icon('eye')}Bulletin</a></td></tr>`,
          )}</tbody></table></div>
      </div>`,
  );
  $('#stu-q', el).addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    $$('tr[data-q]', el).forEach((tr) => tr.classList.toggle('hidden', !tr.dataset.q.includes(q)));
  });
  $('#publish-form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const published = form.elements.published.checked;
    if (published && !status.published && !(await confirmDialog(`Publier les bulletins de ${term}? Tous les étudiants de la session seront avisés.`, { danger: false, label: 'Publier' }))) return;
    try {
      await api(`/api/reports/${termUrl(term)}`, { method: 'PUT', body: { published, message: form.elements.message.value } });
      toast(published ? 'Bulletins publiés.' : 'Enregistré.');
      reload();
    } catch (err) {
      toastError(err);
    }
  });
}

// ---------- Bulletin imprimable ----------

function bulletinView(b) {
  const s = b.student;
  return html`
    <article class="bulletin">
      <header class="b-head">
        <div class="brand"><span class="logo">${icon('logo')}</span><span>${b.school_name || APP_NAME}<small>${b.school_name ? APP_NAME : ''}</small></span></div>
        <div class="right"><div class="b-title">Bulletin de fin de session</div><div class="muted">${b.term}</div></div>
      </header>
      ${b.partial ? html`<div class="alert">${icon('info')}<span>Aperçu enseignant : seuls vos cours sont affichés.</span></div>` : ''}
      ${!b.published && !b.partial ? html`<div class="alert warn">${icon('alert')}<span>Aperçu : ce bulletin n’est pas encore publié${b.all_final ? '' : ' et certains résultats sont provisoires'}.</span></div>` : ''}
      <section class="b-student">
        ${avatar(s, 'lg')}
        <div><h2>${fullName(s)}</h2><div class="muted">${s.student_number ? `Numéro : ${s.student_number}` : ''}${s.program ? ` · ${s.program}` : ''}</div></div>
        <div class="b-kpis">
          <div><span>${pct(b.overall_average)}</span><small>Moyenne générale</small></div>
          <div><span>${b.passed_count}/${b.passed_count + b.failed_count}</span><small>Cours réussis</small></div>
          <div><span>${b.total_absences}</span><small>Absences</small></div>
        </div>
      </section>
      <table class="b-table">
        <thead><tr><th>Cours</th><th>Enseignant</th><th class="right">Note finale</th><th class="right">Moy. du groupe</th><th>Résultat</th><th class="right">Absences</th></tr></thead>
        <tbody>${b.courses.map(
          (c) => html`<tr>
            <td><span class="dot-c" style="--c:${courseColor(c)}"></span> <strong>${c.code}-${c.group_name}</strong><div class="muted xs">${c.name}</div></td>
            <td class="small">${c.teacher}</td>
            <td class="right b-grade">${gradeCell(c.final_grade)}${c.final ? '' : html`<div class="xs muted">provisoire</div>`}</td>
            <td class="right">${c.group_average === null ? '—' : Math.round(c.group_average)}</td>
            <td>${c.passed === null ? html`<span class="badge">—</span>` : c.passed ? html`<span class="badge green">Réussi</span>` : html`<span class="badge red">Échec</span>`}</td>
            <td class="right">${c.absences}${c.lates ? html`<div class="xs muted">${c.lates} retard(s)</div>` : ''}</td>
          </tr>`,
        )}</tbody>
      </table>
      ${b.courses.some((c) => c.comment)
        ? html`<section class="b-comments"><h3>Commentaires des enseignants</h3>${b.courses.filter((c) => c.comment).map(
            (c) => html`<div class="b-comment"><strong>${c.code}</strong> — <span class="muted">${c.teacher}</span><p class="pre">${c.comment}</p></div>`,
          )}</section>`
        : ''}
      ${b.message ? html`<section class="b-message"><h3>Mot de la direction</h3><p class="pre">${b.message}</p></section>` : ''}
      <footer class="b-foot">
        <span>Note de passage : ${PASS} %</span>
        <span>${b.published_at ? `Publié le ${fmtDate(b.published_at)}` : `Généré le ${fmtDate(new Date().toISOString())}`}</span>
      </footer>
    </article>`;
}

export async function bulletinPage(el, term, who) {
  el = fresh(el);
  const all = who === 'tous';
  const bulletins = all ? await api(`/api/reports/${termUrl(term)}/all`) : [await api(`/api/reports/${termUrl(term)}/students/${who}`)];
  const back = state.me.role === 'admin' ? `#/bulletins/${termUrl(term)}` : '#/bulletins';
  render(
    el,
    html`
      <div class="page-head no-print">
        <div><div class="crumbs"><a href="#/bulletins">Bulletins</a> / <a href="${back}">${term}</a></div>
          <h1>${all ? `Tous les bulletins — ${term}` : `Bulletin — ${term}`}</h1>
          <p class="muted">${all ? `${bulletins.length} bulletin(s), un par page à l’impression.` : 'Utilisez « Imprimer » puis « Enregistrer au format PDF » pour en garder une copie.'}</p></div>
        <button class="primary" id="print">${icon('printer')}Imprimer / PDF</button>
      </div>
      ${bulletins.length ? bulletins.map(bulletinView) : html`<div class="card">${emptyState('Aucun bulletin.', 'report')}</div>`}`,
  );
  $('#print', el).addEventListener('click', () => window.print());
}

// ---------- Onglet « Bulletin » d'un cours (enseignant) ----------

export async function courseReportTab(el, course, reload) {
  const data = await api(`/api/courses/${course.id}/report`);
  const locked = data.published && state.me.role !== 'admin';
  const finalized = data.course.results_final;
  render(
    el,
    html`
      <div class="card">
        <div class="card-head">
          <h2>${icon('report')}Résultats de fin de session — ${data.course.term}</h2>
          ${finalized ? html`<span class="badge green">${icon('check')}Remis le ${fmtDateTime(data.course.results_final_at)}</span>` : html`<span class="badge orange">À remettre</span>`}
        </div>
        ${locked ? html`<div class="alert warn">${icon('lock')}<span>Les bulletins de cette session sont publiés : les résultats ne peuvent plus être modifiés. Contactez l’administration au besoin.</span></div>` : ''}
        <p class="muted small">La note calculée vient du relevé de notes (moyenne pondérée des évaluations corrigées). Inscrivez une note finale seulement pour l’ajuster; laissez vide pour garder la note calculée. Note de passage : ${data.pass_mark} %.</p>
        <form id="report-form">
          <div class="table-wrap"><table>
            <thead><tr><th>Étudiant</th><th class="right">Calculée</th><th>Note finale</th><th class="right">Bulletin</th><th class="right">Absences</th><th>Commentaire au bulletin</th></tr></thead>
            <tbody>${data.students.map(
              (s) => html`<tr>
                <td><span class="person">${avatar(s, 'sm')}<span>${fullName(s)}<div class="muted xs">${s.student_number || ''}</div></span></span></td>
                <td class="right nowrap">${s.computed_average === null ? '—' : pct(s.computed_average)}
                  ${s.total_weight && s.weight_graded < s.total_weight ? html`<div class="xs muted">${s.weight_graded}/${s.total_weight} % corrigé</div>` : ''}</td>
                <td><input class="score" type="number" min="0" max="100" step="1" data-grade="${s.id}" value="${s.override ?? ''}" placeholder="${s.computed_average === null ? '' : Math.round(s.computed_average)}" ${locked ? 'disabled' : ''}></td>
                <td class="right b-grade" data-final="${s.id}">${gradeCell(s.final_grade)}</td>
                <td class="right">${s.absences}</td>
                <td><input data-comment="${s.id}" value="${s.comment || ''}" maxlength="1000" placeholder="ex. Excellente participation." ${locked ? 'disabled' : ''}></td>
              </tr>`,
            )}</tbody></table></div>
          ${data.students.length ? '' : emptyState('Aucun étudiant inscrit.', 'users')}
          ${locked
            ? ''
            : html`<div class="actions" style="margin-top:1rem;justify-content:space-between">
                ${toggle('finalize', finalized, 'Résultats finaux remis', 'Indique à l’administration que vos résultats sont prêts pour le bulletin.')}
                <button type="submit" class="primary">${icon('check')}Enregistrer</button>
              </div>`}
        </form>
      </div>`,
  );
  // Live preview of the grade that will appear on the report card.
  on(el, 'input', '[data-grade]', (input) => {
    const s = data.students.find((x) => x.id === Number(input.dataset.grade));
    const v = input.value === '' ? (s.computed_average === null ? null : Math.round(s.computed_average)) : Math.round(Number(input.value));
    render($(`[data-final="${s.id}"]`, el), gradeCell(v));
  });
  $('#report-form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const entries = data.students.map((s) => ({
      student_id: s.id,
      final_grade: $(`[data-grade="${s.id}"]`, el).value,
      comment: $(`[data-comment="${s.id}"]`, el).value,
    }));
    try {
      await api(`/api/courses/${course.id}/report`, { method: 'PUT', body: { entries, finalize: e.target.elements.finalize.checked } });
      toast(e.target.elements.finalize.checked ? 'Résultats remis à l’administration.' : 'Résultats enregistrés.');
      reload();
    } catch (err) {
      toastError(err);
    }
  });
}
