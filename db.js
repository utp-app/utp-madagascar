const postgres = require('postgres');

// On récupère l'URL depuis Render (variable DATABASE_URL)
const connectionString = process.env.DATABASE_URL;

// Connexion avec les options pour le pooler de Supabase
const sql = postgres(connectionString, { 
    prepare: false,
    ssl: 'require'
});

module.exports = sql;
