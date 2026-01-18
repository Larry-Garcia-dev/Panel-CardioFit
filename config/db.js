const mysql = require('mysql2');
require('dotenv').config();

// Usamos createPool en lugar de createConnection.
// Esto crea un "grupo" de conexiones que se gestionan automáticamente.
// Si una se cae, el pool crea otra nueva sin tumbar el servidor.
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10, // Máximo 10 conexiones simultáneas
    queueLimit: 0        // Sin límite en la cola de espera
});

// Manejo de errores global del pool
// Esto evita el famoso error "Unhandled 'error' event" que cierra la app
pool.on('error', (err) => {
    console.error('❌ Error fatal en el Pool de BD:', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.log('🔄 La conexión se perdió. El pool intentará reconectar automáticamente.');
    } else {
        throw err;
    }
});

module.exports = pool;