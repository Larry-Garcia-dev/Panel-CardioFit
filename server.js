require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const cron = require('node-cron');
const axios = require('axios');
const cors = require('cors');

// IMPORTAR CONEXIÓN COMPARTIDA (POOL)
// Esta línea carga la configuración de config/db.js
// Ya no necesitamos 'mysql2' ni crear conexiones aquí.
const db = require('./config/db');

// IMPORTAR RUTAS
const staffRoutes = require('./routes/staff');
const schedulerRoutes = require('./routes/scheduler');
const membershipRoutes = require('./routes/memberships');
const n8nRoutes = require('./api/external-scheduler');
const publicRoutes = require('./routes/public');
const birthdayRoutes = require('./routes/birthdays');
const app = express();
const dominiosPermitidos = [
    'https://admin-cardiofit.online', 
    'https://www.admin-cardiofit.online'
];

app.use(cors({
    origin: function (origin, callback) {
        // Permitir si no hay origen (como apps móviles o N8N) o si está en la lista
        if (!origin || dominiosPermitidos.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log("🚫 Origen bloqueado por CORS:", origin);
            callback(new Error('Bloqueado por CORS: Dominio no autorizado'));
        }
    },
    credentials: true
}));

// ==========================================
// 1. MIDDLEWARE
// ==========================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'secret_cardiofit',
    resave: false,
    saveUninitialized: true
}));


app.use('/api/public', publicRoutes);

// app.get('/:phone', (req, res, next) => {
//     const phone = req.params.phone;
    
//     // Si parece un archivo (tiene punto) o es una ruta de sistema, saltar
//     if (phone.includes('.') || phone.startsWith('api') || phone === 'favicon.ico') return next();

//     // Servir la nueva vista móvil
//     res.sendFile(path.join(__dirname, 'public', 'booking.html'));
// });

app.get('/:phone', (req, res, next) => {
    const phone = req.params.phone;
    
    // CORRECCIÓN: Agregamos "logout" y "admin" a las excepciones
    if (phone === 'logout' || phone === 'admin' || phone.includes('.') || phone.startsWith('api') || phone === 'favicon.ico') {
        return next();
    }

    // Servir la nueva vista móvil
    res.sendFile(path.join(__dirname, 'public', 'booking.html'));
});

// ==========================================
// 2. MIDDLEWARE DE SEGURIDAD Y BLINDAJE
// ==========================================
app.use((req, res, next) => {
    const rutasPublicas = [
        '/login.html',
        '/register.html',
        '/kiosk.html',
        '/api/login',
        '/api/register',
        '/api/check-session',
        '/api/appointments/kiosk-day',
        // '/api/scheduler/book',
        '/api/n8n/agendar' // N8N necesita acceso público
    ];

    // 1. Permitir archivos estáticos
    if (req.path.includes('.') && !req.path.endsWith('.html')) return next();
    
    // 2. Permitir rutas públicas definidas
    if (rutasPublicas.includes(req.path)) return next();

    // 3. CAPA EXTRA DE BLINDAJE (Opcional pero recomendada)
    // Evita que otros sistemas ataquen tus APIs directamente si no son n8n
    const origin = req.get('origin');
    const referer = req.get('referer');
    const esDominioPermitido = 
        (origin && origin.includes('admin-cardiofit.online')) || 
        (referer && referer.includes('admin-cardiofit.online'));

    // Si es una petición a la API, no es pública, y no viene de tu dominio -> Bloquear
    if (req.path.startsWith('/api/') && !esDominioPermitido && req.path !== '/api/n8n/agendar') {
        return res.status(403).json({ success: false, message: 'Acceso denegado: Origen no válido' });
    }

    // 4. VERIFICACIÓN DE SESIÓN ESTRICTA
    if (req.session.loggedin) {
        // Validar que SOLO los ADMIN puedan modificar datos de usuarios/pagos
        const rutasSensibles = ['/api/users', '/api/staff-management'];
        
        // PASAMOS TODO A MINÚSCULAS PARA EVITAR EL TRUCO DEL ATACANTE
        const pathMinuscula = req.path.toLowerCase();
        const isRutaSensible = rutasSensibles.some(ruta => pathMinuscula.startsWith(ruta.toLowerCase()));
        const isModificacion = ['POST', 'PUT', 'DELETE'].includes(req.method);

        if (isRutaSensible && isModificacion && req.session.role !== 'admin') {
            return res.status(403).json({ 
                success: false, 
                message: 'Bloqueo de seguridad: Solo un Administrador puede realizar esta acción.' 
            });
        }
        
        return next();
    }

    // Si no está logueado, redirigir o devolver error 401
    if (req.path === '/' || req.path.endsWith('.html')) return res.redirect('/login.html');
    if (req.path.startsWith('/api/')) return res.status(401).json({ success: false, message: 'No autorizado, inicie sesión' });

    next();
});

// ==========================================
// 3. RUTAS
// ==========================================
app.use(express.static('public'));
app.use('/api/staff-management', staffRoutes);
app.use('/api/memberships', membershipRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/n8n', n8nRoutes);
app.use('/api/birthdays', birthdayRoutes);


// --- RUTAS DE API (BACKEND) ---

// 1. Registro de Administrador
app.post('/api/register', (req, res) => {
    const { nombre, email, password, secretCode } = req.body;

    // A. AUTENTICACIÓN DE ADMINISTRADOR
    const CODIGO_SECRETO_REQUERIDO = 'Mafexpress2026!';

    if (secretCode !== CODIGO_SECRETO_REQUERIDO) {
        return res.json({ success: false, message: 'Código de seguridad inválido. No tienes permiso para crear admins.' });
    }

    // B. VALIDACIÓN DE DATOS
    if (!nombre || !email || !password) {
        return res.json({ success: false, message: 'Por favor completa todos los campos.' });
    }

    // C. VERIFICAR QUE EL EMAIL NO EXISTA YA
    const checkSql = 'SELECT id FROM admins WHERE email = ?';
    db.query(checkSql, [email], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: 'Error verificando cuenta.' });
        }

        if (results.length > 0) {
            return res.json({ success: false, message: 'Este correo ya está registrado como administrador.' });
        }

        // D. INSERTAR EN LA BASE DE DATOS
        // Nota: Se guarda la contraseña tal cual para ser compatible con tu sistema de login actual.
        const insertSql = 'INSERT INTO admins (nombre, email, password) VALUES (?, ?, ?)';
        db.query(insertSql, [nombre, email, password], (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ success: false, message: 'Error guardando en base de datos.' });
            }
            res.json({ success: true, message: '¡Administrador registrado exitosamente!' });
        });
    });
});
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

// 4. Logout (Corregido)
app.get('/logout', (req, res) => {
    // 1. Destruir la sesión en la base de datos/memoria
    req.session.destroy((err) => {
        if (err) {
            console.error('Error cerrando sesión:', err);
            return res.redirect('/'); 
        }
        
        // 2. Borrar la cookie del navegador (nombre por defecto 'connect.sid')
        res.clearCookie('connect.sid'); 
        
        // 3. Redirigir al login
        res.redirect('/login.html');
    });
});

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

// ==========================================
// NUEVA RUTA: Obtener citas por rango para un Staff específico
// ==========================================
app.get('/api/appointments/staff-range', (req, res) => {
    const { staffId, start, end } = req.query;

    if (!staffId || !start || !end) {
        return res.status(400).json({ error: 'Faltan parámetros' });
    }

    // AGREGAMOS a.service_name AQUÍ
    const sql = `
        SELECT a.id, a.appointment_date, a.start_time, a.end_time, a.status, a.service_name,
               u.USUARIO as cliente, u.TELEFONO, u.PLAN
        FROM Appointments a
        JOIN Users u ON a.user_id = u.id
        WHERE a.staff_id = ? 
          AND a.appointment_date BETWEEN ? AND ?
          AND a.status = 'confirmed'
        ORDER BY a.appointment_date ASC, a.start_time ASC
    `;

    db.query(sql, [staffId, start, end], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error db' });
        }
        res.json(results);
    });
});

// 7. Obtener detalles de un usuario específico
app.get('/api/Users/:id', (req, res) => {
    const sql = 'SELECT * FROM Users WHERE id = ?';
    db.query(sql, [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: 'Error db' });
        if (result.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json(result[0]);
    });
});

// 8. Actualizar Usuario (VERSIÓN CON PAGOS)
app.put('/api/Users/:id', (req, res) => {
    const id = req.params.id;

    // Función para limpiar datos vacíos
    const clean = (val) => (val === '' || val === undefined || val === 'null') ? null : val;

    const {
        usuario, cedula, correo, telefono, plan,
        f_ingreso, f_vencimiento, estado, f_nacimiento,
        edad, sexo, f_examen, f_nutricion, f_deportiva, direccion,
        plan_info, fecha_pago, notas,
        metodo_pago, monto_pago,fecha_registro // <--- NUEVOS CAMPOS RECIBIDOS
    } = req.body;

    console.log(`📝 Actualizando ID ${id} con Pago: ${metodo_pago} - $${monto_pago}`);

    const sql = `
        UPDATE Users 
        SET 
            USUARIO = ?, N_CEDULA = ?, CORREO_ELECTRONICO = ?, TELEFONO = ?, PLAN = ?,
            F_INGRESO = ?, F_VENCIMIENTO = ?, ESTADO = ?, F_N = ?, 
            EDAD = ?, SEXO = ?, F_EXAMEN_LABORATORIO = ?, 
            F_CITA_NUTRICION = ?, F_CITA_MED_DEPORTIVA = ?, DIRECCION_O_BARRIO = ?,
            PLAN_INFO = ?, FECHA_PAGO = ?, NOTAS = ?,
            METODO_PAGO = ?, MONTO_PAGO = ?, FECHA_REGISTRO = ?
        WHERE id = ?
    `;

    const values = [
        usuario, cedula, correo, telefono, plan,
        clean(f_ingreso), clean(f_vencimiento), estado, clean(f_nacimiento),
        clean(edad), sexo, clean(f_examen), clean(f_nutricion), clean(f_deportiva), direccion,
        plan_info,
        clean(fecha_pago),
        notas,
        clean(metodo_pago), // <--- VALOR METODO
        clean(monto_pago),  // <--- VALOR MONTO
        clean(fecha_registro), // <--- VALOR FECHA REGISTRO
        id
    ];

    db.query(sql, values, (err, result) => {
        if (err) {
            console.error("❌ Error SQL:", err);
            return res.status(500).json({ success: false, message: 'Error en base de datos: ' + err.sqlMessage });
        }
        res.json({ success: true, message: 'Datos y pago actualizados correctamente' });
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
// 2. VENCIMIENTO AUTOMÁTICO (00:05 AM) - ¡NUEVA FUNCIÓN!
cron.schedule('5 0 * * *', () => {
    console.log('🔄 Cron: Verificando membresías vencidas...');
    // Busca usuarios ACTIVOS cuya fecha de vencimiento sea MENOR a hoy (ayer o antes)
    const sql = `UPDATE Users SET ESTADO = 'VENCIDO' WHERE ESTADO = 'ACTIVO' AND F_VENCIMIENTO < CURDATE()`;
    
    db.query(sql, (err, result) => {
        if (err) {
            console.error('❌ Error actualizando vencidos:', err);
        } else if (result.changedRows > 0) {
            console.log(`✅ Sistema: Se marcaron ${result.changedRows} usuarios como VENCIDO.`);
        } else {
            console.log('ℹ️ No hay nuevos vencimientos hoy.');
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


// B. Cancelar una reserva

// ==========================================
// RUTA KIOSCO: TODA LA AGENDA DEL DÍA
// ==========================================
app.get('/api/appointments/kiosk-day', (req, res) => {
    const now = new Date();

    // Hora actual del sistema (0-23) para que el frontend sepa cuál enfocar
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();

    const displayTime = now.toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });

    // Consulta: TODAS las citas confirmadas DE HOY ordenadas por hora
    const sql = `
        SELECT 
            a.start_time, 
            u.USUARIO as cliente, 
            s.name as staff_nombre,
            s.role as staff_rol
        FROM Appointments a
        JOIN Users u ON a.user_id = u.id
        JOIN Staff s ON a.staff_id = s.id
        WHERE a.appointment_date = CURDATE()
          AND a.status = 'confirmed'
        ORDER BY a.start_time ASC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error interno' });
        }

        res.json({
            currentTimeStr: displayTime,
            currentHourInt: currentHour,
            appointments: results
        });
    });
});

// ... (código existente)

// ==========================================
// NUEVA RUTA: Obtener citas por rango para un Staff específico
// ==========================================
app.get('/api/appointments/staff-range', (req, res) => {
    const { staffId, start, end } = req.query;

    if (!staffId || !start || !end) {
        return res.status(400).json({ error: 'Faltan parámetros' });
    }

    const sql = `
        SELECT a.id, a.appointment_date, a.start_time, a.end_time, a.status,
               u.USUARIO as cliente, u.TELEFONO, u.PLAN
        FROM Appointments a
        JOIN Users u ON a.user_id = u.id
        WHERE a.staff_id = ? 
          AND a.appointment_date BETWEEN ? AND ?
          AND a.status = 'confirmed'
        ORDER BY a.appointment_date ASC, a.start_time ASC
    `;

    db.query(sql, [staffId, start, end], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error db' });
        }
        res.json(results);
    });
});

// ========================================== Sauna gratis===========================================
app.get(['/:phone', '/:phone/saunagratis'], (req, res, next) => {
    const phone = req.params.phone;
    
    // Validaciones de seguridad existentes
    if (phone.includes('.') || phone.startsWith('api') || phone === 'favicon.ico') return next();

    // Servir el mismo archivo HTML, el frontend leerá la URL para saber si activa la promo
    res.sendFile(path.join(__dirname, 'public', 'booking.html'));
});


db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Error conectando a la Base de Datos:', err.code);
        console.error('   -> Verifica que XAMPP/MySQL esté encendido y la IP autorizada.');
    } else {
        console.log('✅ Conectado exitosamente a la Base de Datos: CardioFit');
        connection.release(); // Siempre liberar la conexión tras la prueba
    }
});
// ... (resto del código, app.listen, etc.)
// Iniciar Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});