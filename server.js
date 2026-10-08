import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError, Router, sendJson } from './src/http.js';
import { userFromRequest, purgeExpiredSessions } from './src/auth.js';
import { bootstrap } from './src/seed.js';
import { openDb, isRemoteDb } from './src/db.js';
import { processDocumentNotifications } from './src/routes/coursework.js';
import registerUsers from './src/routes/users.js';
import registerCourses from './src/routes/courses.js';
import registerCoursework from './src/routes/coursework.js';
import registerGeneral from './src/routes/general.js';
import registerReports from './src/routes/reports.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PUBLIC_ROUTES = new Set(['POST /api/login', 'GET /api/health', 'GET /api/settings']);

const router = new Router();
router.get('/api/health', () => ({ ok: true }));
registerUsers(router);
registerCourses(router);
registerCoursework(router);
registerGeneral(router);
registerReports(router);

const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src 'self'; object-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'",
};

function serveStatic(req, res, pathname) {
  let file = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC_DIR, 'index.html');
  const type = STATIC_TYPES[path.extname(file)] || 'application/octet-stream';
  const stat = fs.statSync(file);
  const etag = `"${stat.size}-${stat.mtimeMs}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304).end();
    return;
  }
  // no-cache + ETag: browsers revalidate each time, so a redeploy is picked up immediately.
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache', ETag: etag });
  fs.createReadStream(file).pipe(res);
}

async function handleApi(req, res, url) {
  const match = router.match(req.method, url.pathname);
  if (!match) throw new HttpError(404, 'Route introuvable.');
  if (match.methodNotAllowed) throw new HttpError(405, 'Méthode non permise.');

  // CSRF: browsers cannot send this custom header cross-site without a CORS preflight.
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'fetch') {
    throw new HttpError(403, 'Requête refusée.');
  }

  const user = await userFromRequest(req);
  if (!user && !PUBLIC_ROUTES.has(`${req.method} ${url.pathname}`)) {
    throw new HttpError(401, 'Veuillez vous connecter.');
  }

  const result = await match.handler({
    req,
    res,
    user,
    params: match.params,
    query: Object.fromEntries(url.searchParams),
  });
  if (!res.headersSent) sendJson(res, 200, result ?? { ok: true });
}

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, url.pathname);
    else throw new HttpError(405, 'Méthode non permise.');
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) sendJson(res, status, { error: status === 500 ? 'Erreur interne du serveur.' : err.message });
    else res.destroy();
  }
});

const dbName = await openDb();
console.log(`Base de données : ${dbName}`);
if (!isRemoteDb() && process.env.NODE_ENV === 'production') {
  console.warn('ATTENTION : DATABASE_URL absent. Sur Render (plan gratuit), les données seront PERDUES à chaque redémarrage.');
}
await bootstrap();
await purgeExpiredSessions();
setInterval(() => purgeExpiredSessions().catch(() => {}), 3600_000).unref();
// Scheduled document publications: notify students when the publication date passes.
processDocumentNotifications();
setInterval(processDocumentNotifications, 60_000).unref();

server.listen(PORT, HOST, () => {
  console.log(`Cartable : http://localhost:${PORT}`);
});

// Render sends SIGTERM before stopping the instance: finish in-flight requests, then exit.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
