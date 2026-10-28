const db = require('./db');

const admin = db.prepare("SELECT * FROM responsables WHERE code_acces = 'ADMIN2030'").get();

if (!admin) {
  console.log("⏳ Création des données de base...");
  
  // Création Admin et Direction
  db.prepare('INSERT INTO responsables (nom, code_acces) VALUES (?, ?)').run('Admin UTP', 'ADMIN2030');
  db.prepare('INSERT INTO responsables (nom, code_acces) VALUES (?, ?)').run('Coordo', 'COORDO0009');

  // Création du Centre
  db.prepare('INSERT INTO centres (id, nom) VALUES (?, ?)').run(1, 'UTP Mahitsy');
  
  // Création d'un responsable pour ce centre
  db.prepare('INSERT INTO responsables (nom, code_acces, centre_id) VALUES (?, ?, ?)').run('Sarobidy', 'SARO0001', 1);

  console.log("✅ Base de données initialisée !");
} else {
  console.log("✅ Base de données déjà prête.");
}
