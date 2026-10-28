// importer.js
const db = require('./db');

console.log("⏳ Début de l'importation des données réelles...");

// 1. Nettoyage des tables (pour éviter les doublons)
db.exec("DELETE FROM responsables; DELETE FROM centres; DELETE FROM etudiants;");

// 2. Insertion de la Direction et de l'Admin (d'après votre capture)
const insertResp = db.prepare('INSERT INTO responsables (id, nom, code_acces, centre_id) VALUES (?, ?, ?, ?)');
insertResp.run(1, 'Admin UTP', 'ADMIN2030', null);
insertResp.run(10, 'Coordo', 'COORDO0009', null); // Le rôle direction

// 3. Insertion des vrais Responsables
const responsablesData = [
  { id: 2, nom: 'Sarobidy', code: 'SARO0001' },
  { id: 3, nom: 'Inbert', code: 'INBE0002' },
  { id: 4, nom: 'Innava', code: 'INNA0003' },
  { id: 5, nom: 'Inlov', code: 'INLO0004' },
  { id: 6, nom: 'Tanteraka', code: 'TANT0005' },
  { id: 7, nom: 'Sandra', code: 'SAND0006' },
  { id: 8, nom: 'Zoelina', code: 'ZOEL0007' },
  { id: 9, nom: 'Rado', code: 'RADO0008' }
];

// 4. Insertion des Centres
const insertCentre = db.prepare('INSERT INTO centres (id, nom) VALUES (?, ?)');
const centresData = [
  { id: 1, nom: 'UTP Mahitsy', respId: 2 },
  { id: 2, nom: 'UTP Analakely', respId: 3 },
  { id: 3, nom: 'UTP Androndra', respId: 3 },
  { id: 4, nom: 'UTP Fenoarivo', respId: 4 },
  { id: 5, nom: 'UTP Ampitatakafika', respId: 4 },
  { id: 6, nom: 'UTP Alasora', respId: 4 },
  { id: 7, nom: 'UTP Ankadikely', respId: 5 },
  { id: 8, nom: 'UTP Sabotsy Namehana CEG', respId: 5 },
  { id: 9, nom: 'UTP Sabotsy Namehana', respId: 5 },
  { id: 10, nom: 'UTP Ankadindramamy', respId: 6 },
  { id: 11, nom: 'Intello & UTP Ampefiloha', respId: 7 },
  { id: 12, nom: 'Intello & UTP Tsaralalana', respId: 7 },
  { id: 13, nom: 'UTP Ampasanpito', respId: 8 },
  { id: 14, nom: 'UTP Anosizato Ouest', respId: 9 },
  { id: 15, nom: 'UTP Ambatomaro', respId: 9 },
  { id: 16, nom: 'CLUB LNTC', respId: 6 },
  { id: 17, nom: 'UTP Iaosy', respId: 4 },
  { id: 18, nom: 'UTP Ampefiloha', respId: 8 }
];

for (let c of centresData) {
  insertCentre.run(c.id, c.nom);
  // Mise à jour du responsable avec son centre
  db.prepare('UPDATE responsables SET centre_id = ? WHERE id = ?').run(c.id, c.respId);
}

// 5. Insertion des responsables
for (let r of responsablesData) {
  insertResp.run(r.id, r.nom, r.code, null);
}

console.log("✅ Importation terminée avec succès !");
console.log("➡️ Responsables et Centres configurés.");
console.log("➡️ Vous pouvez maintenant démarrer le serveur avec 'npm start'.");