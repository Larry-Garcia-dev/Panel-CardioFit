// api/external-scheduler.js
const express = require('express');
const router = express.Router();
const mysql = require('mysql2');

// Conexión a Base de Datos
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});

// =========================================================================
// RUTA: /api/n8n/agendar
// Descripción: Agendamiento inteligente con Bloqueo por Plan Personalizado
// =========================================================================
router.post('/agendar', (req, res) => {
    const { id: userId, fecha, hora, especialista } = req.body;

    // 1. Validaciones básicas
    if (!userId || !fecha || !hora || !especialista) {
        return res.status(400).json({ success: false, message: 'Faltan datos: id, fecha, hora, especialista.' });
    }

    console.log(`🤖 N8N Request: Cliente ${userId} | ${fecha} ${hora} | Servicio: ${especialista}`);

    // 2. OBTENER PLAN DEL USUARIO (Para saber si bloquea agenda)
    const sqlUser = 'SELECT PLAN FROM Users WHERE id = ?';
    
    db.query(sqlUser, [userId], (errUser, resultUser) => {
        if (errUser) {
            console.error(errUser);
            return res.status(500).json({ success: false, message: 'Error verificando usuario.' });
        }
        if (resultUser.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
        }

        // Analizar si el plan es personalizado
        const userPlan = (resultUser[0].PLAN || '').toLowerCase();
        const isPersonalized = userPlan.includes('personalizado');
        
        // Si es personalizado, activamos el "Lock" (1), si no, lo dejamos abierto (0)
        const lockingValue = isPersonalized ? 1 : 0; 

        if (isPersonalized) console.log("💎 Cliente con Plan Personalizado detectado. Se intentará bloquear cupo.");

        // 3. Calcular variables de tiempo
        const dateObj = new Date(`${fecha}T${hora}`);
        let jsDay = dateObj.getDay(); 
        const dayOfWeek = (jsDay === 0) ? 7 : jsDay; // 1=Lunes ... 7=Domingo
        const hourInt = parseInt(hora.split(':')[0]);

        if (dayOfWeek === 7) {
            return res.status(400).json({ success: false, message: 'Domingos cerrado.' });
        }

        // 4. DEFINIR CANDIDATOS (Edna vs Entrenadores)
        let targetStaffId = null;
        let targetRole = 'Entrenador';
        let serviceType = 'General';

        if (especialista.toLowerCase().includes('biomecánico') || especialista.toLowerCase().includes('biomecanico')) {
            if (dayOfWeek !== 2 && dayOfWeek !== 3) return res.status(400).json({ success: false, message: 'Análisis Biomecánico solo Martes y Miércoles.' });
            targetStaffId = 9; // Edna
            serviceType = 'Biomecánico';
        } 
        else if (especialista.toLowerCase().includes('fisioterapia')) {
            if (dayOfWeek !== 1 && dayOfWeek !== 6) return res.status(400).json({ success: false, message: 'Fisioterapia solo Lunes y Sábados.' });
            targetStaffId = 9; // Edna
            serviceType = 'Fisioterapia';
        }
        else {
            targetRole = 'Entrenador';
            serviceType = 'Entrenamiento';
        }

        // 5. QUERY DE STAFF
        let sqlStaff = 'SELECT id, name, role FROM Staff WHERE is_active = 1';
        const queryParams = [];

        if (targetStaffId) {
            sqlStaff += ' AND id = ?';
            queryParams.push(targetStaffId);
        } else {
            sqlStaff += ' AND role = ? ORDER BY priority_order ASC';
            queryParams.push(targetRole);
        }

        db.query(sqlStaff, queryParams, (err, candidates) => {
            if (err) return res.status(500).json({ success: false, message: 'Error DB Staff.' });
            if (candidates.length === 0) return res.status(400).json({ success: false, message: 'No hay personal disponible.' });

            // 6. FILTRADO DE HORARIOS (Iván / Edna / General)
            const validCandidates = candidates.filter(staff => {
                // Regla Iván (ID 5) - Viernes
                if (staff.id === 5) {
                    if (dayOfWeek === 5) { 
                        const isMorning = (hourInt >= 5 && hourInt < 9); 
                        const isAfternoon = (hourInt >= 16 && hourInt < 18);
                        if (!isMorning && !isAfternoon) return false;
                    } else {
                        if (hourInt < 5 || hourInt >= 10) return false; // Lunes-Jueves solo mañana
                    }
                }
                // Regla Edna (ID 9) - Horas
                if (staff.id === 9) {
                    const isMorning = (hourInt >= 7 && hourInt < 11);
                    const isAfternoon = (hourInt >= 15 && hourInt < 19);
                    if (!isMorning && !isAfternoon) return false;
                }
                return true;
            });

            if (validCandidates.length === 0) {
                return res.status(400).json({ success: false, message: 'El especialista no atiende en este horario.' });
            }

            // 7. VERIFICACIÓN DE CUPOS + LOGICA DE BLOQUEO (LOCKING)
            const tryBook = (index) => {
                if (index >= validCandidates.length) {
                    return res.status(400).json({ success: false, message: 'No hay cupos disponibles o la agenda está cerrada por exclusividad.' });
                }

                const staff = validCandidates[index];
                const maxCapacity = (staff.id === 9) ? 1 : 5;

                // VERIFICAMOS SI ESTÁ "BLOQUEADO"
                // MAX(is_locking) devolverá 1 si al menos UNA cita tiene el bloqueo activado
                const sqlCount = `
                    SELECT COUNT(*) as total, MAX(is_locking) as is_locked
                    FROM Appointments 
                    WHERE staff_id = ? AND appointment_date = ? AND start_time = ? AND status = 'confirmed'
                `;

                db.query(sqlCount, [staff.id, fecha, hora], (errCount, resCount) => {
                    if (errCount) return tryBook(index + 1);

                    const current = resCount[0].total;
                    const isLocked = resCount[0].is_locked; // Será 1 o 0 (o null)

                    // REGLA DE ORO: Si is_locked es 1, NADIE entra, aunque haya espacio.
                    if (isLocked == 1) {
                        // Está bloqueado por un personalizado previo, probamos siguiente staff
                        return tryBook(index + 1);
                    }

                    // Si NO está bloqueado, revisamos capacidad normal
                    if (current < maxCapacity) {
                        
                        // Si el usuario es Personalizado, necesitamos asegurar que el entrenador esté "Libre"
                        // Interpretación: "Libre" = Capacidad disponible. Al insertar con is_locking=1, cerramos la puerta detrás de nosotros.
                        
                        const sqlInsert = `
                            INSERT INTO Appointments (user_id, staff_id, appointment_date, start_time, end_time, status, is_locking)
                            VALUES (?, ?, ?, ?, ADDTIME(?, '01:00:00'), 'confirmed', ?)
                        `;
                        
                        db.query(sqlInsert, [userId, staff.id, fecha, hora, hora, lockingValue], (errInsert, result) => {
                            if (errInsert) {
                                if (errInsert.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'Usuario ya tiene cita a esta hora.' });
                                return res.status(500).json({ success: false, message: 'Error al guardar.' });
                            }

                            return res.json({
                                success: true,
                                message: `Reserva exitosa con ${staff.name}`,
                                type: isPersonalized ? 'Personalizada (Bloqueo Activado)' : 'Estándar',
                                data: { cita_id: result.insertId, staff: staff.name, fecha, hora }
                            });
                        });

                    } else {
                        // Lleno por capacidad normal
                        tryBook(index + 1);
                    }
                });
            };

            tryBook(0);
        });
    });
});

module.exports = router;