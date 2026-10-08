import {
  state, api, qs, html, render, fresh, $, $$, on, formData, toast, modal, confirmDialog,
  fullName, courseLabel, courseColor, fmtDate, fmtDateTime, fmtTime, fmtShortDate, parseDate, toLocalInput, fromLocalInput,
  todayStr, pct, gradeBadge, KIND_LABEL, STATUS_LABEL, STATUS_COLOR, ROLE_LABEL, DAYS,
} from './core.js';

// ---------- Horaire ----------

export async function schedulePage(el, _params, userId = '') {
  el = fresh(el);
  const isAdmin = state.me.role === 'admin';
  const [slots, users] = await Promise.all([
    api(`/api/schedule${qs({ user_id: userId })}`),
    isAdmin ? api('/api/users') : Promise.resolve([]),
  ]);
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const startHour = Math.min(8, ...slots.map((s) => Math.floor(toMin(s.start_time) / 60)));
  const endHour = Math.max(18, ...slots.map((s) => Math.ceil(toMin(s.end_time) / 60)));
  const showWeekend = slots.some((s) => s.day > 5);
  const days = showWeekend ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5];
  const HOUR_PX = 48;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  render(
    el,
    html`
      <div class="page-head">
        <div><h1>Horaire</h1><p class="muted">${isAdmin && !userId ? 'Tous les cours de l’école' : 'Horaire hebdomadaire'}</p></div>
        ${isAdmin
          ? html`<div><label>Voir l’horaire de</label><select id="who">
              <option value="">Toute l’école</option>
              ${users.filter((u) => u.role !== 'admin').map((u) => html`<option value="${u.id}" ${String(u.id) === String(userId) ? 'selected' : ''}>${fullName(u)} (${ROLE_LABEL[u.role]})</option>`)}
            </select></div>`
          : ''}
      </div>
      <div class="card"><div class="table-wrap">
        <div class="week" style="grid-template-columns:56px repeat(${days.length}, minmax(120px, 1fr))">
          <div></div>${days.map((d) => html`<div class="head">${DAYS[d]}</div>`)}
          <div class="hours">${hours.map((h) => html`<div class="hour">${h}h</div>`)}</div>
          ${days.map(
            (d) => html`<div class="day" style="height:${hours.length * HOUR_PX}px">
              ${slots.filter((s) => s.day === d).map((s) => {
                const top = ((toMin(s.start_time) - startHour * 60) / 60) * HOUR_PX;
                const height = ((toMin(s.end_time) - toMin(s.start_time)) / 60) * HOUR_PX - 2;
                return html`<div class="slot" style="top:${top}px;height:${height}px;background:${courseColor(s.course_id)}">
                  <a href="#/cours/${s.course_id}"><strong>${courseLabel(s)}</strong></a>
                  ${s.name}<br>${s.start_time}–${s.end_time} · ${s.room || 'local à déterminer'}
                  ${s.teacher_first_name ? html`<br>${s.teacher_first_name} ${s.teacher_last_name}` : ''}
                </div>`;
              })}
            </div>`,
          )}
        </div>
      </div>
      ${slots.length ? '' : html`<div class="empty">Aucune plage horaire.</div>`}
      </div>`,
  );
  $('#who', el)?.addEventListener('change', (e) => schedulePage(el, [], e.target.value));
}

// ---------- Calendrier ----------

let calMonth = null;

export async function calendarPage(el) {
  el = fresh(el);
  const { me } = state;
  if (!calMonth) {
    const now = new Date();
    calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const first = new Date(calMonth);
  const gridStart = new Date(first);
  gridStart.setDate(1 - ((first.getDay() + 6) % 7)); // weeks start on Monday
  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridStart.getDate() + 42);

  const canAdd = me.role !== 'etudiant';
  const [items, courses] = await Promise.all([
    api(`/api/calendar${qs({ from: gridStart.toISOString(), to: gridEnd.toISOString() })}`),
    canAdd ? api('/api/courses') : Promise.resolve([]),
  ]);
  const byDay = new Map();
  for (const it of items) {
    const key = todayStr(parseDate(it.starts_at));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(it);
  }
  const today = todayStr();
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
  const monthLabel = first.toLocaleDateString('fr-CA', { month: 'long', year: 'numeric' });

  render(
    el,
    html`
      <div class="page-head">
        <div><h1 style="text-transform:capitalize">${monthLabel}</h1>
          <p class="muted small"><span class="badge orange">Évaluation</span> <span class="badge blue">Événement de cours</span> <span class="badge green">Toute l’école</span></p></div>
        <div class="actions">
          <button id="prev" aria-label="Mois précédent">←</button>
          <button id="today">Aujourd’hui</button>
          <button id="next" aria-label="Mois suivant">→</button>
          ${canAdd ? html`<button class="primary" id="add">Ajouter un événement</button>` : ''}
        </div>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        <div class="cal">
          ${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => html`<div class="dow">${d}</div>`)}
          ${cells.map((d) => {
            const key = todayStr(d);
            const list = byDay.get(key) || [];
            return html`<div class="cell ${d.getMonth() !== first.getMonth() ? 'other' : ''} ${key === today ? 'today' : ''}" data-day="${key}">
              <span class="num">${d.getDate()}</span>
              ${list.map(
                (it) => html`<button class="item ${it.type === 'evaluation' ? 'evaluation' : it.course_id ? '' : 'global'}" data-item="${it.type}:${it.id}" title="${it.code ? it.code + ' · ' : ''}${it.title}">
                  ${it.type === 'evenement' ? fmtTime(it.starts_at) + ' ' : ''}${it.title}</button>`,
              )}
            </div>`;
          })}
        </div>
      </div>`,
  );

  const shift = (n) => {
    calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + n, 1);
    calendarPage(el);
  };
  $('#prev', el).addEventListener('click', () => shift(-1));
  $('#next', el).addEventListener('click', () => shift(1));
  $('#today', el).addEventListener('click', () => {
    calMonth = null;
    calendarPage(el);
  });

  on(el, 'click', '[data-item]', (b, ev) => {
    ev.stopPropagation();
    const [type, id] = b.dataset.item.split(':');
    const it = items.find((x) => x.type === type && x.id === Number(id));
    const m = modal({
      title: it.title,
      body: html`
        <p><span class="badge ${it.type === 'evaluation' ? 'orange' : it.course_id ? 'blue' : 'green'}">${it.type === 'evaluation' ? `Évaluation · ${KIND_LABEL[it.kind]} · ${it.weight} %` : it.code ? `Cours ${courseLabel(it)}` : 'Toute l’école'}</span></p>
        <p><strong>${fmtDateTime(it.starts_at)}</strong>${it.ends_at ? html` → ${fmtDateTime(it.ends_at)}` : ''}</p>
        ${it.description ? html`<p class="pre">${it.description}</p>` : ''}
        ${it.author_first_name ? html`<p class="muted small">Ajouté par ${it.author_first_name} ${it.author_last_name}</p>` : ''}
        ${it.type === 'evaluation' ? html`<p><a href="#/cours/${it.course_id}/evaluations" data-close>Voir l’évaluation →</a></p>` : ''}
        ${it.can_delete ? html`<button class="danger small" id="del-event">Supprimer l’événement</button>` : ''}`,
    });
    $('#del-event', m.el)?.addEventListener('click', async () => {
      await api(`/api/events/${it.id}`, { method: 'DELETE' });
      m.close();
      calendarPage(el);
    });
  });

  if (!canAdd) return;
  const addEvent = (day) => {
    const start = day ? `${day}T09:00` : toLocalInput(new Date().toISOString());
    modal({
      title: 'Nouvel événement',
      body: html`
        <div class="field"><label>Titre</label><input name="title" required maxlength="200"></div>
        <div class="field"><label>Cours</label><select name="course_id">
          ${me.role === 'admin' ? html`<option value="">Toute l’école (événement global)</option>` : ''}
          ${courses.map((c) => html`<option value="${c.id}">${courseLabel(c)} — ${c.name}</option>`)}
        </select></div>
        <div class="row">
          <div class="field"><label>Début</label><input type="datetime-local" name="starts_at" value="${start}" required></div>
          <div class="field"><label>Fin (optionnel)</label><input type="datetime-local" name="ends_at"></div>
        </div>
        <div class="field"><label>Description</label><textarea name="description" rows="3"></textarea></div>`,
      onSubmit: async (form) => {
        const f = formData(form);
        await api('/api/events', {
          method: 'POST',
          body: { ...f, course_id: f.course_id || null, starts_at: fromLocalInput(f.starts_at), ends_at: fromLocalInput(f.ends_at) },
        });
        toast('Événement ajouté.');
        calendarPage(el);
      },
    });
  };
  $('#add', el).addEventListener('click', () => addEvent());
  on(el, 'dblclick', '[data-day]', (cell) => addEvent(cell.dataset.day));
}

// ---------- Messagerie ----------

export async function composeMessage({ recipientIds = [], courseId = null, courseName = '', subject = '', body = '' } = {}) {
  const { me } = state;
  const [contacts, courses] = await Promise.all([
    api('/api/contacts'),
    me.role !== 'etudiant' ? api('/api/courses') : Promise.resolve([]),
  ]);
  const selected = new Set(recipientIds.map(Number));
  const m = modal({
    title: 'Nouveau message',
    submitLabel: 'Envoyer',
    size: 'wide',
    body: html`
      ${courses.length
        ? html`<div class="field"><label>Envoyer à tous les étudiants d’un cours (optionnel)</label>
            <select name="course_id"><option value="">—</option>
              ${courses.map((c) => html`<option value="${c.id}" ${c.id === courseId ? 'selected' : ''}>${courseLabel(c)} — ${c.name} (${c.student_count})</option>`)}
            </select></div>`
        : ''}
      <div class="field">
        <label>Destinataires</label>
        <input type="search" id="rcpt-search" placeholder="Rechercher un nom…" style="margin-bottom:.4rem">
        <div class="recipients">${contacts.length
          ? contacts.map((c) => html`<label class="check" data-name="${fullName(c).toLowerCase()}"><input type="checkbox" name="r" value="${c.id}" ${selected.has(c.id) ? 'checked' : ''}> ${fullName(c)} <span class="badge">${ROLE_LABEL[c.role]}</span></label>`)
          : html`<div class="empty">Aucun contact disponible.</div>`}</div>
      </div>
      <div class="field"><label>Objet</label><input name="subject" value="${subject}" required maxlength="200"></div>
      <div class="field"><label>Message</label><textarea name="body" rows="8" required>${body}</textarea></div>
      ${courseName ? html`<p class="muted small">Le message sera envoyé individuellement à chaque étudiant de ${courseName}.</p>` : ''}`,
    onSubmit: async (form) => {
      const f = formData(form);
      const recipient_ids = $$('input[name="r"]:checked', form).map((c) => Number(c.value));
      const res = await api('/api/messages', {
        method: 'POST',
        body: { recipient_ids, course_id: f.course_id || null, subject: f.subject, body: f.body },
      });
      toast(`Message envoyé à ${res.sent} destinataire(s).`);
      if (location.hash.startsWith('#/messages')) window.dispatchEvent(new HashChangeEvent('hashchange'));
    },
  });
  $('#rcpt-search', m.el).addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    $$('[data-name]', m.el).forEach((l) => l.classList.toggle('hidden', !l.dataset.name.includes(q)));
  });
}

export async function messagesPage(el, _params, box = 'inbox') {
  el = fresh(el);
  const msgs = await api(`/api/messages${qs({ box })}`);
  const sent = box === 'sent';
  render(
    el,
    html`
      <div class="page-head">
        <h1>Messagerie</h1>
        <button class="primary" id="compose">Nouveau message</button>
      </div>
      <nav class="tabs">
        <a href="#/messages" class="${sent ? '' : 'active'}">Boîte de réception</a>
        <a href="#/messages/envoyes" class="${sent ? 'active' : ''}">Messages envoyés</a>
      </nav>
      <div class="card">
        ${msgs.length
          ? html`<div class="table-wrap"><table>
              <thead><tr><th>${sent ? 'À' : 'De'}</th><th>Objet</th><th>Date</th>${sent ? html`<th>Lu</th>` : ''}</tr></thead>
              <tbody>${msgs.map(
                (m) => html`<tr class="msg-row ${!sent && !m.read_at ? 'unread' : ''}" data-open="${m.id}">
                  <td>${fullName(m)} <span class="badge">${ROLE_LABEL[m.role]}</span></td>
                  <td>${!sent && !m.read_at ? html`<span class="badge blue">Nouveau</span> ` : ''}${m.subject}</td>
                  <td class="small nowrap">${fmtDateTime(m.created_at)}</td>
                  ${sent ? html`<td class="small">${m.read_at ? fmtDateTime(m.read_at) : html`<span class="muted">Non lu</span>`}</td>` : ''}
                </tr>`,
              )}</tbody></table></div>`
          : html`<div class="empty">Aucun message.</div>`}
      </div>`,
  );
  $('#compose', el).addEventListener('click', () => composeMessage());
  on(el, 'click', '[data-open]', (row) => (location.hash = `#/messages/${row.dataset.open}`));
}

export async function messagePage(el, id) {
  el = fresh(el);
  const m = await api(`/api/messages/${id}`);
  const incoming = m.recipient_id === state.me.id;
  render(
    el,
    html`
      <div class="page-head">
        <div><div class="muted small"><a href="#/messages${incoming ? '' : '/envoyes'}">← Messagerie</a></div><h1>${m.subject}</h1></div>
        <div class="actions">
          ${incoming ? html`<button class="primary" id="reply">Répondre</button>` : ''}
          <button class="danger" id="delete">Supprimer</button>
        </div>
      </div>
      <div class="card">
        <p><strong>De :</strong> ${m.sender_first_name} ${m.sender_last_name} <span class="badge">${ROLE_LABEL[m.sender_role]}</span><br>
          <strong>À :</strong> ${m.recipient_first_name} ${m.recipient_last_name}<br>
          <span class="muted small">${fmtDateTime(m.created_at)}${!incoming ? (m.read_at ? ` · lu le ${fmtDateTime(m.read_at)}` : ' · non lu') : ''}</span></p>
        <div class="message-body">${m.body}</div>
      </div>`,
  );
  $('#reply', el)?.addEventListener('click', () =>
    composeMessage({
      recipientIds: [m.sender_id],
      subject: m.subject.startsWith('RE:') ? m.subject : `RE: ${m.subject}`,
      body: `\n\n----- ${m.sender_first_name} ${m.sender_last_name} a écrit le ${fmtDateTime(m.created_at)} -----\n${m.body}`,
    }),
  );
  $('#delete', el).addEventListener('click', async () => {
    if (!(await confirmDialog('Supprimer ce message de votre boîte?'))) return;
    await api(`/api/messages/${m.id}`, { method: 'DELETE' });
    location.hash = incoming ? '#/messages' : '#/messages/envoyes';
  });
}

// ---------- Dossiers étudiants ----------

export async function studentsPage(el) {
  el = fresh(el);
  render(
    el,
    html`
      <div class="page-head"><div><h1>Dossiers étudiants</h1>
        <p class="muted">${state.me.role === 'admin' ? 'Tous les étudiants de l’école' : 'Les étudiants inscrits à vos cours'}</p></div></div>
      <div class="toolbar"><input type="search" id="q" placeholder="Nom, courriel ou numéro…"></div>
      <div class="card" id="results"></div>`,
  );
  const load = async (q = '') => {
    const students = await api(`/api/students${qs({ q })}`);
    render(
      $('#results', el),
      students.length
        ? html`<div class="table-wrap"><table>
            <thead><tr><th>Nom</th><th>Numéro</th><th>Courriel</th><th>Programme</th><th></th></tr></thead>
            <tbody>${students.map(
              (s) => html`<tr><td>${s.last_name}, ${s.first_name} ${s.active ? '' : html`<span class="badge red">Inactif</span>`}</td>
                <td>${s.student_number || '—'}</td><td class="small">${s.email}</td><td class="small">${s.program || '—'}</td>
                <td class="right"><a class="btn small" href="#/etudiants/${s.id}">Ouvrir le dossier</a></td></tr>`,
            )}</tbody></table></div>`
        : html`<div class="empty">Aucun étudiant trouvé.</div>`,
    );
  };
  let timer;
  $('#q', el).addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => load(e.target.value.trim()), 250);
  });
  await load();
}

export async function dossierPage(el, [studentId]) {
  el = fresh(el);
  const { student: s, courses } = await api(`/api/students/${studentId}/dossier`);
  const self = state.me.id === s.id;
  const totalAbs = courses.reduce((n, c) => n + c.absences, 0);
  const averages = courses.map((c) => c.average).filter((a) => a !== null);
  const overall = averages.length ? averages.reduce((a, b) => a + b, 0) / averages.length : null;

  render(
    el,
    html`
      <div class="page-head">
        <div>
          ${self ? '' : html`<div class="muted small"><a href="#/etudiants">Dossiers étudiants</a> / ${fullName(s)}</div>`}
          <h1>${self ? 'Mon dossier' : `Dossier de ${fullName(s)}`}</h1>
          <p class="muted">${s.student_number ? `N° ${s.student_number} · ` : ''}${s.program || 'Programme non précisé'}</p>
        </div>
        <div class="actions">
          ${self ? '' : html`<button id="write">Écrire à l’étudiant</button>`}
          <button id="print">Imprimer</button>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><div class="value">${pct(overall)}</div><div class="label">Moyenne générale${state.me.role === 'enseignant' ? ' (vos cours)' : ''}</div></div>
        <div class="stat"><div class="value">${courses.length}</div><div class="label">Cours</div></div>
        <div class="stat"><div class="value">${totalAbs}</div><div class="label">Absences</div></div>
      </div>
      ${self
        ? ''
        : html`<div class="card"><h2>Renseignements</h2><table><tbody>
            <tr><th>Courriel</th><td>${s.email}</td></tr>
            <tr><th>Téléphone</th><td>${s.phone || '—'}</td></tr>
            <tr><th>Compte</th><td>${s.active ? 'Actif' : html`<span class="badge red">Inactif</span>`} · créé le ${fmtDate(s.created_at)}</td></tr>
            <tr><th>Dernière connexion</th><td>${s.last_login_at ? fmtDateTime(s.last_login_at) : 'Jamais'}</td></tr>
          </tbody></table></div>`}
      ${courses.map(
        (c) => html`<div class="card">
          <div class="card-head">
            <div><h2><a href="#/cours/${c.id}">${courseLabel(c)} — ${c.name}</a></h2>
              <div class="muted small">${c.term} · ${c.teacher_first_name ? `${c.teacher_first_name} ${c.teacher_last_name}` : ''}</div></div>
            <div class="actions">${gradeBadge(c.average)} <span class="badge ${c.absences >= 3 ? 'red' : ''}">${c.absences} absence(s)</span> ${c.lates ? html`<span class="badge orange">${c.lates} retard(s)</span>` : ''}</div>
          </div>
          <div class="grid cols-2">
            <div class="table-wrap"><table>
              <thead><tr><th>Évaluation</th><th class="right">Poids</th><th class="right">Note</th><th>Remise</th></tr></thead>
              <tbody>${c.evaluations.length
                ? c.evaluations.map(
                    (e) => html`<tr><td>${e.title}<div class="muted small">${KIND_LABEL[e.kind]}${e.comment ? ` · ${e.comment}` : ''}</div></td>
                      <td class="right">${e.weight} %</td>
                      <td class="right nowrap">${e.score !== null ? html`${e.score}/${e.max_score}` : html`<span class="muted">—</span>`}</td>
                      <td class="small">${e.submitted_at ? fmtShortDate(e.submitted_at) : html`<span class="muted">—</span>`}</td></tr>`,
                  )
                : html`<tr><td colspan="4" class="empty">Aucune évaluation.</td></tr>`}</tbody>
              <tfoot><tr><td>Moyenne</td><td></td><td class="right">${pct(c.average)}</td><td class="small">${c.earned}/${c.weight_graded} pts</td></tr></tfoot>
            </table></div>
            <div>
              <h3>Présences</h3>
              ${c.attendance.filter((a) => a.status !== 'present').length
                ? html`<ul class="list">${c.attendance.filter((a) => a.status !== 'present').map((a) => html`<li><span>${fmtDate(a.date)}${a.note ? html` <span class="muted small">— ${a.note}</span>` : ''}</span><span class="badge ${STATUS_COLOR[a.status]}">${STATUS_LABEL[a.status]}</span></li>`)}</ul>`
                : html`<div class="empty">Aucune absence ni retard.</div>`}
            </div>
          </div>
        </div>`,
      )}
      ${courses.length ? '' : html`<div class="card empty">Aucun cours à afficher.</div>`}`,
  );
  $('#print', el).addEventListener('click', () => window.print());
  $('#write', el)?.addEventListener('click', () => composeMessage({ recipientIds: [s.id] }));
}
