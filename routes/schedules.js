// routes/schedules.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Helper para promisificar queries
const query = (sql, params) => {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
};

// 1. Obtener todos los horarios con información del entrenador
router.get('/all', async (req, res) => {
    try {
        const sql = `
            SELECT 
                ws.id,
                ws.staff_id,
                ws.day_of_week,
                ws.start_time,
                ws.end_time,
                ws.max_capacity,
                s.name as staff_name,
                s.role as staff_role,
                s.is_active as staff_active
            FROM WeeklySchedules ws
            JOIN Staff s ON ws.staff_id = s.id
            ORDER BY s.name ASC, ws.day_of_week ASC, ws.start_time ASC
        `;
        const results = await query(sql, []);
        res.json(results);
    } catch (err) {
        console.error('Error obteniendo horarios:', err);
        res.status(500).json({ error: 'Error obteniendo horarios' });
    }
});

// 2. Obtener horarios de un entrenador específico
router.get('/staff/:staffId', async (req, res) => {
    try {
        const sql = `
            SELECT 
                ws.id,
                ws.staff_id,
                ws.day_of_week,
                ws.start_time,
                ws.end_time,
                ws.max_capacity,
                s.name as staff_name,
                s.role as staff_role
            FROM WeeklySchedules ws
            JOIN Staff s ON ws.staff_id = s.id
            WHERE ws.staff_id = ?
            ORDER BY ws.day_of_week ASC, ws.start_time ASC
        `;
        const results = await query(sql, [req.params.staffId]);
        res.json(results);
    } catch (err) {
        console.error('Error obteniendo horarios del staff:', err);
        res.status(500).json({ error: 'Error obteniendo horarios' });
    }
});

// 3. Obtener lista de Staff para el selector
router.get('/staff-list', async (req, res) => {
    try {
        const sql = 'SELECT id, name, role, is_active FROM Staff ORDER BY name ASC';
        const results = await query(sql, []);
        res.json(results);
    } catch (err) {
        console.error('Error obteniendo staff:', err);
        res.status(500).json({ error: 'Error obteniendo staff' });
    }
});

// 4. Crear nuevo horario
router.post('/create', async (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'No autorizado' });
    }

    const { staff_id, day_of_week, start_time, end_time, max_capacity } = req.body;

    if (!staff_id || day_of_week === undefined || !start_time || !end_time) {
        return res.status(400).json({ success: false, message: 'Faltan campos requeridos' });
    }

    try {
        // Verificar si ya existe un horario que se superponga
        const checkSql = `
            SELECT id FROM WeeklySchedules 
            WHERE staff_id = ? AND day_of_week = ?
            AND (
                (start_time <= ? AND end_time > ?) OR
                (start_time < ? AND end_time >= ?) OR
                (start_time >= ? AND end_time <= ?)
            )
        `;
        const existing = await query(checkSql, [
            staff_id, day_of_week,
            start_time, start_time,
            end_time, end_time,
            start_time, end_time
        ]);

        if (existing.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Ya existe un horario que se superpone para este entrenador en este día' 
            });
        }

        const insertSql = `
            INSERT INTO WeeklySchedules (staff_id, day_of_week, start_time, end_time, max_capacity)
            VALUES (?, ?, ?, ?, ?)
        `;
        await query(insertSql, [staff_id, day_of_week, start_time, end_time, max_capacity || 5]);
        
        res.json({ success: true, message: 'Horario creado exitosamente' });
    } catch (err) {
        console.error('Error creando horario:', err);
        res.status(500).json({ success: false, message: 'Error creando horario' });
    }
});

// 5. Actualizar horario
router.put('/:id', async (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'No autorizado' });
    }

    const { id } = req.params;
    const { staff_id, day_of_week, start_time, end_time, max_capacity } = req.body;

    try {
        // Verificar superposición con otros horarios (excluyendo el actual)
        const checkSql = `
            SELECT id FROM WeeklySchedules 
            WHERE staff_id = ? AND day_of_week = ? AND id != ?
            AND (
                (start_time <= ? AND end_time > ?) OR
                (start_time < ? AND end_time >= ?) OR
                (start_time >= ? AND end_time <= ?)
            )
        `;
        const existing = await query(checkSql, [
            staff_id, day_of_week, id,
            start_time, start_time,
            end_time, end_time,
            start_time, end_time
        ]);

        if (existing.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'El nuevo horario se superpone con otro existente' 
            });
        }

        const updateSql = `
            UPDATE WeeklySchedules 
            SET staff_id = ?, day_of_week = ?, start_time = ?, end_time = ?, max_capacity = ?
            WHERE id = ?
        `;
        await query(updateSql, [staff_id, day_of_week, start_time, end_time, max_capacity || 5, id]);
        
        res.json({ success: true, message: 'Horario actualizado exitosamente' });
    } catch (err) {
        console.error('Error actualizando horario:', err);
        res.status(500).json({ success: false, message: 'Error actualizando horario' });
    }
});

// 6. Eliminar horario
router.delete('/:id', async (req, res) => {
    if (!req.session.loggedin || req.session.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'No autorizado' });
    }

    const { id } = req.params;

    try {
        const deleteSql = 'DELETE FROM WeeklySchedules WHERE id = ?';
        await query(deleteSql, [id]);
        
        res.json({ success: true, message: 'Horario eliminado exitosamente' });
    } catch (err) {
        console.error('Error eliminando horario:', err);
        res.status(500).json({ success: false, message: 'Error eliminando horario' });
    }
});

module.exports = router;
