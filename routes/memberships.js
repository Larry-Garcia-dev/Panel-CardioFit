// routes/memberships.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 1. Membresías por vencer (Próximos 10 días)
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

// 2. Membresías YA VENCIDAS
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

// 3. BÚSQUEDA AVANZADA CON PAGINACIÓN
router.get('/filter', (req, res) => {
    const { 
        paymentMethod, 
        ingresoStart, ingresoEnd, 
        pagoStart, pagoEnd, 
        registroStart, registroEnd,
        page, limit 
    } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50; 
    const offset = (pageNum - 1) * limitNum;

    let sqlWhere = " FROM Users WHERE 1=1";
    const params = [];

    // Filtros
    if (paymentMethod && paymentMethod !== 'all') { sqlWhere += " AND METODO_PAGO = ?"; params.push(paymentMethod); }
    if (ingresoStart) { sqlWhere += " AND F_INGRESO >= ?"; params.push(ingresoStart); }
    if (ingresoEnd) { sqlWhere += " AND F_INGRESO <= ?"; params.push(ingresoEnd); }
    if (pagoStart) { sqlWhere += " AND FECHA_PAGO >= ?"; params.push(pagoStart); }
    if (pagoEnd) { sqlWhere += " AND FECHA_PAGO <= ?"; params.push(pagoEnd); }
    if (registroStart) { sqlWhere += " AND DATE(FECHA_REGISTRO) >= ?"; params.push(registroStart); }
    if (registroEnd) { sqlWhere += " AND DATE(FECHA_REGISTRO) <= ?"; params.push(registroEnd); }

    // Query 1: Contar
    const countSql = "SELECT COUNT(*) as total" + sqlWhere;

    db.query(countSql, params, (err, countResult) => {
        if (err) return res.status(500).json({ error: 'Error en base de datos' });

        const totalRecords = countResult[0].total;

        // Query 2: Datos Paginados
        const dataSql = "SELECT *" + sqlWhere + " ORDER BY id DESC LIMIT ? OFFSET ?";
        const dataParams = [...params, limitNum, offset];

        db.query(dataSql, dataParams, (err, users) => {
            if (err) return res.status(500).json({ error: 'Error en base de datos' });

            res.json({
                data: users,
                total: totalRecords,
                page: pageNum,
                totalPages: Math.ceil(totalRecords / limitNum)
            });
        });
    });
});

// 4. NUEVA RUTA: EXPORTAR A EXCEL (SIN PAGINACIÓN)
router.get('/export', (req, res) => {
    const { 
        paymentMethod, 
        ingresoStart, ingresoEnd, 
        pagoStart, pagoEnd, 
        registroStart, registroEnd 
    } = req.query;

    let sqlWhere = " FROM Users WHERE 1=1";
    const params = [];

    // Reutilizamos la misma lógica de filtros
    if (paymentMethod && paymentMethod !== 'all') { sqlWhere += " AND METODO_PAGO = ?"; params.push(paymentMethod); }
    if (ingresoStart) { sqlWhere += " AND F_INGRESO >= ?"; params.push(ingresoStart); }
    if (ingresoEnd) { sqlWhere += " AND F_INGRESO <= ?"; params.push(ingresoEnd); }
    if (pagoStart) { sqlWhere += " AND FECHA_PAGO >= ?"; params.push(pagoStart); }
    if (pagoEnd) { sqlWhere += " AND FECHA_PAGO <= ?"; params.push(pagoEnd); }
    if (registroStart) { sqlWhere += " AND DATE(FECHA_REGISTRO) >= ?"; params.push(registroStart); }
    if (registroEnd) { sqlWhere += " AND DATE(FECHA_REGISTRO) <= ?"; params.push(registroEnd); }

    // Traemos TODOS los datos (sin LIMIT)
    const dataSql = "SELECT * " + sqlWhere + " ORDER BY id DESC";

    db.query(dataSql, params, (err, users) => {
        if (err) {
            console.error("Error exportando:", err);
            return res.status(500).json({ error: 'Error al exportar' });
        }
        res.json(users);
    });
});

module.exports = router;