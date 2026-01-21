// routes/public.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/db');

// URLs de Webhooks
const DEFAULT_WEBHOOK_URL = 'https://n8n.magnificapec.com/webhook/7c66633b-0a0c-4d98-9d2c-7979ac835823-agenda-automatica';
const BIOMECANICO_WEBHOOK_URL = 'https://n8n.magnificapec.com/webhook/2e2d8791-6fc2-4c50-bf4b-e3369a8198f3-analisis-biomecanico';

// Utilidad Promesas para la base de datos
const query = (sql, params) => new Promise((resolve, reject) => {
    db.query(sql, params, (err, res) => err ? reject(err) : resolve(res));
});

// Hora Colombia
const getColombiaDate = () => {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
};

// =========================================================================
// 1. IDENTIFICAR USUARIO (CONTEO DE CITAS, ESTADO Y PLAN)
// =========================================================================
router.get('/identify/:phone', async (req, res) => {
    try {
        let input = req.params.phone.replace(/\D/g, ''); 
        let phoneClean = input;
        
        if(input.startsWith('57') && input.length > 10) {
            phoneClean = input.substring(2);
        }

        const variants = [input, phoneClean, '+'+input, '+57'+phoneClean];
        
        // Filtramos solo citas FUTURAS para el conteo real
        const now = getColombiaDate();
        const currentDate = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().split(' ')[0];

        const sql = `
            SELECT u.*, 
            (SELECT COUNT(*) FROM Appointments a 
             WHERE a.user_id = u.id 
             AND a.status = 'confirmed'
             AND (a.appointment_date > ? OR (a.appointment_date = ? AND a.start_time > ?))
            ) as future_appointments
            FROM Users u 
            WHERE TELEFONO IN (?, ?, ?, ?) 
            LIMIT 1
        `;

        const users = await query(sql, [currentDate, currentDate, currentTime, ...variants]);
        
        if (users.length > 0) {
            res.json({ found: true, user: users[0] });
        } else {
            res.json({ found: false, phoneClean: phoneClean });
        }
    } catch (e) { 
        console.error(e);
        res.status(500).json({ error: 'Error interno identificando usuario' }); 
    }
});

// =========================================================================
// 2. REGISTRO RÁPIDO (Asigna Plan 'Cortesía/Nuevo' por defecto)
// =========================================================================
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

// =========================================================================
// 3. OBTENER HORAS DISPONIBLES
// =========================================================================
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

// =========================================================================
// 4. OBTENER DÍAS DISPONIBLES (MÁXIMO 5 DÍAS)
// =========================================================================
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
            // REGLA: "Solo aparezca 5 días"
            if (availableDays.length >= 5) break;
        }
        res.json({ success: true, days: availableDays });
    } catch (e) {
        res.status(500).json({ error: 'Error calculando días disponibles' });
    }
});

// =========================================================================
// 5. CONFIRMACIÓN Y AGENDAMIENTO (TODAS LAS REGLAS)
// =========================================================================
router.post('/confirm-booking-batch', async (req, res) => {
    const { userId, role, dates, time, serviceName } = req.body;
    
    if (!dates || dates.length === 0) return res.json({ success: false, message: 'Sin fechas seleccionadas.' });

    // Determinar Webhook
    let currentWebhookUrl = DEFAULT_WEBHOOK_URL;
    if (serviceName && (serviceName.toLowerCase().includes('biomecánico') || serviceName.toLowerCase().includes('biomecanico'))) {
        currentWebhookUrl = BIOMECANICO_WEBHOOK_URL;
    }

    try {
        const now = getColombiaDate();
        const currentDate = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().split(' ')[0];

        // Obtener usuario y contar citas FUTURAS REALES
        const userSql = `
            SELECT PLAN, ESTADO, USUARIO, TELEFONO, CORREO_ELECTRONICO,
            (SELECT COUNT(*) FROM Appointments a
             WHERE a.user_id = id 
             AND a.status = 'confirmed'
             AND (a.appointment_date > ? OR (a.appointment_date = ? AND a.start_time > ?))
            ) as active_count
            FROM Users WHERE id = ?
        `;
        const userRes = await query(userSql, [currentDate, currentDate, currentTime, userId]);
        
        if (userRes.length === 0) return res.json({ success: false, message: 'Usuario no encontrado.' });
        
        const user = userRes[0];
        const userEstado = (user.ESTADO || '').toUpperCase();
        const userPlan = (user.PLAN || '').toLowerCase();
        
        // --- REGLA 2: VALIDACIÓN DE ESTADO ---
        if (userEstado !== 'ACTIVO') {
            return res.json({ 
                success: false, 
                message: `TU MEMBRESÍA ESTÁ ${userEstado}. No puedes agendar. Por favor contacta a un asesor.` 
            });
        }

        // --- REGLA 1 y CORTESÍA: VALIDACIÓN DE LÍMITE ---
        // Si el plan es 'Cortesía/Nuevo' (o contiene esas palabras), el límite es 1.
        // Si es otro plan, el límite es 3.
        const isCourtesyPlan = userPlan.includes('cortesía') || userPlan.includes('cortesia') || userPlan.includes('nuevo');
        const limitActive = isCourtesyPlan ? 1 : 3;
        const currentActive = user.active_count;
        const newRequestCount = dates.length;
        const totalProjected = currentActive + newRequestCount;

        if (totalProjected > limitActive) {
            if (isCourtesyPlan) {
                return res.json({
                    success: false,
                    message: `USUARIO DE CORTESÍA: Solo puedes tener 1 cita activa. Por favor asiste a tu sesión para formalizar tu membresía.`
                });
            } else {
                return res.json({ 
                    success: false, 
                    message: `LÍMITE EXCEDIDO. Tienes ${currentActive} citas activas. Solo puedes tener un máximo de 3 citas agendadas simultáneamente.` 
                });
            }
        }

        // Asignación de Staff
        let dbRole = role;
        let isPersonalized = false;
        let isAdminService = false;
        const results = { booked: [], failed: [] };

        if (userPlan.includes('personalizado')) isPersonalized = true;
        if (role === 'EntrenamientoPersonalizado') { dbRole = 'Entrenador'; isPersonalized = true; }
        else if (role === 'Admin') isAdminService = true;

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
                
                axios.post(currentWebhookUrl, webhookData).catch(err => console.error("WebHook Error", err.message));

            } else {
                results.failed.push({ date, time, reason: "Agenda llena" });
            }
        }
        
        res.json({ success: true, results: results });

    } catch (e) {
        console.error("Batch Error:", e);
        res.status(500).json({ success: false, message: 'Error interno procesando reservas.' });
    }
});

// =========================================================================
// 6. MIS CITAS (FILTRADO DE CITAS PASADAS)
// =========================================================================
router.get('/my-appointments/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const now = getColombiaDate();
        const currentDate = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().split(' ')[0];

        // Solo muestra citas FUTURAS. Las pasadas desaparecen de la zona de booking.
        const results = await query(`
            SELECT a.id, a.appointment_date, a.start_time, s.name as staff_name, s.role
            FROM Appointments a
            JOIN Staff s ON a.staff_id = s.id
            WHERE a.user_id = ? 
              AND a.status = 'confirmed'
              AND (a.appointment_date > ? OR (a.appointment_date = ? AND a.start_time > ?))
            ORDER BY a.appointment_date ASC, a.start_time ASC
        `, [userId, currentDate, currentDate, currentTime]);
        
        res.json({ success: true, appointments: results });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Error al consultar citas.' });
    }
});

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