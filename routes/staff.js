// routes/staff.js
const express = require('express');
const router = express.Router();

// IMPORTANTE: Conexión compartida
const db = require('../config/db');

// 1. Obtener lista de Staff (incluyendo inactivos para gestión)
router.get('/all', (req, res) => {
    const sql = 'SELECT * FROM Staff ORDER BY priority_order ASC';
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: 'Error db' });
        res.json(results);
    });
});

// 2. Crear Nuevo Staff (Solo Admin)
router.post('/create', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'No autorizado' });
    }

    const { name, email, password, role, priority_order } = req.body;
    const sql = 'INSERT INTO Staff (name, email, password, role, priority_order, is_active) VALUES (?, ?, ?, ?, ?, 1)';

    db.query(sql, [name, email, password, role, priority_order], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: 'Error creando staff (Email duplicado?)' });
        }
        res.json({ success: true, message: 'Miembro del staff creado exitosamente' });
    });
});

// 3. Actualizar Staff (Bloquear/Desbloquear o Cambiar Password)
router.put('/:id', (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'No autorizado' });
    }

    const id = req.params.id;
    const { name, email, role, is_active, password } = req.body;

    let sql = 'UPDATE Staff SET name=?, email=?, role=?, is_active=? WHERE id=?';
    let params = [name, email, role, is_active, id];

    // Si el admin envía una contraseña nueva, la actualizamos. Si no, la dejamos igual.
    if (password && password.trim() !== '') {
        sql = 'UPDATE Staff SET name=?, email=?, role=?, is_active=?, password=? WHERE id=?';
        params = [name, email, role, is_active, password, id];
    }

    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Error actualizando' });
        res.json({ success: true, message: 'Datos actualizados correctamente' });
    });
});

module.exports = router;