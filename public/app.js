import {
  APP_NAME, state, api, html, render, fresh, $, $$, on, formData, toastError, toast, fullName, ROLE_LABEL, icon, avatar,
  applyPreferences, applyCachedPreferences, savePreferences, courseLabel, courseColor, skeleton,
} from './js/core.js';
import { dashboardPage, profilePage } from './js/home.js';
import { coursesPage, coursePage, gradingPage } from './js/course.js';
import { schedulePage, calendarPage, messagesPage, messagePage, studentsPage, dossierPage, composeMessage } from './js/pages.js';
import { adminOverviewPage, adminUsersPage, adminCoursesPage, auditPage, schoolSettingsPage } from './js/admin.js';

applyCachedPreferences();

const ROUTES = [
  [/^\/$/, dashboardPage],
  [/^\/cours$/, coursesPage],
  [/^\/cours\/(\d+)(?:\/(\w+))?$/, (el, [id, tab]) => coursePage(el, Number(id), tab || 'apercu')],
  [/^\/evaluation\/(\d+)$/, (el, [id]) => gradingPage(el, Number(id))],
  [/^\/horaire$/, schedulePage],
  [/^\/calendrier$/, calendarPage],
  [/^\/messages$/, messagesPage],
  [/^\/messages\/envoyes$/, (el) => messagesPage(el, [], 'sent')],
  [/^\/messages\/(\d+)$/, (el, [id]) => messagePage(el, Number(id))],
  [/^\/notes$/, (el) => dossierPage(el, [state.me.id])],
  [/^\/etudiants$/, studentsPage, ['admin', 'enseignant']],
  [/^\/etudiants\/(\d+)$/, (el, [id]) => dossierPage(el, [Number(id)]), ['admin', 'enseignant']],
  [/^\/admin$/, adminOverviewPage, ['admin']],
  [/^\/admin\/utilisateurs$/, adminUsersPage, ['admin']],
  [/^\/admin\/cours$/, adminCoursesPage, ['admin']],
  [/^\/admin\/journal$/, auditPage, ['admin']],
  [/^\/admin\/etablissement$/, schoolSettingsPage, ['admin']],
  [/^\/profil(?:\/(\w+))?$/, (el, [section]) => profilePage(el, section)],
];

function navItems(role) {
  const items = [
    ['#/', 'Tableau de bord', 'home'],
    ['#/cours', role === 'admin' ? 'Tous les cours' : 'Mes cours', 'book'],
    ['#/horaire', 'Horaire', 'clock'],
    ['#/calendrier', 'Calendrier', 'calendar'],
    ['#/messages', 'Messagerie', 'mail', 'unread'],
  ];
  if (role === 'etudiant') items.push(['#/notes', 'Mes notes et dossier', 'award']);
  if (role !== 'etudiant') items.push(['#/etudiants', 'Dossiers étudiants', 'users']);
  const admin = role === 'admin'
    ? [
        ['#/admin', 'Vue d’ensemble', 'grid'],
        ['#/admin/utilisateurs', 'Comptes', 'shield'],
        ['#/admin/cours', 'Gestion des cours', 'layers'],
        ['#/admin/journal', 'Journal d’activité', 'activity'],
        ['#/admin/etablissement', 'Établissement', 'building'],
      ]
    : [];
  return { items, admin };
}

function brand(sub) {
  return html`<a class="brand" href="#/"><span class="logo">${icon('logo')}</span><span class="brand-text">${APP_NAME}${sub ? html`<small>${sub}</small>` : ''}</span></a>`;
}

const isDark = () =>
  document.documentElement.dataset.theme === 'dark' ||
  (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);

function renderShell() {
  const { me, settings } = state;
  const { items, admin } = navItems(me.role);
  const link = ([href, label, ic, badge]) =>
    html`<a href="${href}" data-nav title="${label}">${icon(ic)}<span class="label">${label}</span>${badge ? html`<span class="count hidden" data-badge="${badge}"></span>` : ''}</a>`;
  render(
    $('#app'),
    html`
      <div class="shell ${me.preferences?.sidebar_collapsed ? 'collapsed' : ''}">
        <aside class="sidebar">
          ${brand(settings?.school_name)}
          <nav class="nav">
            ${items.map(link)}
            ${admin.length ? html`<div class="nav-section">Administration</div>${admin.map(link)}` : ''}
          </nav>
          <div class="sidebar-foot">
            <a href="#/profil" title="Mon profil">${avatar(me)}</a>
            <div class="who"><strong>${fullName(me)}</strong><span class="muted xs">${ROLE_LABEL[me.role]}</span></div>
            <button type="button" class="ghost icon-btn" id="collapse" title="Réduire ou agrandir le menu">${icon('sidebar')}</button>
          </div>
        </aside>
        <div>
          <header class="topbar">
            <button type="button" class="ghost icon-btn" id="menu" aria-label="Menu">${icon('menu')}</button>
            <button type="button" class="search-btn" id="open-palette">${icon('search')}<span>Rechercher ou aller à…</span><kbd>Ctrl K</kbd></button>
            <span class="spacer"></span>
            <button type="button" class="ghost icon-btn" id="theme-toggle" title="Changer le thème"></button>
            <a class="btn ghost icon-btn" href="#/messages" title="Messagerie">${icon('bell')}<span class="dot hidden" data-badge-dot></span></a>
            <div class="user-menu">
              <button type="button" class="ghost" id="user-btn" aria-haspopup="menu">${avatar(me, 'sm')}<span class="name small">${me.first_name}</span></button>
            </div>
          </header>
          <main class="main" id="main"></main>
        </div>
      </div>`,
  );

  $('#menu').addEventListener('click', () => $('.shell').classList.toggle('nav-open'));
  $('.shell').addEventListener('click', (e) => {
    if (e.target === $('.shell')) $('.shell').classList.remove('nav-open');
  });
  on($('.sidebar'), 'click', 'a', () => $('.shell').classList.remove('nav-open'));
  $('#collapse').addEventListener('click', () => {
    const collapsed = $('.shell').classList.toggle('collapsed');
    savePreferences({ sidebar_collapsed: collapsed }).catch(toastError);
  });
  $('#open-palette').addEventListener('click', openPalette);
  $('#theme-toggle').addEventListener('click', () => {
    savePreferences({ theme: isDark() ? 'light' : 'dark' }).catch(toastError);
    syncThemeIcon();
  });
  syncThemeIcon();
  $('#user-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleUserMenu();
  });
}

function syncThemeIcon() {
  const btn = $('#theme-toggle');
  if (btn) render(btn, icon(isDark() ? 'sun' : 'moon'));
}

function toggleUserMenu() {
  const existing = $('.user-menu .menu');
  if (existing) {
    existing.remove();
    return;
  }
  const { me } = state;
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'menu');
  render(
    menu,
    html`
      <div class="head person">${avatar(me)}<div><strong>${fullName(me)}</strong><div class="muted xs">${me.email}</div></div></div>
      <a href="#/profil">${icon('user')}Mon profil</a>
      <a href="#/profil/apparence">${icon('palette')}Apparence et personnalisation</a>
      <button type="button" data-act="palette">${icon('search')}Recherche rapide <kbd style="margin-left:auto">Ctrl K</kbd></button>
      <hr>
      <button type="button" data-act="logout">${icon('logout')}Se déconnecter</button>`,
  );
  $('.user-menu').append(menu);
  const close = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', close);
    }
  };
  setTimeout(() => document.addEventListener('click', close));
  on(menu, 'click', 'a', () => menu.remove());
  on(menu, 'click', '[data-act]', async (b) => {
    menu.remove();
    if (b.dataset.act === 'palette') openPalette();
    if (b.dataset.act === 'logout') {
      await api('/api/logout', { method: 'POST' }).catch(() => {});
      state.me = null;
      state.courses = null;
      location.hash = '#/connexion';
    }
  });
}

// ---------- Palette de commandes (Ctrl+K) ----------

async function openPalette() {
  if ($('.palette')) return;
  const { me } = state;
  const { items, admin } = navItems(me.role);
  const entries = [...items, ...admin].map(([href, label, ic]) => ({ label, icon: ic, kind: 'Page', run: () => (location.hash = href) }));
  entries.push(
    { label: 'Nouveau message', icon: 'send', kind: 'Action', run: () => composeMessage() },
    { label: 'Apparence et personnalisation', icon: 'palette', kind: 'Action', run: () => (location.hash = '#/profil/apparence') },
    { label: 'Thème clair', icon: 'sun', kind: 'Thème', run: () => savePreferences({ theme: 'light' }).then(syncThemeIcon) },
    { label: 'Thème sombre', icon: 'moon', kind: 'Thème', run: () => savePreferences({ theme: 'dark' }).then(syncThemeIcon) },
    { label: 'Thème automatique (système)', icon: 'monitor', kind: 'Thème', run: () => savePreferences({ theme: 'auto' }).then(syncThemeIcon) },
  );
  try {
    state.courses ??= await api('/api/courses');
    for (const c of state.courses) {
      entries.push({ label: `${courseLabel(c)} — ${c.name}`, kind: 'Cours', color: courseColor(c), run: () => (location.hash = `#/cours/${c.id}`) });
      entries.push({ label: `Documents · ${c.name}`, icon: 'folder', kind: 'Cours', run: () => (location.hash = `#/cours/${c.id}/documents`) });
    }
  } catch {
    /* courses unavailable */
  }

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop top';
  render(
    backdrop,
    html`<div class="modal palette" role="dialog" aria-label="Recherche rapide">
      <div class="modal-body">
        <div class="input-icon">${icon('search')}<input id="pal-q" placeholder="Rechercher une page, un cours, une action…" autocomplete="off"></div>
        <ul id="pal-list"></ul>
        <div class="foot"><span><kbd>↑</kbd> <kbd>↓</kbd> naviguer</span><span><kbd>Entrée</kbd> ouvrir</span><span><kbd>Échap</kbd> fermer</span></div>
      </div>
    </div>`,
  );
  $('#modal-root').append(backdrop);
  const input = $('#pal-q', backdrop);
  const list = $('#pal-list', backdrop);
  let filtered = entries;
  let index = 0;
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const draw = () => {
    render(
      list,
      filtered.length
        ? filtered.slice(0, 40).map(
            (e, i) => html`<li class="${i === index ? 'on' : ''}" data-i="${i}">${e.color ? html`<span class="dot-c" style="--c:${e.color}"></span>` : icon(e.icon)}<span>${e.label}</span><span class="kind">${e.kind}</span></li>`,
          )
        : html`<li class="muted">Aucun résultat</li>`,
    );
    $('li.on', list)?.scrollIntoView({ block: 'nearest' });
  };
  const close = () => backdrop.remove();
  const choose = (i) => {
    const e = filtered[i];
    if (!e) return;
    close();
    e.run();
  };
  input.addEventListener('input', () => {
    const q = norm(input.value.trim());
    filtered = q ? entries.filter((e) => norm(e.label).includes(q)) : entries;
    index = 0;
    draw();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') index = Math.min(index + 1, filtered.length - 1);
    else if (e.key === 'ArrowUp') index = Math.max(index - 1, 0);
    else if (e.key === 'Enter') return choose(index);
    else if (e.key === 'Escape') return close();
    else return;
    e.preventDefault();
    draw();
  });
  on(list, 'click', '[data-i]', (li) => choose(Number(li.dataset.i)));
  backdrop.addEventListener('mousedown', (e) => e.target === backdrop && close());
  draw();
  input.focus();
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && state.me) {
    e.preventDefault();
    openPalette();
  }
});

// ---------- Badges ----------

export async function refreshUnread() {
  try {
    const { unread_messages } = await api('/api/dashboard');
    const badge = $('[data-badge="unread"]');
    if (badge) {
      badge.textContent = unread_messages;
      badge.classList.toggle('hidden', !unread_messages);
    }
    $('[data-badge-dot]')?.classList.toggle('hidden', !unread_messages);
  } catch {
    /* ignore */
  }
}

// ---------- Connexion ----------

function renderLogin() {
  const s = state.settings || {};
  render(
    $('#app'),
    html`
      <div class="login">
        <section class="side">
          ${brand(s.school_name)}
          <div>
            <h1>${s.tagline || 'Votre session, au même endroit.'}</h1>
            <ul>
              <li>${icon('folder')}Documents de cours, consultables en un clic</li>
              <li>${icon('clipboard')}Travaux, remises et notes en temps réel</li>
              <li>${icon('calendar')}Horaire, calendrier et absences</li>
              <li>${icon('mail')}Messagerie entre étudiants, enseignants et direction</li>
            </ul>
          </div>
          <p class="small" style="opacity:.8;margin:0">© ${new Date().getFullYear()} ${APP_NAME}</p>
        </section>
        <section class="form-side">
          <div class="form-card">
            <h2>Bon retour 👋</h2>
            <p class="muted">Connectez-vous à votre espace ${APP_NAME}.</p>
            ${s.login_message ? html`<div class="alert">${icon('info')}<span class="pre">${s.login_message}</span></div>` : ''}
            <form id="login-form">
              <div class="field"><label for="email">Courriel</label><input id="email" name="email" type="email" autocomplete="username" required></div>
              <div class="field"><label for="password">Mot de passe</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
              <div class="alert error hidden" id="login-error"></div>
              <button type="submit" class="primary">Se connecter ${icon('arrowRight')}</button>
            </form>
            <p class="muted small" style="margin-top:1.2rem;text-align:center">Les comptes sont créés par l’administration de l’établissement.</p>
          </div>
        </section>
      </div>`,
  );
  $('#email').focus();
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#login-error');
    const btn = $('button[type="submit"]', e.target);
    err.classList.add('hidden');
    btn.disabled = true;
    try {
      await api('/api/login', { method: 'POST', body: formData(e.target) });
      await loadMe();
      renderShell();
      location.hash = '#/';
      route();
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove('hidden');
    } finally {
      btn.disabled = false;
    }
  });
}

async function loadMe() {
  state.me = await api('/api/me');
  state.courses = null;
  applyPreferences(state.me.preferences);
}

// ---------- Routeur ----------

let navigation = 0;

async function route() {
  const path = location.hash.replace(/^#/, '') || '/';
  if (!state.me) {
    renderLogin();
    return;
  }
  if (path === '/connexion') {
    location.hash = '#/';
    return;
  }
  if (!$('#main')) renderShell();
  const seq = ++navigation;
  const main = fresh($('#main'));

  const links = $$('[data-nav]');
  const hrefOf = (a) => a.getAttribute('href').slice(1);
  const exact = links.filter((a) => hrefOf(a) === path);
  links.forEach((a) => {
    const h = hrefOf(a);
    a.classList.toggle('active', exact.length ? exact.includes(a) : h !== '/' && path.startsWith(h + '/'));
  });

  for (const [regex, page, roles] of ROUTES) {
    const m = regex.exec(path);
    if (!m) continue;
    if (roles && !roles.includes(state.me.role)) break;
    render(main, skeleton(3));
    try {
      await page(main, m.slice(1));
    } catch (err) {
      if (seq === navigation) render($('#main'), html`<div class="alert error">${icon('alert')}<span>${err.message}</span></div>`);
    }
    // Pages may swap #main for a fresh element; animate whatever is current.
    $('#main')?.classList.add('page');
    window.scrollTo({ top: 0 });
    refreshUnread();
    return;
  }
  render(main, html`<div class="card"><div class="empty">${icon('globe')}<h2>Page introuvable</h2><a class="btn primary" href="#/">Retour au tableau de bord</a></div></div>`);
}

window.addEventListener('hashchange', route);
window.addEventListener('unhandledrejection', (e) => toastError(e.reason));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeIcon);

(async function start() {
  try {
    state.settings = await api('/api/settings');
  } catch {
    state.settings = {};
  }
  if (state.settings.school_name) document.title = `${APP_NAME} · ${state.settings.school_name}`;
  try {
    await loadMe();
  } catch {
    state.me = null;
  }
  route();
})();

export { route, toast };
