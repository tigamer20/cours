import {
  api, qs, html, render, fresh, $, on, formData, toast, modal, confirmDialog,
  fullName, courseLabel, fmtDateTime, fmtShortDate, pct, ROLE_LABEL,
} from './core.js';

// ---------- Vue d'ensemble ----------

export async function adminOverviewPage(el) {
  el = fresh(el);
  const [dash, ov, log] = await Promise.all([api('/api/dashboard'), api('/api/admin/overview'), api('/api/admin/audit?limit=15')]);
  const c = dash.counts;
  const max = Math.max(1, ...ov.activity.map((a) => a.n));
  render(
    el,
    html`
      <div class="page-head"><div><h1>Vue d’ensemble</h1><p class="muted">Tout ce qui se passe sur la plateforme</p></div>
        <div class="actions"><a class="btn" href="#/admin/utilisateurs">Créer un compte</a><a class="btn primary" href="#/admin/cours">Créer un cours</a></div></div>
      <div class="stats">
        <div class="stat"><div class="value">${c.students}</div><div class="label">Étudiants</div></div>
        <div class="stat"><div class="value">${c.teachers}</div><div class="label">Enseignants</div></div>
        <div class="stat"><div class="value">${c.admins}</div><div class="label">Administrateurs</div></div>
        <div class="stat"><div class="value">${c.courses}</div><div class="label">Cours</div></div>
        <div class="stat"><div class="value">${c.documents}</div><div class="label">Documents</div></div>
        <div class="stat"><div class="value">${c.submissions}</div><div class="label">Travaux remis</div></div>
        <div class="stat"><div class="value">${ov.online}</div><div class="label">Utilisateurs actifs (1 h)</div></div>
      </div>
      <div class="card">
        <h2>Cours</h2>
        <div class="table-wrap"><table>
          <thead><tr><th>Cours</th><th>Enseignant</th><th class="right">Étudiants</th><th class="right">Documents</th><th class="right">Évaluations</th><th class="right">Plan</th><th class="right">Remises</th><th class="right">Absences</th><th class="right">Moyenne</th></tr></thead>
          <tbody>${ov.courses.map(
            (x) => html`<tr><td><a href="#/cours/${x.id}">${courseLabel(x)}</a><div class="muted small">${x.name} · ${x.term}</div></td>
              <td class="small">${x.teacher_first_name ? `${x.teacher_first_name} ${x.teacher_last_name}` : html`<span class="badge red">Aucun</span>`}</td>
              <td class="right">${x.students}</td><td class="right">${x.documents}</td><td class="right">${x.evaluations}</td>
              <td class="right">${x.total_weight === 100 ? html`<span class="badge green">100 %</span>` : html`<span class="badge orange">${x.total_weight} %</span>`}</td>
              <td class="right">${x.submissions}</td><td class="right">${x.absences}</td><td class="right">${pct(x.avg_percent)}</td></tr>`,
          )}</tbody></table></div>
      </div>
      <div class="grid cols-2">
        <div class="card">
          <h2>Activité des 14 derniers jours</h2>
          ${ov.activity.length
            ? html`<div class="bars">${ov.activity.map((a) => html`<div style="height:${(a.n / max) * 100}%" title="${fmtShortDate(a.day)} : ${a.n} action(s)"></div>`)}</div>
              <p class="muted small" style="margin-top:.4rem">${ov.activity.reduce((s, a) => s + a.n, 0)} actions enregistrées</p>`
            : html`<div class="empty">Aucune activité.</div>`}
        </div>
        <div class="card">
          <h2>Étudiants à surveiller (3 absences et plus)</h2>
          ${ov.at_risk.length
            ? html`<ul class="list">${ov.at_risk.map((s) => html`<li><a href="#/etudiants/${s.id}">${fullName(s)}</a><span class="badge red">${s.absences} absences</span></li>`)}</ul>`
            : html`<div class="empty">Aucun étudiant en difficulté d’assiduité.</div>`}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2>Activité récente</h2><a href="#/admin/journal">Tout le journal →</a></div>
        ${auditTable(log)}
      </div>`,
  );
}

function auditTable(rows) {
  return rows.length
    ? html`<div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Détails</th></tr></thead>
        <tbody>${rows.map(
          (r) => html`<tr><td class="small nowrap">${fmtDateTime(r.created_at)}</td>
            <td class="small">${r.user_id ? html`${fullName(r)} <span class="badge">${ROLE_LABEL[r.role]}</span>` : '—'}</td>
            <td><strong>${r.action}</strong></td><td class="small">${r.details}</td></tr>`,
        )}</tbody></table></div>`
    : html`<div class="empty">Aucune entrée.</div>`;
}

// ---------- Journal ----------

export async function auditPage(el) {
  el = fresh(el);
  const users = await api('/api/users');
  render(
    el,
    html`
      <div class="page-head"><div><h1>Journal d’activité</h1><p class="muted">Connexions, notes, remises, documents consultés, messages envoyés…</p></div></div>
      <div class="toolbar">
        <input type="search" id="q" placeholder="Rechercher…">
        <select id="role"><option value="">Tous les rôles</option>${Object.entries(ROLE_LABEL).map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select>
        <select id="user"><option value="">Tous les utilisateurs</option>${users.map((u) => html`<option value="${u.id}">${fullName(u)}</option>`)}</select>
      </div>
      <div class="card" id="log"></div>`,
  );
  const load = async () => {
    const rows = await api(`/api/admin/audit${qs({ q: $('#q', el).value.trim(), role: $('#role', el).value, user_id: $('#user', el).value, limit: 500 })}`);
    render($('#log', el), auditTable(rows));
  };
  let timer;
  $('#q', el).addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(load, 250);
  });
  $('#role', el).addEventListener('change', load);
  $('#user', el).addEventListener('change', load);
  await load();
}

// ---------- Comptes ----------

function userForm(u = {}) {
  const isNew = !u.id;
  return html`
    <div class="row">
      <div class="field"><label>Prénom</label><input name="first_name" value="${u.first_name || ''}" required></div>
      <div class="field"><label>Nom</label><input name="last_name" value="${u.last_name || ''}" required></div>
    </div>
    <div class="row">
      <div class="field"><label>Courriel</label><input type="email" name="email" value="${u.email || ''}" required></div>
      <div class="field"><label>Rôle</label><select name="role" id="role-select">${Object.entries(ROLE_LABEL).map(([k, l]) => html`<option value="${k}" ${u.role === k ? 'selected' : ''}>${l}</option>`)}</select></div>
    </div>
    <div class="row">
      <div class="field"><label>Numéro étudiant</label><input name="student_number" value="${u.student_number || ''}"></div>
      <div class="field"><label>Programme</label><input name="program" value="${u.program || ''}"></div>
      <div class="field"><label>Téléphone</label><input name="phone" value="${u.phone || ''}"></div>
    </div>
    <div class="field"><label>${isNew ? 'Mot de passe initial (8 caractères min.)' : 'Nouveau mot de passe (laisser vide pour ne pas changer)'}</label>
      <div class="actions" style="flex-wrap:nowrap"><input name="password" id="pw" autocomplete="new-password" ${isNew ? 'required' : ''} minlength="8"><button type="button" id="gen">Générer</button></div>
      <p class="muted small" style="margin:.3rem 0 0">Communiquez-le à la personne; elle pourra le changer dans « Mon profil ».</p></div>
    ${isNew ? '' : html`<label class="check"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}> Compte actif</label>`}`;
}

function wireUserForm(m) {
  $('#gen', m.el).addEventListener('click', () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    $('#pw', m.el).value = [...bytes].map((b) => chars[b % chars.length]).join('');
  });
}

export async function adminUsersPage(el, _p, filters = { role: '', q: '' }) {
  el = fresh(el);
  const users = await api(`/api/users${qs(filters)}`);
  const reload = () => adminUsersPage(el, _p, filters);
  render(
    el,
    html`
      <div class="page-head"><div><h1>Comptes</h1><p class="muted">${users.length} compte(s)</p></div>
        <button class="primary" id="new">Créer un compte</button></div>
      <div class="toolbar">
        <input type="search" id="q" placeholder="Nom, courriel, numéro…" value="${filters.q}">
        <select id="role"><option value="">Tous les rôles</option>${Object.entries(ROLE_LABEL).map(([k, l]) => html`<option value="${k}" ${filters.role === k ? 'selected' : ''}>${l}</option>`)}</select>
      </div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>Nom</th><th>Courriel</th><th>Rôle</th><th>Statut</th><th>Dernière connexion</th><th></th></tr></thead>
        <tbody>${users.map(
          (u) => html`<tr><td>${u.last_name}, ${u.first_name}${u.student_number ? html`<div class="muted small">${u.student_number}</div>` : ''}</td>
            <td class="small">${u.email}</td><td><span class="badge ${u.role === 'admin' ? 'blue' : u.role === 'enseignant' ? 'orange' : ''}">${ROLE_LABEL[u.role]}</span></td>
            <td>${u.active ? html`<span class="badge green">Actif</span>` : html`<span class="badge red">Inactif</span>`}</td>
            <td class="small">${u.last_login_at ? fmtDateTime(u.last_login_at) : 'Jamais'}</td>
            <td class="right"><div class="actions" style="justify-content:flex-end">
              ${u.role === 'etudiant' ? html`<a class="btn small" href="#/etudiants/${u.id}">Dossier</a>` : ''}
              <button class="small" data-edit="${u.id}">Modifier</button>
              ${u.role === 'etudiant' ? html`<button class="small danger" data-delete="${u.id}">Supprimer</button>` : ''}</div></td></tr>`,
        )}</tbody></table></div></div>`,
  );
  let timer;
  $('#q', el).addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => adminUsersPage(el, _p, { ...filters, q: e.target.value.trim() }).then(() => {
      const q = $('#q');
      q.focus();
      q.setSelectionRange(q.value.length, q.value.length);
    }), 350);
  });
  $('#role', el).addEventListener('change', (e) => adminUsersPage(el, _p, { ...filters, role: e.target.value }));

  $('#new', el).addEventListener('click', () => {
    const m = modal({
      title: 'Créer un compte',
      submitLabel: 'Créer',
      size: 'wide',
      body: userForm({ role: filters.role || 'etudiant' }),
      onSubmit: async (form) => {
        const created = await api('/api/users', { method: 'POST', body: formData(form) });
        toast(`Compte créé pour ${fullName(created)}.`);
        reload();
      },
    });
    wireUserForm(m);
  });
  on(el, 'click', '[data-edit]', (b) => {
    const u = users.find((x) => x.id === Number(b.dataset.edit));
    const m = modal({
      title: `Modifier ${fullName(u)}`,
      size: 'wide',
      body: userForm(u),
      onSubmit: async (form) => {
        const f = formData(form);
        if (!f.password) delete f.password;
        await api(`/api/users/${u.id}`, { method: 'PATCH', body: f });
        toast('Compte mis à jour.');
        reload();
      },
    });
    wireUserForm(m);
  });
  on(el, 'click', '[data-delete]', (b) => {
    const u = users.find((x) => x.id === Number(b.dataset.delete));
    const m = modal({
      title: `Supprimer le compte de ${fullName(u)}`,
      submitLabel: 'Supprimer définitivement',
      body: html`
        <div class="alert error">Cette action est <strong>irréversible</strong>. Seront effacés : le compte, les inscriptions,
          les notes, les remises de travaux (et leurs fichiers), les présences, les consultations de documents et les messages de l’étudiant.</div>
        <p class="small muted">Pour seulement bloquer l’accès en conservant l’historique, utilisez plutôt « Modifier » → décocher « Compte actif ».</p>
        <div class="field"><label>Pour confirmer, tapez le courriel de l’étudiant : <strong>${u.email}</strong></label>
          <input name="confirm_email" autocomplete="off" spellcheck="false" required></div>`,
      onSubmit: async (form) => {
        const { confirm_email } = formData(form);
        if (confirm_email.trim().toLowerCase() !== u.email.toLowerCase()) throw new Error('Le courriel tapé ne correspond pas.');
        await api(`/api/users/${u.id}`, { method: 'DELETE', body: { confirm_email } });
        toast(`Compte de ${fullName(u)} supprimé.`);
        reload();
      },
    });
    $('button[type="submit"]', m.el).classList.replace('primary', 'danger');
  });
}

// ---------- Gestion des cours ----------

export async function adminCoursesPage(el) {
  el = fresh(el);
  const [courses, teachers] = await Promise.all([api('/api/courses'), api('/api/users?role=enseignant')]);
  const reload = () => adminCoursesPage(el);
  const courseForm = (c = {}) => html`
    <div class="row">
      <div class="field"><label>Code</label><input name="code" value="${c.code || ''}" placeholder="420-316-SH" required></div>
      <div class="field"><label>Groupe</label><input name="group_name" value="${c.group_name || '01'}"></div>
      <div class="field"><label>Session</label><input name="term" value="${c.term || ''}" placeholder="Automne 2026" required></div>
    </div>
    <div class="field"><label>Nom du cours</label><input name="name" value="${c.name || ''}" required></div>
    <div class="field"><label>Enseignant</label><select name="teacher_id"><option value="">— À déterminer —</option>
      ${teachers.filter((t) => t.active).map((t) => html`<option value="${t.id}" ${c.teacher_id === t.id ? 'selected' : ''}>${fullName(t)}</option>`)}</select></div>
    <div class="field"><label>Description</label><textarea name="description" rows="3">${c.description || ''}</textarea></div>`;

  render(
    el,
    html`
      <div class="page-head"><div><h1>Gestion des cours</h1><p class="muted">Créez les cours, assignez les enseignants, puis inscrivez les étudiants depuis l’onglet « Étudiants » du cours.</p></div>
        <button class="primary" id="new">Créer un cours</button></div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>Cours</th><th>Session</th><th>Enseignant</th><th class="right">Étudiants</th><th></th></tr></thead>
        <tbody>${courses.map(
          (c) => html`<tr><td><a href="#/cours/${c.id}">${courseLabel(c)}</a><div class="muted small">${c.name}</div></td><td>${c.term}</td>
            <td>${c.teacher_first_name ? `${c.teacher_first_name} ${c.teacher_last_name}` : html`<span class="badge red">Aucun</span>`}</td>
            <td class="right">${c.student_count}</td>
            <td class="right"><div class="actions" style="justify-content:flex-end">
              <a class="btn small" href="#/cours/${c.id}/etudiants">Inscriptions</a>
              <a class="btn small" href="#/cours/${c.id}/apercu">Horaire</a>
              <button class="small" data-edit="${c.id}">Modifier</button>
              <button class="small danger" data-del="${c.id}">Supprimer</button></div></td></tr>`,
        )}</tbody></table></div>
        ${courses.length ? '' : html`<div class="empty">Aucun cours.</div>`}</div>`,
  );
  $('#new', el).addEventListener('click', () =>
    modal({
      title: 'Créer un cours',
      submitLabel: 'Créer',
      body: courseForm(),
      onSubmit: async (form) => {
        const c = await api('/api/courses', { method: 'POST', body: formData(form) });
        toast('Cours créé.');
        location.hash = `#/cours/${c.id}/etudiants`;
      },
    }),
  );
  on(el, 'click', '[data-edit]', (b) => {
    const c = courses.find((x) => x.id === Number(b.dataset.edit));
    modal({
      title: `Modifier ${courseLabel(c)}`,
      body: courseForm(c),
      onSubmit: async (form) => {
        await api(`/api/courses/${c.id}`, { method: 'PATCH', body: formData(form) });
        toast('Cours mis à jour.');
        reload();
      },
    });
  });
  on(el, 'click', '[data-del]', async (b) => {
    if (!(await confirmDialog('Supprimer ce cours avec ses documents, évaluations, notes et présences? Cette action est irréversible.'))) return;
    await api(`/api/courses/${b.dataset.del}`, { method: 'DELETE' });
    toast('Cours supprimé.');
    reload();
  });
}

// ---------- Établissement (nom, slogan, couleur par défaut) ----------

export async function schoolSettingsPage(el) {
  el = fresh(el);
  const s = await api('/api/settings');
  render(
    el,
    html`
      <div class="page-head"><div><h1>Établissement</h1><p class="muted">Nom, slogan et couleur affichés à tous, y compris sur la page de connexion.</p></div></div>
      <form class="card" id="school-form" style="max-width:720px">
        <div class="field"><label>Nom de l’établissement</label><input name="school_name" value="${s.school_name}" maxlength="120" placeholder="ex. Cégep de Sherbrooke"></div>
        <div class="field"><label>Slogan (page de connexion)</label><input name="tagline" value="${s.tagline}" maxlength="160"></div>
        <div class="field"><label>Message sur la page de connexion (optionnel)</label><textarea name="login_message" rows="3" maxlength="500">${s.login_message}</textarea></div>
        <div class="field"><label>Couleur par défaut (les utilisateurs peuvent choisir la leur)</label><input type="color" name="accent" value="${s.accent}"></div>
        <button type="submit" class="primary">Enregistrer</button>
      </form>`,
  );
  $('#school-form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/api/settings', { method: 'PUT', body: formData(e.target) });
    toast('Paramètres enregistrés. Rechargez la page pour voir le nouveau nom partout.');
  });
}
