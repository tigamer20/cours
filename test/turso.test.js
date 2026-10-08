// Suite complète contre le pilote Turso (HTTP), avec un faux serveur Turso local.
import { defineSuite } from './suite.js';
import { startFakeTurso } from './fake-turso.js';

let fake;
defineSuite(
  'turso',
  async () => {
    fake = await startFakeTurso();
    return { DATABASE_URL: fake.url, DATABASE_TOKEN: fake.token };
  },
  () => fake?.close(),
);
