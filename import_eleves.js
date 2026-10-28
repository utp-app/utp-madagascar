const db = require('./db');

console.log("⏳ Début de l'importation des élèves depuis Google Sheet...");

// ⚠️ COLLEZ VOS VRAIES DONNÉES ICI (entre les crochets [ ])
// Format : ['ID', 'NOM', 'PRENOM', ID_CENTRE, 'MATIERE', 'NIVEAU', MONTANT, 'DATE_ENTREE']
const elevesAImporter = [
  ['UTP-3006', 'RAKOTOARIZAKA', 'SANDY HERINIAINA', 14, 'Anglais', 'L2', 80000, '2018-03-28'],
  ['UTP-3007', 'RAKOTONIRINA', 'SANTATRINIA JEAN CLAUDE', 14, 'Anglais', 'L2', 80000, '2018-03-28'],
  ['UTP-3008', 'RAHASINOMENTSY', 'SANTATRINIA ANTSA', 14, 'Anglais', 'L1', 60000, '2018-03-28'],
  // Ajoutez les autres lignes ici...
];

try {
  const insertEtudiant = db.prepare(`
    INSERT OR IGNORE INTO etudiants 
    (utp_id, nom, prenom, centre_id, matiere, niveau, montant_paye, date_entree, statut, badge_genere) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'actif', ?)
  `);

  let compteur = 0;
  for (let e of elevesAImporter) {
    const badge = e[6] >= 20000 ? 1 : 0;
    try {
      insertEtudiant.run(e[0], e[1], e[2], e[3], e[4], e[5], e[6], e[7], badge);
      compteur++;
    } catch (err) {
      console.log(`⚠️ Erreur sur l'élève ${e[1]} : ${err.message}`);
    }
  }
  console.log(`✅ ${compteur} élèves importés avec succès !`);
} catch (globalError) {
  console.error("❌ Erreur critique dans le script d'importation :", globalError.message);
}
