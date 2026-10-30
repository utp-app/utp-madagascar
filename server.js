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

function calculDateExamen(dateEntree, matiere) {
  if (!dateEntree) return '—';
  const d = new Date(dateEntree);
  if (matiere === 'Anglais' || matiere === 'Français') d.setMonth(d.getMonth() + 2);
  else d.setMonth(d.getMonth() + 3);
  return d.toISOString().slice(0, 10);
}

function estExpire(dateEntree, matiere) {
  if (!dateEntree) return false;
  const dureeJours = (matiere === 'Anglais' || matiere === 'Français') ? 80 : 110;
  const dateEntreeObj = new Date(dateEntree);
  const dateLimite = new Date(dateEntreeObj.getTime() + (dureeJours * 24 * 60 * 60 * 1000));
  return new Date() > dateLimite;
}

function calculAppreciation(total, matiere) {
  if (matiere === 'Français') {
    if (total < 50) return 'Repêchage';
    if (total <= 60) return 'Passable';
    if (total <= 69) return 'Assez Bien';
    if (total <= 79) return 'Bien';
    if (total <= 89) return 'Très Bien';
    return 'Excellent';
  } else {
    if (total < 50) return 'Repêchage';
    if (total <= 60) return 'Fair';
    if (total <= 69) return 'Good Enough';
    if (total <= 79) return 'Good';
    if (total <= 89) return 'Very Good';
    return 'Excellent';
  }
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
  if (u.role === 'admin' || u.role === 'direction') res.json(db.prepare('SELECT * FROM centres ORDER BY id').all());
  else res.json(db.prepare(`SELECT c.* FROM centres c JOIN responsable_centres rc ON rc.centre_id = c.id WHERE rc.responsable_id = ?`).all(u.id));
});

app.get('/api/responsables', authRole, (req, res) => {
  if (req.utilisateur.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  res.json(db.prepare(`SELECT r.id, r.nom, r.code_acces, r.telephone, GROUP_CONCAT(c.nom, ', ') as centres_noms FROM responsables r LEFT JOIN responsable_centres rc ON rc.responsable_id = r.id LEFT JOIN centres c ON c.id = rc.centre_id WHERE r.code_acces NOT IN ('ADMIN2030', 'COORDO0009') GROUP BY r.id`).all());
});

app.put('/api/admin/responsables/:id/telephone', authRole, (req, res) => {
  if (req.utilisateur.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  const { telephone } = req.body;
  try {
    db.prepare('UPDATE responsables SET telephone = ? WHERE id = ?').run(telephone, req.params.id);
    res.json({ ok: true, message: 'Téléphone mis à jour' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// REQUETE CORRIGÉE POUR L'ADMIN ET LA DIRECTION
app.get('/api/etudiants', authRole, (req, res) => {
  const u = req.utilisateur;
  let rows;
  if (u.role === 'admin' || u.role === 'direction') {
    rows = db.prepare(`
      SELECT e.*, c.nom AS centre_nom, r.telephone AS responsable_tel 
      FROM etudiants e 
      LEFT JOIN centres c ON c.id = e.centre_id 
      LEFT JOIN responsable_centres rc ON rc.centre_id = c.id
      LEFT JOIN responsables r ON r.id = rc.responsable_id
      WHERE e.statut != 'archive'
    `).all();
  } else {
    rows = db.prepare(`
      SELECT e.*, c.nom AS centre_nom, r.telephone AS responsable_tel 
      FROM etudiants e 
      LEFT JOIN centres c ON c.id = e.centre_id 
      LEFT JOIN responsable_centres rc ON rc.centre_id = e.centre_id
      LEFT JOIN responsables r ON r.id = rc.responsable_id
      WHERE rc.responsable_id = ? AND e.statut != 'archive'
    `).all(u.id);
  }
  res.json(rows.map(e => ({ 
    ...e, 
    date_examen_auto: calculDateExamen(e.date_entree, e.matiere),
    date_examen_affichee: e.date_examen_validee || calculDateExamen(e.date_entree, e.matiere)
  })));
});

app.post('/api/etudiants', authRole, (req, res) => {
  if (req.utilisateur.role !== 'responsable') return res.status(403).json({ error: 'Seul un responsable peut inscrire.' });
  const { nom, prenom, telephone, matiere, niveau, centre_id, date_entree } = req.body;
  const existant = db.prepare(`SELECT id, utp_id FROM etudiants WHERE nom = ? AND prenom = ?`).get(nom, prenom);
  let utp_id;
  if (existant) {
    utp_id = existant.utp_id;
    db.prepare(`UPDATE etudiants SET statut = 'actif', centre_id = ?, matiere = ?, niveau = ?, date_entree = ?, montant_paye = 0, badge_genere = 0, statut_examen = 'en_attente', date_examen_validee = NULL WHERE id = ?`).run(centre_id, matiere, niveau, date_entree || new Date().toISOString().slice(0,10), existant.id);
  } else {
    utp_id = genUtpId();
    db.prepare(`INSERT INTO etudiants (utp_id, nom, prenom, telephone, matiere, niveau, centre_id, date_entree, statut) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'actif')`).run(utp_id, nom, prenom || '', telephone || '', matiere, niveau, centre_id, date_entree || new Date().toISOString().slice(0,10));
  }
  res.json({ utp_id });
});

app.post('/api/paiements', authRole, (req, res) => {
  const { etudiant_id, montant, tranche, mode_paiement, reference } = req.body;
  if ((mode_paiement === 'Mobile Money' || mode_paiement === 'Chèque') && !reference) return res.status(400).json({ error: 'Référence obligatoire.' });
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

app.post('/api/livres/commander', authRole, (req, res) => {
  if (req.utilisateur.role !== 'responsable') return res.status(403).json({ error: 'Responsable requis' });
  const { detail_livres, centre_id } = req.body; 
  let montant_total = 0;
  let total_livres = 0;
  detail_livres.forEach(item => {
    montant_total += item.nombre * 20000;
    total_livres += item.nombre;
  });
  if (total_livres === 0) return res.status(400).json({ error: 'Veuillez commander au moins un livre.' });
  const info = db.prepare('INSERT INTO commandes_livres (centre_id, nombre_livres, montant_total, details) VALUES (?, ?, ?, ?)').run(centre_id, total_livres, montant_total, JSON.stringify(detail_livres));
  db.prepare('INSERT INTO depenses (centre_id, libelle, montant) VALUES (?, ?, ?)').run(centre_id, 'Achat de livres (Versement Direction)', montant_total);
  res.json({ id: info.lastInsertRowid, montant_total, total_livres });
});

app.get('/api/direction/livres-details', authRole, (req, res) => {
  if (req.utilisateur.role !== 'direction') return res.status(403).json({ error: 'Direction requise' });
  const rows = db.prepare(`SELECT cl.*, c.nom AS centre_nom FROM commandes_livres cl JOIN centres c ON c.id = cl.centre_id ORDER BY cl.id DESC`).all();
  res.json(rows.map(r => ({ ...r, details: JSON.parse(r.details || '[]') })));
});

app.post('/api/depenses', authRole, (req, res) => {
  const u = req.utilisateur;
  if (u.role !== 'responsable') return res.status(403).json({ error: 'Responsable requis' });
  const { libelle, montant, centre_id } = req.body;
  if (!libelle || !montant) return res.status(400).json({ error: 'Champs manquants' });
  const info = db.prepare('INSERT INTO depenses (centre_id, libelle, montant) VALUES (?, ?, ?)').run(centre_id, libelle, montant);
  res.json({ id: info.lastInsertRowid });
});

app.get('/api/responsable/stats', authRole, (req, res) => {
  if (req.utilisateur.role !== 'responsable') return res.status(403).json({ error: 'Responsable requis' });
  const u = req.utilisateur;
  const centres = db.prepare(`SELECT c.* FROM centres c JOIN responsable_centres rc ON rc.centre_id = c.id WHERE rc.responsable_id = ?`).all(u.id);
  let totalRecettes = 0;
  let totalDepenses = 0;
  const detailCentres = [];
  centres.forEach(c => {
    const recettes = db.prepare(`SELECT COALESCE(SUM(p.montant),0) as total FROM paiements p JOIN etudiants e ON e.id = p.etudiant_id WHERE e.centre_id = ?`).get(c.id).total;
    const depenses = db.prepare('SELECT COALESCE(SUM(montant),0) as total FROM depenses WHERE centre_id = ?').get(c.id).total;
    totalRecettes += recettes;
    totalDepenses += depenses;
    detailCentres.push({ id: c.id, nom: c.nom, recettes, depenses, solde: recettes - depenses });
  });
  res.json({ totalRecettes, totalDepenses, solde: totalRecettes - totalDepenses, detailCentres });
});

app.get('/api/responsable/rapport-comptable', authRole, (req, res) => {
  if (req.utilisateur.role !== 'responsable') return res.status(403).json({ error: 'Responsable requis' });
  const u = req.utilisateur;
  const centres = db.prepare(`SELECT c.id FROM centres c JOIN responsable_centres rc ON rc.centre_id = c.id WHERE rc.responsable_id = ?`).all(u.id).map(c => c.id);
  if (centres.length === 0) return res.json([]);
  const placeholders = centres.map(() => '?').join(',');
  const recettes = db.prepare(`SELECT p.date_paiement as date, 'Recette' as type, 'Paiement ' || e.nom || ' ' || e.prenom || ' (' || e.utp_id || ')' as libelle, p.montant, c.nom as centre_nom FROM paiements p JOIN etudiants e ON e.id = p.etudiant_id JOIN centres c ON c.id = e.centre_id WHERE e.centre_id IN (${placeholders})`).all(...centres);
  const depenses = db.prepare(`SELECT d.date_depense as date, 'Dépense' as type, d.libelle, d.montant, c.nom as centre_nom FROM depenses d JOIN centres c ON c.id = d.centre_id WHERE d.centre_id IN (${placeholders})`).all(...centres);
  const mouvements = [...recettes, ...depenses].sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(mouvements);
});

app.post('/api/notes', authRole, (req, res) => {
  const { etudiant_id, detail, total, type_examen } = req.body;
  const etudiant = db.prepare('SELECT * FROM etudiants WHERE id = ?').get(etudiant_id);
  if (!etudiant) return res.status(404).json({ error: 'Étudiant introuvable' });
  const appreciation = calculAppreciation(total, etudiant.matiere);
  const passe = total >= 50;
  db.prepare(`INSERT INTO notes (etudiant_id, matiere, total, appreciation, detail_json, type_examen) VALUES (?, ?, ?, ?, ?, ?)`).run(etudiant_id, etudiant.matiere, total, appreciation, JSON.stringify(detail), type_examen || 'normal');
  if (passe) {
    const niveaux = MATIERES_NIVEAUX[etudiant.matiere];
    const idx = niveaux.indexOf(etudiant.niveau);
    if (idx >= 0 && idx < niveaux.length - 1) db.prepare('UPDATE etudiants SET niveau = ? WHERE id = ?').run(niveaux[idx + 1], etudiant.id);
  }
  res.json({ total, appreciation, passe_niveau: passe });
});

app.post('/api/direction/examens/:id/approuver', authRole, (req, res) => {
  if (req.utilisateur.role !== 'direction') return res.status(403).json({ error: 'Direction requise' });
  const etudiant = db.prepare('SELECT * FROM etudiants WHERE id = ?').get(req.params.id);
  const dateAuto = calculDateExamen(etudiant.date_entree, etudiant.matiere);
  db.prepare("UPDATE etudiants SET statut_examen = 'approuve', date_examen_validee = ? WHERE id = ?").run(dateAuto, req.params.id);
  res.json({ ok: true, date: dateAuto });
});

app.post('/api/direction/examens/:id/modifier', authRole, (req, res) => {
  if (req.utilisateur.role !== 'direction') return res.status(403).json({ error: 'Direction requise' });
  const { nouvelle_date } = req.body;
  db.prepare("UPDATE etudiants SET statut_examen = 'modifie', date_examen_validee = ? WHERE id = ?").run(nouvelle_date, req.params.id);
  res.json({ ok: true, date: nouvelle_date });
});

app.post('/api/admin/centres', authRole, (req, res) => {
  if (req.utilisateur.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  const info = db.prepare('INSERT INTO centres (nom) VALUES (?)').run(req.body.nom);
  res.json({ id: info.lastInsertRowid });
});

app.post('/api/admin/utilisateurs', authRole, (req, res) => {
  if (req.utilisateur.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  const { nom, code_acces, telephone, centres_ids } = req.body;
  try {
    const info = db.prepare('INSERT INTO responsables (nom, code_acces, telephone) VALUES (?, ?, ?)').run(nom, code_acces, telephone || '');
    if (centres_ids && centres_ids.length > 0) {
      const insertLiaison = db.prepare('INSERT INTO responsable_centres (responsable_id, centre_id) VALUES (?, ?)');
      centres_ids.forEach(cId => insertLiaison.run(info.lastInsertRowid, cId));
    }
    res.json({ id: info.lastInsertRowid });
  } catch (e) { res.status(400).json({ error: 'Code déjà existant' }); }
});

app.put('/api/admin/etudiants/:id', authRole, (req, res) => {
  if (req.utilisateur.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  const { nom, prenom, telephone, matiere, niveau, centre_id, montant_paye, date_entree } = req.body;
  const id = req.params.id;
  try {
    db.prepare(`
      UPDATE etudiants 
      SET nom = ?, prenom = ?, telephone = ?, matiere = ?, niveau = ?, centre_id = ?, montant_paye = ?, date_entree = ?
      WHERE id = ?
    `).run(nom, prenom, telephone, matiere, niveau, centre_id, montant_paye, date_entree, id);
    
    const etudiant = db.prepare('SELECT montant_paye FROM etudiants WHERE id = ?').get(id);
    const badge = etudiant.montant_paye >= 20000 ? 1 : 0;
    db.prepare('UPDATE etudiants SET badge_genere = ? WHERE id = ?').run(badge, id);
    
    res.json({ ok: true, message: 'Élève modifié avec succès' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/admin/transactions', authRole, (req, res) => {
  if (req.utilisateur.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  res.json(db.prepare(`SELECT p.*, e.nom, e.prenom, e.utp_id, c.nom AS centre_nom FROM paiements p JOIN etudiants e ON e.id = p.etudiant_id JOIN centres c ON c.id = e.centre_id ORDER BY p.id DESC`).all());
});

app.delete('/api/admin/transactions/:id', authRole, (req, res) => {
  if (req.utilisateur.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  const p = db.prepare('SELECT * FROM paiements WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Transaction introuvable' });
  db.prepare('DELETE FROM paiements WHERE id = ?').run(req.params.id);
  const totalPaye = db.prepare('SELECT COALESCE(SUM(montant),0) as total FROM paiements WHERE etudiant_id = ?').get(p.etudiant_id).total;
  const badge = totalPaye >= 20000 ? 1 : 0;
  db.prepare('UPDATE etudiants SET montant_paye = ?, badge_genere = ? WHERE id = ?').run(totalPaye, badge, p.etudiant_id);
  res.json({ ok: true, nouveauMontant: totalPaye });
});

app.delete('/api/admin/etudiants/:id', authRole, (req, res) => {
  if (req.utilisateur.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  db.prepare('DELETE FROM etudiants WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/archiver-expires', authRole, (req, res) => {
  if (req.utilisateur.role !== 'admin') return res.status(403).json({ error: 'Seul l\'administrateur peut lancer la remise à zéro.' });
  const eleves = db.prepare("SELECT id, matiere, date_entree FROM etudiants WHERE statut = 'actif'").all();
  let archives = 0;
  for (let e of eleves) {
    if (estExpire(e.date_entree, e.matiere)) {
      db.prepare("UPDATE etudiants SET statut = 'archive' WHERE id = ?").run(e.id);
      archives++;
    }
  }
  res.json({ archives, message: `${archives} élèves archivés avec succès.` });
});

app.post('/api/admin/nettoyer-archives', authRole, (req, res) => {
  if (req.utilisateur.role !== 'admin') return res.status(403).json({ error: 'Admin requis' });
  const count = db.prepare("SELECT COUNT(*) as c FROM etudiants WHERE statut = 'archive'").get().c;
  db.prepare("DELETE FROM etudiants WHERE statut = 'archive'").run();
  res.json({ message: `${count} élèves archivés ont été supprimés définitivement.` });
});

app.get('/api/direction/compta-detaillee', authRole, (req, res) => {
  if (req.utilisateur.role !== 'direction') return res.status(403).json({ error: 'Direction requise' });
  const centres = db.prepare('SELECT * FROM centres').all();
  res.json(centres.map(c => {
    const recettes = db.prepare(`SELECT COALESCE(SUM(p.montant),0) as total FROM paiements p JOIN etudiants e ON e.id = p.etudiant_id WHERE e.centre_id = ?`).get(c.id).total;
    const depenses = db.prepare('SELECT COALESCE(SUM(montant),0) as total FROM depenses WHERE centre_id = ?').get(c.id).total;
    return { id: c.id, nom: c.nom, recettes, depenses, solde: recettes - depenses };
  }));
});

app.post('/api/etudiants/:id/valider-livre', authRole, (req, res) => {
  if (req.utilisateur.role !== 'direction') return res.status(403).json({ error: 'Direction requise' });
  db.prepare("UPDATE etudiants SET statut = 'actif' WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

setInterval(() => {
  console.log("⏳ Vérification automatique des expirations...");
  const eleves = db.prepare("SELECT id, matiere, date_entree FROM etudiants WHERE statut = 'actif'").all();
  let count = 0;
  for (let e of eleves) {
    if (estExpire(e.date_entree, e.matiere)) {
      db.prepare("UPDATE etudiants SET statut = 'archive' WHERE id = ?").run(e.id);
      count++;
    }
  }
  if (count > 0) console.log(`✅ ${count} élève(s) archivé(s) automatiquement.`);
}, 24 * 60 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`UTP App démarrée sur le port ${PORT}`);
});
