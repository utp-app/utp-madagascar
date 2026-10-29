const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'utp.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS centres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS responsables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  code_acces TEXT NOT NULL UNIQUE,
  telephone TEXT,
  centre_id INTEGER REFERENCES centres(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS responsable_centres (
  responsable_id INTEGER NOT NULL REFERENCES responsables(id) ON DELETE CASCADE,
  centre_id INTEGER NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  PRIMARY KEY (responsable_id, centre_id)
);

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
  statut_examen TEXT DEFAULT 'en_attente',
  date_examen_validee TEXT,
  montant_paye INTEGER NOT NULL DEFAULT 0,
  badge_genere INTEGER NOT NULL DEFAULT 0,
  statut TEXT NOT NULL DEFAULT 'actif',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS paiements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  etudiant_id INTEGER NOT NULL REFERENCES etudiants(id) ON DELETE CASCADE,
  montant INTEGER NOT NULL,
  tranche TEXT NOT NULL DEFAULT 'total',
  ticket_ref TEXT NOT NULL,
  mode_paiement TEXT NOT NULL DEFAULT 'Espèce',
  reference TEXT,
  date_paiement TEXT DEFAULT (datetime('now')),
  valide_direction INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS depenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  centre_id INTEGER NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  libelle TEXT NOT NULL,
  montant INTEGER NOT NULL,
  date_depense TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  etudiant_id INTEGER NOT NULL REFERENCES etudiants(id) ON DELETE CASCADE,
  matiere TEXT NOT NULL,
  type_examen TEXT NOT NULL DEFAULT 'normal',
  detail_json TEXT NOT NULL,
  total INTEGER NOT NULL,
  appreciation TEXT NOT NULL,
  date_examen TEXT DEFAULT (datetime('now')),
  passe_niveau INTEGER NOT NULL DEFAULT 0,
  doit_repechage INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS commandes_livres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  centre_id INTEGER NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  nombre_livres INTEGER NOT NULL,
  montant_total INTEGER NOT NULL,
  details TEXT,
  statut TEXT NOT NULL DEFAULT 'en_attente',
  date_commande TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS parametres (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
);
`);

const insertParam = db.prepare(`INSERT OR IGNORE INTO parametres (cle, valeur) VALUES (?, ?)`);
insertParam.run('duree_anglais_francais_jours', '80');
insertParam.run('duree_allemand_chinois_jours', '110');
insertParam.run('montant_badge_min', '20000');
insertParam.run('frais_direction_par_etudiant', '20000');
insertParam.run('montant_total_formation', '50000');

module.exports = db;
