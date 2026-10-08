import {
  state, api, html, render, $, formData, toast, fullName, fmtDateTime, fmtRelative, fmtShortDate,
  KIND_LABEL, ROLE_LABEL,
} from './core.js';

const list = (items, renderItem, emptyText) =>
  items.length ? html`<ul class="list">${items.map(renderItem)}</ul>` : html`<div class="empty">${emptyText}</div>`;

export async function dashboardPage(el) {
  const { me } = state;
  const d = await api('/api/dashboard');
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';

  const stats = [];
  if (me.role === 'admin') {
    const c = d.counts;
    stats.push(['Étudiants', c.students], ['Enseignants', c.teachers], ['Cours', c.courses], ['Documents', c.documents], ['Remises', c.submissions]);
  }
  stats.push(['Messages non lus', d.unread_messages]);
  if (me.role === 'etudiant') stats.push(['Travaux à remettre', d.pending_submissions.length], ['Absences', d.absences]);
  if (me.role === 'enseignant') stats.push(['Remises à corriger', d.to_grade.reduce((s, x) => s + x.n, 0)]);

  render(
    el,
    html`
      <div class="page-head">
        <div><h1>${hello}, ${me.first_name}</h1><p class="muted">${ROLE_LABEL[me.role]} · ${new Date().toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
      </div>
      <div class="stats">${stats.map(([label, value]) => html`<div class="stat"><div class="value">${value}</div><div class="label">${label}</div></div>`)}</div>
      <div class="grid cols-2">
        ${me.role === 'etudiant'
          ? html`<div class="card"><h2>Travaux à remettre</h2>
              ${list(d.pending_submissions, (e) => html`<li><div><a href="#/cours/${e.course_id}/evaluations">${e.title}</a><div class="muted small">${e.code}</div></div>
                <span class="small nowrap">${e.due_at ? html`${fmtDateTime(e.due_at)}<br><span class="muted">${fmtRelative(e.due_at)}</span>` : 'Sans échéance'}</span></li>`, 'Aucun travail en attente. 🎉')}</div>`
          : ''}
        ${me.role === 'enseignant'
          ? html`<div class="card"><h2>Remises à corriger</h2>
              ${list(d.to_grade, (e) => html`<li><div><a href="#/evaluation/${e.id}">${e.title}</a><div class="muted small">${e.code}</div></div><span class="badge orange">${e.n} à corriger</span></li>`, 'Tout est corrigé.')}</div>`
          : ''}
        <div class="card"><h2>Évaluations des 14 prochains jours</h2>
          ${list(d.upcoming_evaluations, (e) => html`<li><div><a href="#/cours/${e.course_id}/evaluations">${e.title}</a>
            <div class="muted small">${e.code} · ${KIND_LABEL[e.kind]} · ${e.weight} %</div></div>
            <span class="small nowrap right">${fmtDateTime(e.due_at)}<br><span class="muted">${fmtRelative(e.due_at)}</span></span></li>`, 'Rien à l’horaire.')}
        </div>
        <div class="card"><h2>Événements à venir</h2>
          ${list(d.upcoming_events, (e) => html`<li><div>${e.title}<div class="muted small">${e.code || 'Toute l’école'}</div></div><span class="small nowrap">${fmtDateTime(e.starts_at)}</span></li>`, 'Aucun événement.')}
          <p style="margin-top:.75rem"><a href="#/calendrier">Ouvrir le calendrier →</a></p>
        </div>
        <div class="card"><h2>Documents récents</h2>
          ${list(d.recent_documents, (doc) => html`<li><div><a href="#/cours/${doc.course_id}/documents">${doc.title}</a><div class="muted small">${doc.code}</div></div><span class="small muted">${fmtShortDate(doc.created_at)}</span></li>`, 'Aucun document.')}
        </div>
      </div>`,
  );
}

export async function profilePage(el) {
  const me = await api('/api/me');
  render(
    el,
    html`
      <div class="page-head"><h1>Mon profil</h1></div>
      <div class="grid cols-2">
        <div class="card">
          <h2>Informations</h2>
          <table><tbody>
            <tr><th>Nom</th><td>${fullName(me)}</td></tr>
            <tr><th>Courriel</th><td>${me.email}</td></tr>
            <tr><th>Rôle</th><td>${ROLE_LABEL[me.role]}</td></tr>
            ${me.student_number ? html`<tr><th>Numéro étudiant</th><td>${me.student_number}</td></tr>` : ''}
            ${me.program ? html`<tr><th>Programme</th><td>${me.program}</td></tr>` : ''}
            ${me.phone ? html`<tr><th>Téléphone</th><td>${me.phone}</td></tr>` : ''}
          </tbody></table>
          <p class="muted small" style="margin-top:.75rem">Pour corriger ces informations, contactez l’administration.</p>
        </div>
        <div class="card">
          <h2>Changer mon mot de passe</h2>
          <form id="pw-form">
            <div class="field"><label>Mot de passe actuel</label><input type="password" name="current" autocomplete="current-password" required></div>
            <div class="field"><label>Nouveau mot de passe (8 caractères min.)</label><input type="password" name="next" autocomplete="new-password" minlength="8" required></div>
            <div class="field"><label>Confirmer</label><input type="password" name="confirm" autocomplete="new-password" required></div>
            <button type="submit" class="primary">Mettre à jour</button>
          </form>
        </div>
      </div>`,
  );
  $('#pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (f.next !== f.confirm) return toast('Les mots de passe ne correspondent pas.', 'error');
    try {
      await api('/api/me/password', { method: 'POST', body: { current: f.current, next: f.next } });
      e.target.reset();
      toast('Mot de passe modifié.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
