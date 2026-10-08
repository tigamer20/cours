export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function fail(status, message) {
  throw new HttpError(status, message);
}

export function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit) return reject(new HttpError(413, 'Fichier ou requête trop volumineux.'));
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'Fichier ou requête trop volumineux.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function readJson(req) {
  const buf = await readBody(req, 1024 * 1024);
  if (buf.length === 0) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    fail(400, 'JSON invalide.');
  }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? fwd.split(',')[0] : req.socket.remoteAddress || '').trim();
}

export function isHttps(req) {
  return req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
}

/** Minimal router: patterns like '/api/courses/:id' — params are matched as integers or slugs. */
export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    const keys = [];
    const regex = new RegExp(
      '^' +
        pattern.replace(/:(\w+)/g, (_, key) => {
          keys.push(key);
          return '([^/]+)';
        }) +
        '$',
    );
    this.routes.push({ method, regex, keys, handler });
  }

  get(p, h) { this.add('GET', p, h); }
  post(p, h) { this.add('POST', p, h); }
  put(p, h) { this.add('PUT', p, h); }
  patch(p, h) { this.add('PATCH', p, h); }
  delete(p, h) { this.add('DELETE', p, h); }

  match(method, pathname) {
    let pathMatched = false;
    for (const route of this.routes) {
      const m = route.regex.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (route.method !== method) continue;
      const params = {};
      route.keys.forEach((k, i) => {
        const raw = decodeURIComponent(m[i + 1]);
        params[k] = /^\d+$/.test(raw) ? Number(raw) : raw;
      });
      return { handler: route.handler, params };
    }
    return pathMatched ? { methodNotAllowed: true } : null;
  }
}

// --- Input validation helpers -------------------------------------------------

export function str(value, field, { required = true, max = 5000 } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(400, `Le champ « ${field} » est requis.`);
    return '';
  }
  if (typeof value !== 'string') fail(400, `Le champ « ${field} » est invalide.`);
  const v = value.trim();
  if (required && !v) fail(400, `Le champ « ${field} » est requis.`);
  if (v.length > max) fail(400, `Le champ « ${field} » est trop long.`);
  return v;
}

export function num(value, field, { required = true, min = -Infinity, max = Infinity } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(400, `Le champ « ${field} » est requis.`);
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) fail(400, `Le champ « ${field} » est invalide.`);
  return n;
}

export function oneOf(value, field, options) {
  if (!options.includes(value)) fail(400, `Le champ « ${field} » est invalide.`);
  return value;
}

/** Date-time sent by the browser as ISO 8601 (UTC). Stored normalized, e.g. 2026-10-08T14:30:00.000Z. */
export function date(value, field, { required = true } = {}) {
  if (!value) {
    if (required) fail(400, `Le champ « ${field} » est requis.`);
    return null;
  }
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) fail(400, `Le champ « ${field} » doit être une date valide.`);
  return d.toISOString();
}

/** SQLite datetime('now') values are UTC without a zone marker. */
export function sqlTimeToDate(value) {
  return new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
}

export function time(value, field) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    fail(400, `Le champ « ${field} » doit être une heure (HH:MM).`);
  }
  return value;
}
