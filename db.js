const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'utp.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
-- Table des centres
CREATE TABLE IF NOT EXISTS centres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Table des responsables (Admin, Direction, Responsables)
CREATE TABLE IF NOT EXISTS responsables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  code_acces TEXT NOT NULL UNIQUE,
  centre_id INTEGER REFERENCES centres(id) ON DELETE SET NULL, -- Ancien système (gardé pour compatibilité)
  created_at TEXT DEFAULT (datetime('now'))
);

-- Table de liaison : Un responsable peut gérer PLUSIEURS centres
CREATE TABLE IF NOT EXISTS responsable_centres (
  responsable_id INTEGER NOT NULL REFERENCES responsables(id) ON DELETE CASCADE,
  centre_id INTEGER NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  PRIMARY KEY (responsable_id, centre_id)
);

-- Table des étudiants
CREATE TABLE IF NOT EXISTS etudiants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  utp_id TEXT NOT NULL UNIQUE,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL DEFAULT '',
  telephone TEXT,
  matiere TEXT NOT NULL,
  niveau TEXT NOT NULL,
  centre_id INTEGER NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  responsable_id INTEGER REFERENCES responsables(id) ON DELETE SET NULL,
  date_entree TEXT NOT NULL,
  montant_paye INTEGER NOT NULL DEFAULT 0,
  badge_genere INTEGER NOT NULL DEFAULT 0,
  statut TEXT NOT NULL DEFAULT 'actif', -- actif, archive, repêchage, diplome
  created_at TEXT DEFAULT (datetime('now'))
);

-- Table des paiements (avec mode et référence)
CREATE TABLE IF NOT EXISTS paiements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  etudiant_id INTEGER NOT NULL REFERENCES etudiants(id) ON DELETE CASCADE,
  montant INTEGER NOT NULL,
  tranche TEXT NOT NULL DEFAULT 'total', -- total, tranche1, tranche2
  ticket_ref TEXT NOT NULL,
  mode_paiement TEXT NOT NULL DEFAULT 'Espèce', -- Espèce, Mobile Money, Virement, Chèque
  reference TEXT, -- N° transaction Mobile Money ou Chèque
  date_paiement TEXT DEFAULT (datetime('now')),
  valide_direction INTEGER NOT NULL DEFAULT 0
);

-- Table des dépenses
CREATE TABLE IF NOT EXISTS depenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  centre_id INTEGER NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  libelle TEXT NOT NULL,
  montant INTEGER NOT NULL,
  date_depense TEXT DEFAULT (datetime('now'))
);

-- Table des notes (avec type d'examen)
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  etudiant_id INTEGER NOT NULL REFERENCES etudiants(id) ON DELETE CASCADE,
  matiere TEXT NOT NULL,
  type_examen TEXT NOT NULL DEFAULT 'normal', -- normal, reprise
  detail_json TEXT NOT NULL,
  total INTEGER NOT NULL,
  appreciation TEXT NOT NULL,
  date_examen TEXT DEFAULT (datetime('now')),
  passe_niveau INTEGER NOT NULL DEFAULT 0,
  doit_repechage INTEGER NOT NULL DEFAULT 0
);

-- Table des paramètres (durées, montants, etc.)
CREATE TABLE IF NOT EXISTS parametres (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
);
`);

// Initialisation des paramètres par défaut s'ils n'existent pas
const insertParam = db.prepare(`INSERT OR IGNORE INTO parametres (cle, valeur) VALUES (?, ?)`);
insertParam.run('duree_anglais_francais_jours', '70');
insertParam.run('duree_allemand_chinois_jours', '100');
insertParam.run('montant_badge_min', '20000');
insertParam.run('frais_direction_par_etudiant', '20000');
insertParam.run('montant_total_formation', '50000'); // Pour le calcul du reste à payer sur le badge

module.exports = db;
