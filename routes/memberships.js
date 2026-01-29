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

// 2. Membresías YA VENCIDAS (Estado VENCIDO)
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

// 3. BÚSQUEDA AVANZADA (FILTROS OPTIMIZADOS)
router.get('/filter', (req, res) => {
    const { paymentMethod, ingresoStart, ingresoEnd, pagoStart, pagoEnd } = req.query;

    let sql = "SELECT * FROM Users WHERE 1=1";
    const params = [];

    // Filtro Método de Pago
    if (paymentMethod && paymentMethod !== 'all') {
        sql += " AND METODO_PAGO = ?";
        params.push(paymentMethod);
    }

    // Filtro Fecha Ingreso
    if (ingresoStart) {
        sql += " AND F_INGRESO >= ?";
        params.push(ingresoStart);
    }
    if (ingresoEnd) {
        sql += " AND F_INGRESO <= ?";
        params.push(ingresoEnd);
    }

    // Filtro Fecha Pago
    if (pagoStart) {
        sql += " AND FECHA_PAGO >= ?";
        params.push(pagoStart);
    }
    if (pagoEnd) {
        sql += " AND FECHA_PAGO <= ?";
        params.push(pagoEnd);
    }

    // Ordenar por fecha de ingreso reciente y limitar a 100 para no bloquear el navegador
    sql += " ORDER BY F_INGRESO DESC LIMIT 100";

    db.query(sql, params, (err, results) => {
        if (err) {
            console.error("Error filtrando:", err);
            return res.status(500).json({ error: 'Error en base de datos' });
        }
        res.json(results);
    });
});

module.exports = router;