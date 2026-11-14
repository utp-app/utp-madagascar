const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const sql = require('./db'); // Connexion PostgreSQL (Supabase)

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'votre_cle_secrete_utp_2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware d'authentification
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// Route de connexion
app.post('/api/login', async (req, res) => {
    const { code_acces } = req.body;
    try {
        // Requête vers la table 'responsables' de Supabase
        const result = await sql`SELECT * FROM responsables WHERE code_acces = ${code_acces}`;
        
        if (result.length === 0) {
            return res.status(401).json({ error: 'Code d\'accès incorrect' });
        }
        
        const user = result[0];
        const token = jwt.sign(
            { id: user.id, nom: user.nom, code: user.code_acces }, 
            JWT_SECRET, 
            { expiresIn: '8h' }
        );
        res.json({ 
            token, 
            user: { nom: user.nom, code: user.code_acces } 
        });
    } catch (err) {
        console.error("Erreur de connexion:", err);
        res.status(500).json({ error: 'Erreur serveur lors de la connexion' });
    }
});

// Routes pour les élèves
app.get('/api/eleves', authenticateToken, async (req, res) => {
    try {
        const eleves = await sql`SELECT * FROM eleves ORDER BY id DESC`;
        res.json(eleves);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/eleves', authenticateToken, async (req, res) => {
    const { nom, prenom, telephone, matiere, niveau, centre, date_entree } = req.body;
    try {
        const result = await sql`
            INSERT INTO eleves (nom, prenom, telephone, matiere, niveau, centre, date_entree) 
            VALUES (${nom}, ${prenom}, ${telephone}, ${matiere}, ${niveau}, ${centre}, ${date_entree}) 
            RETURNING *
        `;
        res.status(201).json(result[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});
