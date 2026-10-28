const db = require('./db');

// On vérifie si l'admin existe déjà. Si oui, on ne fait rien (pour ne pas effacer les données).
const admin = db.prepare("SELECT * FROM responsables WHERE code_acces = 'ADMIN2030'").get();

if (!admin) {
  console.log("⏳ Création des données de base (Admin, Direction, Centres)...");

  // 1. Créer l'Admin et la Direction
  db.prepare('INSERT INTO responsables (nom, code_acces) VALUES (?, ?)').run('Admin UTP', 'ADMIN2030');
  db.prepare('INSERT INTO responsables (nom, code_acces) VALUES (?, ?)').run('Coordo', 'COORDO0009');

  // 2. Créer vos centres et leurs responsables (d'après votre Google Sheet)
  const centres = [
    { id: 1, nom: 'UTP Mahitsy', resp: 'SARO0001' },
    { id: 2, nom: 'UTP Analakely', resp: 'INBE0002' },
    { id: 3, nom: 'UTP Androndra', resp: 'INBE0002' },
    { id: 4, nom: 'UTP Fenoarivo', resp: 'INNA0003' },
    { id: 5, nom: 'UTP Ampitatakafika', resp: 'INNA0003' },
    { id: 6, nom: 'UTP Alasora', resp: 'INNA0003' },
    { id: 7, nom: 'UTP Ankadikely', resp: 'INLO0004' },
    { id: 8, nom: 'UTP Sabotsy Namehana CEG', resp: 'INLO0004' },
    { id: 9, nom: 'UTP Sabotsy Namehana', resp: 'INLO0004' },
    { id: 10, nom: 'UTP Ankadindramamy', resp: 'TANT0005' },
    { id: 11, nom: 'Intello & UTP Ampefiloha', resp: 'SAND0006' },
    { id: 12, nom: 'Intello & UTP Tsaralalana', resp: 'SAND0006' },
    { id: 13, nom: 'UTP Ampasanpito', resp: 'ZOEL0007' },
    { id: 14, nom: 'UTP Anosizato Ouest', resp: 'RADO0008' },
    { id: 15, nom: 'UTP Ambatomaro', resp: 'RADO0008' },
    { id: 16, nom: 'CLUB LNTC', resp: 'TANT0005' },
    { id: 17, nom: 'UTP Iaosy', resp: 'INNA0003' },
    { id: 18, nom: 'UTP Ampefiloha', resp: 'ZOEL0007' }
  ];

  // Création des centres et des responsables
  for (let c of centres) {
    db.prepare('INSERT INTO centres (id, nom) VALUES (?, ?)').run(c.id, c.nom);
    // On crée un compte pour le responsable s'il n'existe pas déjà
    const exist = db.prepare('SELECT * FROM responsables WHERE code_acces = ?').get(c.resp);
    if (!exist) {
       db.prepare('INSERT INTO responsables (nom, code_acces, centre_id) VALUES (?, ?, ?)').run('Responsable ' + c.nom, c.resp, c.id);
    }
  }

  console.log("✅ Base de données initialisée avec tous les centres !");
} else {
  console.log("✅ Base de données déjà prête.");
}
