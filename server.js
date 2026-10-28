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

  let centres = [];
  if (role === 'admin' || role === 'direction') {
    centres = db.prepare('SELECT * FROM centres ORDER BY id').all();
  } else {
    centres = db.prepare(`SELECT c.* FROM centres c JOIN responsable_centres rc ON rc.centre_id = c.id WHERE rc.responsable_id = ?`).all(resp.id);
  }

  res.json({ utilisateur: { ...resp, role }, centres: centres });
});

app.get('/api/matieres', (req, res) => res.json(MATIERES_NIVEAUX));

app.get('/api/centres', authRole, (req, res) => {
  const u = req.utilisateur;
  if (u.role === 'admin' || u.role === 'direction') {
    res.json(db.prepare('SELECT * FROM centres ORDER BY id').all());
  } else {
    const rows = db.prepare(`SELECT c.* FROM centres c JOIN responsable_centres rc ON rc.centre_id = c.id WHERE rc.responsable_id = ?`).all(u.id);
    res.json(rows);
  }
});

app.get('/api/etudiants', authRole, (req, res) => {
  const u = req.utilisateur;
  let rows;
  if (u.role === 'admin' || u.role === 'direction') {
    rows = db.prepare(`SELECT e.*, c.nom AS centre_nom FROM etudiants e JOIN centres c ON c.id = e.centre_id WHERE e.statut != 'archive'`).all();
  } else {
    rows = db.prepare(`SELECT e.*, c.nom AS centre_nom FROM etudiants e JOIN centres c ON c.id = e.centre_id JOIN responsable_centres rc ON rc.centre_id = e.centre_id WHERE rc.responsable_id = ? AND e.statut != 'archive'`).all(u.id);
  }
  res.json(rows);
});

app.post('/api/etudiants', authRole, (req, res) => {
  if (req.utilisateur.role !== 'responsable') return res.status(403).json({ error: 'Seul un responsable de centre peut inscrire un élève.' });
  const { nom, prenom, telephone, matiere, niveau, centre_id, date_entree } = req.body;
  
  const existant = db.prepare(`SELECT id, utp_id FROM etudiants WHERE nom = ? AND prenom = ?`).get(nom, prenom);
  let utp_id;
  
  if (existant) {
    utp_id = existant.utp_id;
    db.prepare(`UPDATE etudiants SET statut = 'actif', centre_id = ?, matiere = ?, niveau = ?, date_entree = ?, montant_paye = 0, badge_genere = 0 WHERE id = ?`).run(centre_id, matiere, niveau, date_entree || new Date().toISOString().slice(0,10), existant.id);
  } else {
    utp_id = genUtpId();
    db.prepare(`INSERT INTO etudiants (utp_id, nom, prenom, telephone, matiere, niveau, centre_id, date_entree, statut) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'actif')`).run(utp_id, nom, prenom || '', telephone || '', matiere, niveau, centre_id, date_entree || new Date().toISOString().slice(0,10));
  }
  res.json({ utp_id });
});

app.post('/api/paiements', authRole, (req, res) => {
  const { etudiant_id, montant, tranche, mode_paiement, reference } = req.body;
  const etudiant = db.prepare('SELECT * FROM etudiants WHERE id = ?').get(etudiant_id);
  if (!etudiant) return res.status(404).json({ error: 'Étudiant introuvable' });
  
  const ticket_ref = 'TCK-' + Date.now();
  db.prepare('INSERT INTO paiements (etudiant_id, montant, tranche, ticket_ref, mode_paiement, reference) VALUES (?, ?, ?, ?, ?, ?)').run(etudiant_id, montant, tranche, ticket_ref, mode_paiement, reference || null);

  const nouveauMontant = etudiant.montant_paye + montant;
  let badge = etudiant.badge_genere;
  if (nouveauMontant >= 20000) badge = 1;
  db.prepare('UPDATE etudiants SET montant_paye = ?, badge_genere = ? WHERE id = ?').run(nouveauMontant, badge, etudiant_id);
  
  res.json({ ticket_ref, montant, nouveauMontant, badge_genere: badge });
});

// --- COMMANDES DE LIVRES ---
app.post('/api/livres/commander', authRole, (req, res) => {
  if (req.utilisateur.role !== 'responsable') return res.status(403).json({ error: 'Responsable requis' });
  const { nombre_livres, centre_id } = req.body;
  const montant_total = nombre_livres * 20000;
  
  const info = db.prepare('INSERT INTO commandes_livres (centre_id, nombre_livres, montant_total) VALUES (?, ?, ?)').run(centre_id, nombre_livres, montant_total);
  db.prepare('INSERT INTO depenses (centre_id, libelle, montant) VALUES (?, ?, ?)').run(centre_id, 'Achat de livres (Versement Direction)', montant_total);

  res.json({ id: info.lastInsertRowid, montant_total });
});

app.get('/api/direction/livres', authRole, (req, res) => {
  if (req.utilisateur.role !== 'direction') return res.status(403).json({ error: 'Direction requise' });
  const rows = db.prepare(`SELECT cl.*, c.nom AS centre_nom FROM commandes_livres cl JOIN centres c ON c.id = cl.centre_id ORDER BY cl.id DESC`).all();
  res.json(rows);
});

// --- ADMINISTRATION ---
app.post('/api/admin/centres', authRole, (req, res) => {
  if (req.utilisateur.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  const { nom } = req.body;
  const info = db.prepare('INSERT INTO centres (nom) VALUES (?)').run(nom);
  res.json({ id: info.lastInsertRowid, nom });
});

app.post('/api/admin/utilisateurs', authRole, (req, res) => {
  if (req.utilisateur.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  const { nom, code_acces, centres_ids } = req.body;
  try {
    const info = db.prepare('INSERT INTO responsables (nom, code_acces) VALUES (?, ?)').run(nom, code_acces);
    const respId = info.lastInsertRowid;
    if (centres_ids && centres_ids.length > 0) {
      const insertLiaison = db.prepare('INSERT INTO responsable_centres (responsable_id, centre_id) VALUES (?, ?)');
      centres_ids.forEach(cId => insertLiaison.run(respId, cId));
    }
    res.json({ id: respId });
  } catch (e) { res.status(400).json({ error: 'Code déjà existant' }); }
});

app.post('/api/reinitialiser', authRole, (req, res) => {
  if (req.utilisateur.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  db.prepare("UPDATE etudiants SET statut = 'archive'").run();
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`UTP App démarrée sur le port ${PORT}`));
