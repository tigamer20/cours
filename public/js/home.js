import {
  state, api, html, render, fresh, $, $$, on, formData, toast, toastError, fullName, fmtDateTime, fmtRelative, fmtShortDate,
  KIND_LABEL, ROLE_LABEL, icon, avatar, stat, emptyState, courseColor, ACCENTS, DEFAULT_PREFS, savePreferences, segmented, toggle,
} from './core.js';

const list = (items, renderItem, emptyText, emptyIcon) =>
  items.length ? html`<ul class="list stagger">${items.map((it, i) => renderItem(it, i))}</ul>` : emptyState(emptyText, emptyIcon);

const when = (iso) => html`<span class="small nowrap right">${fmtShortDate(iso)}<br><span class="muted xs">${fmtRelative(iso)}</span></span>`;

export async function dashboardPage(el) {
  el = fresh(el);
  const { me } = state;
  const d = await api('/api/dashboard');
  const hour = new Date().getHours();
  const hello = hour < 5 ? 'Bonne nuit' : hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
  const today = new Date().toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'long' });

  const stats = [];
  if (me.role === 'admin') {
    const c = d.counts;
    stats.push(
      stat('Étudiants', c.students, 'users', '', '#/admin/utilisateurs'),
      stat('Enseignants', c.teachers, 'user', 'blue', '#/admin/utilisateurs'),
      stat('Cours', c.courses, 'book', 'green', '#/admin/cours'),
      stat('Documents', c.documents, 'folder', 'orange'),
    );
  }
  stats.push(stat('Messages non lus', d.unread_messages, 'mail', d.unread_messages ? 'red' : '', '#/messages'));
  if (me.role === 'etudiant') {
    stats.push(
      stat('Travaux à remettre', d.pending_submissions.length, 'clipboard', 'orange'),
      stat('Lectures à confirmer', d.to_acknowledge.length, 'eye', d.to_acknowledge.length ? 'red' : 'green'),
      stat('Absences', d.absences, 'attendance', d.absences >= 3 ? 'red' : 'blue', '#/notes'),
    );
  }
  if (me.role === 'enseignant') {
    stats.push(
      stat('Remises à corriger', d.to_grade.reduce((s, x) => s + x.n, 0), 'clipboard', 'orange'),
      stat('Publications programmées', d.scheduled_documents.length, 'timer', 'blue'),
    );
  }

  const evalItem = (e, i) => html`<li style="--i:${i}"><span class="dot-c" style="--c:${courseColor(e)}"></span>
    <div class="grow"><a class="title" href="#/cours/${e.course_id}/evaluations">${e.title}</a><div class="muted xs">${e.code} · ${KIND_LABEL[e.kind] || ''} ${e.weight != null ? `· ${e.weight} %` : ''}</div></div>${when(e.due_at)}</li>`;

  render(
    el,
    html`
      <section class="hero">
        <svg class="art" viewBox="0 0 120 120" fill="none" aria-hidden="true">
          <rect x="18" y="34" width="84" height="66" rx="16" fill="rgba(255,255,255,.22)"/>
          <path d="M44 34v-8a10 10 0 0 1 10-10h12a10 10 0 0 1 10 10v8" stroke="rgba(255,255,255,.7)" stroke-width="6" stroke-linecap="round"/>
          <path d="M18 62h84" stroke="rgba(255,255,255,.55)" stroke-width="5"/><rect x="50" y="56" width="20" height="14" rx="4" fill="rgba(255,255,255,.85)"/>
        </svg>
        <p style="text-transform:capitalize">${today}</p>
        <h1>${hello}, ${me.first_name} !</h1>
        <p>${me.role === 'etudiant'
          ? d.pending_submissions.length ? `Vous avez ${d.pending_submissions.length} travail(aux) à remettre.` : 'Aucun travail en attente — bravo !'
          : me.role === 'enseignant' ? 'Voici l’essentiel de vos cours aujourd’hui.' : 'Voici ce qui se passe dans l’établissement.'}</p>
        <div class="chips">
          <a class="chip" href="#/horaire">${icon('clock')}Mon horaire</a>
          <a class="chip" href="#/calendrier">${icon('calendar')}Calendrier</a>
          ${me.role === 'etudiant' ? html`<a class="chip" href="#/notes">${icon('award')}Mes notes</a>` : html`<a class="chip" href="#/cours">${icon('book')}Mes cours</a>`}
        </div>
      </section>
      <div class="stats">${stats}</div>
      <div class="grid cols-2">
        ${me.role === 'etudiant'
          ? html`
            <div class="card">
              <div class="card-head"><h2>${icon('clipboard')}Travaux à remettre</h2></div>
              ${list(d.pending_submissions, (e, i) => html`<li style="--i:${i}"><span class="dot-c" style="--c:${courseColor(e)}"></span>
                <div class="grow"><a class="title" href="#/cours/${e.course_id}/evaluations">${e.title}</a><div class="muted xs">${e.code}</div></div>
                ${e.due_at ? when(e.due_at) : html`<span class="muted xs">Sans échéance</span>`}</li>`, 'Aucun travail en attente. 🎉', 'checkCircle')}
            </div>
            ${d.to_acknowledge.length
              ? html`<div class="card">
                  <div class="card-head"><h2>${icon('eye')}Lectures obligatoires</h2><span class="badge red">${d.to_acknowledge.length}</span></div>
                  ${list(d.to_acknowledge, (doc, i) => html`<li style="--i:${i}"><span class="dot-c" style="--c:${courseColor(doc)}"></span>
                    <div class="grow"><a class="title" href="#/cours/${doc.course_id}/documents">${doc.title}</a><div class="muted xs">${doc.code}</div></div>
                    <a class="btn small" href="#/cours/${doc.course_id}/documents">Lire</a></li>`, '')}
                </div>`
              : ''}`
          : ''}
        ${me.role === 'enseignant'
          ? html`<div class="card">
              <div class="card-head"><h2>${icon('clipboard')}Remises à corriger</h2></div>
              ${list(d.to_grade, (e, i) => html`<li style="--i:${i}"><span class="dot-c" style="--c:${courseColor(e)}"></span>
                <div class="grow"><a class="title" href="#/evaluation/${e.id}">${e.title}</a><div class="muted xs">${e.code}</div></div>
                <span class="badge orange">${e.n} à corriger</span></li>`, 'Tout est corrigé. ✨', 'checkCircle')}
            </div>
            ${d.scheduled_documents.length
              ? html`<div class="card">
                  <div class="card-head"><h2>${icon('timer')}Publications programmées</h2></div>
                  ${list(d.scheduled_documents, (doc, i) => html`<li style="--i:${i}"><span class="dot-c" style="--c:${courseColor(doc)}"></span>
                    <div class="grow"><a class="title" href="#/cours/${doc.course_id}/documents">${doc.title}</a><div class="muted xs">${doc.code}</div></div>${when(doc.publish_at)}</li>`, '')}
                </div>`
              : ''}`
          : ''}
        <div class="card">
          <div class="card-head"><h2>${icon('target')}Évaluations des 14 prochains jours</h2></div>
          ${list(d.upcoming_evaluations, evalItem, 'Rien à l’horaire. Profitez-en !', 'calendar')}
        </div>
        <div class="card">
          <div class="card-head"><h2>${icon('calendar')}Événements à venir</h2><a class="small" href="#/calendrier">Calendrier →</a></div>
          ${list(d.upcoming_events, (e, i) => html`<li style="--i:${i}"><span class="dot-c" style="--c:${e.code ? courseColor(e) : 'var(--success)'}"></span>
            <div class="grow"><span class="title">${e.title}</span><div class="muted xs">${e.code || 'Toute l’école'} · ${fmtDateTime(e.starts_at)}</div></div>${when(e.starts_at)}</li>`, 'Aucun événement.', 'calendar')}
        </div>
        <div class="card">
          <div class="card-head"><h2>${icon('folder')}Documents récents</h2></div>
          ${list(d.recent_documents, (doc, i) => html`<li style="--i:${i}"><span class="dot-c" style="--c:${courseColor(doc)}"></span>
            <div class="grow"><a class="title" href="#/cours/${doc.course_id}/documents">${doc.title}</a><div class="muted xs">${doc.code}</div></div>
            ${me.role === 'etudiant' && !doc.first_viewed_at ? html`<span class="badge accent">Nouveau</span>` : ''}
            ${me.role !== 'etudiant' && doc.status === 'draft' ? html`<span class="badge">Brouillon</span>` : ''}
            <span class="muted xs nowrap">${fmtShortDate(doc.created_at)}</span></li>`, 'Aucun document.', 'folder')}
        </div>
      </div>`,
  );
}

// ---------- Profil et apparence ----------

function appearanceCard(prefs) {
  const p = { ...DEFAULT_PREFS, ...prefs };
  const accent = p.accent || state.settings?.accent || '#6366f1';
  const themeTile = (value, label, bg, side, ic) => html`<label class="tile"><input type="radio" name="theme" value="${value}" ${p.theme === value ? 'checked' : ''}>
    <div class="preview" style="background:${bg}"><i style="background:${side}"></i><i></i></div><b>${icon(ic)} ${label}</b></label>`;
  return html`
    <form class="card" id="appearance">
      <div class="card-head"><h2>${icon('palette')}Apparence et personnalisation</h2><button type="button" class="small ghost" id="reset-prefs">Réinitialiser</button></div>
      <p class="muted small">Vos choix sont enregistrés dans votre compte et vous suivent sur tous vos appareils.</p>

      <div class="field"><label>Thème</label>
        <div class="tiles">
          ${themeTile('auto', 'Automatique', 'linear-gradient(90deg,#f4f5fb 50%,#0b0d17 50%)', 'transparent', 'monitor')}
          ${themeTile('light', 'Clair', '#f4f5fb', '#ffffff', 'sun')}
          ${themeTile('dark', 'Sombre', '#0b0d17', '#131626', 'moon')}
        </div>
      </div>

      <div class="field"><label>Couleur d’accent</label>
        <div class="swatches">
          ${ACCENTS.map(([name, hex]) => html`<button type="button" class="swatch ${hex === accent ? 'on' : ''}" style="--c:${hex}" data-accent="${hex}" title="${name}" aria-label="${name}"></button>`)}
          <label class="row-flex small" style="margin:0 0 0 .4rem" title="Couleur personnalisée"><input type="color" id="custom-accent" value="${accent}"> Personnalisée</label>
        </div>
      </div>

      <div class="row">
        <div class="field"><label>Densité</label>${segmented('density', p.density, [['comfortable', 'Confortable'], ['compact', 'Compacte']])}</div>
        <div class="field"><label>Taille du texte</label>${segmented('font_scale', p.font_scale, [[90, 'A−'], [100, 'A'], [110, 'A+'], [120, 'A++']])}</div>
      </div>
      <div class="row">
        <div class="field"><label>Coins</label>${segmented('corners', p.corners, [['rounded', 'Arrondis'], ['soft', 'Doux'], ['sharp', 'Droits']])}</div>
        <div class="field"><label>Arrière-plan</label>${segmented('background', p.background, [['mesh', 'Dégradé'], ['dots', 'Points'], ['plain', 'Uni']])}</div>
      </div>
      ${toggle('sidebar_collapsed', p.sidebar_collapsed, 'Menu latéral réduit', 'N’afficher que les icônes dans le menu de gauche.')}
      ${toggle('reduce_motion', p.reduce_motion, 'Réduire les animations', 'Désactive les transitions et effets de mouvement.')}
    </form>`;
}

export async function profilePage(el, section) {
  el = fresh(el);
  const me = await api('/api/me');
  state.me.preferences = me.preferences;
  render(
    el,
    html`
      <div class="page-head"><div><h1>Mon profil</h1><p class="muted">Vos informations, votre sécurité et votre interface.</p></div></div>
      <div class="grid cols-2">
        <div class="card">
          <div class="person" style="margin-bottom:1rem">${avatar(me, 'lg')}<div><h2 style="margin:0">${fullName(me)}</h2><span class="badge accent">${ROLE_LABEL[me.role]}</span></div></div>
          <table><tbody>
            <tr><td class="muted">Courriel</td><td>${me.email}</td></tr>
            ${me.student_number ? html`<tr><td class="muted">Numéro étudiant</td><td>${me.student_number}</td></tr>` : ''}
            ${me.program ? html`<tr><td class="muted">Programme</td><td>${me.program}</td></tr>` : ''}
            ${me.phone ? html`<tr><td class="muted">Téléphone</td><td>${me.phone}</td></tr>` : ''}
          </tbody></table>
          <p class="muted small" style="margin-top:.9rem">Pour corriger ces informations, contactez l’administration.</p>
        </div>
        <div class="card">
          <div class="card-head"><h2>${icon('lock')}Changer mon mot de passe</h2></div>
          <form id="pw-form">
            <div class="field"><label>Mot de passe actuel</label><input type="password" name="current" autocomplete="current-password" required></div>
            <div class="field"><label>Nouveau mot de passe</label><input type="password" name="next" autocomplete="new-password" minlength="8" required><div class="hint">8 caractères minimum.</div></div>
            <div class="field"><label>Confirmer</label><input type="password" name="confirm" autocomplete="new-password" required></div>
            <button type="submit" class="primary">Mettre à jour</button>
          </form>
        </div>
      </div>
      ${appearanceCard(me.preferences)}`,
  );

  if (section === 'apparence') setTimeout(() => $('#appearance', el)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);

  const form = $('#appearance', el);
  const persist = (patch) => savePreferences(patch).catch(toastError);
  form.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'custom-accent') return;
    const f = formData(form);
    if (t.name === 'sidebar_collapsed') $('.shell')?.classList.toggle('collapsed', f.sidebar_collapsed);
    persist({
      theme: f.theme,
      density: f.density,
      font_scale: Number(f.font_scale),
      corners: f.corners,
      background: f.background,
      sidebar_collapsed: f.sidebar_collapsed,
      reduce_motion: f.reduce_motion,
    });
  });
  const setAccent = (hex) => {
    $$('.swatch', form).forEach((s) => s.classList.toggle('on', s.dataset.accent === hex));
    $('#custom-accent', form).value = hex;
    persist({ accent: hex });
  };
  on(form, 'click', '[data-accent]', (b) => setAccent(b.dataset.accent));
  let accentTimer;
  $('#custom-accent', form).addEventListener('input', (e) => {
    document.documentElement.style.setProperty('--accent', e.target.value);
    clearTimeout(accentTimer);
    accentTimer = setTimeout(() => setAccent(e.target.value), 300);
  });
  $('#reset-prefs', form).addEventListener('click', async () => {
    state.me.preferences = {};
    await savePreferences({ ...DEFAULT_PREFS, accent: undefined }).catch(toastError);
    $('.shell')?.classList.remove('collapsed');
    toast('Apparence réinitialisée.');
    profilePage(el, 'apparence');
  });

  $('#pw-form', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (f.next !== f.confirm) return toast('Les mots de passe ne correspondent pas.', 'error');
    try {
      await api('/api/me/password', { method: 'POST', body: { current: f.current, next: f.next } });
      e.target.reset();
      toast('Mot de passe modifié.');
    } catch (err) {
      toastError(err);
    }
  });
}
