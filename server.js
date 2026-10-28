const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const MATIERES_NIVEAUX = {
  Anglais: ['L1', 'L2', 'L3', 'L4'],
  Français: ['L1', 'L2', 'L3', 'L4'],
  Allemand: ['A1', 'A2', 'B1', 'B2'],
  Chinois: ['HSK 1', 'HSK 2', 'HSK 3', 'HSK 4']
};

function getParam(cle, defaut) {
  const row = db.prepare('SELECT valeur FROM parametres WHERE cle = ?').get(cle);
  return row ? row.valeur : defaut;
}

function genUtpId() {
  const row = db.prepare(`SELECT MAX(CAST(SUBSTR(utp_id, 5) AS INTEGER)) AS m FROM etudiants WHERE utp_id LIKE 'UTP-%'`).get();
  const next = row && row.m ? row.m + 1 : 3000;
  return 'UTP-' + next;
}

function estExpire(etudiant) {
  const matiere = etudiant.matiere;
  const duree = ['Anglais', 'Français'].includes(matiere)
    ? parseInt(getParam('duree_anglais_francais_jours', '70'))
    : parseInt(getParam('duree_allemand_chinois_jours', '100'));
  const entree = new Date(etudiant.date_entree);
  const limite = new Date(entree.getTime() + duree * 86400000);
  return new Date() > limite;
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
    rows = db.prepare(`SELECT e.*, c.nom AS centre_nom FROM etudiants e JOIN centres c ON c.id = e.centre_id WHERE e.statut != 'supprime' ORDER BY e.id DESC`).all();
  } else {
    if (!u.centre_id) return res.json([]);
    rows = db.prepare(`SELECT e.*, c.nom AS centre_nom FROM etudiants e JOIN centres c ON c.id = e.centre_id WHERE e.centre_id = ? AND e.statut != 'supprime' ORDER BY e.id DESC`).all(u.centre_id);
  }
  res.json(rows);
});

app.post('/api/etudiants', authRole, (req, res) => {
  const { nom, prenom, telephone, matiere, niveau, centre_id, date_entree } = req.body;
  if (!nom || !matiere || !niveau || !centre_id) return res.status(400).json({ error: 'Champs manquants' });
  if (!MATIERES_NIVEAUX[matiere] || !MATIERES_NIVEAUX[matiere].includes(niveau)) return res.status(400).json({ error: 'Matière ou niveau invalide' });

  const u = req.utilisateur;
  if (u.role === 'responsable' && u.centre_id !== parseInt(centre_id)) return res.status(403).json({ error: 'Vous ne gérez pas ce centre' });

  const utp_id = genUtpId();
  const info = db.prepare(`INSERT INTO etudiants (utp_id, nom, prenom, telephone, matiere, niveau, centre_id, responsable_id, date_entree) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(utp_id, nom, prenom || '', telephone || '', matiere, niveau, centre_id, u.id, date_entree || new Date().toISOString().slice(0,10));

  res.json(db.prepare('SELECT * FROM etudiants WHERE id = ?').get(info.lastInsertRowid));
});

app.post('/api/paiements', authRole, (req, res) => {
  const { etudiant_id, montant, tranche, mode_paiement, reference } = req.body;
  const etudiant = db.prepare('SELECT * FROM etudiants WHERE id = ?').get(etudiant_id);
  if (!etudiant) return res.status(404).json({ error: 'Étudiant introuvable' });

  if ((mode_paiement === 'Mobile Money' || mode_paiement === 'Chèque') && !reference) {
    return res.status(400).json({ error: 'La référence est obligatoire pour ce mode de paiement.' });
  }

  const ticket_ref = 'TCK-' + Date.now();
  db.prepare('INSERT INTO paiements (etudiant_id, montant, tranche, ticket_ref, mode_paiement, reference) VALUES (?, ?, ?, ?, ?, ?)')
    .run(etudiant_id, montant, tranche || 'total', ticket_ref, mode_paiement || 'Espèce', reference || null);

  const nouveauMontant = etudiant.montant_paye + montant;
  let badge = etudiant.badge_genere;
  if (nouveauMontant >= 20000) badge = 1;

  db.prepare('UPDATE etudiants SET montant_paye = ?, badge_genere = ? WHERE id = ?').run(nouveauMontant, badge, etudiant_id);
  res.json({ ticket_ref, montant, nouveauMontant, badge_genere: badge });
});

app.post('/api/etudiants/:id/valider-livre', authRole, (req, res) => {
  if (req.utilisateur.role !== 'direction') return res.status(403).json({ error: 'Direction requise' });
  db.prepare("UPDATE etudiants SET statut = 'actif' WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/direction/compta-detaillee', authRole, (req, res) => {
  if (req.utilisateur.role !== 'direction') return res.status(403).json({ error: 'Direction requise' });
  const centres = db.prepare('SELECT * FROM centres').all();
  const result = centres.map(c => {
    const recettes = db.prepare(`SELECT COALESCE(SUM(p.montant),0) as total FROM paiements p JOIN etudiants e ON e.id = p.etudiant_id WHERE e.centre_id = ?`).get(c.id).total;
    const depenses = db.prepare('SELECT COALESCE(SUM(montant),0) as total FROM depenses WHERE centre_id = ?').get(c.id).total;
    return { id: c.id, nom: c.nom, recettes, depenses, solde: recettes - depenses };
  });
  res.json(result);
});

app.get('/api/notes/:id', authRole, (req, res) => {
  res.json(db.prepare('SELECT * FROM notes WHERE etudiant_id = ? ORDER BY id DESC').all(req.params.id));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`UTP App démarrée sur http://localhost:${PORT}`));
