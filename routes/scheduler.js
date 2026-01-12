// routes/scheduler.js
const express = require('express');
const router = express.Router();
const mysql = require('mysql2');
const axios = require('axios');

// Conexión a Base de Datos
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});

// URL del Webhook
const WEBHOOK_URL = 'https://n8n.magnificapec.com/webhook/ff5e2454-2c1b-4542-be55-48408d97b4e8-panel';

// 1. OBTENER GRILLA
router.get('/grid', (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const sqlStaff = 'SELECT id, name, role FROM Staff WHERE is_active = 1 ORDER BY priority_order ASC';
    
    // Traemos citas incluyendo el estado de bloqueo
    const sqlAppts = `
        SELECT a.id, a.staff_id, a.start_time, a.user_id, a.is_locking,
               u.USUARIO as cliente, u.TELEFONO, u.N_CEDULA, u.ESTADO, u.CORREO_ELECTRONICO
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
    // Aceptamos true, 'true', 1 o '1' como bloqueo activado
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

module.exports = router;