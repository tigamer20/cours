import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR, one, run } from './db.js';
import { fail, readBody } from './http.js';

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 25) * 1024 * 1024;

const EXT_MIME = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

// Only these are ever served inline; everything else is forced to download so
// an uploaded HTML/SVG file can never run script in the site's origin.
const INLINE_SAFE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain']);

function mimeFor(name) {
  const ext = path.extname(name).slice(1).toLowerCase();
  return EXT_MIME[ext] || 'application/octet-stream';
}

function cleanName(name) {
  const base = path.basename(String(name || 'fichier')).replace(/[\x00-\x1f"\\/<>:|?*]/g, '_').trim();
  return base.slice(0, 180) || 'fichier';
}

/**
 * Upload protocol: the request body is the raw file bytes and the original
 * file name is sent URL-encoded in the X-File-Name header.
 */
export async function saveUpload(req, userId) {
  const header = req.headers['x-file-name'];
  if (!header) fail(400, 'Aucun fichier reçu.');
  const originalName = cleanName(decodeURIComponent(header));
  const data = await readBody(req, MAX_UPLOAD_BYTES);
  if (data.length === 0) fail(400, 'Le fichier est vide.');
  const storedName = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(path.join(UPLOAD_DIR, storedName), data);
  const { lastInsertRowid } = run(
    'INSERT INTO files (original_name, stored_name, mime, size, uploaded_by) VALUES (?, ?, ?, ?, ?)',
    originalName,
    storedName,
    mimeFor(originalName),
    data.length,
    userId,
  );
  return Number(lastInsertRowid);
}

export function sendFile(res, fileId, { inline = false } = {}) {
  const file = one('SELECT * FROM files WHERE id = ?', fileId);
  if (!file) fail(404, 'Fichier introuvable.');
  const full = path.join(UPLOAD_DIR, file.stored_name);
  if (!fs.existsSync(full)) fail(404, 'Le fichier n’existe plus sur le serveur.');
  const asInline = inline && INLINE_SAFE.has(file.mime);
  const encoded = encodeURIComponent(file.original_name);
  const headers = {
    'Content-Type': file.mime,
    'Content-Length': file.size,
    'Content-Disposition': `${asInline ? 'inline' : 'attachment'}; filename*=UTF-8''${encoded}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  };
  // Browsers refuse to render PDFs under a sandbox CSP, so it is only applied to other types.
  if (file.mime !== 'application/pdf') {
    headers['Content-Security-Policy'] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox";
  }
  res.writeHead(200, headers);
  fs.createReadStream(full).pipe(res);
}
