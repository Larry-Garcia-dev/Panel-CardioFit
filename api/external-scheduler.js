// api/external-scheduler.js
const express = require('express');
const router = express.Router();
const db = require('../config/db'); // Usamos el Pool compartido

// Función auxiliar para convertir db.query en Promesa (para usar await)
const query = (sql, params) => {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
};

// =========================================================================
// FUNCIÓN CLAVE: OBTENER HORARIOS DISPONIBLES
// =========================================================================
async function getAvailableHours(staffId, date, dayOfWeek) {
    try {
        // 1. Obtener horario base del staff para ese día
        const schedules = await query(
            'SELECT start_time, end_time, max_capacity FROM WeeklySchedules WHERE staff_id = ? AND day_of_week = ?', 
            [staffId, dayOfWeek]
        );

        if (schedules.length === 0) return [];

        let availableSlots = [];

        // 2. Obtener citas ya agendadas para ese día
        const appointments = await query(
            `SELECT start_time, count(*) as total, MAX(is_locking) as is_locked 
             FROM Appointments 
             WHERE staff_id = ? AND appointment_date = ? AND status = 'confirmed' 
             GROUP BY start_time`,
            [staffId, date]
        );

        // Convertir citas a un mapa para búsqueda rápida: { "08:00:00": { total: 2, locked: 0 } }
        const apptMap = {};
        appointments.forEach(app => {
            apptMap[app.start_time] = { total: app.total, locked: app.is_locked };
        });

        // 3. Generar slots hora por hora según el horario
        for (const schedule of schedules) {
            let currentHour = parseInt(schedule.start_time.split(':')[0]);
            const endHour = parseInt(schedule.end_time.split(':')[0]);
            const maxCap = (staffId === 9) ? 1 : 5; // Edna=1, Otros=5

            // Recorrer desde hora inicio hasta hora fin
            while (currentHour < endHour) {
                // REGLA ESPECIAL IVÁN (ID 5) - VIERNES (Día 5)
                // Si es viernes, Iván solo trabaja 5-9 y 16-18. 
                // La BD ya tiene los rangos, pero validamos por seguridad.
                let isValidSlot = true;
                
                // Formatear hora (ej: "07:00:00")
                const timeStr = `${currentHour.toString().padStart(2, '0')}:00:00`;

                // Verificar ocupación
                const slotInfo = apptMap[timeStr];
                
                if (slotInfo) {
                    // Si está bloqueado (Plan Personalizado) o está Lleno
                    if (slotInfo.locked == 1 || slotInfo.total >= maxCap) {
                        isValidSlot = false;
                    }
                }

                if (isValidSlot) {
                    // Formato amigable (ej: "07:00 AM")
                    const ampm = currentHour >= 12 ? 'PM' : 'AM';
                    const hour12 = currentHour % 12 || 12;
                    availableSlots.push(`${hour12}:00 ${ampm}`);
                }

                currentHour++;
            }
        }
        
        // Ordenar horas (simplemente por si acaso)
        return availableSlots;

    } catch (e) {
        console.error("Error calculando disponibilidad:", e);
        return [];
    }
}

// =========================================================================
// RUTA: /api/n8n/agendar
// =========================================================================
router.post('/agendar', async (req, res) => {
    try {
        const { id: userId, fecha, hora, especialista } = req.body;

        // 1. Validaciones básicas
        if (!userId || !fecha || !hora || !especialista) {
            return res.status(400).json({ success: false, message: 'Faltan datos: id, fecha, hora, especialista.' });
        }

        console.log(`🤖 N8N Request: Cliente ${userId} | ${fecha} ${hora} | Servicio: ${especialista}`);

        // 2. Obtener Plan del Usuario
        const userResult = await query('SELECT PLAN FROM Users WHERE id = ?', [userId]);
        if (userResult.length === 0) return res.status(404).json({ success: false, message: 'Usuario no encontrado en base de datos.' });

        const userPlan = (userResult[0].PLAN || '').toLowerCase();
        const isPersonalized = userPlan.includes('personalizado');
        const lockingValue = isPersonalized ? 1 : 0;

        // 3. Calcular Día
        const dateObj = new Date(`${fecha}T${hora}`);
        let jsDay = dateObj.getDay(); 
        const dayOfWeek = (jsDay === 0) ? 7 : jsDay; 
        const hourInt = parseInt(hora.split(':')[0]);

        if (dayOfWeek === 7) return res.status(400).json({ success: false, message: 'Lo sentimos, los domingos estamos cerrados.' });

        // 4. LÓGICA DE ROLES Y REGLAS DE SERVICIO
        let targetStaffId = null;
        let targetRole = 'Entrenador';
        let serviceType = 'General';
        const esp = especialista.toLowerCase();

        // --- REGLAS EDNA ---
        if (esp.includes('biomecánico') || esp.includes('biomecanico')) {
            if (dayOfWeek !== 2 && dayOfWeek !== 3) {
                return res.status(200).json({ success: false, message: 'El Análisis Biomecánico solo está disponible Martes y Miércoles.' });
            }
            targetStaffId = 9; 
            serviceType = 'Biomecánico';
        } 
        else if (esp.includes('fisioterapia') || esp.includes('fisio')) {
            if (dayOfWeek !== 1 && dayOfWeek !== 6) {
                return res.status(200).json({ success: false, message: 'Fisioterapia solo está disponible Lunes y Sábados.' });
            }
            targetStaffId = 9; 
            targetRole = 'Fisioterapia'; // Para asegurar filtro si quitamos el ID fijo
            serviceType = 'Fisioterapia';
        }
        else if (esp.includes('spa') || esp.includes('masaje')) {
            targetRole = 'Spa';
            serviceType = 'Spa';
        }
        else {
            targetRole = 'Entrenador';
            serviceType = 'Entrenamiento';
        }

        // 5. BUSCAR CANDIDATOS
        let sqlStaff = `
            SELECT s.id, s.name, s.role, ws.max_capacity, ws.start_time, ws.end_time
            FROM Staff s
            JOIN WeeklySchedules ws ON s.id = ws.staff_id
            WHERE s.is_active = 1
              AND ws.day_of_week = ?
              AND ? >= ws.start_time 
              AND ? < ws.end_time
        `;
        
        const queryParams = [dayOfWeek, hora, hora];

        if (targetStaffId) {
            sqlStaff += ' AND s.id = ?';
            queryParams.push(targetStaffId);
        } else {
            sqlStaff += ' AND s.role = ? ORDER BY s.priority_order ASC';
            queryParams.push(targetRole);
        }

        const candidates = await query(sqlStaff, queryParams);

        // 6. SI NO HAY CANDIDATOS (HORA INVÁLIDA PARA EL ROL)
        if (candidates.length === 0) {
            // Aquí entra la "Inteligencia": Buscar horarios libres para sugerir
            // Usamos un ID representativo (si era Edna, ID 9. Si era Entrenador, buscamos uno genérico del rol)
            let suggestionId = targetStaffId;
            
            if (!suggestionId) {
                // Buscar un staff cualquiera de ese rol para ver sus horarios
                const anyStaff = await query('SELECT id FROM Staff WHERE role = ? LIMIT 1', [targetRole]);
                if (anyStaff.length > 0) suggestionId = anyStaff[0].id;
            }

            if (suggestionId) {
                const slots = await getAvailableHours(suggestionId, fecha, dayOfWeek);
                if (slots.length > 0) {
                    return res.status(200).json({ 
                        success: false, 
                        message: `No hay servicio a las ${hora}. Horarios disponibles para ${serviceType} hoy: ${slots.join(', ')}` 
                    });
                }
            }

            return res.status(200).json({ success: false, message: `No hay especialistas de ${targetRole} disponibles este día.` });
        }

        // 7. INTENTAR AGENDAR (Iterando candidatos)
        for (const staff of candidates) {
            // Filtro especial Iván Viernes (aunque la Query ya filtra por WeeklySchedules, doble check por seguridad)
            if (staff.id === 5 && dayOfWeek === 5) {
                const isMorning = (hourInt >= 5 && hourInt < 9);
                const isAfternoon = (hourInt >= 16 && hourInt < 18);
                if (!isMorning && !isAfternoon) continue; // Saltar Iván si no cuadra
            }

            // Verificar Cupos
            const apptInfo = await query(
                `SELECT COUNT(*) as total, MAX(is_locking) as is_locked 
                 FROM Appointments 
                 WHERE staff_id = ? AND appointment_date = ? AND start_time = ? AND status = 'confirmed'`,
                [staff.id, fecha, hora]
            );

            const current = apptInfo[0].total;
            const isLocked = apptInfo[0].is_locked;
            const capacity = staff.max_capacity;

            // Regla de Bloqueo
            if (isLocked == 1) continue; // Ocupado por VIP, siguiente staff

            // Regla VIP (Necesita staff vacío)
            if (isPersonalized && current > 0) continue; // Staff no está vacío, siguiente

            // Regla Capacidad Normal
            if (current < capacity) {
                // ¡HAY CUPO! -> AGENDAR
                const insertRes = await query(
                    `INSERT INTO Appointments (user_id, staff_id, appointment_date, start_time, end_time, status, is_locking)
                     VALUES (?, ?, ?, ?, ADDTIME(?, '01:00:00'), 'confirmed', ?)`,
                    [userId, staff.id, fecha, hora, hora, lockingValue]
                );

                return res.json({
                    success: true,
                    message: `Reserva confirmada con ${staff.name}`,
                    details: { staff: staff.name, fecha, hora }
                });
            }
        }

        // 8. SI LLEGAMOS AQUÍ, TODOS ESTÁN LLENOS
        // Generamos sugerencias con el primer candidato de la lista
        const slots = await getAvailableHours(candidates[0].id, fecha, dayOfWeek);
        const msgSlots = slots.length > 0 ? ` Horarios disponibles: ${slots.join(', ')}` : ' No quedan horarios hoy.';

        return res.status(200).json({ 
            success: false, 
            message: `Lo sentimos, la agenda está llena a las ${hora}.${msgSlots}` 
        });

    } catch (error) {
        console.error("Error crítico en agendamiento:", error);
        res.status(500).json({ success: false, message: 'Error interno del servidor.' });
    }
});

module.exports = router;