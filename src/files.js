// Les fichiers téléversés sont stockés DANS la base de données (en morceaux), pour qu'ils
// survivent aux redémarrages du plan gratuit de Render. Un cache local évite de les
// retélécharger à chaque consultation; il peut disparaître sans conséquence.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CACHE_DIR, one, all, run, batch } from './db.js';
import { fail, readBody } from './http.js';

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 15) * 1024 * 1024;
const CHUNK_BYTES = 256 * 1024;
const CHUNKS_PER_REQUEST = 8; // ~2 Mo par requête vers la base

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
export const INLINE_SAFE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain']);

function mimeFor(name) {
  const ext = path.extname(name).slice(1).toLowerCase();
  return EXT_MIME[ext] || 'application/octet-stream';
}

function cleanName(name) {
  const base = path.basename(String(name || 'fichier')).replace(/[\x00-\x1f"\\/<>:|?*]/g, '_').trim();
  return base.slice(0, 180) || 'fichier';
}

/** Stores bytes in the database and returns the new file id. */
export async function storeFile(originalName, data, userId) {
  const storedName = crypto.randomBytes(16).toString('hex');
  const chunks = Math.ceil(data.length / CHUNK_BYTES);
  const { lastInsertRowid } = await run(
    'INSERT INTO files (original_name, stored_name, mime, size, chunks, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
    cleanName(originalName),
    storedName,
    mimeFor(originalName),
    data.length,
    chunks,
    userId,
  );
  const fileId = Number(lastInsertRowid);
  try {
    for (let start = 0; start < chunks; start += CHUNKS_PER_REQUEST) {
      const stmts = [];
      for (let i = start; i < Math.min(chunks, start + CHUNKS_PER_REQUEST); i++) {
        stmts.push(['INSERT INTO file_chunks (file_id, idx, data) VALUES (?, ?, ?)', [fileId, i, data.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES)]]);
      }
      await batch(stmts);
    }
  } catch (err) {
    await run('DELETE FROM files WHERE id = ?', fileId).catch(() => {});
    throw err;
  }
  fs.promises.writeFile(path.join(CACHE_DIR, storedName), data).catch(() => {});
  return fileId;
}

/**
 * Upload protocol: the request body is the raw file bytes and the original
 * file name is sent URL-encoded in the X-File-Name header.
 */
export async function saveUpload(req, userId) {
  const header = req.headers['x-file-name'];
  if (!header) fail(400, 'Aucun fichier reçu.');
  const data = await readBody(req, MAX_UPLOAD_BYTES);
  if (data.length === 0) fail(400, 'Le fichier est vide.');
  return storeFile(decodeURIComponent(header), data, userId);
}

export async function getFileMeta(fileId) {
  const file = await one('SELECT id, original_name, stored_name, mime, size, chunks FROM files WHERE id = ?', fileId);
  if (!file) fail(404, 'Fichier introuvable.');
  return file;
}

export async function sendFile(res, fileId, { inline = false } = {}) {
  const file = await getFileMeta(fileId);
  const asInline = inline && INLINE_SAFE.has(file.mime);
  const headers = {
    'Content-Type': file.mime,
    'Content-Length': file.size,
    'Content-Disposition': `${asInline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  };
  // Browsers refuse to render PDFs under a sandbox CSP, so it is only applied to other types.
  if (file.mime !== 'application/pdf') {
    headers['Content-Security-Policy'] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox";
  }

  const cached = path.join(CACHE_DIR, file.stored_name);
  if (fs.existsSync(cached) && fs.statSync(cached).size === file.size) {
    res.writeHead(200, headers);
    fs.createReadStream(cached).pipe(res);
    return;
  }

  // Stream from the database, a few chunks at a time, and fill the cache on the way.
  const parts = [];
  for (let start = 0; start < file.chunks; start += CHUNKS_PER_REQUEST) {
    const rows = await all(
      'SELECT data FROM file_chunks WHERE file_id = ? AND idx >= ? AND idx < ? ORDER BY idx',
      file.id,
      start,
      start + CHUNKS_PER_REQUEST,
    );
    if (start === 0) res.writeHead(200, headers);
    for (const r of rows) {
      const buf = Buffer.from(r.data);
      parts.push(buf);
      res.write(buf);
    }
  }
  if (file.chunks === 0) res.writeHead(200, headers);
  res.end();
  const full = Buffer.concat(parts);
  if (full.length === file.size) fs.promises.writeFile(cached, full).catch(() => {});
}
