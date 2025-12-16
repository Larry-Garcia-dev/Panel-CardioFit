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
// 3. LÓGICA DE LA AGENDA (CON WHATSAPP)
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

                // LÓGICA WHATSAPP
                let whatsappBtn = '';
                if (cita.TELEFONO) {
                    // Limpiamos el número (quitamos espacios, guiones, etc.)
                    let telefono = cita.TELEFONO.replace(/\D/g, '');

                    // Si no tiene código de país (ej: 57), se lo agregamos (asumiendo Colombia)
                    if (!telefono.startsWith('57') && telefono.length === 10) {
                        telefono = '57' + telefono;
                    }

                    // Mensaje personalizado
                    const mensaje = `Hola ${cita.cliente}, te saludamos de CardioFit. Queríamos confirmar tu asistencia a la cita programada para hoy a las ${hora}. ¿Podrás asistir?`;
                    const url = `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`;

                    whatsappBtn = `
                        <a href="${url}" target="_blank" 
                           class="mt-3 block w-full bg-green-500 hover:bg-green-600 text-white text-center py-2 rounded-lg font-bold text-sm transition flex items-center justify-center gap-2 shadow-sm">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                            </svg>
                            Confirmar Asistencia
                        </a>
                    `;
                } else {
                    whatsappBtn = `
                        <button disabled class="mt-3 block w-full bg-gray-200 text-gray-400 text-center py-2 rounded-lg font-bold text-sm cursor-not-allowed">
                            Sin teléfono
                        </button>
                    `;
                }

                const card = document.createElement('div');
                card.className = 'bg-white p-5 rounded-xl shadow border-l-4 border-blue-500 hover:shadow-md transition flex flex-col justify-between';
                card.innerHTML = `
                    <div>
                        <div class="flex justify-between items-start mb-2">
                            <span class="text-2xl font-bold text-blue-600">${hora}</span>
                            <span class="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">Staff: ${cita.entrenador}</span>
                        </div>
                        <h3 class="font-bold text-gray-800 text-lg truncate" title="${cita.cliente}">${cita.cliente}</h3>
                        <p class="text-sm text-gray-500">Sesión regular</p>
                    </div>
                    ${whatsappBtn}
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
            // Ahora cargamos el texto tal cual viene de la BD, o vacío si es null
            const observacion = user.F_CITA_MED_DEPORTIVA || '';
            document.getElementById('editFDeportiva').value = observacion;
            // Actualizamos el contador visualmente al abrir el modal
            if (document.getElementById('charCountDeportiva')) {
                document.getElementById('charCountDeportiva').innerText = observacion.length;
            }
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
            // ... (código existente de carga de datos) ...

            // LÓGICA PARA MOSTRAR INFORMACIÓN DE CONGELAMIENTO
            const infoCongelamientoDiv = document.getElementById('infoCongelamiento');
            const viewInicio = document.getElementById('viewInicioCongelamiento');
            const viewFin = document.getElementById('viewFinCongelamiento');

            if (user.ESTADO === 'CONGELADO') {
                // Si está congelado, mostramos el cuadro y llenamos las fechas
                infoCongelamientoDiv.classList.remove('hidden');
                viewInicio.value = formatDateForInput(user.F_INICIO_CONGELAMIENTO);
                viewFin.value = formatDateForInput(user.F_FIN_CONGELAMIENTO);
            } else {
                // Si está activo o inactivo, ocultamos ese cuadro
                infoCongelamientoDiv.classList.add('hidden');
                viewInicio.value = '';
                viewFin.value = '';
            }

            modal.classList.remove('hidden');

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

    const data = {
        usuario: document.getElementById('editNombre').value,
        cedula: document.getElementById('editCedula').value,
        telefono: document.getElementById('editTelefono').value,
        correo: document.getElementById('editCorreo').value,
        direccion: document.getElementById('editDireccion').value,
        edad: document.getElementById('editEdad').value,
        sexo: document.getElementById('editSexo').value,
        estado: document.getElementById('editEstado').value,
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
        .then(res => res.json())
        .then(response => {
            if (response.success) {
                // ALERTA DE ÉXITO
                Swal.fire({
                    title: '¡Guardado!',
                    text: 'La ficha del usuario ha sido actualizada.',
                    icon: 'success',
                    confirmButtonColor: '#2563eb' // Azul
                });
                closeModal();
                loadAgenda();
            } else {
                // ALERTA DE ERROR
                Swal.fire({
                    title: 'Error',
                    text: response.message,
                    icon: 'error',
                    confirmButtonColor: '#dc2626' // Rojo
                });
            }
        });
}

// ==========================================
// FUNCIÓN PARA CERRAR MODAL (AGREGAR AL FINAL DE MAIN.JS)
// ==========================================
window.closeModal = function () {
    const modal = document.getElementById('userModal');
    // Verificamos que el modal exista antes de intentar cerrarlo
    if (modal) {
        modal.classList.add('hidden');
    }
}

// ==========================================
// FASE 4: FUNCIÓN DE CONGELAMIENTO
// ==========================================
window.freezeMembership = function () {
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

    if (startInput && endInput) {
        startInput.addEventListener('change', (e) => {
            // Cuando cambie la fecha de inicio, la fecha fin
            // NO puede ser menor a la fecha de inicio seleccionada.
            endInput.min = e.target.value;

            // Si ya había una fecha fin seleccionada y es menor, la borramos
            if (endInput.value && endInput.value < e.target.value) {
                endInput.value = '';
            }
        });
    }
    // ==========================================
    // LÓGICA INTERACTIVA: MOSTRAR/OCULTAR INPUT DE PLAN
    // ==========================================
    const selectPlan = document.getElementById('planSelect');
    const inputPlan = document.getElementById('planManualInput');

    if (selectPlan && inputPlan) {
        selectPlan.addEventListener('change', (e) => {
            if (e.target.value === 'Otro') {
                // Si elige "Otro", mostramos el campo manual
                inputPlan.classList.remove('hidden');
                inputPlan.focus(); // Ponemos el cursor ahí automáticamente
            } else {
                // Si elige un plan estándar, ocultamos y limpiamos el manual
                inputPlan.classList.add('hidden');
                inputPlan.value = '';
            }
        });
    }
    // 3. Lógica para Nuevo Usuario (PLAN "OTRO")
    const newPlanSelect = document.getElementById('newPlan');
    const boxSelect = document.getElementById('boxNewPlanSelect');
    const boxInput = document.getElementById('boxNewPlanInput');
    const newPlanInput = document.getElementById('newPlanManual');

    if (newPlanSelect && boxInput) {
        newPlanSelect.addEventListener('change', (e) => {
            if (e.target.value === 'Otro') {
                // Mostrar campo manual: reducimos el select al 50% y mostramos el input
                boxSelect.classList.remove('w-full');
                boxSelect.classList.add('w-1/2');
                boxInput.classList.remove('hidden');
                boxInput.classList.add('w-1/2');
                newPlanInput.focus();
            } else {
                // Ocultar campo manual: select vuelve al 100%
                boxInput.classList.add('hidden');
                boxInput.classList.remove('w-1/2');
                boxSelect.classList.remove('w-1/2');
                boxSelect.classList.add('w-full');
                newPlanInput.value = '';
            }
        });
    }
});


// ==========================================
// FASE 5: FUNCIÓN DE AGENDAR CITA
// ==========================================
// A. FUNCION PARA CARGAR STAFF (PONER AL INICIO O AL FINAL DE MAIN.JS)
function loadStaffOptions() {
    const staffSelect = document.getElementById('apptStaff');
    if (!staffSelect) return;

    fetch('/api/staff')
        .then(res => res.json())
        .then(staffList => {
            staffSelect.innerHTML = '<option value="">-- Seleccionar --</option>';
            staffList.forEach(person => {
                const option = document.createElement('option');
                option.value = person.id;
                // Aquí mostramos "Nombre - Rol"
                option.textContent = `${person.name} - ${person.role}`;
                staffSelect.appendChild(option);
            });
        });
}

// B. LLAMAR A LA CARGA DE STAFF AL INICIAR
document.addEventListener('DOMContentLoaded', () => {
    loadStaffOptions();
    // ... aquí sigue tu otro código del DOMContentLoaded ...
});

// C. ACTUALIZAR LA FUNCIÓN DE AGENDAR (REEMPLAZAR LA EXISTENTE)
function bookAppointment() {
    const userId = document.getElementById('editUserId').value;
    const staffId = document.getElementById('apptStaff').value;
    const date = document.getElementById('apptDate').value;
    const time = document.getElementById('apptTime').value;

    if (!date || !time || !staffId) {
        Swal.fire('Campos incompletos', 'Por favor completa Entrenador, Fecha y Hora.', 'warning');
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    if (date < today) {
        Swal.fire('Fecha inválida', 'No puedes agendar citas en el pasado.', 'error');
        return;
    }

    const data = { userId, staffId, fecha: date, hora: time };

    fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
        .then(res => res.json())
        .then(response => {
            if (response.success) {
                Swal.fire({
                    title: '¡Cita Agendada!',
                    text: response.message,
                    icon: 'success',
                    confirmButtonColor: '#2563eb'
                });
                // Limpiar campos
                document.getElementById('apptDate').value = '';
                document.getElementById('apptTime').value = '';
                document.getElementById('apptStaff').value = '';
                loadAgenda();
            } else {
                Swal.fire('No se pudo agendar', response.message, 'error');
            }
        });
}

// ==========================================
// CREAR NUEVO USUARIO (CON FECHAS INICIO Y FIN)
// ==========================================
function registerNewUser() {
    const nombre = document.getElementById('newNombre').value;
    const cedula = document.getElementById('newCedula').value;

    if (!nombre || !cedula) {
        Swal.fire('Faltan datos', 'El Nombre y la Cédula son obligatorios.', 'warning');
        return;
    }

    // Lógica Plan Manual
    const selectPlan = document.getElementById('newPlan');
    const inputPlan = document.getElementById('newPlanManual');
    let planFinal = selectPlan.value;

    if (planFinal === 'Otro') {
        planFinal = inputPlan.value.trim();
        if (!planFinal) {
            Swal.fire('Atención', 'Seleccionaste "Otro" pero no escribiste el nombre del plan.', 'warning');
            return;
        }
    }

    const data = {
        usuario: nombre,
        cedula: cedula,
        telefono: document.getElementById('newTelefono').value,
        correo: document.getElementById('newCorreo').value,
        direccion: document.getElementById('newDireccion').value,
        f_nacimiento: document.getElementById('newNacimiento').value,
        sexo: document.getElementById('newSexo').value,
        plan: planFinal,
        f_ingreso: document.getElementById('newIngreso').value,
        f_vencimiento: document.getElementById('newVencimiento').value
    };

    fetch('/api/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
        .then(res => res.json())
        .then(response => {
            if (response.success) {
                Swal.fire('¡Registrado!', response.message, 'success');

                document.getElementById('newUserModal').classList.add('hidden');
                document.getElementById('createUserForm').reset();

                // Reset visual del plan
                document.getElementById('boxNewPlanInput').classList.add('hidden');
                document.getElementById('boxNewPlanSelect').classList.remove('w-1/2');
                document.getElementById('boxNewPlanSelect').classList.add('w-full');
                document.getElementById('newIngreso').value = new Date().toISOString().split('T')[0];
            } else {
                Swal.fire('Error', response.message, 'error');
            }
        })
        .catch(err => Swal.fire('Error', 'Fallo de conexión con el servidor.', 'error'));
}



// ==========================================
// GESTIÓN DE RESERVAS (CALENDARIO/LISTA)
// ==========================================
// ABRIR MODAL DE RESERVAS
function openReservationsModal() {
    document.getElementById('reservationsModal').classList.remove('hidden');
    loadAllReservations(); // Cargar datos al abrir
}

// 1. Función para cargar reservas

// ==========================================
// FUNCIÓN: CARGAR TODAS LAS RESERVAS (HISTORIAL)
// ==========================================
function loadAllReservations(query = '') {
    const tableBody = document.getElementById('reservasTableBody');
    if (!tableBody) return; // Si no existe la tabla, no hacemos nada

    fetch(`/api/appointments/all?q=${query}`)
        .then(res => res.json())
        .then(reservas => {
            tableBody.innerHTML = '';

            if (reservas.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-gray-500">No se encontraron reservas.</td></tr>`;
                return;
            }

            reservas.forEach(reserva => {
                // 1. Formatear fecha (ajuste de zona horaria simple)
                const fechaObj = new Date(reserva.appointment_date);
                const fechaStr = new Date(fechaObj.getUTCFullYear(), fechaObj.getUTCMonth(), fechaObj.getUTCDate()).toLocaleDateString('es-ES');
                const horaStr = reserva.start_time.substring(0, 5);

                // 2. Definir Estado y Acciones
                let estadoBadge = '';
                let acciones = '<div class="flex items-center justify-center gap-4">'; // Contenedor Flex para alinear íconos

                // --- BOTÓN WHATSAPP (SOLO ÍCONO) ---
                if (reserva.TELEFONO) {
                    let tel = reserva.TELEFONO.replace(/\D/g, ''); // Limpiar número
                    if (!tel.startsWith('57') && tel.length === 10) tel = '57' + tel; // Agregar código país si falta

                    const mensaje = `Hola ${reserva.cliente}, desde CardioFit confirmamos tu cita para el día ${fechaStr} a las ${horaStr}.`;
                    const url = `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`;

                    acciones += `
                        <a href="${url}" target="_blank" title="Confirmar por WhatsApp" 
                           class="text-green-500 hover:text-green-600 transition hover:scale-110">
                            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                            </svg>
                        </a>
                    `;
                }

                // --- BOTÓN CANCELAR (SOLO SI ESTÁ CONFIRMADA) ---
                if (reserva.status === 'confirmed') {
                    estadoBadge = `<span class="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold border border-green-200">Activa</span>`;
                    acciones += `
                        <button onclick="cancelReservation(${reserva.id})" title="Cancelar Cita"
                            class="text-red-500 hover:text-red-700 transition hover:scale-110">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                            </svg>
                        </button>`;
                } else {
                    estadoBadge = `<span class="bg-gray-100 text-gray-500 px-2 py-1 rounded-full text-xs font-bold border border-gray-200">Cancelada</span>`;
                }

                acciones += '</div>'; // Cerrar contenedor flex

                // 3. Crear Fila
                const row = document.createElement('tr');
                row.className = 'hover:bg-purple-50 transition border-b border-gray-100 group';
                row.innerHTML = `
                    <td class="p-4 font-medium text-gray-700">${fechaStr}</td>
                    <td class="p-4 text-gray-600">${horaStr}</td>
                    <td class="p-4 font-bold text-blue-900 group-hover:text-purple-700 transition">${reserva.cliente}</td>
                    <td class="p-4 text-gray-500 text-sm">${reserva.entrenador}</td>
                    <td class="p-4">${estadoBadge}</td>
                    <td class="p-4 text-center">${acciones}</td>
                `;
                tableBody.appendChild(row);
            });
        });
}

// 2. Función para Cancelar
function cancelReservation(id) {
    Swal.fire({
        title: '¿Cancelar Cita?',
        text: "Esta acción liberará el cupo y no se puede deshacer.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626', // Rojo
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Sí, cancelar cita',
        cancelButtonText: 'No, mantenerla'
    }).then((result) => {
        if (result.isConfirmed) {
            fetch(`/api/appointments/${id}/cancel`, { method: 'PUT' })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        Swal.fire('Cancelada', 'La cita ha sido cancelada correctamente.', 'success');
                        loadAllReservations();
                        loadAgenda();
                    } else {
                        Swal.fire('Error', 'No se pudo cancelar la cita.', 'error');
                    }
                });
        }
    });
}

// 3. Activar el Buscador de Reservas y Carga Inicial
document.addEventListener('DOMContentLoaded', () => {
    // Cargar lista inicial
    loadAllReservations();

    // Escuchar el input de búsqueda
    const inputSearchReserva = document.getElementById('searchReserva');
    if (inputSearchReserva) {
        inputSearchReserva.addEventListener('input', (e) => {
            loadAllReservations(e.target.value);
        });
    }
});

// ------------------------------------------------------
// 4. CONTADOR DE CARACTERES PARA MED. DEPORTIVA (NUEVO)
// ------------------------------------------------------
const textDeportiva = document.getElementById('editFDeportiva');
const countDeportiva = document.getElementById('charCountDeportiva');

if (textDeportiva && countDeportiva) {
    textDeportiva.addEventListener('input', function () {
        const currentLength = this.value.length;
        countDeportiva.innerText = currentLength;

        // Cambiar color a rojo si llega al límite
        if (currentLength >= 250) {
            countDeportiva.classList.add('text-red-600');
        } else {
            countDeportiva.classList.remove('text-red-600');
        }
    });
}