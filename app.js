      <!-- Onglet Paiements -->
      <div id="tab-paiements" class="tab">
        <h2>Enregistrer un paiement</h2>
        <div class="card">
          <select id="p-etudiant" style="width:100%; margin-bottom:10px;"></select>
          
          <!-- NOUVEAU CHAMP : Montant Total de la Formation -->
          <label style="font-size:12px; font-weight:bold; color:#333;">Montant total de la formation (Ar)</label>
          <input id="p-total" type="number" value="50000" placeholder="Montant total" style="width:100%; margin-bottom:10px;" oninput="calculerReste()" />
          
          <!-- CHAMP MODIFIÉ : Montant versé maintenant -->
          <label style="font-size:12px; font-weight:bold; color:#333;">Montant versé maintenant (Ar)</label>
          <input id="p-montant" type="number" placeholder="Montant versé" style="width:100%; margin-bottom:10px;" oninput="calculerReste()" />
          
          <!-- NOUVEAU CHAMP : Reste à payer (lecture seule) -->
          <label style="font-size:12px; font-weight:bold; color:#333;">Reste à payer (Ar)</label>
          <input id="p-reste" type="text" readonly placeholder="Reste à payer" style="width:100%; margin-bottom:10px; background:#eee; font-weight:bold; color:#C62828;" />

          <select id="p-tranche" style="width:100%; margin-bottom:10px;">
            <option value="total">Total</option>
            <option value="tranche1">Tranche 1</option>
            <option value="tranche2">Tranche 2</option>
          </select>
          <select id="p-mode" style="width:100%; margin-bottom:10px;" onchange="toggleReference()">
            <option value="Espèce">Espèce</option>
            <option value="Mobile Money">Mobile Money</option>
            <option value="Virement">Virement</option>
            <option value="Chèque">Chèque</option>
          </select>
          <input id="p-reference" type="text" placeholder="Référence (N° transaction)" style="width:100%; margin-bottom:10px; display:none;" />
          
          <button onclick="ajouterPaiement()">Enregistrer et générer le ticket</button>
        </div>
        <div id="ticket-result"></div>
      </div>
