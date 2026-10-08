import crypto from 'node:crypto';
import { one, run } from './db.js';
import { fail, isHttps, parseCookies } from './http.js';

const SESSION_DAYS = 7;
const COOKIE = 'sid';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    fail(400, 'Le mot de passe doit contenir au moins 8 caractères.');
  }
  if (password.length > 200) fail(400, 'Le mot de passe est trop long.');
  return password;
}

const tokenHash = (token) => crypto.createHash('sha256').update(token).digest('hex');

export async function createSession(res, req, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', tokenHash(token), userId, expires.toISOString());
  setCookie(res, req, token, SESSION_DAYS * 86400);
}

export async function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) await run('DELETE FROM sessions WHERE token = ?', tokenHash(token));
  setCookie(res, req, '', 0);
}

export function destroyUserSessions(userId) {
  return run('DELETE FROM sessions WHERE user_id = ?', userId);
}

function setCookie(res, req, value, maxAge) {
  const parts = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAge}`];
  if (isHttps(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export async function userFromRequest(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const user = await one(
    `SELECT u.id, u.email, u.role, u.first_name, u.last_name, u.student_number, u.program, u.phone, u.active, u.preferences
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > ?`,
    tokenHash(token),
    new Date().toISOString(),
  );
  if (!user || !user.active) return null;
  let preferences = {};
  try {
    preferences = JSON.parse(user.preferences || '{}');
  } catch {
    /* ignore */
  }
  return { ...user, preferences };
}

export function purgeExpiredSessions() {
  return run('DELETE FROM sessions WHERE expires_at <= ?', new Date().toISOString());
}

// --- Brute-force protection on login (in memory, per IP + email) -------------

const attempts = new Map();
const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;

export function checkLoginRate(key) {
  const entry = attempts.get(key);
  if (entry && entry.until > Date.now() && entry.count >= MAX_FAILURES) {
    fail(429, 'Trop de tentatives. Réessayez dans quelques minutes.');
  }
}

export function recordLoginFailure(key) {
  const entry = attempts.get(key);
  if (!entry || entry.until < Date.now()) attempts.set(key, { count: 1, until: Date.now() + WINDOW_MS });
  else entry.count += 1;
}

export function clearLoginFailures(key) {
  attempts.delete(key);
}
