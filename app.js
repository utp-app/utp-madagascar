let session = null;
let centres = [];
let matieres = {};

const $ = (sel) => document.querySelector(sel);

// --- API FETCH ---
async function api(path, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (session) headers['x-code-acces'] = session.utilisateur.code_acces;
  
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  
  const r = await fetch(path, opts);
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: 'Erreur inconnue' }));
    throw new Error(err.error || 'Erreur');
  }
  return r.json();
}

// --- AUTHENTIFICATION ---
async function login() {
  const code = $('#code-input').value.trim();
  try {
    const data = await api('/api/login', 'POST', { code });
    session = data;
    sessionStorage.setItem('utp_code', code);
    
    $('#login-screen').classList.remove('active');
    $('#main-screen').classList.add('active');
    $('#user-info').textContent = `${session.utilisateur.nom} (${session.utilisateur.role})` + 
      (session.centre ? ` – ${session.centre.nom}` : '');
      
    if (session.utilisateur.role === 'admin') $('#btn-admin').style.display = '';
    if (session.utilisateur.role === 'direction') $('#btn-direction').style.display = '';
    
    await init();
  } catch (e) { 
    $('#login-error').textContent = e.message; 
  }
}

function logout() { 
  session = null; 
  sessionStorage.removeItem('utp_code');
  location.reload(); 
}

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  $(`#tab-${name}`).classList.add('active');
}

// --- INITIALISATION ---
async function init() {
  centres = await api('/api/centres');
  matieres = await api('/api/matieres');

  const fillCentres = (id) => {
    const sel = $(id);
    if(!sel) return;
    sel.innerHTML = centres.map(c => `<option value="${c.id}">${c.nom}</option>`).join('');
    if (session.centre) sel.value = session.centre.id;
  };
  fillCentres('#e-centre');
  fillCentres('#d-centre');
  fillCentres('#r-centre');

  const matSel = $('#e-matiere');
  if (matSel) {
    matSel.innerHTML = Object.keys(matieres).map(m => `<option>${m}</option>`).join('');
    matSel.onchange = () => majNiveaux();
    majNiveaux();
  }

  await chargerEtudiants();
  if ($('#tab-compta')) await chargerCompta();
}

function majNiveaux() {
  const mat = $('#e-matiere').value;
  $('#e-niveau').innerHTML = (matieres[mat] || []).map(n => `<option>${n}</option>`).join('');
}

// --- GESTION DES ÉTUDIANTS ---
async function chargerEtudiants() {
  try {
    const rows = await api('/api/etudiants');
    const tbody = $('#table-etudiants tbody');
    if (!tbody) return;

    tbody.innerHTML = rows.map(e => `
      <tr>
        <td>${e.utp_id}</td>
        <td>${e.nom} ${e.prenom}</td>
        <td>${e.matiere}</td>
        <td>${e.niveau}</td>
        <td>${e.centre_nom}</td>
        <td>${e.montant_paye.toLocaleString()} Ar</td>
        <td>${e.badge_genere ? '<span class="badge-ok">✔</span>' : '<span class="badge-no">✘</span>'}</td>
        <td>${e.date_entree}</td>
        <td>${session.utilisateur.role === 'admin' ? `<button onclick="supprimerEtudiant(${e.id})" style="background:#e74c3c">Suppr</button>` : ''}</td>
      </tr>
    `).join('');

    const opts = rows.map(e => `<option value="${e.id}">${e.utp_id} – ${e.nom} (${e.matiere} ${e.niveau})</option>`).join('');
    if ($('#p-etudiant')) $('#p-etudiant').innerHTML = opts;
    if ($('#n-etudiant')) $('#n-etudiant').innerHTML = opts;
    
  } catch (e) { console.error(e); }
}

async function ajouterEtudiant() {
  try {
    await api('/api/etudiants', 'POST', {
      nom: $('#e-nom').value,
      prenom: $('#e-prenom').value,
      telephone: $('#e-tel').value,
      matiere: $('#e-matiere').value,
      niveau: $('#e-niveau').value,
      centre_id: parseInt($('#e-centre').value),
      date_entree: $('#e-date').value
    });
    await chargerEtudiants();
    alert("✅ Étudiant ajouté !");
    // Réinitialiser les champs
    $('#e-nom').value = ''; $('#e-prenom').value = ''; $('#e-tel').value = '';
  } catch (e) { alert(e.message); }
}

async function supprimerEtudiant(id) {
  if (!confirm('Supprimer cet étudiant ?')) return;
  try {
    await api('/api/etudiants/' + id, 'DELETE');
    await chargerEtudiants();
  } catch (e) { alert(e.message); }
}

// --- GESTION DES PAIEMENTS ---
function toggleReference() {
  var mode = document.getElementById('p-mode').value;
  var refInput = document.getElementById('p-reference');
  if (mode === 'Mobile Money' || mode === 'Chèque') {
    refInput.style.display = 'block';
    refInput.required = true;
  } else {
    refInput.style.display = 'none';
    refInput.required = false;
    refInput.value = '';
  }
}

async function ajouterPaiement() {
  const etudiant_id = parseInt($('#p-etudiant').value);
  const montant = parseInt($('#p-montant').value);
  const tranche = $('#p-tranche').value;
  const mode_paiement = $('#p-mode').value;
  const reference = $('#p-reference').value;

  if (!etudiant_id || !montant) return alert('Champs manquants');
  if ((mode_paiement === 'Mobile Money' || mode_paiement === 'Chèque') && !reference) {
    return alert('⚠️ Veuillez saisir la référence (N° transaction).');
  }

  try {
    const rows = await api('/api/etudiants');
    const eleve = rows.find(e => e.id === etudiant_id);

    const r = await api('/api/paiements', 'POST', { etudiant_id, montant, tranche, mode_paiement, reference });
    
    // GÉNÉRATION DU TICKET DE CAISSE
    const dateNow = new Date().toLocaleString('fr-FR');
    const ticketHTML = `
      <html>
      <head>
        <title>Ticket de caisse - UTP</title>
        <style>
          @media print {
            @page { size: 80mm auto; margin: 0; }
            body { width: 80mm; margin: 0; padding: 10px; }
            .no-print { display: none !important; }
          }
          body { font-family: 'Courier New', Courier, monospace; font-size: 12px; color: #000; line-height: 1.4; width: 300px; margin: 0 auto; background: #fff; padding: 15px; }
          .text-center { text-align: center; }
          .logo { display: block; margin: 0 auto; width: 70px; height: 70px; border-radius: 50%; object-fit: cover; }
          .title { font-size: 16px; font-weight: bold; margin: 10px 0 2px 0; }
          .subtitle { font-size: 10px; margin-bottom: 10px; }
          .divider { border-top: 1px dashed #000; margin: 10px 0; }
          .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
          .bold { font-weight: bold; }
          .total { font-size: 14px; font-weight: bold; margin-top: 10px; text-align: center; border: 1px solid #000; padding: 5px; }
          .btn-print { display: block; width: 100%; padding: 12px; margin-top: 20px; background: #1A237E; color: white; border: none; border-radius: 5px; font-size: 14px; font-weight: bold; cursor: pointer; text-align: center; }
        </style>
      </head>
      <body>
        <img src="/logo.png" alt="Logo UTP" class="logo">
        <div class="text-center title">UTP MADAGASCAR</div>
        <div class="text-center subtitle">Centre : ${eleve.centre_nom || 'Non défini'}</div>
        <div class="divider"></div>
        <div class="row"><span>Date :</span> <span>${dateNow}</span></div>
        <div class="row"><span>Ticket N° :</span> <span>${r.ticket_ref}</span></div>
        <div class="row"><span>Mode :</span> <span>${mode_paiement}</span></div>
        ${reference ? `<div class="row"><span>Réf :</span> <span>${reference}</span></div>` : ''}
        <div class="divider"></div>
        <div class="row bold"><span>Élève :</span> <span>${eleve.nom} ${eleve.prenom}</span></div>
        <div class="row"><span>ID :</span> <span>${eleve.utp_id}</span></div>
        <div class="row"><span>Formation :</span> <span>${eleve.matiere} (${eleve.niveau})</span></div>
        <div class="divider"></div>
        <div class="row"><span>Montant versé :</span> <span>${r.montant.toLocaleString()} Ar</span></div>
        <div class="row"><span>Type :</span> <span>${tranche}</span></div>
        <div class="row bold"><span>Total payé à ce jour :</span> <span>${r.nouveauMontant.toLocaleString()} Ar</span></div>
        <div class="total">MERCI DE VOTRE CONFIANCE</div>
        <div class="text-center" style="font-size: 9px; margin-top: 15px;">Ce ticket est généré automatiquement.</div>
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>
      </body>
      </html>
    `;

    const win = window.open('', '_blank');
    win.document.write(ticketHTML);
    win.document.close();

    $('#ticket-result').innerHTML = `
      <div class="card" style="background:#E8F5E9; border:1px solid #C8E6C9; color:#2E7D32;">
        <h3>✅ Paiement enregistré avec succès !</h3>
        <p>Le ticket a été ouvert dans un nouvel onglet pour impression.</p>
      </div>`;
    
    await chargerEtudiants(); 
    $('#p-montant').value = ''; $('#p-reference').value = '';
  } catch (e) { alert(e.message); }
}

// --- COMPTABILITÉ (Si présent dans l'onglet) ---
async function chargerCompta() {
  try {
    const c = await api('/api/comptabilite');
    $('#compta-stats').innerHTML = `
      <div class="card">
        <h3>Bilan</h3>
        <p><strong>Recettes :</strong> ${c.recettes.toLocaleString()} Ar</p>
        <p><strong>Dépenses :</strong> ${c.depenses.toLocaleString()} Ar</p>
        <p><strong>Solde :</strong> ${c.solde.toLocaleString()} Ar</p>
      </div>`;
    
    const tbodyDep = $('#table-depenses tbody');
    if (tbodyDep) {
      tbodyDep.innerHTML = c.detail.map(d => `
        <tr>
          <td>${d.libelle}</td>
          <td>${d.montant.toLocaleString()} Ar</td>
          <td>${d.centre_nom || session.centre?.nom || '-'}</td>
          <td>${d.date_depense}</td>
        </tr>
      `).join('');
    }
  } catch (e) { console.error(e); }
}

async function ajouterDepense() {
  try {
    await api('/api/depenses', 'POST', {
      libelle: $('#d-libelle').value,
      montant: parseInt($('#d-montant').value),
      centre_id: session.centre ? session.centre.id : parseInt($('#d-centre').value)
    });
    await chargerCompta();
    $('#d-libelle').value = ''; $('#d-montant').value = '';
  } catch (e) { alert(e.message); }
}