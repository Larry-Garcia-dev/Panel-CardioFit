// routes/scheduler.js
const express = require('express');
const router = express.Router();
const axios = require('axios'); // Si lo usas para webhooks

// IMPORTANTE: Usamos la conexión compartida (Pool)
const db = require('../config/db');

// URL del Webhook
const WEBHOOK_URL = 'https://n8n.magnificapec.com/webhook/ff5e2454-2c1b-4542-be55-48408d97b4e8-panel';

// 1. OBTENER GRILLA
router.get('/grid', (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const sqlStaff = 'SELECT id, name, role FROM Staff WHERE is_active = 1 ORDER BY priority_order ASC';
    
    // --- CAMBIO AQUÍ: Agregamos a.service_name y u.PLAN ---
    const sqlAppts = `
        SELECT a.id, a.staff_id, a.start_time, a.user_id, a.is_locking, a.service_name,
               u.USUARIO as cliente, u.TELEFONO, u.N_CEDULA, u.ESTADO, u.CORREO_ELECTRONICO, u.PLAN
        FROM Appointments a
        JOIN Users u ON a.user_id = u.id
        WHERE a.appointment_date = ? AND a.status = 'confirmed'
    `;

    db.query(sqlStaff, (err, staffList) => {
        if (err) {
            console.error("❌ Error Staff:", err);
            return res.status(500).json({ error: 'Error DB Staff' });
        }

        db.query(sqlAppts, [date], (err, appointments) => {
            if (err) {
                console.error("❌ Error Citas:", err);
                return res.status(500).json({ error: 'Error DB Citas' });
            }
            res.json({ staff: staffList, appointments: appointments });
        });
    });
});

// 2. AGENDAR CITA (CORREGIDO PARA GUARDAR 1 ó 0)
router.post('/book', (req, res) => {
    const { userId, staffId, date, time, lock } = req.body; 

    // --- CORRECCIÓN CRÍTICA: Detección segura ---
    let isLockingValue = 0;
    if (lock === true || lock === 'true' || lock === 1 || lock === '1') {
        isLockingValue = 1;
    }

    console.log(`\n🔵 INTENTO AGENDAR: Staff ${staffId} | Hora ${time} | Bloquear? ${lock} -> Valor BD: ${isLockingValue}`);

    // Verificar disponibilidad
    const sqlCheck = `
        SELECT is_locking FROM Appointments 
        WHERE staff_id = ? AND appointment_date = ? AND start_time = ? AND status = 'confirmed'
    `;

    db.query(sqlCheck, [staffId, date, time], (err, existingAppts) => {
        if (err) {
            console.error("❌ Error SQL Check:", err);
            return res.status(500).json({ success: false, message: 'Error verificando cupos.' });
        }

        // Verificamos si ya existe algún bloqueo
        const isBlocked = existingAppts.some(a => a.is_locking == 1 || a.is_locking === true);
        const total = existingAppts.length;

        if (isBlocked) {
            console.warn("⛔ DENEGADO: Horario ya estaba bloqueado.");
            return res.json({ success: false, message: '⛔ HORARIO YA BLOQUEADO.' });
        }

        if (total >= 5) {
            console.warn("⛔ DENEGADO: Cupo lleno.");
            return res.json({ success: false, message: '⛔ CUPO LLENO (Máximo 5).' });
        }

        // --- INSERCIÓN ---
        const sqlInsert = `
            INSERT INTO Appointments (user_id, staff_id, appointment_date, start_time, end_time, status, is_locking)
            VALUES (?, ?, ?, ?, ADDTIME(?, '01:00:00'), 'confirmed', ?)
        `;

        db.query(sqlInsert, [userId, staffId, date, time, time, isLockingValue], (err, insertRes) => {
            if (err) {
                console.error("❌ Error INSERT:", err);
                return res.status(500).json({ success: false, message: 'Error guardando cita.' });
            }

            console.log(`✅ Cita guardada ID: ${insertRes.insertId} | is_locking grabado: ${isLockingValue}`);

            // --- WEBHOOK ---
            const sqlInfo = `SELECT u.USUARIO, u.TELEFONO, u.CORREO_ELECTRONICO, s.name, s.role FROM Users u, Staff s WHERE u.id=? AND s.id=?`;
            db.query(sqlInfo, [userId, staffId], (errInfo, infoRes) => {
                if(!errInfo && infoRes.length > 0) {
                    const info = infoRes[0];
                    
                    const webhookData = {
                        "evento": isLockingValue === 1 ? "cita_bloqueada" : "nueva_cita",
                        "cita_id": insertRes.insertId,
                        "fecha": date,
                        "hora": time,
                        "cliente": {
                            "id": String(userId),
                            "nombre": info.USUARIO,
                            "telefono": info.TELEFONO || "",
                            "email": info.CORREO_ELECTRONICO || ""
                        },
                        "staff": {
                            "id": String(staffId),
                            "nombre": info.name,
                            "rol": info.role
                        },
                        "notificacion": isLockingValue === 1 ? "Bloqueo desde Panel" : "Cita desde Panel"
                    };
                    // Enviar webhook
                    axios.post(WEBHOOK_URL, webhookData).catch(e => console.error("⚠️ Webhook Error:", e.message));
                }
            });

            res.json({ 
                success: true, 
                message: isLockingValue === 1 ? '🔒 Horario BLOQUEADO correctamente.' : '✅ Cita agendada.' 
            });
        });
    });
});

// 3. DESBLOQUEAR
router.put('/unlock/:id', (req, res) => {
    db.query("UPDATE Appointments SET is_locking = 0 WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, message: 'Desbloqueado.' });
    });
});

// 4. ELIMINAR (DELETE)
router.delete('/cancel/:id', (req, res) => {
    db.query("DELETE FROM Appointments WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, message: 'Cita eliminada.' });
    });
});

// RUTA: Bloqueo Masivo de una hora específica
router.post('/mass-lock', (req, res) => {
    const { staffId, date, time } = req.body;

    // 1. Intentar actualizar a TODOS los que estén en esa hora
    const sqlUpdate = `
        UPDATE Appointments 
        SET is_locking = 1 
        WHERE staff_id = ? AND appointment_date = ? AND start_time = ? AND status = 'confirmed'
    `;

    db.query(sqlUpdate, [staffId, date, time], (err, result) => {
        if (err) {
            console.error("Error bloqueando masivamente:", err);
            return res.status(500).json({ success: false, message: 'Error en base de datos' });
        }

        // 2. Si se actualizaron filas (había gente), retornamos éxito
        if (result.affectedRows > 0) {
            return res.json({ success: true, updated: result.affectedRows });
        } 
        
        // 3. Si NO había nadie (hora vacía), insertamos un bloqueo para cerrar la hora
        else {
            const sqlInsertLock = `
                INSERT INTO Appointments (user_id, staff_id, appointment_date, start_time, end_time, status, is_locking)
                VALUES (1, ?, ?, ?, ADDTIME(?, '01:00:00'), 'confirmed', 1)
            `;
            
            db.query(sqlInsertLock, [staffId, date, time, time], (errInsert) => {
                if (errInsert) {
                    return res.status(500).json({ success: false, message: 'Error creando bloqueo vacío' });
                }
                return res.json({ success: true, updated: 0 });
            });
        }
    });
});

module.exports = router;