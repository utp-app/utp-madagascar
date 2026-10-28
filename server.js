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
  if (u.role === 'admin' || u.role === 'direction') {
    rows = db.prepare(`SELECT e.*, c.nom AS centre_nom FROM etudiants e JOIN centres c ON c.id = e.centre_id`).all();
  } else {
    rows = db.prepare(`SELECT e.*, c.nom AS centre_nom FROM etudiants e JOIN centres c ON c.id = e.centre_id WHERE e.centre_id = ?`).all(u.centre_id);
  }
  res.json(rows);
});

// ---- SÉCURITÉ : SEUL LE RESPONSABLE PEUT INSCRIRE ----
app.post('/api/etudiants', authRole, (req, res) => {
  if (req.utilisateur.role !== 'responsable') {
    return res.status(403).json({ error: 'Seul un responsable de centre peut inscrire un élève.' });
  }

  const { nom, prenom, telephone, matiere, niveau, centre_id, date_entree } = req.body;
  const utp_id = genUtpId();
  const info = db.prepare(`INSERT INTO etudiants (utp_id, nom, prenom, telephone, matiere, niveau, centre_id, date_entree) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(utp_id, nom, prenom || '', telephone || '', matiere, niveau, centre_id, date_entree || new Date().toISOString().slice(0,10));
  res.json({ id: info.lastInsertRowid, utp_id });
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

app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
  console.log(`UTP App démarrée sur le port ${process.env.PORT || 3000}`);
});
