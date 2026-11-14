const fs = require('fs');
const csv = require('csv-parser');
const db = require('./db'); // Assurez-vous que db.js exporte bien votre base utp.db

// Configuration
const CSV_FILE_PATH = './eleves.csv';
const RESPONSABLE_CODE = 'ADMIN2030'; // Le code du responsable unique (Admin UTP)

function cleanString(str) {
    if (!str) return '';
    return str.replace(/[^\x20-\x7E\xC0-\xFF]/g, '').trim();
}

async function importEleves() {
    console.log("⏳ Début de l'importation des élèves...");

    const responsable = db.prepare("SELECT id FROM responsables WHERE code_acces = ?").get(RESPONSABLE_CODE);
    if (!responsable) {
        console.error(`❌ Responsable ${RESPONSABLE_CODE} introuvable. Avez-vous lancé le script d'initialisation ?`);
        return;
    }
    const responsableId = responsable.id;

    const centresDB = db.prepare("SELECT id, nom FROM centres").all();
    const centreMap = {};
    centresDB.forEach(c => {
        centreMap[c.nom.toLowerCase()] = c.id;
    });

    const elevesToInsert = [];

    if (!fs.existsSync(CSV_FILE_PATH)) {
        console.error(`❌ Fichier ${CSV_FILE_PATH} introuvable.`);
        return;
    }

    fs.createReadStream(CSV_FILE_PATH)
        .pipe(csv({ separator: ';' }))
        .on('data', (row) => {
            const nom = cleanString(row['Nom']);
            const prenom = cleanString(row['Prénom']);
            let centreNom = cleanString(row['Centre']);
            const groupe = cleanString(row['Groupe']);
            const matiere = cleanString(row['Matière']);
            const niveau = cleanString(row['Niveau']);
            const telephone = cleanString(row['Téléphone']);
            const adresse = cleanString(row['Adresse']);

            let centreId = null;
            if (centreNom.toLowerCase().includes('anosizato')) {
                centreId = centreMap['utp anosizato ouest'];
            } else if (centreNom.toLowerCase().includes('ambatomaro')) {
                centreId = centreMap['utp ambatomaro'];
            }

            if (!centreId) return; // Ignore les centres non reconnus

            elevesToInsert.push({
                nom, prenom, centre_id: centreId, responsable_id: responsableId, 
                groupe, matiere, niveau, telephone, adresse
            });
        })
        .on('end', () => {
            console.log(`📄 ${elevesToInsert.length} élèves lus depuis le CSV.`);
            
            try {
                const stmt = db.prepare(`
                    INSERT INTO eleves (nom, prenom, centre_id, responsable_id, groupe, matiere, niveau, telephone, adresse) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                const insertMany = db.transaction((eleves) => {
                    for (const e of eleves) {
                        stmt.run(e.nom, e.prenom, e.centre_id, e.responsable_id, e.groupe, e.matiere, e.niveau, e.telephone, e.adresse);
                    }
                });

                insertMany(elevesToInsert);
                console.log("✅ Importation terminée avec succès !");
            } catch (error) {
                console.error("❌ Erreur insertion :", error);
            }
        });
}

importEleves();