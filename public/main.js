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

// ... (El resto de funciones loadAllReservations y cancelReservation se mantienen igual que en el paso anterior)
// 1. Función para cargar reservas
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
                // Formatear fecha
                const fechaObj = new Date(reserva.appointment_date);
                // Ajuste de zona horaria simple para visualización correcta
                const fechaStr = fechaObj.toLocaleDateString('es-ES', { timeZone: 'UTC' });
                const horaStr = reserva.start_time.substring(0, 5);

                // Definir colores según estado
                let estadoBadge = '';
                let btnCancel = '';

                if (reserva.status === 'confirmed') {
                    estadoBadge = `<span class="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold">Confirmada</span>`;
                    // Botón de cancelar solo si está confirmada
                    btnCancel = `
                        <button onclick="cancelReservation(${reserva.id})" 
                            class="bg-red-100 text-red-600 hover:bg-red-200 px-3 py-1 rounded text-xs font-bold transition">
                            Cancelar
                        </button>`;
                } else {
                    estadoBadge = `<span class="bg-gray-100 text-gray-500 px-2 py-1 rounded-full text-xs font-bold">Cancelada</span>`;
                    btnCancel = `<span class="text-gray-300 text-xs">-</span>`;
                }

                const row = document.createElement('tr');
                row.className = 'hover:bg-gray-50 transition';
                row.innerHTML = `
                    <td class="p-4 font-medium text-gray-800">${fechaStr}</td>
                    <td class="p-4">${horaStr}</td>
                    <td class="p-4 font-bold text-blue-900">${reserva.cliente}</td>
                    <td class="p-4 text-gray-500">${reserva.entrenador}</td>
                    <td class="p-4">${estadoBadge}</td>
                    <td class="p-4 text-center">${btnCancel}</td>
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