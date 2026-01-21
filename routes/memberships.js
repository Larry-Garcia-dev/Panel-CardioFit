// routes/memberships.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 1. Membresías por vencer (Próximos 10 días, ESTADO ACTIVO)
router.get('/expiring', (req, res) => {
    const sql = `
        SELECT *, DATEDIFF(F_VENCIMIENTO, CURDATE()) as dias_restantes 
        FROM Users 
        WHERE ESTADO = 'ACTIVO' 
        AND F_VENCIMIENTO BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 10 DAY)
        ORDER BY F_VENCIMIENTO ASC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: 'Error DB' });
        res.json(results);
    });
});

// 2. NUEVO: Membresías YA VENCIDAS (Estado VENCIDO)
router.get('/expired', (req, res) => {
    const sql = `
        SELECT *, DATEDIFF(CURDATE(), F_VENCIMIENTO) as dias_vencido
        FROM Users 
        WHERE ESTADO = 'VENCIDO'
        ORDER BY F_VENCIMIENTO DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: 'Error DB' });
        res.json(results);
    });
});

// 3. Todos los usuarios
router.get('/all', (req, res) => {
    const sql = 'SELECT * FROM Users ORDER BY USUARIO ASC';
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: 'Error DB' });
        res.json(results);
    });
});

module.exports = router;