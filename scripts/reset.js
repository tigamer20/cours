// Supprime la base de données et les fichiers téléversés locaux (data/). Usage : npm run reset
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.env.DATA_DIR || 'data');
fs.rmSync(dir, { recursive: true, force: true });
console.log(`Supprimé : ${dir}`);
