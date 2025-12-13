// ==========================================
// 1. VERIFICACIÓN DE SESIÓN Y FECHA
// ==========================================
fetch('/api/check-session')
    .then(res => res.json())
    .then(data => {
        if (!data.loggedin) window.location.href = '/login.html';
        else document.getElementById('adminName').innerText = data.user;
    });

// Mostrar fecha actual
document.getElementById('currentDateDisplay').innerText = new Date().toLocaleDateString('es-ES', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

// ==========================================
// 2. LÓGICA DEL BUSCADOR
// ==========================================
const searchInput = document.getElementById('searchInput');
const resultsBox = document.getElementById('searchResults');
const loader = document.getElementById('searchLoader');

searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();

    if (query.length < 2) {
        resultsBox.classList.add('hidden');
        return;
    }

    loader.classList.remove('hidden');

    fetch(`/api/users/search?q=${query}`)
        .then(res => res.json())
        .then(users => {
            loader.classList.add('hidden');
            resultsBox.innerHTML = '';

            if (users.length === 0) {
                resultsBox.innerHTML = `<div class="p-4 text-center text-gray-500">No se encontraron usuarios.</div>`;
            } else {
                users.forEach(user => {
                    const item = document.createElement('div');
                    item.className = 'p-4 border-b hover:bg-blue-50 cursor-pointer transition flex justify-between items-center group';
                    item.innerHTML = `
                        <div>
                            <p class="font-bold text-gray-800 group-hover:text-blue-700">${user.USUARIO}</p>
                            <p class="text-sm text-gray-500">CC: ${user.N_CEDULA || 'N/A'} | Tel: ${user.TELEFONO || 'N/A'}</p>
                        </div>
                        <span class="text-xs px-2 py-1 rounded ${user.ESTADO === 'ACTIVO' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                            ${user.ESTADO || 'Desconocido'}
                        </span>
                    `;

                    // AL HACER CLIC, ABRIR EL MODAL
                    item.onclick = () => openUserModal(user.id);
                    resultsBox.appendChild(item);
                });
            }
            resultsBox.classList.remove('hidden');
        });
});

// Ocultar resultados si hago clic fuera
document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !resultsBox.contains(e.target)) {
        resultsBox.classList.add('hidden');
    }
});

// ==========================================
// 3. LÓGICA DE LA AGENDA
// ==========================================
function loadAgenda() {
    fetch('/api/appointments/today')
        .then(res => res.json())
        .then(citas => {
            const container = document.getElementById('agendaContainer');
            container.innerHTML = '';

            if (citas.length === 0) {
                container.innerHTML = `
                    <div class="col-span-full bg-white p-8 rounded-xl shadow text-center">
                        <p class="text-gray-500 text-lg">📅 No hay citas programadas para hoy.</p>
                    </div>`;
                return;
            }

            citas.forEach(cita => {
                const hora = cita.start_time.substring(0, 5);
                const card = document.createElement('div');
                card.className = 'bg-white p-5 rounded-xl shadow border-l-4 border-blue-500 hover:shadow-md transition';
                card.innerHTML = `
                    <div class="flex justify-between items-start mb-2">
                        <span class="text-2xl font-bold text-blue-600">${hora}</span>
                        <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Entrenador: ${cita.entrenador}</span>
                    </div>
                    <h3 class="font-bold text-gray-800 text-lg truncate">${cita.cliente}</h3>
                    <p class="text-sm text-gray-500">Sesión regular</p>
                `;
                container.appendChild(card);
            });
        });
}

// Cargar agenda al iniciar
loadAgenda();

// ==========================================
// 4. LÓGICA DEL MODAL Y EDICIÓN COMPLETA
// ==========================================
const modal = document.getElementById('userModal');
const planSelect = document.getElementById('planSelect');
const planInput = document.getElementById('planManualInput');

// Función auxiliar para cortar la fecha de MySQL (YYYY-MM-DD)
function formatDateForInput(dateString) {
    if (!dateString) return '';
    return dateString.split('T')[0]; // Toma solo la parte de la fecha
}

// ==========================================
// FUNCIÓN PARA ABRIR MODAL CON LÍMITES DE FECHA
// ==========================================
function openUserModal(id) {
    document.getElementById('searchResults').classList.add('hidden');
    document.getElementById('searchInput').value = '';

    fetch(`/api/users/${id}`)
        .then(res => res.json())
        .then(user => {
            // ... (Llenado de datos existente) ...
            document.getElementById('editUserId').value = user.id;
            document.getElementById('editNombre').value = user.USUARIO || '';
            document.getElementById('editCedula').value = user.N_CEDULA || '';
            document.getElementById('editTelefono').value = user.TELEFONO || '';
            document.getElementById('editCorreo').value = user.CORREO_ELECTRONICO || '';
            document.getElementById('editDireccion').value = user.DIRECCION_O_BARRIO || '';
            document.getElementById('editEdad').value = user.EDAD || '';
            document.getElementById('editSexo').value = user.SEXO || 'M';
            document.getElementById('editEstado').value = user.ESTADO || 'ACTIVO';

            // Fechas
            const fVencimiento = formatDateForInput(user.F_VENCIMIENTO); // Guardamos esto en variable
            document.getElementById('editNacimiento').value = formatDateForInput(user.F_N);
            document.getElementById('editFIngreso').value = formatDateForInput(user.F_INGRESO);
            document.getElementById('editFVencimiento').value = fVencimiento;
            document.getElementById('editFExamen').value = formatDateForInput(user.F_EXAMEN_LABORATORIO);
            document.getElementById('editFNutricion').value = formatDateForInput(user.F_CITA_NUTRICION);
            document.getElementById('editFDeportiva').value = formatDateForInput(user.F_CITA_MED_DEPORTIVA);

            // ---------------------------------------------------------
            // 🔒 LÓGICA DE BLOQUEO DE FECHAS (NUEVO)
            // ---------------------------------------------------------
            const freezeStart = document.getElementById('freezeStart');
            const freezeEnd = document.getElementById('freezeEnd');
            
            // 1. Obtener fecha de hoy en formato YYYY-MM-DD
            const today = new Date().toISOString().split('T')[0];

            // 2. Configurar límites
            // El inicio no puede ser antes de hoy
            freezeStart.min = today; 
            // El inicio no puede ser después de que se le venza el plan
            freezeStart.max = fVencimiento; 
            
            // El fin tampoco puede pasar del vencimiento original
            freezeEnd.max = fVencimiento;
            
            // Limpiamos valores previos para evitar errores
            freezeStart.value = '';
            freezeEnd.value = '';
            // ---------------------------------------------------------

            // Lógica Plan Híbrido (Igual que antes)
            const planesEstandar = ["Experiencia Fitness plan básico", "Plan Trimestral", "Plan Semestral", "Plan Anual"];
            const userPlan = user.PLAN || "";

            if (planesEstandar.includes(userPlan)) {
                planSelect.value = userPlan;
                planInput.classList.add('hidden');
                planInput.value = ""; 
            } else {
                planSelect.value = "Otro";
                planInput.classList.remove('hidden');
                planInput.value = userPlan; 
            }

            modal.classList.remove('hidden');
        });
}


function saveUserChanges() {
    const id = document.getElementById('editUserId').value;
    
    // Determinar Plan Final
    let planFinal = planSelect.value;
    if (planFinal === 'Otro') {
        planFinal = planInput.value.trim();
    }

    // Recolectar TODOS los datos
    const data = {
        usuario: document.getElementById('editNombre').value,
        cedula: document.getElementById('editCedula').value,
        telefono: document.getElementById('editTelefono').value,
        correo: document.getElementById('editCorreo').value,
        direccion: document.getElementById('editDireccion').value,
        edad: document.getElementById('editEdad').value,
        sexo: document.getElementById('editSexo').value,
        estado: document.getElementById('editEstado').value,
        
        // Fechas
        f_nacimiento: document.getElementById('editNacimiento').value,
        f_ingreso: document.getElementById('editFIngreso').value,
        f_vencimiento: document.getElementById('editFVencimiento').value,
        f_examen: document.getElementById('editFExamen').value,
        f_nutricion: document.getElementById('editFNutricion').value,
        f_deportiva: document.getElementById('editFDeportiva').value,
        
        plan: planFinal
    };

    fetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(response => {
        if (response.success) {
            alert('✅ Ficha actualizada correctamente');
            closeModal();
            loadAgenda(); 
        } else {
            alert('❌ Error: ' + response.message);
        }
    });
}

// ==========================================
// FUNCIÓN PARA CERRAR MODAL (AGREGAR AL FINAL DE MAIN.JS)
// ==========================================
window.closeModal = function() {
    const modal = document.getElementById('userModal');
    // Verificamos que el modal exista antes de intentar cerrarlo
    if (modal) {
        modal.classList.add('hidden');
    }
}

// ==========================================
// FASE 4: FUNCIÓN DE CONGELAMIENTO
// ==========================================
window.freezeMembership = function() {
    const id = document.getElementById('editUserId').value;
    const start = document.getElementById('freezeStart').value;
    const end = document.getElementById('freezeEnd').value;

    // 1. Validaciones
    if (!start || !end) {
        alert('⚠️ Por favor selecciona ambas fechas (Desde y Hasta).');
        return;
    }

    if (new Date(start) > new Date(end)) {
        alert('⚠️ La fecha de inicio no puede ser posterior a la fecha final.');
        return;
    }

    if (!confirm('¿Estás seguro? Esto cambiará el estado a CONGELADO y extenderá la fecha de vencimiento.')) {
        return;
    }

    // 2. Enviar al Backend
    fetch(`/api/users/${id}/freeze`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaInicio: start, fechaFin: end })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('❄️ ' + data.message);
            // Recargamos el modal para ver el cambio de fecha inmediato
            openUserModal(id);
            
            // Limpiamos los inputs de fecha
            document.getElementById('freezeStart').value = '';
            document.getElementById('freezeEnd').value = '';
        } else {
            alert('❌ Error: ' + data.message);
        }
    });
}

// ==========================================
// EVENTO: CONTROL DINÁMICO DE FECHAS DE CONGELAMIENTO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const startInput = document.getElementById('freezeStart');
    const endInput = document.getElementById('freezeEnd');

    if(startInput && endInput) {
        startInput.addEventListener('change', (e) => {
            // Cuando cambie la fecha de inicio, la fecha fin
            // NO puede ser menor a la fecha de inicio seleccionada.
            endInput.min = e.target.value;
            
            // Si ya había una fecha fin seleccionada y es menor, la borramos
            if(endInput.value && endInput.value < e.target.value) {
                endInput.value = '';
            }
        });
    }
});


// ==========================================
// FASE 5: FUNCIÓN DE AGENDAR CITA
// ==========================================
function bookAppointment() {
    const userId = document.getElementById('editUserId').value;
    const date = document.getElementById('apptDate').value;
    const time = document.getElementById('apptTime').value;

    if (!date || !time) {
        alert('⚠️ Por favor selecciona Fecha y Hora.');
        return;
    }

    // Validar que la fecha no sea en el pasado (Opcional)
    const today = new Date().toISOString().split('T')[0];
    if (date < today) {
        alert('⚠️ No puedes agendar citas en fechas pasadas.');
        return;
    }

    const data = {
        userId: userId,
        fecha: date,
        hora: time,
        staffId: 3 // Por defecto asignamos al ID 3 (puedes cambiarlo si agregas un selector de Staff)
    };

    fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(response => {
        if (response.success) {
            alert(response.message);
            // Limpiar campos
            document.getElementById('apptDate').value = '';
            document.getElementById('apptTime').value = '';
            // Recargar la agenda principal del dashboard por si la cita es hoy
            loadAgenda();
        } else {
            alert('❌ Error: ' + response.message);
        }
    });
}