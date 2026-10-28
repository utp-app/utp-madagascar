let session = null;
let centres = [];
let matieres = {};

const $ = (sel) => document.querySelector(sel);

async function api(path, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (session) headers['x-code-acces'] = session.utilisateur.code_acces;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Erreur');
  return r.json();
}

async function login() {
  const code = $('#code-input').value.trim();
  try {
    const data = await api('/api/login', 'POST', { code });
    session = data;
    sessionStorage.setItem('utp_code', code);
    
    $('#login-screen').classList.remove('active');
    $('#main-screen').classList.add('active');
    $('#user-info').textContent = `${session.utilisateur.nom} (${session.utilisateur.role})`;
    
    // AFFICHAGE SÉCURISÉ SELON LE RÔLE
    if (session.utilisateur.role === 'admin') {
      $('#btn-admin').style.display = 'inline-block';
    } 
    else if (session.utilisateur.role === 'direction') {
      $('#btn-direction').style.display = 'inline-block';
    } 
    else {
      $('#interface-responsable').style.display = 'block';
      await init(); // Chargement des données uniquement pour le responsable
    }
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
  $('#tab-' + name).classList.add('active');
}

function toggleReference() {
  var mode = document.getElementById('p-mode').value;
  var refInput = document.getElementById('p-reference');
  refInput.style.display = (mode === 'Mobile Money' || mode === 'Chèque') ? 'block' : 'none';
}

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

  const matSel = $('#e-matiere');
  if (matSel) {
    matSel.innerHTML = Object.keys(matieres).map(m => `<option>${m}</option>`).join('');
    matSel.onchange = () => majNiveaux();
    majNiveaux();
  }

  await chargerEtudiants();
}

function majNiveaux() {
  const mat = $('#e-matiere').value;
  $('#e-niveau').innerHTML = (matieres[mat] || []).map(n => `<option>${n}</option>`).join('');
}

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

    const opts = rows.map(e => `<option value="${e.id}">${e.utp_id} – ${e.nom}</option>`).join('');
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
    await chargerEtudiants();
  } catch (e) { alert(e.message); }
}

async function ajouterPaiement() {
  const etudiant_id = parseInt($('#p-etudiant').value);
  const montant = parseInt($('#p-montant').value);
  const tranche = $('#p-tranche').value;
  const mode_paiement = $('#p-mode').value;
  const reference = $('#p-reference').value;

  if (!etudiant_id || !montant) return alert('Champs manquants');
  
  try {
    const r = await api('/api/paiements', 'POST', { etudiant_id, montant, tranche, mode_paiement, reference });
    
    // Génération du ticket
    const eleve = await api('/api/etudiants').then(rows => rows.find(e => e.id === etudiant_id));
    const ticketHTML = `
      <html><head><style>
        @media print { @page { size: 80mm auto; margin: 0; } body { width: 80mm; margin: 0; padding: 10px; } }
        body { font-family: monospace; font-size: 12px; width: 300px; margin: 0 auto; padding: 15px; }
        .text-center { text-align: center; } .divider { border-top: 1px dashed #000; margin: 10px 0; }
        .row { display: flex; justify-content: space-between; margin-bottom: 4px; }
        .logo { display: block; margin: 0 auto; width: 70px; height: 70px; border-radius: 50%; }
      </style></head><body>
        <img src="/logo.png" class="logo">
        <div class="text-center" style="font-size:16px; font-weight:bold;">UTP MADAGASCAR</div>
        <div class="text-center" style="font-size:10px;">Centre : ${eleve.centre_nom}</div>
        <div class="divider"></div>
        <div class="row"><span>Ticket :</span> <span>${r.ticket_ref}</span></div>
        <div class="row"><span>Élève :</span> <span>${eleve.nom} ${eleve.prenom}</span></div>
        <div class="row"><span>Mode :</span> <span>${mode_paiement}</span></div>
        <div class="divider"></div>
        <div class="row"><span>Versé :</span> <span>${r.montant.toLocaleString()} Ar</span></div>
        <div class="row"><span>Total :</span> <span>${r.nouveauMontant.toLocaleString()} Ar</span></div>
        <div class="text-center" style="margin-top:20px;">MERCI DE VOTRE CONFIANCE</div>
        <button onclick="window.print()" style="width:100%; padding:10px; margin-top:20px;">🖨️ Imprimer</button>
      </body></html>
    `;
    const win = window.open('', '_blank');
    win.document.write(ticketHTML);
    win.document.close();

    await chargerEtudiants();
  } catch (e) { alert(e.message); }
}
