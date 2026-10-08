import { state, api, html, render, fresh, $, $$, on, formData, toastError, toast, fullName, ROLE_LABEL } from './js/core.js';
import { dashboardPage, profilePage } from './js/home.js';
import { coursesPage, coursePage, gradingPage } from './js/course.js';
import { schedulePage, calendarPage, messagesPage, messagePage, studentsPage, dossierPage } from './js/pages.js';
import { adminOverviewPage, adminUsersPage, adminCoursesPage, auditPage } from './js/admin.js';

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
  [/^\/profil$/, profilePage],
];

function navItems(role) {
  const items = [
    ['#/', 'Tableau de bord'],
    ['#/cours', role === 'admin' ? 'Tous les cours' : 'Mes cours'],
    ['#/horaire', 'Horaire'],
    ['#/calendrier', 'Calendrier'],
    ['#/messages', 'Messagerie', 'unread'],
  ];
  if (role === 'etudiant') items.push(['#/notes', 'Mon dossier et mes notes']);
  if (role !== 'etudiant') items.push(['#/etudiants', 'Dossiers étudiants']);
  const admin = role === 'admin'
    ? [
        ['#/admin', 'Vue d’ensemble'],
        ['#/admin/utilisateurs', 'Comptes'],
        ['#/admin/cours', 'Gestion des cours'],
        ['#/admin/journal', 'Journal d’activité'],
      ]
    : [];
  return { items, admin };
}

function renderShell() {
  const { me } = state;
  const { items, admin } = navItems(me.role);
  const link = ([href, label, badge]) =>
    html`<a href="${href}" data-nav>${label}${badge ? html`<span class="badge hidden" data-badge="${badge}"></span>` : ''}</a>`;
  render(
    $('#app'),
    html`
      <div class="shell">
        <aside class="sidebar">
          <div class="brand"><img src="/favicon.svg" alt="">École en ligne</div>
          <nav class="nav">
            ${items.map(link)}
            ${admin.length ? html`<div class="nav-section">Administration</div>${admin.map(link)}` : ''}
            <div class="nav-section">Compte</div>
            ${link(['#/profil', 'Mon profil'])}
          </nav>
          <div class="sidebar-foot">
            <div class="who">${fullName(me)}</div>
            <div>${ROLE_LABEL[me.role]}</div>
            <button type="button" id="logout">Se déconnecter</button>
          </div>
        </aside>
        <div>
          <header class="topbar">
            <button type="button" id="menu" aria-label="Menu">☰</button>
            <strong>École en ligne</strong>
          </header>
          <main class="main" id="main"></main>
        </div>
      </div>`,
  );
  $('#logout').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    state.me = null;
    location.hash = '#/connexion';
  });
  $('#menu').addEventListener('click', () => $('.shell').classList.toggle('nav-open'));
  on($('.sidebar'), 'click', 'a', () => $('.shell').classList.remove('nav-open'));
}

export async function refreshUnread() {
  try {
    const { unread_messages } = await api('/api/dashboard');
    const badge = $('[data-badge="unread"]');
    if (!badge) return;
    badge.textContent = unread_messages;
    badge.classList.toggle('hidden', !unread_messages);
  } catch {
    /* ignore */
  }
}

function renderLogin() {
  render(
    $('#app'),
    html`
      <div class="login">
        <div class="card">
          <div class="brand"><img src="/favicon.svg" alt="">École en ligne</div>
          <form id="login-form">
            <div class="field"><label for="email">Courriel</label><input id="email" name="email" type="email" autocomplete="username" required></div>
            <div class="field"><label for="password">Mot de passe</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
            <div class="alert error hidden" id="login-error"></div>
            <button type="submit" class="primary" style="width:100%">Se connecter</button>
          </form>
          <p class="muted small" style="margin-top:1rem;text-align:center">Les comptes sont créés par l’administration de l’école.</p>
        </div>
      </div>`,
  );
  $('#email').focus();
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#login-error');
    err.classList.add('hidden');
    try {
      await api('/api/login', { method: 'POST', body: formData(e.target) });
      state.me = await api('/api/me');
      renderShell();
      location.hash = '#/';
      route();
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove('hidden');
    }
  });
}

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
  const main = fresh($('#main'));

  $$('[data-nav]').forEach((a) => {
    const href = a.getAttribute('href').slice(1);
    a.classList.toggle('active', href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
  });
  // Exact match wins over a prefix match (e.g. /admin vs /admin/cours).
  const exact = $$('[data-nav]').filter((a) => a.getAttribute('href').slice(1) === path);
  if (exact.length) $$('[data-nav]').forEach((a) => a.classList.toggle('active', exact.includes(a)));

  for (const [regex, page, roles] of ROUTES) {
    const m = regex.exec(path);
    if (!m) continue;
    if (roles && !roles.includes(state.me.role)) break;
    render(main, html`<div class="muted">Chargement…</div>`);
    try {
      await page(main, m.slice(1));
    } catch (err) {
      // Pages may swap #main for a fresh element, so render the error into whatever is current.
      render($('#main'), html`<div class="alert error">${err.message}</div>`);
    }
    window.scrollTo(0, 0);
    refreshUnread();
    return;
  }
  render(main, html`<h1>Page introuvable</h1><p><a href="#/">Retour au tableau de bord</a></p>`);
}

window.addEventListener('hashchange', route);
window.addEventListener('unhandledrejection', (e) => toastError(e.reason));

(async function start() {
  try {
    state.me = await api('/api/me');
  } catch {
    state.me = null;
  }
  route();
})();

export { route, toast };
