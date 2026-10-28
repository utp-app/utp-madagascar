const db = require('./db');

// ⚠️ REMPLACEZ CE TABLEAU PAR VOS VRAIES DONNÉES
const elevesAImporter = [
  // Exemple avec les données de votre capture :
  // [ID, Nom, Prénom, Centre (ID), Matière, Niveau, Montant, Date d'entrée]
  ['UTP-3006', 'RAKOTOARIZAKA', 'SANDY HERINIAINA', 14, 'Anglais', 'Level 2', 80000, '2018-03-28'],
  ['UTP-3007', 'RAKOTONIRINA', 'SANTATRINIA JEAN CLAUDE', 14, 'Anglais', 'Level 2', 80000, '2018-03-28'],
  ['UTP-3008', 'RAHASINOMENTSY', 'SANTATRINIA ANTSA', 14, 'Anglais', 'Level 1', 60000, '2018-03-28'],
  ['UTP-3009', 'RAHERIMANANA', 'MAHATIANA COLOMBE', 14, 'Anglais', 'Level 1', 80000, '2018-03-28'],
  // ... Ajoutez les autres lignes ici de la même façon ...
];

const insertEtudiant = db.prepare(`
  INSERT OR IGNORE INTO etudiants 
  (utp_id, nom, prenom, centre_id, matiere, niveau, montant_paye, date_entree, statut, badge_genere) 
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'actif', ?)
`);

let compteur = 0;
for (let e of elevesAImporter) {
  // On attribue le badge si l'élève a payé plus de 20 000 Ar
  const badge = e[6] >= 20000 ? 1 : 0;
  
  try {
    insertEtudiant.run(e[0], e[1], e[2], e[3], e[4], e[5], e[6], e[7], badge);
    compteur++;
  } catch (err) {
    console.log("Erreur sur l'élève " + e[1] + " : " + err.message);
  }
}

console.log(`✅ ${compteur} élèves importés avec succès !`);
