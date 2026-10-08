// Shared helpers: API calls, safe HTML templating, icons, formatting, preferences, modals and toasts.

export const APP_NAME = 'Cartable';
export const state = { me: null, settings: null, courses: null };

// ---------- API ----------

export async function api(path, { method = 'GET', body, file, headers = {} } = {}) {
  const opts = { method, headers: { 'X-Requested-With': 'fetch', ...headers }, credentials: 'same-origin' };
  if (file) {
    opts.body = file;
    opts.headers['Content-Type'] = 'application/octet-stream';
    opts.headers['X-File-Name'] = encodeURIComponent(file.name);
  } else if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(path, opts);
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (res.status === 401 && path !== '/api/login' && path !== '/api/me') {
    state.me = null;
    location.hash = '#/connexion';
    throw new Error(data?.error || 'Session expirée.');
  }
  if (!res.ok) throw new Error(data?.error || `Erreur ${res.status}`);
  return data;
}

export function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

// ---------- Safe templating ----------
// html`...` escapes every interpolated value unless it is itself the result of html`` / raw().

class Safe {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

export const raw = (s) => new Safe(String(s));

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function fmtVal(v) {
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(fmtVal).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(v);
}

export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += fmtVal(values[i]);
  });
  return new Safe(out);
}

export function render(el, content) {
  el.innerHTML = fmtVal(content);
  return el;
}

/** Replaces an element with an empty clone so listeners from a previous render are dropped. */
export function fresh(el) {
  const clone = el.cloneNode(false);
  el.replaceWith(clone);
  return clone;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Delegated event listener: on(root, 'click', '[data-x]', (el, ev) => …) */
export function on(root, type, selector, handler) {
  root.addEventListener(type, (ev) => {
    const el = ev.target.closest(selector);
    if (el && root.contains(el)) handler(el, ev);
  });
}

export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else if (el.type === 'file') out[el.name] = el.files[0] || null;
    else out[el.name] = el.value;
  }
  return out;
}

// ---------- Icônes (dessinées à la main, trait 1,8) ----------

const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M9 7h7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a5.5 5.5 0 0 1 3.5 5.8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
  shield: '<path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  building: '<path d="M4 21V6l8-3 8 3v15"/><path d="M9 21v-5h6v5M8.5 9h.01M12 9h.01M15.5 9h.01M8.5 12.5h.01M12 12.5h.01M15.5 12.5h.01"/>',
  file: '<path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="m10 8-4 4 4 4M6 12h11"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.6-1.5-2.2-.5-3.5.6-.8 1.6-.5 3-.5a4.5 4.5 0 0 0 4.5-4.5C21 6.5 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14.5" cy="7" r="1"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="m6 7 1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m14.5 7.5 3 3"/>',
  send: '<path d="M21 3 3 10.5l7 3 3 7z"/><path d="m10 13.5 4.5-4.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 8 5-3 5 3-1.5-8"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h4"/>',
  attendance: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  sparkles: '<path d="m12 3 1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  alert: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>',
  printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  reply: '<path d="m9 8-5 4 5 4"/><path d="M4 12h10a6 6 0 0 1 6 6"/>',
  inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9 2h6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  logo: '<path d="M8 7V5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V7"/><rect x="3.5" y="7" width="17" height="13" rx="3"/><path d="M3.5 12.5h17M10 12.5v2h4v-2"/>',
};

export const icon = (name, cls = '') =>
  raw(`<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.file}</svg>`);

// ---------- Avatars, couleurs ----------

const PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16'];
export const ACCENTS = [
  ['Indigo', '#6366f1'], ['Violet', '#8b5cf6'], ['Rose', '#ec4899'], ['Rouge', '#ef4444'], ['Orange', '#f97316'],
  ['Ambre', '#f59e0b'], ['Vert', '#10b981'], ['Sarcelle', '#14b8a6'], ['Ciel', '#0ea5e9'], ['Ardoise', '#475569'],
];

function hash(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export const colorFor = (key) => PALETTE[hash(key) % PALETTE.length];
export const courseColor = (c) => (c && c.color) || PALETTE[(Number(c?.course_id ?? c?.id) || 0) % PALETTE.length];

export function avatar(u, size = '') {
  const initials = `${(u.first_name || '?')[0]}${(u.last_name || '')[0] || ''}`.toUpperCase();
  return html`<span class="avatar ${size}" style="--c:${colorFor(`${u.first_name}${u.last_name}`)}" aria-hidden="true">${initials}</span>`;
}

export function fileIcon(name = '', mime = '') {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map = { pdf: '#ef4444', doc: '#2563eb', docx: '#2563eb', xls: '#16a34a', xlsx: '#16a34a', csv: '#16a34a', ppt: '#ea580c', pptx: '#ea580c', zip: '#7c3aed', png: '#0891b2', jpg: '#0891b2', jpeg: '#0891b2', gif: '#0891b2', webp: '#0891b2', txt: '#64748b' };
  const label = ext && ext.length <= 4 ? ext.toUpperCase() : mime.startsWith('image/') ? 'IMG' : 'FICH';
  return html`<span class="ficon" style="--fc:${map[ext] || '#64748b'}">${label}</span>`;
}

// ---------- Préférences d'interface ----------

export const DEFAULT_PREFS = { theme: 'auto', density: 'comfortable', font_scale: 100, corners: 'rounded', background: 'mesh', reduce_motion: false, sidebar_collapsed: false };

export function applyPreferences(prefs = {}) {
  const p = { ...DEFAULT_PREFS, ...prefs };
  const root = document.documentElement;
  const accent = p.accent || state.settings?.accent || '#6366f1';
  root.style.setProperty('--accent', accent);
  root.dataset.theme = p.theme;
  root.dataset.density = p.density;
  root.dataset.font = String(p.font_scale);
  root.dataset.corners = p.corners;
  root.dataset.bg = p.background;
  root.dataset.motion = p.reduce_motion ? 'reduce' : 'full';
  try {
    localStorage.setItem('cartable.prefs', JSON.stringify({ ...p, accent }));
  } catch {
    /* storage unavailable */
  }
  return p;
}

/** Applies cached preferences immediately on load, before /api/me answers (no flash). */
export function applyCachedPreferences() {
  try {
    const cached = JSON.parse(localStorage.getItem('cartable.prefs') || 'null');
    if (cached) applyPreferences(cached);
  } catch {
    /* ignore */
  }
}

export async function savePreferences(patch) {
  const next = { ...(state.me?.preferences || {}), ...patch };
  applyPreferences(next);
  if (state.me) {
    // Update locally first so quick successive changes build on each other instead of racing.
    state.me.preferences = next;
    await api('/api/me/preferences', { method: 'PUT', body: next });
  }
}

// ---------- Formatage ----------

/** Accepts ISO strings, SQLite UTC 'YYYY-MM-DD HH:MM:SS' and plain dates 'YYYY-MM-DD' (local). */
export function parseDate(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  if (s.includes('T')) return new Date(s);
  return new Date(s.replace(' ', 'T') + 'Z');
}

const fmt = (opts) => new Intl.DateTimeFormat('fr-CA', opts);
export const fmtDate = (s) => (s ? fmt({ day: 'numeric', month: 'long', year: 'numeric' }).format(parseDate(s)) : '—');
export const fmtShortDate = (s) => (s ? fmt({ day: 'numeric', month: 'short' }).format(parseDate(s)) : '—');
export const fmtDateTime = (s) =>
  s ? fmt({ day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(parseDate(s)) : '—';
export const fmtTime = (s) => (s ? fmt({ hour: '2-digit', minute: '2-digit' }).format(parseDate(s)) : '');

export function fmtRelative(s) {
  const d = parseDate(s);
  if (!d) return '';
  const diff = (d - Date.now()) / 86400_000;
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  if (Math.abs(diff) < 1) {
    const hours = Math.round((d - Date.now()) / 3600_000);
    if (Math.abs(hours) < 1) return rtf.format(Math.round((d - Date.now()) / 60_000), 'minute');
    return rtf.format(hours, 'hour');
  }
  return rtf.format(Math.round(diff), 'day');
}

/** ISO (UTC) → value for <input type="datetime-local"> in local time. */
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = parseDate(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

export function todayStr(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

export const ROLE_LABEL = { admin: 'Administrateur', enseignant: 'Enseignant', etudiant: 'Étudiant' };
export const KIND_LABEL = { examen: 'Examen', travail: 'Travail', quiz: 'Quiz', projet: 'Projet', laboratoire: 'Laboratoire', autre: 'Autre' };
export const STATUS_LABEL = { present: 'Présent', absent: 'Absent', retard: 'Retard', motive: 'Absence motivée' };
export const STATUS_COLOR = { present: 'green', absent: 'red', retard: 'orange', motive: 'blue' };
export const DAYS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export const fullName = (u) => `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim();
export const courseLabel = (c) => `${c.code}${c.group_name ? '-' + c.group_name : ''}`;

export function pct(v) {
  return v === null || v === undefined ? '—' : `${Number(v).toLocaleString('fr-CA', { maximumFractionDigits: 1 })} %`;
}

export function gradeBadge(average) {
  if (average === null || average === undefined) return html`<span class="badge">—</span>`;
  const color = average >= 80 ? 'green' : average >= 60 ? 'blue' : 'red';
  return html`<span class="badge ${color}">${pct(average)}</span>`;
}

export function ring(value, label = '') {
  const has = value !== null && value !== undefined;
  const v = has ? Math.max(0, Math.min(100, value)) : 0;
  const c = !has ? 'var(--border-strong)' : v >= 80 ? 'var(--success)' : v >= 60 ? 'var(--accent)' : 'var(--danger)';
  return html`<div class="ring" style="--p:${v};--c:${c}" title="${label}"><span>${has ? Math.round(v) + '%' : '—'}</span></div>`;
}

export function emptyState(text, iconName = 'inbox') {
  return html`<div class="empty">${icon(iconName)}<span>${text}</span></div>`;
}

export function stat(label, value, iconName, tone = '', href = '') {
  const inner = html`<div class="bubble">${icon(iconName)}</div><div><div class="value">${value}</div><div class="label">${label}</div></div>`;
  return href ? html`<a class="stat tone-${tone}" href="${href}">${inner}</a>` : html`<div class="stat tone-${tone}">${inner}</div>`;
}

/** <label class="switch"> toggle with a title and description. */
export function toggle(name, checked, title, description = '') {
  return html`<label class="switch"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}>
    <span><strong>${title}</strong>${description ? html`<span class="d">${description}</span>` : ''}</span></label>`;
}

/** Segmented radio control: options = [[value, label, iconName?]] */
export function segmented(name, value, options) {
  return html`<div class="segmented" role="radiogroup">${options.map(
    ([v, label, ic]) => html`<label><input type="radio" name="${name}" value="${v}" ${String(v) === String(value) ? 'checked' : ''}><span>${ic ? icon(ic) : ''}${label}</span></label>`,
  )}</div>`;
}

// ---------- Modale et notifications ----------

export function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = fmtVal(html`${icon(type === 'error' ? 'alert' : 'checkCircle')}<span>${message}</span>`);
  $('#toast-root').append(el);
  setTimeout(() => el.remove(), type === 'error' ? 6000 : 3500);
}

export const toastError = (err) => toast(err.message || String(err), 'error');

/**
 * Opens a modal. `body` is html``; `onSubmit(form)` (optional) turns the body into a form —
 * return false to keep the modal open. Returns { el, close }.
 */
export function modal({ title, body, submitLabel, onSubmit, size = '', footer = true, headExtra = '', top = false }) {
  const root = $('#modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = `modal-backdrop ${top ? 'top' : ''}`;
  const inner = html`
    <div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${title || 'Fenêtre'}">
      ${title
        ? html`<div class="modal-head">
            <h2>${title}</h2>
            <div class="actions">${headExtra}<button type="button" class="small ghost" data-close aria-label="Fermer">${icon('x')}</button></div>
          </div>`
        : ''}
      ${onSubmit
        ? html`<form novalidate>
            <div class="modal-body">${body}</div>
            <div class="modal-foot">
              <button type="button" class="ghost" data-close>Annuler</button>
              <button type="submit" class="primary">${submitLabel || 'Enregistrer'}</button>
            </div>
          </form>`
        : html`<div class="modal-body">${body}</div>
          ${footer && size !== 'viewer' && title ? html`<div class="modal-foot"><button type="button" data-close>Fermer</button></div>` : ''}`}
    </div>`;
  render(backdrop, inner);
  root.append(backdrop);

  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('mousedown', (e) => e.target === backdrop && close());
  on(backdrop, 'click', '[data-close]', close);

  const form = $('form', backdrop);
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type="submit"]', form);
      btn.disabled = true;
      try {
        const keep = await onSubmit(form);
        if (keep !== false) close();
      } catch (err) {
        toastError(err);
      } finally {
        btn.disabled = false;
      }
    });
    setTimeout(() => $('input:not([type=radio]):not([type=checkbox]), select, textarea', form)?.focus(), 30);
  }
  return { el: backdrop, close };
}

export function confirmDialog(message, { danger = true, label = 'Confirmer' } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const m = modal({
      title: 'Confirmation',
      body: html`<p>${message}</p>`,
      submitLabel: label,
      onSubmit: () => {
        answered = true;
        resolve(true);
      },
    });
    if (danger) $('button[type="submit"]', m.el).classList.add('danger');
    const observer = new MutationObserver(() => {
      if (!m.el.isConnected) {
        observer.disconnect();
        if (!answered) resolve(false);
      }
    });
    observer.observe($('#modal-root'), { childList: true });
  });
}

/** In-browser viewer for PDFs and images; other types are downloaded. */
export function openViewer(title, url, mime, downloadUrl) {
  const viewable = mime === 'application/pdf' || mime?.startsWith('image/') || mime === 'text/plain';
  if (!viewable) {
    if (downloadUrl) window.location.href = downloadUrl;
    else toast('Ce type de fichier ne peut pas être affiché dans le navigateur.', 'error');
    return;
  }
  modal({
    title,
    size: 'viewer',
    headExtra: downloadUrl
      ? html`<a class="btn small" href="${downloadUrl}">${icon('download')}Télécharger</a>`
      : html`<span class="badge orange">${icon('lock')}Consultation seulement</span>`,
    body: mime.startsWith('image/') ? html`<img src="${url}" alt="${title}">` : html`<iframe src="${url}" title="${title}"></iframe>`,
  });
}

export function skeleton(rows = 3) {
  return html`<div class="grid">${Array.from({ length: rows }, () => html`<div class="skeleton" style="height:84px"></div>`)}</div>`;
}
