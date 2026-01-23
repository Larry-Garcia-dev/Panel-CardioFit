// routes/public.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../config/db');

// --- WEBHOOKS ---
const WHATSAPP_WEBHOOK_URL = 'https://n8n.magnificapec.com/webhook/69388ce3-86a8-49df-9372-fe37dba04d96-whatsapp-template';
const DEFAULT_WEBHOOK_URL = 'https://n8n.magnificapec.com/webhook/7c66633b-0a0c-4d98-9d2c-7979ac835823-agenda-automatica';

// Promesas DB
const query = (sql, params) => new Promise((resolve, reject) => {
    db.query(sql, params, (err, res) => err ? reject(err) : resolve(res));
});

// Hora Colombia
const getColombiaDate = () => {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
};

// =========================================================================
// VALIDACIÓN DE REGLAS DE FECHA Y HORARIO
// =========================================================================
function isValidDateRule(staffId, dateObj, serviceType) {
    const dayOfWeek = dateObj.getDay(); // 0=Dom, 6=Sab
    const dayOfMonth = dateObj.getDate();
    const staffIdInt = parseInt(staffId);
    const sType = (serviceType || "").toLowerCase();

    // 1. JORGE (ID 4) - Sábados: Solo los dos primeros del mes
    if (staffIdInt === 4 && dayOfWeek === 6) {
        if (dayOfMonth > 14) return false;
    }

    // 2. EDNA (ID 9)
    if (staffIdInt === 9) {
        const isFisio = sType.includes('fisioterapia') || sType.includes('fisio');
        const isExam = sType.includes('biomec') || sType.includes('holter') || sType.includes('mapa') || sType.includes('electro');

        // Sábados Quincenales (Fisio) - Desde 10 Ene 2026
        if (dayOfWeek === 6) {
            if (!isFisio) return false; 
            const startDate = new Date('2026-01-10T00:00:00');
            const diffTime = dateObj.getTime() - startDate.getTime();
            const weeksPassed = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));
            if (weeksPassed % 2 !== 0) return false; 
        }

        // Fisioterapia: Lunes y Sábados
        if (isFisio && dayOfWeek !== 1 && dayOfWeek !== 6) return false;

        // Exámenes: Lunes, Martes, Miércoles
        if (isExam) {
            if (dayOfWeek === 4 || dayOfWeek === 5 || dayOfWeek === 6) return false;
        }
    }

    return true;
}

// =========================================================================
// 1. IDENTIFICAR USUARIO (CONTEO DE CITAS) [CORREGIDO]
// =========================================================================
router.get('/identify/:phone', async (req, res) => {
    try {
        let input = req.params.phone.replace(/\D/g, ''); 
        let phoneClean = input;
        if(input.startsWith('57') && input.length > 10) phoneClean = input.substring(2);
        
        const variants = [input, phoneClean, '+'+input, '+57'+phoneClean];
        
        const now = getColombiaDate();
        const currentDate = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().split(' ')[0];

        // RESTAURADO: Subconsulta para contar citas futuras (importante para validación de límites)
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
// 2. REGISTRO RÁPIDO [RESTAURADO]
// =========================================================================
router.post('/quick-register', async (req, res) => {
    try {
        let { nombre, cedula, correo, telefono } = req.body;
        
        let telLimpio = telefono.replace(/\D/g, ''); 
        if(telLimpio.startsWith('57') && telLimpio.length > 10) {
            telLimpio = telLimpio.substring(2);
        }

        // Verificar si la cédula ya existe para no duplicar
        const exists = await query('SELECT id FROM Users WHERE N_CEDULA = ?', [cedula]);
        if (exists.length > 0) {
            // Si existe por cédula pero cambió teléfono, actualizamos teléfono
            await query('UPDATE Users SET TELEFONO = ? WHERE id = ?', [telLimpio, exists[0].id]);
            return res.json({ success: true, userId: exists[0].id, usuario: nombre });
        }
        
        // Insertar nuevo usuario con plan por defecto
        const result = await query(
            `INSERT INTO Users (USUARIO, N_CEDULA, CORREO_ELECTRONICO, TELEFONO, ESTADO, PLAN, F_INGRESO)
             VALUES (?, ?, ?, ?, 'ACTIVO', 'Cortesía/Nuevo', CURDATE())`,
            [nombre, cedula, correo, telLimpio]
        );
        res.json({ success: true, userId: result.insertId, usuario: nombre });
    } catch (e) { 
        console.error(e);
        res.status(500).json({ success: false, message: 'Error registrando usuario' }); 
    }
});

// =========================================================================
// 3. OBTENER HORAS DISPONIBLES
// =========================================================================
router.post('/get-service-hours', async (req, res) => {
    const { role } = req.body;
    let dbRole = role === 'EntrenamientoPersonalizado' ? 'Entrenador' : role;

    try {
        const schedules = await query(`
            SELECT DISTINCT start_time, end_time 
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
    } catch (e) { res.status(500).json({ error: 'Error horas' }); }
});

// =========================================================================
// 4. OBTENER DÍAS (REGLA DE ORO: Validar Capacidad Real)
// =========================================================================
router.post('/get-available-days', async (req, res) => {
    const { role, time, serviceName } = req.body;
    let availableDays = [];
    let now = getColombiaDate();
    const currentHour = now.getHours();
    const requestHour = parseInt(time.split(':')[0]);

    let dbRole = role;
    let isPersonalized = false;
    if (role === 'EntrenamientoPersonalizado') {
        dbRole = 'Entrenador';
        isPersonalized = true;
    }

    try {
        for (let i = 0; i < 45; i++) {
            let d = new Date(now);
            d.setDate(now.getDate() + i); 
            
            let dayOfWeek = d.getDay() === 0 ? 7 : d.getDay();
            if (dayOfWeek === 7) continue; 

            let dateStr = d.toISOString().split('T')[0];
            if (i === 0 && requestHour <= currentHour) continue;

            // BUSCAR STAFF DISPONIBLE
            const staffWorking = await query(`
                SELECT s.id, ws.max_capacity 
                FROM Staff s
                JOIN WeeklySchedules ws ON s.id = ws.staff_id
                WHERE s.role = ? AND s.is_active = 1
                  AND ws.day_of_week = ?
                  AND ? >= ws.start_time AND ? < ws.end_time
            `, [dbRole, dayOfWeek, time, time]);

            let hasSpace = false;

            for (const staff of staffWorking) {
                if (!isValidDateRule(staff.id, d, serviceName || role)) continue;

                // CONTAR OCUPACIÓN REAL (Regla de Oro)
                const ocupacion = await query(`
                    SELECT COUNT(*) as total, MAX(is_locking) as locked
                    FROM Appointments 
                    WHERE staff_id = ? AND appointment_date = ? AND start_time = ? AND status = 'confirmed'
                `, [staff.id, dateStr, time]);

                const isLocked = ocupacion[0].locked == 1;
                const currentBookings = ocupacion[0].total;
                
                // VALIDACIÓN CAPACIDAD
                if (isPersonalized) {
                    if (!isLocked && currentBookings === 0) { hasSpace = true; break; }
                } else {
                    if (!isLocked && currentBookings < staff.max_capacity) { hasSpace = true; break; }
                }
            }

            if (hasSpace) {
                availableDays.push({
                    dateStr: dateStr,
                    displayDate: d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
                });
            }
            if (availableDays.length >= 7) break;
        }
        res.json({ success: true, days: availableDays });
    } catch (e) { res.status(500).json({ error: 'Error calculando días' }); }
});

// =========================================================================
// 5. CONFIRMACIÓN (LÍMITES + DOBLE WEBHOOK)
// =========================================================================
router.post('/confirm-booking-batch', async (req, res) => {
    const { userId, role, dates, time, serviceName } = req.body;
    if (!dates || dates.length === 0) return res.json({ success: false, message: 'Sin fechas.' });

    try {
        const now = getColombiaDate();
        const currentDate = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().split(' ')[0];

        // DATOS USUARIO
        const userRes = await query('SELECT * FROM Users WHERE id = ?', [userId]);
        if (userRes.length === 0) return res.json({ success: false, message: 'Usuario no encontrado.' });
        const user = userRes[0];
        
        if ((user.ESTADO || '').toUpperCase() !== 'ACTIVO') {
            return res.json({ success: false, message: `Membresía ${user.ESTADO}. Contacta a soporte.` });
        }

        const userPlan = (user.PLAN || '').toLowerCase();
        let dbRole = role;
        let isPersonalized = false;
        if (role === 'EntrenamientoPersonalizado') { dbRole = 'Entrenador'; isPersonalized = true; }

        // === VALIDACIÓN LÍMITES POR TIPO ===
        
        // 1. Cortesía: Máximo 1 cita TOTAL
        if (userPlan.includes('cortesía') || userPlan.includes('nuevo')) {
            const countAll = await query(`
                SELECT COUNT(*) as c FROM Appointments 
                WHERE user_id = ? AND status = 'confirmed' 
                AND (appointment_date > ? OR (appointment_date = ? AND start_time > ?))
            `, [userId, currentDate, currentDate, currentTime]);
            
            if (countAll[0].c + dates.length > 1) {
                return res.json({ success: false, message: 'USUARIO DE CORTESÍA: Solo puedes tener 1 cita activa.' });
            }
        } 
        // 2. Entrenamientos (Activos): Máximo 3 citas activas
        else if (dbRole === 'Entrenador') {
            const countTrainings = await query(`
                SELECT COUNT(*) as c FROM Appointments a
                JOIN Staff s ON a.staff_id = s.id
                WHERE a.user_id = ? AND a.status = 'confirmed' 
                AND s.role = 'Entrenador'
                AND (a.appointment_date > ? OR (a.appointment_date = ? AND a.start_time > ?))
            `, [userId, currentDate, currentDate, currentTime]);

            if (countTrainings[0].c + dates.length > 3) {
                return res.json({ success: false, message: `LÍMITE ENTRENAMIENTO: Tienes ${countTrainings[0].c} citas activas. Máximo 3 permitidas.` });
            }
        }
        // 3. Otros Servicios: SIN LÍMITE (Pasan directo)

        // === PROCESO DE AGENDAMIENTO ===
        const results = { booked: [], failed: [] };
        let duration = '01:00:00';
        if (role === 'Spa' && (serviceName.includes('recuperación') || serviceName.includes('relajación'))) {
            duration = '02:00:00';
        }

        for (const date of dates) {
            const dObj = new Date(date + 'T12:00:00');
            const dayOfWeek = dObj.getDay() === 0 ? 7 : dObj.getDay();
            let selectedStaff = null;

            // Buscar Candidatos Disponibles
            const candidates = await query(`
                SELECT s.id, s.name, ws.max_capacity 
                FROM Staff s
                JOIN WeeklySchedules ws ON s.id = ws.staff_id
                WHERE s.role = ? AND ws.day_of_week = ?
                  AND ? >= ws.start_time AND ? < ws.end_time
                ORDER BY s.priority_order ASC
            `, [dbRole, dayOfWeek, time, time]);

            for (const staff of candidates) {
                if (!isValidDateRule(staff.id, dObj, serviceName || role)) continue;

                // Validar Ocupación Real
                const apptInfo = await query(`
                    SELECT COUNT(*) as total, MAX(is_locking) as locked
                    FROM Appointments 
                    WHERE staff_id = ? AND appointment_date = ? AND start_time = ? AND status = 'confirmed'
                `, [staff.id, date, time]);

                const isLocked = apptInfo[0].locked == 1;
                const count = apptInfo[0].total;

                if (isPersonalized) {
                    if (!isLocked && count === 0) { selectedStaff = staff; break; }
                } else {
                    if (!isLocked && count < staff.max_capacity) { selectedStaff = staff; break; }
                }
            }

            if (selectedStaff) {
                const lockVal = isPersonalized ? 1 : 0;
                const insert = await query(
                    `INSERT INTO Appointments (user_id, staff_id, appointment_date, start_time, end_time, status, is_locking)
                     VALUES (?, ?, ?, ?, ADDTIME(?, ?), 'confirmed', ?)`,
                    [userId, selectedStaff.id, date, time, time, duration, lockVal]
                );
                
                results.booked.push({ date, time, staff: selectedStaff.name });

                // 3. ENVÍO A LOS DOS WEBHOOKS
                const webhookPayload = {
                    mensaje: `Nueva Reserva: ${serviceName}`,
                    cita_id: insert.insertId,
                    fecha: date,
                    hora: time,
                    servicio: serviceName,
                    staff_asignado: selectedStaff.name,
                    duracion: duration,
                    tipo_agendamiento: isPersonalized ? "Personalizado" : "General",
                    cliente: {
                        id: user.id,
                        nombre: user.USUARIO,
                        telefono: user.TELEFONO || "",
                        email: user.CORREO_ELECTRONICO || "",
                        cedula: user.N_CEDULA
                    }
                };
                
                // Enviar a WhatsApp
                axios.post(WHATSAPP_WEBHOOK_URL, webhookPayload).catch(e => console.error("Whatsapp Webhook Error:", e.message));
                // Enviar a Default (Agenda Automática)
                axios.post(DEFAULT_WEBHOOK_URL, webhookPayload).catch(e => console.error("Default Webhook Error:", e.message));

            } else {
                results.failed.push({ date, time, reason: "Cupo lleno" });
            }
        }
        res.json({ success: true, results: results });

    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: 'Error interno.' });
    }
});

// 6. MIS CITAS (Mostrar solo futuras)
router.get('/my-appointments/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const now = getColombiaDate();
        const currentDate = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().split(' ')[0];

        const results = await query(`
            SELECT a.id, a.appointment_date, a.start_time, s.name as staff_name, s.role
            FROM Appointments a
            JOIN Staff s ON a.staff_id = s.id
            WHERE a.user_id = ? 
              AND a.status = 'confirmed'
              AND (a.appointment_date > ? OR (a.appointment_date = ? AND a.start_time > ?))
            ORDER BY a.appointment_date ASC
        `, [userId, currentDate, currentDate, currentTime]);
        
        res.json({ success: true, appointments: results });
    } catch (e) { res.status(500).json({ success: false }); }
});

router.delete('/cancel-appointment/:id', async (req, res) => {
    try {
        await query('DELETE FROM Appointments WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

module.exports = router;