const db = require('./db');

const admin = db.prepare("SELECT * FROM responsables WHERE code_acces = 'ADMIN2030'").get();

if (!admin) {
  console.log("⏳ Création des données de base...");

  // 1. Admin et Direction
  db.prepare('INSERT INTO responsables (nom, code_acces) VALUES (?, ?)').run('Admin UTP', 'ADMIN2030');
  db.prepare('INSERT INTO responsables (nom, code_acces) VALUES (?, ?)').run('Coordo', 'COORDO0009');

  // 2. Création des centres
  const centres = [
    { id: 1, nom: 'UTP Mahitsy' }, { id: 2, nom: 'UTP Analakely' }, { id: 3, nom: 'UTP Androndra' },
    { id: 4, nom: 'UTP Fenoarivo' }, { id: 5, nom: 'UTP Ampitatakafika' }, { id: 6, nom: 'UTP Alasora' },
    { id: 7, nom: 'UTP Ankadikely' }, { id: 8, nom: 'UTP Sabotsy Namehana CEG' }, { id: 9, nom: 'UTP Sabotsy Namehana' },
    { id: 10, nom: 'UTP Ankadindramamy' }, { id: 11, nom: 'Intello & UTP Ampefiloha' }, { id: 12, nom: 'Intello & UTP Tsaralalana' },
    { id: 13, nom: 'UTP Ampasanpito' }, { id: 14, nom: 'UTP Anosizato Ouest' }, { id: 15, nom: 'UTP Ambatomaro' },
    { id: 16, nom: 'CLUB LNTC' }, { id: 17, nom: 'UTP Iaosy' }, { id: 18, nom: 'UTP Ampefiloha' }
  ];

  for (let c of centres) {
    db.prepare('INSERT INTO centres (id, nom) VALUES (?, ?)').run(c.id, c.nom);
  }

  // 3. Création des responsables
  const responsables = [
    { nom: 'Sarobidy', code: 'SARO0001' },
    { nom: 'Inbert', code: 'INBE0002' },
    { nom: 'Innava', code: 'INNA0003' },
    { nom: 'Inlov', code: 'INLO0004' },
    { nom: 'Tanteraka', code: 'TANT0005' },
    { nom: 'Sandra', code: 'SAND0006' },
    { nom: 'Zoelina', code: 'ZOEL0007' },
    { nom: 'Rado', code: 'RADO0008' }
  ];

  for (let r of responsables) {
    db.prepare('INSERT INTO responsables (nom, code_acces) VALUES (?, ?)').run(r.nom, r.code);
  }

  // 4. LIAISON (Responsable <-> Centres)
  // Inbert gère Analakely (2) et Androndra (3)
  const inbert = db.prepare("SELECT id FROM responsables WHERE code_acces = 'INBE0002'").get();
  db.prepare('INSERT INTO responsable_centres (responsable_id, centre_id) VALUES (?, ?)').run(inbert.id, 2);
  db.prepare('INSERT INTO responsable_centres (responsable_id, centre_id) VALUES (?, ?)').run(inbert.id, 3);

  // Innava gère Fenoarivo (4), Ampitatakafika (5), Alasora (6), Iaosy (17)
  const innava = db.prepare("SELECT id FROM responsables WHERE code_acces = 'INNA0003'").get();
  [4, 5, 6, 17].forEach(cId => db.prepare('INSERT INTO responsable_centres (responsable_id, centre_id) VALUES (?, ?)').run(innava.id, cId));

  // Inlov gère Ankadikely (7), Sabotsy CEG (8), Sabotsy (9)
  const inlov = db.prepare("SELECT id FROM responsables WHERE code_acces = 'INLO0004'").get();
  [7, 8, 9].forEach(cId => db.prepare('INSERT INTO responsable_centres (responsable_id, centre_id) VALUES (?, ?)').run(inlov.id, cId));

  // Tanteraka gère Ankadindramamy (10), CLUB LNTC (16)
  const tanteraka = db.prepare("SELECT id FROM responsables WHERE code_acces = 'TANT0005'").get();
  [10, 16].forEach(cId => db.prepare('INSERT INTO responsable_centres (responsable_id, centre_id) VALUES (?, ?)').run(tanteraka.id, cId));

  // Sandra gère Intello Ampefiloha (11), Intello Tsaralalana (12)
  const sandra = db.prepare("SELECT id FROM responsables WHERE code_acces = 'SAND0006'").get();
  [11, 12].forEach(cId => db.prepare('INSERT INTO responsable_centres (responsable_id, centre_id) VALUES (?, ?)').run(sandra.id, cId));

  // Zoelina gère Ampasanpito (13), Ampefiloha (18)
  const zoelina = db.prepare("SELECT id FROM responsables WHERE code_acces = 'ZOEL0007'").get();
  [13, 18].forEach(cId => db.prepare('INSERT INTO responsable_centres (responsable_id, centre_id) VALUES (?, ?)').run(zoelina.id, cId));

  // Rado gère Anosizato Ouest (14), Ambatomaro (15)
  const rado = db.prepare("SELECT id FROM responsables WHERE code_acces = 'RADO0008'").get();
  [14, 15].forEach(cId => db.prepare('INSERT INTO responsable_centres (responsable_id, centre_id) VALUES (?, ?)').run(rado.id, cId));

  // Sarobidy gère Mahitsy (1)
  const sarobidy = db.prepare("SELECT id FROM responsables WHERE code_acces = 'SARO0001'").get();
  db.prepare('INSERT INTO responsable_centres (responsable_id, centre_id) VALUES (?, ?)').run(sarobidy.id, 1);

  console.log("✅ Base de données initialisée avec les responsables multi-centres !");
} else {
  console.log("✅ Base de données déjà prête.");
}
