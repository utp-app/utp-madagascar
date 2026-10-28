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
  centre_id INTEGER REFERENCES centres(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now'))
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
  type_examen TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  total INTEGER NOT NULL,
  appreciation TEXT NOT NULL,
  date_examen TEXT DEFAULT (datetime('now')),
  passe_niveau INTEGER NOT NULL DEFAULT 0,
  doit_repechage INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS parametres (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL
);
`);

const insertParam = db.prepare(`INSERT OR IGNORE INTO parametres (cle, valeur) VALUES (?, ?)`);
insertParam.run('duree_anglais_francais_jours', '70');
insertParam.run('duree_allemand_chinois_jours', '100');
insertParam.run('montant_badge_min', '20000');
insertParam.run('frais_direction_par_etudiant', '20000');
const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); 

const MATIERES_NIVEAUX = {
  Anglais: ['L1', 'L2', 'L3', 'L4'],
  Français: ['L1', 'L2', 'L3', 'L4'],
  Allemand: ['A1', 'A2', 'B1', 'B2'],
  Chinois: ['HSK 1', 'HSK 2', 'HSK 3', 'HSK 4']
};

// Fonction de génération d'ID : regarde le plus grand numéro existant (même les archivés)
function genUtpId() {
  const row = db.prepare(`SELECT MAX(CAST(SUBSTR(utp_id, 5) AS INTEGER)) AS m FROM etudiants WHERE utp_id LIKE 'UTP-%'`).get();
  const next = row && row.m ? row.m + 1 : 3000;
  return 'UTP-' + next;
}

function authRole(req, res, next) {
  const code = req.headers['x-code-acces'] || req.query.code;
  if (!code) return res.status(401).json({ error: 'Code d\'accès manquant' });
  const resp = db.prepare('SELECT * FROM responsables WHERE code_acces = ?').get(code);
  if (!resp) return res.status(403).json({ error: 'Code invalide' });

  let role = 'responsable';
  if (code === 'ADMIN2030') role = 'admin';
  else if (code === 'COORDO0009') role = 'direction';

  req.utilisateur = { ...resp, role };
  next();
}

app.post('/api/login', (req, res) => {
  const { code } = req.body;
  const resp = db.prepare('SELECT * FROM responsables WHERE code_acces = ?').get(code);
  if (!resp) return res.status(401).json({ error: 'Code invalide' });

  let role = 'responsable';
  if (code === 'ADMIN2030') role = 'admin';
  else if (code === 'COORDO0009') role = 'direction';

  const centre = resp.centre_id ? db.prepare('SELECT * FROM centres WHERE id = ?').get(resp.centre_id) : null;
  res.json({ utilisateur: { ...resp, role }, centre });
});

app.get('/api/matieres', (req, res) => res.json(MATIERES_NIVEAUX));
app.get('/api/centres', authRole, (req, res) => res.json(db.prepare('SELECT * FROM centres ORDER BY id').all()));

app.get('/api/etudiants', authRole, (req, res) => {
  const u = req.utilisateur;
  let rows;
  
  // On ne sélectionne QUE les élèves qui ne sont pas archivés (statut différent de 'archive')
  if (u.role === 'admin' || u.role === 'direction') {
    rows = db.prepare(`SELECT e.*, c.nom AS centre_nom FROM etudiants e JOIN centres c ON c.id = e.centre_id WHERE e.statut != 'archive'`).all();
  } else {
    rows = db.prepare(`SELECT e.*, c.nom AS centre_nom FROM etudiants e JOIN centres c ON c.id = e.centre_id WHERE e.centre_id = ? AND e.statut != 'archive'`).all(u.centre_id);
  }
  res.json(rows);
});

// ---- INSCRIPTION (réservée au responsable) ----
app.post('/api/etudiants', authRole, (req, res) => {
  if (req.utilisateur.role !== 'responsable') {
    return res.status(403).json({ error: 'Seul un responsable de centre peut inscrire un élève.' });
  }

  const { nom, prenom, telephone, matiere, niveau, centre_id, date_entree } = req.body;
  
  // 1. VÉRIFICATION : Est-ce que cet élève existe déjà (même archivé) ?
  const existant = db.prepare(`SELECT utp_id FROM etudiants WHERE nom = ? AND prenom = ?`).get(nom, prenom);

  let utp_id;
  if (existant) {
    // S'il existe déjà, il garde son ancien ID
    utp_id = existant.utp_id;
    // On le réactive
    db.prepare(`UPDATE etudiants SET statut = 'actif', centre_id = ?, date_entree = ? WHERE utp_id = ?`)
      .run(centre_id, date_entree || new Date().toISOString().slice(0,10), utp_id);
  } else {
    // Sinon, on lui crée un nouvel ID
    utp_id = genUtpId();
    db.prepare(`INSERT INTO etudiants (utp_id, nom, prenom, telephone, matiere, niveau, centre_id, date_entree, statut) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'actif')`)
      .run(utp_id, nom, prenom || '', telephone || '', matiere, niveau, centre_id, date_entree || new Date().toISOString().slice(0,10));
  }

  res.json({ utp_id, message: existant ? 'Élève réinscrit (ID conservé)' : 'Nouvel élève inscrit' });
});

app.post('/api/paiements', authRole, (req, res) => {
  const { etudiant_id, montant, tranche, mode_paiement, reference } = req.body;
  const etudiant = db.prepare('SELECT * FROM etudiants WHERE id = ?').get(etudiant_id);
  
  const ticket_ref = 'TCK-' + Date.now();
  db.prepare('INSERT INTO paiements (etudiant_id, montant, tranche, ticket_ref, mode_paiement, reference) VALUES (?, ?, ?, ?, ?, ?)')
    .run(etudiant_id, montant, tranche, ticket_ref, mode_paiement, reference || null);

  const nouveauMontant = etudiant.montant_paye + montant;
  let badge = etudiant.badge_genere;
  if (nouveauMontant >= 20000) badge = 1;

  db.prepare('UPDATE etudiants SET montant_paye = ?, badge_genere = ? WHERE id = ?').run(nouveauMontant, badge, etudiant_id);
  res.json({ ticket_ref, montant, nouveauMontant, badge_genere: badge });
});

/* ============================================================
   RÉINITIALISATION AUTOMATIQUE (Archivage)
   ============================================================ */
app.post('/api/reinitialiser', authRole, (req, res) => {
  if (req.utilisateur.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  
  // On archive tous les élèves (on ne les efface pas !)
  db.prepare("UPDATE etudiants SET statut = 'archive'").run();
  
  res.json({ ok: true, message: 'Tous les élèves ont été archivés. Les ID sont conservés.' });
});

app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
  console.log(`UTP App démarrée sur le port ${process.env.PORT || 3000}`);
});

module.exports = db;
