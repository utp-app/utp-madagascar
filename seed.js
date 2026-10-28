// seed.js
const db = require('./db');

function seed() {
  const nbCentres = db.prepare('SELECT COUNT(*) as c FROM centres').get().c;
  if (nbCentres > 0) {
    console.log('Données déjà présentes, seed ignoré.');
    return;
  }

  const insertCentre = db.prepare('INSERT INTO centres (nom) VALUES (?)');
  const c1 = insertCentre.run('Centre A').lastInsertRowid;
  const c2 = insertCentre.run('Centre B').lastInsertRowid;

  const insertResp = db.prepare(
    'INSERT INTO responsables (nom, code_acces, centre_id) VALUES (?, ?, ?)'
  );
  insertResp.run('Responsable Centre A', 'RESP-A-2024', c1);
  insertResp.run('Responsable Centre B', 'RESP-B-2024', c2);

  // Compte Direction (centre_id NULL) et Admin
  insertResp.run('Direction Générale', 'DIR-2024', null);
  insertResp.run('Administrateur', 'ADMIN-2024', null);

  console.log('Seed terminé. Codes : RESP-A-2024, RESP-B-2024, DIR-2024, ADMIN-2024');
}

seed();