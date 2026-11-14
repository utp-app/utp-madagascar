const postgres = require('postgres');

// On récupère l'URL de connexion depuis les variables d'environnement de Render
const connectionString = process.env.DATABASE_URL;

// On crée la connexion avec les options recommandées par Supabase
// prepare: false est très important pour éviter les erreurs avec le "Transaction Pooler"
const sql = postgres(connectionString, { 
    prepare: false,
    ssl: 'require' 
});

// On exporte la connexion pour l'utiliser dans le reste de l'application (server.js, etc.)
module.exports = sql;
