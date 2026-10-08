// Shared helpers: API calls, safe HTML templating, formatting, modals and toasts.

export const state = { me: null };

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
  if (res.status === 401 && path !== '/api/login') {
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
    else if (el.type === 'file') out[el.name] = el.files[0] || null;
    else out[el.name] = el.value;
  }
  return out;
}

// ---------- Formatting ----------

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
  const diff = Math.round((d - Date.now()) / 86400_000);
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  if (Math.abs(diff) < 1) {
    const hours = Math.round((d - Date.now()) / 3600_000);
    return Math.abs(hours) < 1 ? 'maintenant' : rtf.format(hours, 'hour');
  }
  return rtf.format(diff, 'day');
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

const PALETTE = ['#2f5bd3', '#1f8a4c', '#b4521f', '#7b3fc4', '#0f7f8f', '#b2347a', '#5b6b1f', '#a33a3a'];
export const courseColor = (id) => PALETTE[(Number(id) || 0) % PALETTE.length];

// ---------- Modal & toast ----------

export function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  $('#toast-root').append(el);
  setTimeout(() => el.remove(), type === 'error' ? 6000 : 3500);
}

export const toastError = (err) => toast(err.message || String(err), 'error');

/**
 * Opens a modal. `body` is html``; `onSubmit(form)` (optional) turns the body into a form —
 * return false to keep the modal open. Returns { el, close }.
 */
export function modal({ title, body, submitLabel, onSubmit, size = '', footer = true, headExtra = '' }) {
  const root = $('#modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const inner = html`
    <div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="modal-head">
        <h2>${title}</h2>
        <div class="actions">${headExtra}<button type="button" class="small" data-close aria-label="Fermer">✕</button></div>
      </div>
      ${onSubmit
        ? html`<form novalidate>
            <div class="modal-body">${body}</div>
            <div class="modal-foot">
              <button type="button" data-close>Annuler</button>
              <button type="submit" class="primary">${submitLabel || 'Enregistrer'}</button>
            </div>
          </form>`
        : html`<div class="modal-body">${body}</div>
          ${footer && size !== 'viewer' ? html`<div class="modal-foot"><button type="button" data-close>Fermer</button></div>` : ''}`}
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
    setTimeout(() => $('input, select, textarea', form)?.focus(), 30);
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
    window.location.href = url;
    return;
  }
  modal({
    title,
    size: 'viewer',
    headExtra: downloadUrl ? html`<a class="btn small" href="${downloadUrl}">Télécharger</a>` : '',
    body: mime.startsWith('image/') ? html`<img src="${url}" alt="${title}">` : html`<iframe src="${url}" title="${title}"></iframe>`,
  });
}
