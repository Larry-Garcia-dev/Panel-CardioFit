// routes/birthdays.js
const express = require('express');
const router = express.Router();
const cron = require('node-cron');
const axios = require('axios');
const db = require('../config/db'); // Conexión a la BD

const WEBHOOK_URL = 'https://n8n.magnificapec.com/webhook/ab413d92-09d2-4405-b99d-31e999c2da85-cumpleanos';

// ==========================================
// TAREA AUTOMÁTICA: CUMPLEAÑOS (Todos los días a las 08:00 AM)
// ==========================================
cron.schedule('0 8 * * *', () => {
    console.log('🔄 Cron: Buscando cumpleañeros del día...');
    
    const sql = `
        SELECT id, USUARIO, TELEFONO, CORREO_ELECTRONICO, F_N, ESTADO, PLAN 
        FROM Users 
        WHERE MONTH(F_N) = MONTH(CURDATE()) 
          AND DAY(F_N) = DAY(CURDATE())
    `;
    
    db.query(sql, (err, users) => {
        if (err) return console.error('❌ Error buscando cumpleaños:', err);
        
        if (users.length > 0) {
            axios.post(WEBHOOK_URL, {
                fecha: new Date().toISOString().split('T')[0],
                total_cumpleaneros: users.length,
                cumpleaneros: users
            }).then(() => {
                console.log(`✅ ${users.length} cumpleañeros enviados al webhook exitosamente.`);
            }).catch(e => console.error("⚠️ Error enviando webhook de cumpleaños:", e.message));
        } else {
            console.log('ℹ️ No hay cumpleañeros el día de hoy.');
        }
    });
});

// ==========================================
// RUTA: FORZAR ENVÍO DE CUMPLEAÑOS MANUALMENTE (PRUEBAS)
// ==========================================
router.get('/trigger', async (req, res) => {
    const sql = `
        SELECT id, USUARIO, TELEFONO, CORREO_ELECTRONICO, F_N, ESTADO, PLAN 
        FROM Users 
        WHERE MONTH(F_N) = MONTH(CURDATE()) 
          AND DAY(F_N) = DAY(CURDATE())
    `;
    
    db.query(sql, async (err, users) => {
        if (err) {
            console.error('Error buscando cumpleaños:', err);
            return res.status(500).json({ success: false, message: 'Error consultando base de datos' });
        }

        if (users.length === 0) {
            return res.json({ success: true, message: 'No hay cumpleañeros el día de hoy.', data: [] });
        }

        try {
            await axios.post(WEBHOOK_URL, {
                fecha: new Date().toISOString().split('T')[0],
                total_cumpleaneros: users.length,
                cumpleaneros: users
            });
            
            res.json({ 
                success: true, 
                message: `Se enviaron ${users.length} cumpleañeros al webhook.`, 
                data: users 
            });
        } catch (webhookErr) {
            res.status(500).json({ success: false, message: 'Fallo la conexión con N8N', error: webhookErr.message });
        }
    });
});

module.exports = router;