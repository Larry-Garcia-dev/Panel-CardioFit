require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const cron = require('node-cron');
const axios = require('axios')
const app = express();
const staffRoutes = require('./routes/staff');

// Configuración de Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public')); // Sirve los archivos HTML/CSS
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
}));
app.use('/api/staff-management', staffRoutes);

// Conexión a Base de Datos
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});

db.connect(err => {
    if (err) {
        console.error('❌ Error conectando a MySQL:', err);
        return;
    }
    console.log('✅ Conectado a MySQL Base de Datos: CardioFit');
});

// --- RUTAS DE API (BACKEND) ---

// 1. Registro de Administrador
// 2. Login Mejorado (Admin o Staff)
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    // 1. Intentar buscar en ADMINS
    const sqlAdmin = 'SELECT * FROM admins WHERE email = ? AND password = ?';
    db.query(sqlAdmin, [email, password], (err, adminResults) => {
        if (err) throw err;

        if (adminResults.length > 0) {
            req.session.loggedin = true;
            req.session.username = adminResults[0].nombre;
            req.session.role = 'admin'; // Importante para permisos
            req.session.userId = adminResults[0].id;
            return res.json({ success: true, role: 'admin', redirect: '/index.html' });
        }

        // 2. Si no es admin, intentar buscar en STAFF
        const sqlStaff = 'SELECT * FROM Staff WHERE email = ? AND password = ? AND is_active = 1';
        db.query(sqlStaff, [email, password], (err, staffResults) => {
            if (err) throw err;

            if (staffResults.length > 0) {
                req.session.loggedin = true;
                req.session.username = staffResults[0].name;
                req.session.role = 'staff';
                req.session.userId = staffResults[0].id; // ID del staff para filtrar su agenda
                return res.json({ success: true, role: 'staff', redirect: '/staff-agenda.html' });
            }

            // 3. Falló todo
            res.status(401).json({ success: false, message: 'Credenciales incorrectas o cuenta inactiva' });
        });
    });
});

// Modificar check-session para devolver el rol y el ID
app.get('/api/check-session', (req, res) => {
    if (req.session.loggedin) {
        res.json({ 
            loggedin: true, 
            user: req.session.username, 
            role: req.session.role,
            id: req.session.userId 
        });
    } else {
        res.json({ loggedin: false });
    }
});

// 3. Verificar Sesión (Para proteger el dashboard)
app.get('/api/check-session', (req, res) => {
    if (req.session.loggedin) {
        res.json({ loggedin: true, user: req.session.username });
    } else {
        res.json({ loggedin: false });
    }
});

// 4. Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});
// --- NUEVAS RUTAS FASE 2 ---

// 5. Buscador Inteligente
app.get('/api/Users/search', (req, res) => {
    const query = req.query.q; // Lo que escribe el usuario
    if (!query) return res.json([]);

    // Buscamos coincidencias en Nombre, Cédula, Correo o Teléfono
    // Usamos LOWER() para que no importen mayúsculas/minúsculas
    const sql = `
        SELECT id, USUARIO, N_CEDULA, CORREO_ELECTRONICO, TELEFONO, ESTADO 
        FROM Users 
        WHERE USUARIO LIKE ? 
           OR N_CEDULA LIKE ? 
           OR CORREO_ELECTRONICO LIKE ? 
           OR TELEFONO LIKE ?
        LIMIT 10
    `;

    const searchTerm = `%${query}%`;

    db.query(sql, [searchTerm, searchTerm, searchTerm, searchTerm], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error en la búsqueda' });
        }
        res.json(results);
    });
});

// 6. Agenda del Día (Citas de HOY)
app.get('/api/appointments/today', (req, res) => {
    // CAMBIO: Agregamos u.TELEFONO a la consulta
    const sql = `
        SELECT a.id, a.start_time, a.end_time, u.USUARIO as cliente, u.TELEFONO, s.name as entrenador
        FROM Appointments a
        JOIN Users u ON a.user_id = u.id
        JOIN Staff s ON a.staff_id = s.id
        WHERE a.appointment_date = CURDATE()
        ORDER BY a.start_time ASC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error cargando agenda' });
        }
        res.json(results);
    });
});
// --- NUEVAS RUTAS FASE 3 (EDICIÓN) ---

// 7. Obtener detalles de un usuario específico
app.get('/api/Users/:id', (req, res) => {
    const sql = 'SELECT * FROM Users WHERE id = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: 'Error db' });
        if (result.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json(result[0]);
    });
});

// 8. Actualizar Usuario (VERSIÓN BLINDADA)
app.put('/api/Users/:id', (req, res) => {
    const id = req.params.id;

    // Función para limpiar datos vacíos (Evita errores con fechas e ints)
    const clean = (val) => (val === '' || val === undefined || val === 'null') ? null : val;

    const {
        usuario, cedula, correo, telefono, plan,
        f_ingreso, f_vencimiento, estado, f_nacimiento,
        edad, sexo, f_examen, f_nutricion, f_deportiva, direccion
    } = req.body;

    // DEBUG: Ver en la terminal qué está llegando
    console.log(`📝 Actualizando ID ${id}:`, { usuario, direccion, edad, f_nacimiento });

    const sql = `
        UPDATE Users 
        SET 
            USUARIO = ?, N_CEDULA = ?, CORREO_ELECTRONICO = ?, TELEFONO = ?, PLAN = ?,
            F_INGRESO = ?, F_VENCIMIENTO = ?, ESTADO = ?, F_N = ?, 
            EDAD = ?, SEXO = ?, F_EXAMEN_LABORATORIO = ?, 
            F_CITA_NUTRICION = ?, F_CITA_MED_DEPORTIVA = ?, DIRECCION_O_BARRIO = ?
        WHERE id = ?
    `;

    // Mapeo exacto de variables a columnas
    const values = [
        usuario,
        cedula,
        correo,
        telefono,
        plan,
        clean(f_ingreso),
        clean(f_vencimiento),
        estado,
        clean(f_nacimiento),
        clean(edad),
        sexo,
        clean(f_examen),
        clean(f_nutricion),
        clean(f_deportiva),
        direccion,
        id
    ];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error("❌ Error SQL:", err);
            return res.status(500).json({ success: false, message: 'Error en base de datos: ' + err.sqlMessage });
        }
        console.log("✅ Filas afectadas:", result.changedRows);
        res.json({ success: true, message: 'Datos guardados correctamente' });
    });
});

// ==========================================
// 9. LÓGICA DE CONGELAMIENTO (CORREGIDO Y COMPLETO)
// ==========================================
app.put('/api/Users/:id/freeze', (req, res) => {
    const id = req.params.id;
    const { fechaInicio, fechaFin } = req.body;

    // Validación: Que envíen las dos fechas
    if (!fechaInicio || !fechaFin) {
        return res.status(400).json({ success: false, message: 'Faltan fechas de inicio o fin.' });
    }

    // 1. Buscamos la fecha de vencimiento actual del usuario
    const sqlGet = 'SELECT F_VENCIMIENTO FROM Users WHERE id = ?';

    db.query(sqlGet, [id], (err, results) => {
        if (err || results.length === 0) {
            return res.status(500).json({ message: 'Error buscando usuario o usuario no existe' });
        }

        const currentExpiration = results[0].F_VENCIMIENTO;

        // Si el usuario no tiene fecha de vencimiento (es nuevo), no podemos extender nada
        if (!currentExpiration) {
            return res.status(400).json({ success: false, message: 'Este usuario no tiene fecha de vencimiento para extender.' });
        }

        let fechaVencimientoActual = new Date(currentExpiration);

        // 2. CÁLCULO MATEMÁTICO: Diferencia de días
        const dInicio = new Date(fechaInicio);
        const dFin = new Date(fechaFin);

        // Calcular diferencia en milisegundos y convertir a días
        // (1000ms * 60s * 60m * 24h) = Milisegundos en un día
        const diffTime = Math.abs(dFin - dInicio);
        const diasCongelados = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diasCongelados <= 0) {
            return res.status(400).json({ success: false, message: 'El rango de fechas no es válido.' });
        }

        // 3. Sumar esos días a la fecha de vencimiento actual (Extensión del plan)
        fechaVencimientoActual.setDate(fechaVencimientoActual.getDate() + diasCongelados);

        // ---------------------------------------------------------------
        // 4. GUARDAR EN BD (CORRECCIÓN COMPLETA)
        // Guardamos fecha de vencimiento extendida, estado CONGELADO, 
        // y AMBAS fechas del rango de congelamiento (Inicio y Fin).
        // ---------------------------------------------------------------
        const sqlUpdate = `
            UPDATE Users 
            SET F_VENCIMIENTO = ?, 
                ESTADO = 'CONGELADO', 
                F_FIN_CONGELAMIENTO = ?, 
                F_INICIO_CONGELAMIENTO = ? 
            WHERE id = ?
        `;

        // Pasamos fechaVencimientoActual, fechaFin, fechaInicio y el id
        db.query(sqlUpdate, [fechaVencimientoActual, fechaFin, fechaInicio, id], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'Error SQL al actualizar' });

            res.json({
                success: true,
                message: `Membresía congelada por ${diasCongelados} días. Se extendió el vencimiento y se reactivará automáticamente el ${fechaFin}.`
            });
        });
    });
});
// ==========================================
// 9. LÓGICA DE CONGELAMIENTO (CORREGIDO Y COMPLETO)
// ==========================================
app.put('/api/Users/:id/freeze', (req, res) => {
    const id = req.params.id;
    const { fechaInicio, fechaFin } = req.body;

    // Validación: Que envíen las dos fechas
    if (!fechaInicio || !fechaFin) {
        return res.status(400).json({ success: false, message: 'Faltan fechas de inicio o fin.' });
    }

    // 1. Buscamos la fecha de vencimiento actual del usuario
    const sqlGet = 'SELECT F_VENCIMIENTO FROM Users WHERE id = ?';

    db.query(sqlGet, [id], (err, results) => {
        if (err || results.length === 0) {
            return res.status(500).json({ message: 'Error buscando usuario o usuario no existe' });
        }

        const currentExpiration = results[0].F_VENCIMIENTO;

        // Si el usuario no tiene fecha de vencimiento (es nuevo), no podemos extender nada
        if (!currentExpiration) {
            return res.status(400).json({ success: false, message: 'Este usuario no tiene fecha de vencimiento para extender.' });
        }

        let fechaVencimientoActual = new Date(currentExpiration);

        // 2. CÁLCULO MATEMÁTICO: Diferencia de días
        const dInicio = new Date(fechaInicio);
        const dFin = new Date(fechaFin);

        // Calcular diferencia en milisegundos y convertir a días
        // (1000ms * 60s * 60m * 24h) = Milisegundos en un día
        const diffTime = Math.abs(dFin - dInicio);
        const diasCongelados = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diasCongelados <= 0) {
            return res.status(400).json({ success: false, message: 'El rango de fechas no es válido.' });
        }

        // 3. Sumar esos días a la fecha de vencimiento actual (Extensión del plan)
        fechaVencimientoActual.setDate(fechaVencimientoActual.getDate() + diasCongelados);

        // ---------------------------------------------------------------
        // 4. GUARDAR EN BD (CORRECCIÓN COMPLETA)
        // Guardamos fecha de vencimiento extendida, estado CONGELADO, 
        // y AMBAS fechas del rango de congelamiento (Inicio y Fin).
        // ---------------------------------------------------------------
        const sqlUpdate = `
            UPDATE Users 
            SET F_VENCIMIENTO = ?, 
                ESTADO = 'CONGELADO', 
                F_FIN_CONGELAMIENTO = ?, 
                F_INICIO_CONGELAMIENTO = ? 
            WHERE id = ?
        `;

        // Pasamos fechaVencimientoActual, fechaFin, fechaInicio y el id
        db.query(sqlUpdate, [fechaVencimientoActual, fechaFin, fechaInicio, id], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'Error SQL al actualizar' });

            res.json({
                success: true,
                message: `Membresía congelada por ${diasCongelados} días. Se extendió el vencimiento y se reactivará automáticamente el ${fechaFin}.`
            });
        });
    });
});


// Nuevo: Obtener lista de Staff (Entrenadores, Fisio, etc.)
app.get('/api/staff', (req, res) => {
    // Solo traemos a los activos
    const sql = 'SELECT id, name, role FROM Staff WHERE is_active = 1 ORDER BY name ASC';
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: 'Error db' });
        res.json(results);
    });
});
// ==========================================
// 10. Agendar Cita con Envío a Webhook
// ==========================================
app.post('/api/Appointments', (req, res) => {
    const { userId, fecha, hora, staffId } = req.body;

    if (!userId || !fecha || !hora || !staffId) {
        return res.status(400).json({
            success: false,
            message: 'Faltan datos: Debes seleccionar un profesional, fecha y hora.'
        });
    }

    const formattedTime = hora.includes(':') && hora.split(':').length === 2 ? `${hora}:00` : hora;
    const dayOfWeek = new Date(fecha).getUTCDay() + 1; // 1=Lunes, 7=Domingo

    // 1. Obtener información completa para el Webhook (Usuario, Staff y Horario)
    const sqlFullInfo = `
        SELECT 
            u.USUARIO as cliente_nombre, u.TELEFONO as cliente_tel, u.CORREO_ELECTRONICO as cliente_email,
            s.name as staff_nombre, s.role as staff_role,
            ws.start_time, ws.end_time 
        FROM Users u, Staff s
        JOIN WeeklySchedules ws ON s.id = ws.staff_id
        WHERE u.id = ? AND s.id = ? AND ws.day_of_week = ? 
          AND ? >= ws.start_time AND ? < ws.end_time
    `;

    db.query(sqlFullInfo, [userId, staffId, dayOfWeek, formattedTime, formattedTime], (err, infoResults) => {
        if (err || infoResults.length === 0) {
            return res.status(400).json({ success: false, message: 'Error de validación o el profesional no está disponible.' });
        }

        const details = infoResults[0];
        
        // --- Lógica de capacidad dinámica (Simplificada para el ejemplo) ---
        // Aquí iría tu validación de 4 o 5 personas según el orden de prioridad
        const maxCapacity = 5; // Ajustar según tu lógica de prioridad previa

        const sqlCheck = `SELECT COUNT(*) as current FROM Appointments WHERE staff_id = ? AND appointment_date = ? AND start_time = ? AND status = 'confirmed'`;
        
        db.query(sqlCheck, [staffId, fecha, formattedTime], (err, checkRes) => {
            if (checkRes[0].current >= maxCapacity) {
                return res.status(400).json({ success: false, message: 'Cupo lleno.' });
            }

            // 2. Insertar en Base de Datos
            const sqlInsert = `INSERT INTO Appointments (user_id, staff_id, appointment_date, start_time, end_time, status) VALUES (?, ?, ?, ?, ADDTIME(?, '01:00:00'), 'confirmed')`;
            
            db.query(sqlInsert, [userId, staffId, fecha, formattedTime, formattedTime], async (err, result) => {
                if (err) return res.status(500).json({ success: false, message: 'Error al registrar.' });

                // 3. ENVÍO AL WEBHOOK
                const webhookData = {
                    evento: "nueva_cita",
                    cita_id: result.insertId,
                    fecha: fecha,
                    hora: formattedTime,
                    cliente: {
                        id: userId,
                        nombre: details.cliente_nombre,
                        telefono: details.cliente_tel,
                        email: details.cliente_email
                    },
                    staff: {
                        id: staffId,
                        nombre: details.staff_nombre,
                        rol: details.staff_role
                    },
                    notificacion: "Cita agendada mediante Panel CardioFit"
                };

                try {
                    await axios.post('https://n8n.magnificapec.com/webhook/ff5e2454-2c1b-4542-be55-48408d97b4e8-panel', webhookData);
                    console.log("✅ Webhook enviado correctamente");
                } catch (error) {
                    console.error("❌ Error enviando al Webhook:", error.message);
                }

                res.json({ 
                    success: true, 
                    message: `Cita confirmada con ${details.staff_nombre}. Los detalles se enviaron al sistema de notificaciones.` 
                });
            });
        });
    });
});

// ==========================================
// TAREA AUTOMÁTICA: DESCONGELAMIENTO DIARIO
// ==========================================
// Se ejecuta todos los días a las 00:01 AM
cron.schedule('1 0 * * *', () => {
    console.log('🔄 Verificando usuarios congelados...');

    // Busca usuarios congelados cuya fecha de fin ya pasó o es hoy
    const sql = `
        UPDATE Users 
        SET ESTADO = 'ACTIVO', F_FIN_CONGELAMIENTO = NULL 
        WHERE ESTADO = 'CONGELADO' AND F_FIN_CONGELAMIENTO <= CURDATE()
    `;

    db.query(sql, (err, result) => {
        if (err) {
            console.error('❌ Error en tarea automática:', err);
        } else if (result.changedRows > 0) {
            console.log(`✅ Sistema: Se reactivaron ${result.changedRows} usuarios automáticamente.`);
        } else {
            console.log('ℹ️ No hubo usuarios para reactivar hoy.');
        }
    });
});

// ==========================================
// 11. CREAR NUEVO USUARIO (CON VENCIMIENTO)
// ==========================================
app.post('/api/Users/create', (req, res) => {
    // 1. Recibimos f_vencimiento del frontend
    const { usuario, cedula, telefono, correo, plan, f_ingreso, f_vencimiento, f_nacimiento, sexo, direccion } = req.body;

    // A. Validaciones básicas
    if (!usuario || !cedula) {
        return res.status(400).json({ success: false, message: '⚠️ Nombre y Cédula son obligatorios.' });
    }

    // B. Verificar duplicados
    const checkSql = 'SELECT id FROM Users WHERE N_CEDULA = ?';
    db.query(checkSql, [cedula], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Error verificando duplicados.' });

        if (results.length > 0) {
            return res.status(400).json({ success: false, message: '⛔ Ya existe un usuario registrado con esta Cédula.' });
        }

        // C. Insertar (AHORA INCLUIMOS F_VENCIMIENTO)
        const insertSql = `
            INSERT INTO Users (
                USUARIO, N_CEDULA, TELEFONO, CORREO_ELECTRONICO, PLAN, 
                F_INGRESO, F_VENCIMIENTO, F_N, SEXO, DIRECCION_O_BARRIO, ESTADO
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO')
        `;

        // Validamos fechas vacías para evitar errores
        const fechaIngreso = f_ingreso || new Date();
        const fechaVencimiento = f_vencimiento || null; // Si no ponen fecha, queda NULL

        const values = [
            usuario, cedula, telefono, correo, plan,
            fechaIngreso, fechaVencimiento, f_nacimiento, sexo, direccion
        ];

        db.query(insertSql, values, (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ success: false, message: 'Error al guardar en base de datos.' });
            }
            res.json({ success: true, message: '✅ Cliente registrado exitosamente.' });
        });
    });
});

// ==========================================
// 12. GESTIÓN DE RESERVAS (VER TODAS Y CANCELAR)
// ==========================================

// A. Ver todas las reservas (con buscador)
app.get('/api/Appointments/all', (req, res) => {
    const query = req.query.q || ''; // Texto del buscador

    const sql = `
        SELECT a.id, a.appointment_date, a.start_time, a.status, 
               u.USUARIO as cliente, u.TELEFONO, s.name as entrenador
        FROM Appointments a
        JOIN Users u ON a.user_id = u.id
        JOIN Staff s ON a.Staff_id = s.id
        WHERE u.USUARIO LIKE ? OR s.name LIKE ?
        ORDER BY a.appointment_date DESC, a.start_time ASC
        LIMIT 50
    `;

    const searchTerm = `%${query}%`;

    db.query(sql, [searchTerm, searchTerm], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error cargando reservas' });
        }
        res.json(results);
    });
});

// B. Cancelar una reserva
app.put('/api/Appointments/:id/cancel', (req, res) => {
    const id = req.params.id;
    const sql = "UPDATE Appointments SET status = 'cancelled' WHERE id = ?";

    db.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Error al cancelar' });
        res.json({ success: true, message: 'Cita cancelada correctamente' });
    });
});
// Iniciar Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});