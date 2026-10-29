let session = null;
let centres = [];
let matieres = {};
let listeEleves = [];

const $ = (sel) => document.querySelector(sel);

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

// --- CALCUL DU RESTE À PAYER ---
function calculerReste() {
  const total = parseInt(document.getElementById('p-total').value) || 0;
  const verse = parseInt(document.getElementById('p-montant').value) || 0;
  const reste = total - verse;
  
  const champReste = document.getElementById('p-reste');
  if (total > 0) {
    champReste.value = reste.toLocaleString() + ' Ar';
  } else {
    champReste.value = '';
  }
}

async function login() {
  const code = $('#code-input').value.trim();
  $('#code-input').value = '';
  if (!code) return;
  try {
    const data = await api('/api/login', 'POST', { code });
    session = data;
    sessionStorage.setItem('utp_session_data', JSON.stringify(data));
    afficherInterface();
  } catch (e) { 
    $('#login-error').textContent = e.message; 
  }
}

async function afficherInterface() {
  $('#login-screen').classList.remove('active');
  $('#main-screen').classList.add('active');
  $('#user-info').textContent = `${session.utilisateur.nom} (${session.utilisateur.role})`;
  
  if (session.utilisateur.role === 'admin') {
    $('#interface-admin-direction').style.display = 'block';
    $('#interface-responsable').style.display = 'none';
    $('#btn-admin').style.display = 'inline-block';
    $('#btn-direction').style.display = 'none'; 
  } 
  else if (session.utilisateur.role === 'direction') {
    $('#interface-admin-direction').style.display = 'block';
    $('#interface-responsable').style.display = 'none';
    $('#btn-admin').style.display = 'none';
    $('#btn-direction').style.display = 'inline-block'; 
  } 
  else {
    $('#interface-responsable').style.display = 'block';
    $('#interface-admin-direction').style.display = 'none';
    $('#btn-admin').style.display = 'none';
    $('#btn-direction').style.display = 'none';
    if (centres.length === 0) await init(); 
    showTab('dashboard');
  }
}

window.onload = async function() {
  const savedData = sessionStorage.getItem('utp_session_data');
  if (savedData) {
    session = JSON.parse(savedData);
    await afficherInterface();
  }
};

function logout() { 
  session = null; 
  sessionStorage.clear(); 
  localStorage.clear(); 
  document.getElementById('user-info').textContent = '';
  document.getElementById('main-screen').classList.remove('active');
  document.getElementById('interface-responsable').style.display = 'none';
  document.getElementById('interface-admin-direction').style.display = 'none';
  document.getElementById('code-input').value = '';
  document.getElementById('login-error').textContent = '';
  document.getElementById('login-screen').classList.add('active');
}

function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const target = document.getElementById('tab-' + name);
  if (target) target.classList.add('active');
  
  if (name === 'dashboard') {
    chargerDashboard();
  }
}

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
    genererTableauLivres();
    await chargerDashboard();
  } catch (e) { console.error("Erreur d'initialisation :", e); }
}

function majNiveaux() {
  const mat = $('#e-matiere').value;
  $('#e-niveau').innerHTML = (matieres[mat] || []).map(n => `<option>${n}</option>`).join('');
}

async function chargerEtudiants() {
  try {
    const rows = await api('/api/etudiants');
    listeEleves = rows;
    
    const tbody = $('#table-etudiants tbody');
    if (!tbody) return;

    tbody.innerHTML = rows.map(e => {
      let statutExamenIcon = e.statut_examen === 'approuve' ? '✅' : (e.statut_examen === 'modifie' ? '⚠️' : '⏳');
      let statutExamenColor = e.statut_examen === 'approuve' ? '#2E7D32' : (e.statut_examen === 'modifie' ? '#E65100' : '#666');

      return `
      <tr>
        <td>${e.utp_id}</td>
        <td>${e.nom} ${e.prenom}</td>
        <td>${e.matiere}</td>
        <td>${e.niveau}</td>
        <td>${e.centre_nom}</td>
        <td>${e.montant_paye.toLocaleString()} Ar</td>
        <td>${e.badge_genere ? '✅' : '❌'}</td>
        <td>
          <div>Entrée : ${e.date_entree}</div>
          <div style="font-size:11px; margin-top:3px; font-weight:bold; color:${statutExamenColor};">
            Examen : ${e.date_examen_affichee} ${statutExamenIcon}
          </div>
        </td>
      </tr>
    `}).join('');

    const opts = rows.map(e => `<option value="${e.id}">${e.utp_id} – ${e.nom} (${e.matiere} ${e.niveau})</option>`).join('');
    if ($('#p-etudiant')) $('#p-etudiant').innerHTML = opts;
    if ($('#n-etudiant')) $('#n-etudiant').innerHTML = opts;
  } catch (e) { console.error(e); }
}

async function ajouterEtudiant() {
  const nom = $('#e-nom').value.trim();
  const prenom = $('#e-prenom').value.trim();
  const tel = $('#e-tel').value.trim();
  const matiere = $('#e-matiere').value;
  const niveau = $('#e-niveau').value;
  const centre = $('#e-centre').value;
  const date = $('#e-date').value;

  if (!nom || !prenom || !tel || !matiere || !niveau || !centre || !date) {
    return alert('⚠️ Veuillez remplir tous les champs obligatoires.');
  }

  try {
    await api('/api/etudiants', 'POST', {
      nom: nom, prenom: prenom, telephone: tel, matiere: matiere, niveau: niveau, centre_id: parseInt(centre), date_entree: date
    });
    alert("✅ Étudiant ajouté !");
    $('#e-nom').value = ''; $('#e-prenom').value = ''; $('#e-tel').value = ''; $('#e-date').value = '';
    await chargerEtudiants();
  } catch (e) { alert(e.message); }
}

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
  
  const formatChoisi = document.getElementById('p-format').value;
  const largeurTicket = formatChoisi === '58' ? '58mm' : '80mm';
  const largeurPolice = formatChoisi === '58' ? '10px' : '12px';

  if (!etudiant_id || !montant) return alert('Champs manquants');
  if ((mode_paiement === 'Mobile Money' || mode_paiement === 'Chèque') && !reference) {
    return alert('⚠️ Veuillez saisir la référence (N° transaction).');
  }

  try {
    const rows = await api('/api/etudiants');
    const eleve = rows.find(e => e.id === etudiant_id);

    const r = await api('/api/paiements', 'POST', { etudiant_id, montant, tranche, mode_paiement, reference });
    
    const dateNow = new Date().toLocaleString('fr-FR', { timeZone: 'Indian/Antananarivo' });
    
    const ticketHTML = `
      <html><head><style>
        @media print { 
          @page { size: ${largeurTicket} auto; margin: 0; } 
          body { width: ${largeurTicket}; margin: 0; padding: 5px; } 
          .no-print { display: none !important; } 
        }
        body { font-family: 'Courier New', Courier, monospace; font-size: ${largeurPolice}; color: #000; line-height: 1.4; width: ${largeurTicket}; margin: 0 auto; background: #fff; padding: 10px; }
        .text-center { text-align: center; } 
        .logo { display: block; margin: 0 auto; width: ${formatChoisi === '58' ? '50px' : '70px'}; height: ${formatChoisi === '58' ? '50px' : '70px'}; border-radius: 50%; object-fit: cover; }
        .title { font-size: ${formatChoisi === '58' ? '14px' : '16px'}; font-weight: bold; margin: 10px 0 2px 0; } 
        .subtitle { font-size: 9px; margin-bottom: 10px; }
        .divider { border-top: 1px dashed #000; margin: 8px 0; } 
        .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
        .bold { font-weight: bold; } 
        .total { font-size: ${formatChoisi === '58' ? '12px' : '14px'}; font-weight: bold; margin-top: 10px; text-align: center; border: 1px solid #000; padding: 5px; }
        .btn-print { display: block; width: 100%; padding: 12px; margin-top: 20px; background: #1A237E; color: white; border: none; border-radius: 5px; font-size: 14px; font-weight: bold; cursor: pointer; text-align: center; }
      </style></head><body>
        <img src="/logo.png" class="logo">
        <div class="text-center title">UTP MADAGASCAR</div>
        <div class="text-center subtitle">Centre : ${eleve.centre_nom || 'Non défini'}</div>
        <div class="divider"></div>
        <div class="row"><span>Date :</span> <span>${dateNow}</span></div>
        <div class="row"><span>Ticket :</span> <span>${r.ticket_ref}</span></div>
        <div class="row"><span>Mode :</span> <span>${mode_paiement}</span></div>
        ${reference ? `<div class="row"><span>Réf :</span> <span>${reference}</span></div>` : ''}
        <div class="divider"></div>
        <div class="row bold"><span>Élève :</span> <span>${eleve.nom} ${eleve.prenom}</span></div>
        <div class="row"><span>ID :</span> <span>${eleve.utp_id}</span></div>
        <div class="row"><span>Formation :</span> <span>${eleve.matiere} (${eleve.niveau})</span></div>
        <div class="divider"></div>
        <div class="row"><span>Montant versé :</span> <span>${r.montant.toLocaleString()} Ar</span></div>
        <div class="row"><span>Type :</span> <span>${tranche}</span></div>
        <div class="row bold"><span>Total payé :</span> <span>${r.nouveauMontant.toLocaleString()} Ar</span></div>
        <div class="total">MERCI DE VOTRE CONFIANCE</div>
        <div class="text-center" style="font-size: 9px; margin-top: 10px;">Généré automatiquement.</div>
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimer</button>
      </body></html>
    `;
    const win = window.open('', '_blank');
    win.document.write(ticketHTML);
    win.document.close();

    $('#ticket-result').innerHTML = `<div class="card" style="background:#E8F5E9; border:1px solid #C8E6C9; color:#2E7D32;"><h3>✅ Paiement enregistré avec succès !</h3><p>Le ticket a été ouvert dans un nouvel onglet pour impression.</p></div>`;
    
    await chargerEtudiants(); 
    $('#p-montant').value = ''; $('#p-reference').value = '';
    calculerReste();
  } catch (e) { alert(e.message); }
}

// --- NOTES DYNAMIQUES ---
function chargerBareme() {
  const id = parseInt($('#n-etudiant').value);
  if (!id) { $('#n-bareme').innerHTML = ''; return; }
  
  const eleve = listeEleves.find(e => e.id === id);
  if (!eleve) { 
    $('#n-bareme').innerHTML = '<p style="color:red; text-align:center;">Erreur : Élève non trouvé.</p>';
    return; 
  }
  
  const matiere = eleve.matiere;
  const niveau = eleve.niveau;
  
  let bareme = [];
  
  if (matiere === 'Allemand' && (niveau === 'A1' || niveau === 'A2')) {
    bareme = [
      { nom: 'Lesen (Compréhension écrite)', max: 25 },
      { nom: 'Hören (Compréhension orale)', max: 25 },
      { nom: 'Schreiben (Expression écrite)', max: 25 },
      { nom: 'Sprechen (Expression orale)', max: 25 }
    ];
  } else if (matiere === 'Allemand' && (niveau === 'B1' || niveau === 'B2')) {
    bareme = [
      { nom: 'Lesen', max: 30 },
      { nom: 'Hören', max: 30 },
      { nom: 'Sprechen', max: 30 },
      { nom: 'Schreiben', max: 30 }
    ];
  } else if (matiere === 'Français') {
    bareme = [
      { nom: 'Compréhension Orale', max: 15 },
      { nom: 'Expression Orale / Fluidité', max: 18 },
      { nom: 'Prononciation / Intonation', max: 12 },
      { nom: 'Grammaire', max: 9 },
      { nom: 'Participation / Effort', max: 6 },
      { nom: 'Soutenance Finale', max: 40 }
    ];
  } else if (matiere === 'Anglais' && niveau === 'L1') {
    bareme = [
      { nom: 'Listening', max: 30 },
      { nom: 'Reading', max: 15 },
      { nom: 'Writing', max: 15 },
      { nom: 'Speaking (Conversation + Q/R)', max: 40 }
    ];
  } else if (matiere === 'Anglais' && (niveau === 'L2' || niveau === 'L3' || niveau === 'L4')) {
    bareme = [
      { nom: 'Listening', max: 15 },
      { nom: 'Reading', max: 10 },
      { nom: 'Writing', max: 10 },
      { nom: 'Speaking (Conversation + Q/R)', max: 25 },
      { nom: 'Public Speaking / Soutenance', max: 40 }
    ];
  } else {
    bareme = [
      { nom: 'Épreuve 1', max: 25 },
      { nom: 'Épreuve 2', max: 25 },
      { nom: 'Épreuve 3', max: 25 },
      { nom: 'Épreuve 4', max: 25 }
    ];
  }

  let html = `<table style="width:100%; margin-top:10px; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <thead><tr><th style="background:#1e3a5f; color:white; padding:12px; text-align:left;">Épreuve / Critère</th><th style="background:#1e3a5f; color:white; padding:12px; text-align:center;">Barème</th><th style="background:#1e3a5f; color:white; padding:12px; text-align:center;">Note</th></tr></thead><tbody>`;
  
  bareme.forEach((b) => {
    html += `
      <tr>
        <td style="padding:12px; border-bottom:1px solid #eee;">${b.nom}</td>
        <td style="padding:12px; border-bottom:1px solid #eee; text-align:center;">${b.max} pts</td>
        <td style="padding:12px; border-bottom:1px solid #eee; text-align:center;"><input type="number" class="note-input" data-max="${b.max}" max="${b.max}" min="0" placeholder="0" oninput="calculerTotalNote()" style="width:80px; padding:8px; border:1px solid #ccc; border-radius:4px; text-align:center;" /></td>
      </tr>
    `;
  });
  
  html += `</tbody></table>
    <div style="margin-top:20px; font-size:18px; font-weight:bold; text-align:center; color:#1A237E; background:#E3F2FD; padding:15px; border-radius:8px;">
      TOTAL : <span id="total-note-affiche">0</span> / <span id="total-bareme-affiche">${bareme.reduce((s, b) => s + b.max, 0)}</span>
    </div>
  `;
  
  $('#n-bareme').innerHTML = html;
  calculerTotalNote();
}

function calculerTotalNote() {
  const inputs = document.querySelectorAll('.note-input');
  let total = 0;
  inputs.forEach(input => {
    total += parseInt(input.value) || 0;
  });
  document.getElementById('total-note-affiche').textContent = total;
}

async function enregistrerNote() {
  const etudiant_id = parseInt($('#n-etudiant').value);
  const type_examen = $('#n-type').value;
  const inputs = document.querySelectorAll('.note-input');
  
  if (inputs.length === 0) return alert('Veuillez sélectionner un élève.');
  
  let total = 0;
  let detail = {};
  let criteresDetail = [];
  
  inputs.forEach((input, index) => {
    const val = parseInt(input.value) || 0;
    total += val;
    detail['critere_' + index] = val;
    const nomCritere = input.closest('tr').querySelector('td').textContent;
    criteresDetail.push({ nom: nomCritere, note: val, max: input.dataset.max });
  });

  if (total === 0) return alert('Veuillez saisir au moins une note.');

  try {
    const r = await api('/api/notes', 'POST', { etudiant_id, detail, total, type_examen });
    
    let mentionColor = r.passe_niveau ? '#2E7D32' : '#C62828';
    let mentionText = r.passe_niveau ? '✅ Admis au niveau supérieur' : '⚠️ Repêchage nécessaire';
    
    $('#note-result').innerHTML = `
      <div class="card" style="background:#E3F2FD; border:1px solid #BBDEFB;">
        <h3 style="color:#1A237E;">Résultat de l'examen</h3>
        <p style="font-size:16px;"><strong>Total :</strong> ${r.total} / 100</p>
        <p style="font-size:16px;"><strong>Mention :</strong> ${r.appreciation}</p>
        <p style="font-size:16px; color:${mentionColor}; font-weight:bold;">${mentionText}</p>
        
        <button onclick="telechargerResultatPDF(${etudiant_id}, '${criteresDetail.map(c => c.nom + '|' + c.note + '|' + c.max).join(';')}', ${r.total}, '${r.appreciation}')" 
          style="margin-top:20px; padding:12px 20px; background:#2E7D32; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer; width:100%;">
          📄 Voir / Télécharger le résultat (PDF)
        </button>
      </div>`;
      
    await chargerEtudiants();
    $('#n-bareme').innerHTML = '';
  } catch (e) { alert(e.message); }
}

function telechargerResultatPDF(etudiant_id, criteresStr, total, appreciation) {
  const eleve = listeEleves.find(e => e.id === etudiant_id);
  if (!eleve) return alert('Élève introuvable.');
  
  const criteres = criteresStr.split(';').map(c => {
    const parts = c.split('|');
    return { nom: parts[0], note: parts[1], max: parts[2] };
  });
  
  const dateNow = new Date().toLocaleString('fr-FR', { timeZone: 'Indian/Antananarivo' });
  
  let lignesTableau = '';
  criteres.forEach(c => {
    lignesTableau += `
      <tr>
        <td style="padding:10px; border-bottom:1px solid #ddd;">${c.nom}</td>
        <td style="padding:10px; border-bottom:1px solid #ddd; text-align:center;">${c.max}</td>
        <td style="padding:10px; border-bottom:1px solid #ddd; text-align:center; font-weight:bold;">${c.note}</td>
      </tr>
    `;
  });

  const html = `
    <html>
    <head>
      <title>Résultat Examen - ${eleve.nom}</title>
      <style>
        @media print { @page { size: A4; margin: 20mm; } body { padding: 0; } .no-print { display: none !important; } }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; max-width: 800px; margin: 0 auto; color: #333; }
        .header { text-align: center; border-bottom: 3px solid #1A237E; padding-bottom: 20px; margin-bottom: 30px; }
        .header img { width: 80px; height: 80px; border-radius: 50%; }
        .header h1 { color: #1A237E; margin: 10px 0; font-size: 24px; }
        .header p { color: #666; margin: 0; font-size: 14px; }
        .info-eleve { background: #f4f6f8; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 5px solid #1A237E; }
        .info-eleve p { margin: 5px 0; font-size: 15px; }
        .info-eleve strong { color: #1A237E; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: #1A237E; color: white; padding: 12px; text-align: left; }
        .total-box { background: #E8F5E9; border: 2px solid #2E7D32; padding: 20px; border-radius: 8px; text-align: center; margin-top: 20px; }
        .total-box h2 { color: #2E7D32; margin: 0; font-size: 28px; }
        .total-box p { color: #2E7D32; font-weight: bold; font-size: 18px; margin-top: 10px; }
        .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
        .btn-print { display: block; width: 100%; padding: 15px; margin-top: 30px; background: #2E7D32; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="/logo.png" alt="Logo UTP">
        <h1>UTP MADAGASCAR</h1>
        <p>Fiche de Résultat d'Examen</p>
      </div>
      
      <div class="info-eleve">
        <p><strong>Élève :</strong> ${eleve.nom} ${eleve.prenom}</p>
        <p><strong>ID :</strong> ${eleve.utp_id}</p>
        <p><strong>Centre :</strong> ${eleve.centre_nom}</p>
        <p><strong>Matière :</strong> ${eleve.matiere} (${eleve.niveau})</p>
        <p><strong>Date :</strong> ${dateNow}</p>
      </div>
      
      <table>
        <thead>
          <tr><th>Épreuve / Critère</th><th style="text-align:center;">Barème</th><th style="text-align:center;">Note obtenue</th></tr>
        </thead>
        <tbody>
          ${lignesTableau}
        </tbody>
      </table>
      
      <div class="total-box">
        <h2>TOTAL : ${total} / 100</h2>
        <p>MENTION : ${appreciation}</p>
      </div>
      
      <div class="footer">
        <p>Ce document est généré automatiquement par l'application UTP Madagascar.</p>
      </div>
      
      <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>
    </body>
    </html>
  `;
  
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}

// --- COMMANDER DES LIVRES ---
function genererTableauLivres() {
  const tbody = document.getElementById('tbody-commande-livres');
  if (!tbody) return;

  const combinaisons = [
    { matiere: 'Anglais', niveaux: ['L1', 'L2', 'L3', 'L4'] },
    { matiere: 'Français', niveaux: ['L1', 'L2', 'L3', 'L4'] },
    { matiere: 'Allemand', niveaux: ['A1', 'A2', 'B1', 'B2'] },
    { matiere: 'Chinois', niveaux: ['HSK 1', 'HSK 2', 'HSK 3', 'HSK 4'] }
  ];

  let html = '';
  combinaisons.forEach(c => {
    c.niveaux.forEach(n => {
      html += `
        <tr>
          <td style="padding:10px; border-bottom:1px solid #eee;">${c.matiere} - ${n}</td>
          <td style="padding:10px; border-bottom:1px solid #eee; text-align:center;">
            <input type="number" class="livre-input" data-matiere="${c.matiere}" data-niveau="${n}" min="0" value="0" oninput="calculerTotalLivres()" style="width:80px; padding:8px; border:1px solid #ccc; border-radius:4px; text-align:center;" />
          </td>
        </tr>
      `;
    });
  });

  tbody.innerHTML = html;
}

function calculerTotalLivres() {
  const inputs = document.querySelectorAll('.livre-input');
  let totalLivres = 0;
  inputs.forEach(input => {
    totalLivres += parseInt(input.value) || 0;
  });
  
  document.getElementById('total-livres-affiche').textContent = totalLivres;
  document.getElementById('total-montant-affiche').textContent = (totalLivres * 20000).toLocaleString() + ' Ar';
}

async function commanderLivres() {
  const inputs = document.querySelectorAll('.livre-input');
  const detail_livres = [];
  let totalLivres = 0;

  inputs.forEach(input => {
    const nombre = parseInt(input.value) || 0;
    if (nombre > 0) {
      detail_livres.push({
        matiere: input.dataset.matiere,
        niveau: input.dataset.niveau,
        nombre: nombre
      });
      totalLivres += nombre;
    }
  });

  if (totalLivres === 0) return alert('Veuillez commander au moins un livre.');
  
  const centre_id = parseInt($('#e-centre').value);

  try {
    const r = await api('/api/livres/commander', 'POST', { detail_livres, centre_id });
    alert(`✅ Commande envoyée à la Direction !\n${totalLivres} livres = ${r.montant_total.toLocaleString()} Ar\n\nCet argent a été déduit de votre caisse.`);
    
    document.querySelectorAll('.livre-input').forEach(input => input.value = 0);
    calculerTotalLivres();
  } catch (e) { alert(e.message); }
}

// --- DÉPENSES ---
async function ajouterDepense() {
  const libelle = document.getElementById('d-libelle').value.trim();
  const montant = parseInt(document.getElementById('d-montant').value) || 0;
  
  if (!libelle || !montant) {
    return alert('⚠️ Veuillez remplir le libellé et le montant.');
  }
  
  const centre_id = parseInt($('#e-centre').value);
  
  try {
    await api('/api/depenses', 'POST', { libelle, montant, centre_id });
    alert('✅ Dépense enregistrée avec succès !');
    document.getElementById('d-libelle').value = '';
    document.getElementById('d-montant').value = '';
    await chargerDashboard();
  } catch (e) { alert('Erreur : ' + e.message); }
}

// --- TABLEAU DE BORD RESPONSABLE ---
async function chargerDashboard() {
  try {
    const stats = await api('/api/responsable/stats');
    const mouvements = await api('/api/responsable/rapport-comptable');
    
    let html = `
      <div style="display:flex; gap:15px; margin-bottom:20px; flex-wrap:wrap;">
        <div class="card" style="flex:1; min-width:200px; background:#E8F5E9; border-left:5px solid #2E7D32;">
          <h3 style="color:#2E7D32; border:none; margin-bottom:5px;">Recettes</h3>
          <div style="font-size:24px; font-weight:900; color:#2E7D32;">+${stats.totalRecettes.toLocaleString()} Ar</div>
        </div>
        <div class="card" style="flex:1; min-width:200px; background:#FFEBEE; border-left:5px solid #C62828;">
          <h3 style="color:#C62828; border:none; margin-bottom:5px;">Dépenses</h3>
          <div style="font-size:24px; font-weight:900; color:#C62828;">-${stats.totalDepenses.toLocaleString()} Ar</div>
        </div>
        <div class="card" style="flex:1; min-width:200px; background:#E3F2FD; border-left:5px solid #1565C0;">
          <h3 style="color:#1565C0; border:none; margin-bottom:5px;">Solde Total</h3>
          <div style="font-size:24px; font-weight:900; color:#1565C0;">${stats.solde.toLocaleString()} Ar</div>
        </div>
      </div>
      
      <!-- BOUTON DE TÉLÉCHARGEMENT PDF -->
      <div style="text-align:right; margin-bottom:20px;">
        <button onclick="telechargerRapportFinancierPDF()" style="padding:12px 20px; background:#1A237E; color:white; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">
          🖨️ Télécharger le rapport (PDF)
        </button>
      </div>
      
      <h3>Détail par centre :</h3>
      <table style="margin-top:10px; margin-bottom: 30px;">
        <thead><tr><th>Centre</th><th>Recettes</th><th>Dépenses</th><th>Solde</th></tr></thead>
        <tbody>
    `;
    
    stats.detailCentres.forEach(c => {
      let color = c.solde >= 0 ? '#2E7D32' : '#C62828';
      html += `
        <tr>
          <td><strong>${c.nom}</strong></td>
          <td style="color:#2E7D32;">+${c.recettes.toLocaleString()} Ar</td>
          <td style="color:#C62828;">-${c.depenses.toLocaleString()} Ar</td>
          <td style="color:${color}; font-weight:bold;">${c.solde.toLocaleString()} Ar</td>
        </tr>
      `;
    });
    
    html += `</tbody></table>`;

    html += `<h3>📊 Journal des Mouvements Financiers</h3>`;
    html += `<table style="margin-top:10px;">
      <thead><tr><th>Date</th><th>Type</th><th>Centre</th><th>Libellé</th><th>Montant</th></tr></thead>
      <tbody>`;
      
    if (mouvements.length === 0) {
      html += `<tr><td colspan="5" style="text-align:center;">Aucun mouvement enregistré.</td></tr>`;
    } else {
      mouvements.forEach(m => {
        let color = m.type === 'Recette' ? '#2E7D32' : '#C62828';
        let signe = m.type === 'Recette' ? '+' : '-';
        let icon = m.type === 'Recette' ? '🟢' : '🔴';
        
        html += `
          <tr>
            <td>${new Date(m.date).toLocaleDateString('fr-FR')}</td>
            <td>${icon} ${m.type}</td>
            <td>${m.centre_nom}</td>
            <td>${m.libelle}</td>
            <td style="color:${color}; font-weight:bold;">${signe}${m.montant.toLocaleString()} Ar</td>
          </tr>
        `;
      });
    }
    html += `</tbody></table>`;
    
    document.getElementById('dashboard-content').innerHTML = html;
  } catch (e) {
    document.getElementById('dashboard-content').innerHTML = `<p style="color:red;">Erreur : ${e.message}</p>`;
  }
}

// --- GÉNÉRATION DU PDF DU RAPPORT FINANCIER ---
async function telechargerRapportFinancierPDF() {
  try {
    const stats = await api('/api/responsable/stats');
    const mouvements = await api('/api/responsable/rapport-comptable');
    
    const dateNow = new Date().toLocaleString('fr-FR', { timeZone: 'Indian/Antananarivo' });
    
    let lignesCentres = '';
    stats.detailCentres.forEach(c => {
      let color = c.solde >= 0 ? '#2E7D32' : '#C62828';
      lignesCentres += `
        <tr>
          <td style="padding:10px; border-bottom:1px solid #ddd;">${c.nom}</td>
          <td style="padding:10px; border-bottom:1px solid #ddd; color:#2E7D32;">+${c.recettes.toLocaleString()} Ar</td>
          <td style="padding:10px; border-bottom:1px solid #ddd; color:#C62828;">-${c.depenses.toLocaleString()} Ar</td>
          <td style="padding:10px; border-bottom:1px solid #ddd; color:${color}; font-weight:bold;">${c.solde.toLocaleString()} Ar</td>
        </tr>
      `;
    });

    let lignesMouvements = '';
    mouvements.forEach(m => {
      let color = m.type === 'Recette' ? '#2E7D32' : '#C62828';
      let signe = m.type === 'Recette' ? '+' : '-';
      lignesMouvements += `
        <tr>
          <td style="padding:8px; border-bottom:1px solid #ddd;">${new Date(m.date).toLocaleDateString('fr-FR')}</td>
          <td style="padding:8px; border-bottom:1px solid #ddd;">${m.type}</td>
          <td style="padding:8px; border-bottom:1px solid #ddd;">${m.centre_nom}</td>
          <td style="padding:8px; border-bottom:1px solid #ddd;">${m.libelle}</td>
          <td style="padding:8px; border-bottom:1px solid #ddd; color:${color}; font-weight:bold;">${signe}${m.montant.toLocaleString()} Ar</td>
        </tr>
      `;
    });

    const html = `
      <html>
      <head>
        <title>Rapport Financier - UTP</title>
        <style>
          @media print { @page { size: A4; margin: 15mm; } body { padding: 0; } .no-print { display: none !important; } }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; max-width: 1000px; margin: 0 auto; color: #333; }
          .header { text-align: center; border-bottom: 3px solid #1A237E; padding-bottom: 20px; margin-bottom: 30px; }
          .header img { width: 80px; height: 80px; border-radius: 50%; }
          .header h1 { color: #1A237E; margin: 10px 0; font-size: 24px; }
          .header p { color: #666; margin: 0; font-size: 14px; }
          .stats-box { display: flex; justify-content: space-between; margin-bottom: 30px; gap: 15px; }
          .stat-card { flex: 1; padding: 20px; border-radius: 8px; text-align: center; }
          .stat-card h3 { margin: 0 0 10px 0; font-size: 14px; text-transform: uppercase; }
          .stat-card .value { font-size: 24px; font-weight: bold; }
          .green { background: #E8F5E9; color: #2E7D32; border: 1px solid #C8E6C9; }
          .red { background: #FFEBEE; color: #C62828; border: 1px solid #FFCDD2; }
          .blue { background: #E3F2FD; color: #1565C0; border: 1px solid #BBDEFB; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 13px; }
          th { background: #1A237E; color: white; padding: 12px; text-align: left; }
          .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
          .btn-print { display: block; width: 100%; padding: 15px; margin-top: 30px; background: #1A237E; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; cursor: pointer; }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="/logo.png" alt="Logo UTP">
          <h1>UTP MADAGASCAR</h1>
          <p>Rapport d'État Financier</p>
          <p>Généré le : ${dateNow}</p>
        </div>
        
        <div class="stats-box">
          <div class="stat-card green"><h3>Total Recettes</h3><div class="value">+${stats.totalRecettes.toLocaleString()} Ar</div></div>
          <div class="stat-card red"><h3>Total Dépenses</h3><div class="value">-${stats.totalDepenses.toLocaleString()} Ar</div></div>
          <div class="stat-card blue"><h3>Solde Global</h3><div class="value">${stats.solde.toLocaleString()} Ar</div></div>
        </div>

        <h3>Détail par Centre</h3>
        <table>
          <thead><tr><th>Centre</th><th>Recettes</th><th>Dépenses</th><th>Solde</th></tr></thead>
          <tbody>${lignesCentres}</tbody>
        </table>

        <h3>Journal des Mouvements</h3>
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Centre</th><th>Libellé</th><th>Montant</th></tr></thead>
          <tbody>${lignesMouvements}</tbody>
        </table>
        
        <div class="footer">
          <p>Ce document est généré automatiquement par l'application UTP Madagascar.</p>
        </div>
        
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>
      </body>
      </html>
    `;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
  } catch (e) { alert('Erreur : ' + e.message); }
}
