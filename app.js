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
  $('#code-input').value = ''; // Vide le champ immédiatement pour la sécurité

  if (!code) return;

  try {
    const data = await api('/api/login', 'POST', { code });
    session = data;
    
    // Sauvegarde de la session pour le retour depuis la page Badge
    sessionStorage.setItem('utp_session_data', JSON.stringify(data));
    
    afficherInterface();
  } catch (e) { 
    $('#login-error').textContent = e.message; 
  }
}

// --- AFFICHAGE DE L'INTERFACE (CORRIGÉ) ---
async function afficherInterface() {
  $('#login-screen').classList.remove('active');
  $('#main-screen').classList.add('active');
  $('#user-info').textContent = `${session.utilisateur.nom} (${session.utilisateur.role})`;
  
  if (session.utilisateur.role === 'admin') {
    $('#interface-admin-direction').style.display = 'block';
    $('#interface-responsable').style.display = 'none';
    // Affiche Admin et cache Direction
    $('#btn-admin').style.display = 'inline-block';
    $('#btn-direction').style.display = 'none'; 
  } 
  else if (session.utilisateur.role === 'direction') {
    $('#interface-admin-direction').style.display = 'block';
    $('#interface-responsable').style.display = 'none';
    // Affiche Direction et cache Admin
    $('#btn-admin').style.display = 'none';
    $('#btn-direction').style.display = 'inline-block'; 
  } 
  else {
    // Responsable : on affiche son interface de travail
    $('#interface-responsable').style.display = 'block';
    $('#interface-admin-direction').style.display = 'none';
    $('#btn-admin').style.display = 'none';
    $('#btn-direction').style.display = 'none';
    
    if (centres.length === 0) {
      await init(); 
    }
    showTab('etudiants');
  }
}

// --- RESTAURATION DE SESSION AU CHARGEMENT ---
window.onload = async function() {
  const savedData = sessionStorage.getItem('utp_session_data');
  if (savedData) {
    session = JSON.parse(savedData);
    await afficherInterface();
  }
};

// --- DÉCONNEXION TOTALE ---
function logout() { 
  // 1. Vider la session
  session = null; 
  sessionStorage.clear(); 
  localStorage.clear(); 
  
  // 2. Vider le nom de l'utilisateur en haut
  document.getElementById('user-info').textContent = '';
  
  // 3. Cacher toutes les interfaces
  document.getElementById('main-screen').classList.remove('active');
  document.getElementById('interface-responsable').style.display = 'none';
  document.getElementById('interface-admin-direction').style.display = 'none';
  
  // 4. Vider le champ de connexion et les erreurs
  document.getElementById('code-input').value = '';
  document.getElementById('login-error').textContent = '';
  
  // 5. Afficher l'écran de connexion
  document.getElementById('login-screen').classList.add('active');
}

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const target = document.getElementById('tab-' + name);
  if (target) target.classList.add('active');
}

// --- INITIALISATION DES DONNÉES ---
async function init() {
  try {
    centres = await api('/api/centres');
    matieres = await api('/api/matieres');

    const fillCentres = (id) => {
      const sel = $(id);
      if(!sel) return;
      sel.innerHTML = centres.map(c => `<option value="${c.id}">${c.nom}</option>`).join('');
    };
    fillCentres('#e-centre');

    const matSel = $('#e-matiere');
    if (matSel) {
      matSel.innerHTML = Object.keys(matieres).map(m => `<option>${m}</option>`).join('');
      matSel.onchange = () => majNiveaux();
      majNiveaux();
    }

    await chargerEtudiants();
  } catch (e) {
    console.error("Erreur d'initialisation :", e);
  }
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
        <td>${e.badge_genere ? '✅' : '❌'}</td>
        <td>${e.date_entree}</td>
      </tr>
    `).join('');

    const opts = rows.map(e => `<option value="${e.id}">${e.utp_id} – ${e.nom} (${e.matiere} ${e.niveau})</option>`).join('');
    if ($('#p-etudiant')) $('#p-etudiant').innerHTML = opts;
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
    alert("✅ Étudiant ajouté !");
    $('#e-nom').value = ''; $('#e-prenom').value = ''; $('#e-tel').value = '';
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
