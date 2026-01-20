// routes/public.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/db');

const WEBHOOK_URL = 'https://n8n.magnificapec.com/webhook/7c66633b-0a0c-4d98-9d2c-7979ac835823-agenda-automatica';

// Utilidad Promesas
const query = (sql, params) => new Promise((resolve, reject) => {
    db.query(sql, params, (err, res) => err ? reject(err) : resolve(res));
});

// Hora Colombia
const getColombiaDate = () => {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
};

// 1. IDENTIFICAR (Limpieza de +57 en búsqueda)
router.get('/identify/:phone', async (req, res) => {
    try {
        let input = req.params.phone.replace(/\D/g, ''); 
        
        let phoneClean = input;
        if(input.startsWith('57') && input.length > 10) {
            phoneClean = input.substring(2);
        }

        const variants = [input, phoneClean, '+'+input, '+57'+phoneClean];
        const users = await query('SELECT * FROM Users WHERE TELEFONO IN (?, ?, ?, ?) LIMIT 1', variants);
        
        if (users.length > 0) {
            res.json({ found: true, user: users[0] });
        } else {
            res.json({ found: false, phoneClean: phoneClean });
        }
    } catch (e) { 
        console.error(e);
        res.status(500).json({ error: 'Error interno' }); 
    }
});

// 2. REGISTRO RÁPIDO
router.post('/quick-register', async (req, res) => {
    try {
        let { nombre, cedula, correo, telefono } = req.body;
        
        let telLimpio = telefono.replace(/\D/g, ''); 
        if(telLimpio.startsWith('57') && telLimpio.length > 10) {
            telLimpio = telLimpio.substring(2);
        }

        const exists = await query('SELECT id FROM Users WHERE N_CEDULA = ?', [cedula]);
        if (exists.length > 0) {
            await query('UPDATE Users SET TELEFONO = ? WHERE id = ?', [telLimpio, exists[0].id]);
            return res.json({ success: true, userId: exists[0].id, usuario: nombre });
        }
        
        const result = await query(
            `INSERT INTO Users (USUARIO, N_CEDULA, CORREO_ELECTRONICO, TELEFONO, ESTADO, PLAN, F_INGRESO)
             VALUES (?, ?, ?, ?, 'ACTIVO', 'Cortesía/Nuevo', CURDATE())`,
            [nombre, cedula, correo, telLimpio]
        );
        res.json({ success: true, userId: result.insertId, usuario: nombre });
    } catch (e) { 
        console.error(e);
        res.status(500).json({ success: false }); 
    }
});

// 3. OBTENER HORAS
router.post('/get-service-hours', async (req, res) => {
    const { role } = req.body;
    
    if (role === 'Admin') {
        const adminHours = [
            '05:00:00', '06:00:00', '07:00:00', '08:00:00', '09:00:00', '10:00:00',
            '15:00:00', '16:00:00', '17:00:00', '18:00:00'
        ];
        return res.json({ success: true, hours: adminHours });
    }

    let dbRole = role === 'EntrenamientoPersonalizado' ? 'Entrenador' : role;

    try {
        const schedules = await query(`
            SELECT DISTINCT ws.start_time, ws.end_time 
            FROM WeeklySchedules ws
            JOIN Staff s ON ws.staff_id = s.id
            WHERE s.role = ? AND s.is_active = 1
        `, [dbRole]);
        
        const hourSet = new Set();
        schedules.forEach(sch => {
            let start = parseInt(sch.start_time.split(':')[0]);
            let end = parseInt(sch.end_time.split(':')[0]);
            for (let h = start; h < end; h++) {
                hourSet.add(h.toString().padStart(2, '0') + ":00:00");
            }
        });

        res.json({ success: true, hours: Array.from(hourSet).sort() });
    } catch (e) { res.status(500).json({ error: 'Error calculando horas' }); }
});

// 4. OBTENER DÍAS
router.post('/get-available-days', async (req, res) => {
    const { role, time } = req.body;
    let availableDays = [];
    let now = getColombiaDate();
    const currentHour = now.getHours();
    const requestHour = parseInt(time.split(':')[0]);

    let dbRole = role;
    let isPersonalized = false;
    let isAdminService = false;
    let adminId = null;

    if (role === 'EntrenamientoPersonalizado') {
        dbRole = 'Entrenador';
        isPersonalized = true;
    } else if (role === 'Admin') {
        isAdminService = true;
        const adminStaff = await query("SELECT id FROM Staff WHERE role='Admin' AND name LIKE '%Mafe%' LIMIT 1");
        if (adminStaff.length > 0) adminId = adminStaff[0].id;
        else {
            const anyAdmin = await query("SELECT id FROM Staff WHERE role='Admin' LIMIT 1");
            if(anyAdmin.length > 0) adminId = anyAdmin[0].id;
        }
    }

    try {
        for (let i = 0; i < 30; i++) {
            let d = new Date(now);
            d.setDate(now.getDate() + i); 
            
            let dayOfWeek = d.getDay() === 0 ? 7 : d.getDay();
            if (dayOfWeek === 7) continue; 

            let dateStr = d.toISOString().split('T')[0];
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const localDateStr = `${year}-${month}-${day}`;

            if (i === 0 && requestHour <= currentHour) continue;

            let hasSpace = false;

            if (isAdminService && adminId) {
                const ocupacion = await query(`
                    SELECT COUNT(*) as total
                    FROM Appointments 
                    WHERE staff_id = ? AND appointment_date = ? AND start_time = ? AND status = 'confirmed'
                `, [adminId, localDateStr, time]);
                if (ocupacion[0].total < 1) hasSpace = true;
            } else {
                const staffWorking = await query(`
                    SELECT s.id, ws.max_capacity 
                    FROM Staff s
                    JOIN WeeklySchedules ws ON s.id = ws.staff_id
                    WHERE s.role = ? AND s.is_active = 1
                      AND ws.day_of_week = ?
                      AND ? >= ws.start_time AND ? < ws.end_time
                `, [dbRole, dayOfWeek, time, time]);

                for (const staff of staffWorking) {
                    const ocupacion = await query(`
                        SELECT COUNT(*) as total, MAX(is_locking) as locked
                        FROM Appointments 
                        WHERE staff_id = ? AND appointment_date = ? AND start_time = ? AND status = 'confirmed'
                    `, [staff.id, localDateStr, time]);

                    const isLocked = ocupacion[0].locked == 1;
                    const count = ocupacion[0].total;

                    if (isPersonalized) {
                        if (!isLocked && count === 0) { hasSpace = true; break; }
                    } else {
                        if (!isLocked && count < staff.max_capacity) { hasSpace = true; break; }
                    }
                }
            }

            if (hasSpace) {
                availableDays.push({
                    dateStr: localDateStr,
                    displayDate: d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
                });
            }
            if (availableDays.length >= 5) break;
        }
        res.json({ success: true, days: availableDays });
    } catch (e) {
        res.status(500).json({ error: 'Error calculando días' });
    }
});

// 5. CONFIRMACIÓN (Con reporte de éxito/fallo)
router.post('/confirm-booking-batch', async (req, res) => {
    const { userId, role, dates, time, serviceName } = req.body;
    if (!dates || dates.length === 0) return res.json({ success: false, message: 'Sin fechas' });

    let dbRole = role;
    let isPersonalized = false;
    let isAdminService = false;

    // Estructura para reportar resultados
    const results = {
        booked: [],
        failed: []
    };

    try {
        const userRes = await query('SELECT * FROM Users WHERE id = ?', [userId]);
        const user = userRes[0];
        const planUsuario = (user.PLAN || '').toLowerCase();
        
        // REGLA: Bloqueo automático si el plan es personalizado
        if (planUsuario.includes('personalizado')) {
            isPersonalized = true;
        }

        if (role === 'EntrenamientoPersonalizado') {
            dbRole = 'Entrenador';
            isPersonalized = true; 
        } else if (role === 'Admin') {
            isAdminService = true;
        }

        for (const date of dates) {
            const dObj = new Date(date + 'T12:00:00');
            const dayOfWeek = dObj.getDay() === 0 ? 7 : dObj.getDay();
            let selectedStaff = null;

            if (isAdminService) {
                const mafe = await query("SELECT id, name FROM Staff WHERE role='Admin' AND name LIKE '%Mafe%' LIMIT 1");
                if (mafe.length > 0) {
                    const ocupacion = await query(`
                        SELECT COUNT(*) as total FROM Appointments 
                        WHERE staff_id = ? AND appointment_date = ? AND start_time = ? AND status = 'confirmed'
                    `, [mafe[0].id, date, time]);
                    
                    if (ocupacion[0].total < 1) selectedStaff = mafe[0];
                }
            } else {
                const candidates = await query(`
                    SELECT s.id, s.name, ws.max_capacity 
                    FROM Staff s
                    JOIN WeeklySchedules ws ON s.id = ws.staff_id
                    WHERE s.role = ? AND ws.day_of_week = ?
                      AND ? >= ws.start_time AND ? < ws.end_time
                    ORDER BY s.priority_order ASC
                `, [dbRole, dayOfWeek, time, time]);

                for (const staff of candidates) {
                    const ocupacion = await query(`
                        SELECT COUNT(*) as total, MAX(is_locking) as locked
                        FROM Appointments 
                        WHERE staff_id = ? AND appointment_date = ? AND start_time = ? AND status = 'confirmed'
                    `, [staff.id, date, time]);

                    const isLocked = ocupacion[0].locked == 1;
                    const count = ocupacion[0].total;

                    if (isPersonalized) {
                        if (!isLocked && count === 0) { selectedStaff = staff; break; }
                    } else {
                        if (!isLocked && count < staff.max_capacity) { selectedStaff = staff; break; }
                    }
                }
            }

            if (selectedStaff) {
                const lockValue = isPersonalized ? 1 : 0;
                
                const insert = await query(
                    `INSERT INTO Appointments (user_id, staff_id, appointment_date, start_time, end_time, status, is_locking)
                     VALUES (?, ?, ?, ?, ADDTIME(?, '01:00:00'), 'confirmed', ?)`,
                    [userId, selectedStaff.id, date, time, time, lockValue]
                );
                
                // Agregar a lista de éxitos
                results.booked.push({ date, time, staff: selectedStaff.name });

                // Webhook
                let extraMessage = "";
                if (serviceName === "Clase de Cortesía") {
                    extraMessage = "\n\n⚠️ *IMPORTANTE:* Recuerda que debes estar 30 minutos antes para un tamizaje previo.";
                }

                const webhookData = {
                    mensaje: (isPersonalized ? "Cita PERSONALIZADA" : "Cita Agendada") + extraMessage,
                    cita_id: insert.insertId,
                    fecha: date,
                    hora: time,
                    servicio: serviceName || role, 
                    staff_asignado: selectedStaff.name,
                    cliente: {
                        id: user.id,
                        nombre: user.USUARIO,
                        telefono: user.TELEFONO,
                        email: user.CORREO_ELECTRONICO
                    }
                };
                axios.post(WEBHOOK_URL, webhookData).catch(err => console.error("WebHook Error", err.message));
            } else {
                // Agregar a lista de fallos
                results.failed.push({ date, time, reason: "Agenda llena o no disponible" });
            }
        }
        
        // Retornamos el objeto results completo
        res.json({ success: true, results: results });

    } catch (e) {
        console.error("Batch Error:", e);
        res.status(500).json({ success: false, message: 'Error interno' });
    }
});

// 6. OBTENER MIS CITAS
router.get('/my-appointments/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const results = await query(`
            SELECT a.id, a.appointment_date, a.start_time, s.name as staff_name, s.role
            FROM Appointments a
            JOIN Staff s ON a.staff_id = s.id
            WHERE a.user_id = ? 
              AND a.appointment_date >= CURDATE() 
              AND a.status = 'confirmed'
            ORDER BY a.appointment_date ASC, a.start_time ASC
        `, [userId]);
        
        res.json({ success: true, appointments: results });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Error al consultar citas.' });
    }
});

// 7. CANCELAR CITA
router.delete('/cancel-appointment/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM Appointments WHERE id = ?', [id]);
        res.json({ success: true, message: 'Cita eliminada correctamente.' });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Error al cancelar la cita.' });
    }
});

module.exports = router;