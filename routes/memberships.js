// routes/memberships.js
const express = require('express');
const router = express.Router();
const mysql = require('mysql2');

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});

// 1. Obtener membresías que vencen en los próximos 10 días
router.get('/expiring', (req, res) => {
    // Buscamos usuarios ACTIVOS cuya fecha de vencimiento esté entre HOY y HOY+10 días
    const sql = `
        SELECT *, DATEDIFF(F_VENCIMIENTO, CURDATE()) as dias_restantes 
        FROM Users 
        WHERE ESTADO = 'ACTIVO' 
        AND F_VENCIMIENTO BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 10 DAY)
        ORDER BY F_VENCIMIENTO ASC
    `;
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error en base de datos' });
        }
        res.json(results);
    });
});

// 2. Obtener TODOS los usuarios (para la vista completa)
router.get('/all', (req, res) => {
    const sql = 'SELECT * FROM Users ORDER BY USUARIO ASC';
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: 'Error db' });
        res.json(results);
    });
});

module.exports = router;