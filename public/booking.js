// public/booking.js

// Variables Globales
let selectedDates = new Set();
let globalUserActiveAppointments = 0;
let globalUserLimit = 3; // Límite por defecto (se ajustará a 1 si es cortesía)
const WHATSAPP_ASESOR = "573155774777";
let isPromoMode = false; // <--- NUEVA VARIABLE PARA CONTROLAR EL MODO SAUNA GRATIS

const otherServicesList = [
    { name: "Baño Terapéutico", role: "Spa" }, // Mantiene filtro de horas 8-11 y 4-7
    { name: "Masaje Terapéutico/Relajante", role: "Spa" },
    { name: "Fisioterapia (sesión / valoracion)", role: "Fisioterapia" },
    { name: "Análisis Biomecánico o Exámenes (MAPA, Holter)", role: "Fisioterapia" },
    { name: "Electrocardiograma", role: "Fisioterapia" },
    { name: "Monitoreo Holter (24h)", role: "Fisioterapia" },
    { name: "Monitoreo Presión Arterial", role: "Fisioterapia" },
    { name: "Circuito Recuperación", role: "Spa" }, // Lógica especial: 2 horas consecutivas
    { name: "Masaje Rejuvenecimiento Facial", role: "Spa" },
    { name: "Terapia de Compresión", role: "Spa" },
    { name: "Infrarrojo", role: "Fisioterapia" },
    { name: "Entrenamiento Simulador", role: "CONTACT_ONLY_GENERIC" }, // Contacto genérico
    { name: "Sauna Infrarrojo (40min)", role: "Spa" },
    { name: "Consulta Cardiología o Nutrición", role: "CONTACT_ONLY" } // Contacto Lorena
];

document.addEventListener('DOMContentLoaded', () => {
    // 1. Detectar y limpiar URL
    const rawPath = window.location.pathname;
    
    // Detectar si la URL contiene /saunagratis (ignorando mayúsculas/minúsculas)
    if (rawPath.toLowerCase().includes('/saunagratis')) {
        isPromoMode = true;
    }

    // Limpiar la URL para obtener solo el teléfono (quitamos /saunagratis y las barras /)
    let phonePart = rawPath.replace(/\/saunagratis\/?$/i, '').replace(/^\//, '');
    const phone = decodeURIComponent(phonePart);

    if (!phone || phone.includes('booking')) {
        document.getElementById('loader').classList.add('hidden');
        Swal.fire({
            title: 'Enlace incompleto',
            text: 'Por favor usa el enlace enviado a tu WhatsApp.',
            icon: 'error',
            width: '90%',
            maxWidth: '400px',
            confirmButtonColor: '#000'
        });
        return;
    }

    identifyUser(phone);
    renderOtherServices();
});

function identifyUser(phone) {
    fetch(`/api/public/identify/${encodeURIComponent(phone)}`)
        .then(res => {
            if (!res.ok) throw new Error("Error en servidor");
            return res.json();
        })
        .then(data => {
            document.getElementById('loader').classList.add('hidden');

            if (data.found) {
                const user = data.user;
                const userPlan = (user.PLAN || '').toLowerCase();

                // 1. REGLA ESTADO (Vencido/Congelado)
                if (user.ESTADO !== 'ACTIVO') {
                    Swal.fire({
                        title: `<span class="text-xl font-bold">Estado: ${user.ESTADO}</span>`,
                        html: `
                            <div class="text-left text-sm text-gray-600 mb-4">
                                Lo sentimos, tu membresía se encuentra <b>${user.ESTADO}</b>.
                                <br><br>
                                No puedes agendar nuevas citas por el momento.
                            </div>
                            <a href="https://wa.me/${WHATSAPP_ASESOR}?text=Hola, quiero reactivar mi plan." 
                               class="bg-green-500 text-white px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-green-600 transition shadow-lg w-full whitespace-normal">
                                <svg class="w-6 h-6 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                                <span class="text-sm">Hablar con Asesor</span>
                            </a>
                        `,
                        icon: 'warning',
                        width: '90%',
                        maxWidth: '400px',
                        allowOutsideClick: false,
                        allowEscapeKey: false,
                        showConfirmButton: false,
                        customClass: { popup: 'rounded-2xl pb-6', htmlContainer: 'px-1' }
                    });
                    return;
                }

                // 2. CONFIGURAR LÍMITE (Cortesía = 1, Regular = 3)
                if (userPlan.includes('cortesía') || userPlan.includes('cortesia') || userPlan.includes('nuevo')) {
                    globalUserLimit = 1;
                } else {
                    globalUserLimit = 3;
                }

                document.getElementById('gUserId').value = user.id;
                document.getElementById('userName').innerText = user.USUARIO.split(' ')[0];

                // Guardar conteo de citas activas
                globalUserActiveAppointments = user.future_appointments || 0;

                // === NUEVA LÓGICA SAUNA GRATIS ===
                if (isPromoMode) {
                    if (user.SAUNA_CLAIMED == 1) {
                        Swal.fire({
                            title: 'Beneficio Redimido',
                            text: 'Ya has disfrutado de tu Sauna Gratis anteriormente.',
                            icon: 'info',
                            confirmButtonColor: '#000',
                            confirmButtonText: 'Entendido'
                        });
                        // No mostramos el botón especial, se muestra el menú normal
                    } else {
                        // Usuario apto: Inyectar botón especial al principio del menú
                        const menuContainer = document.getElementById('menuExistingUsers');
                        const promoBtnHtml = `
                            <button onclick="selectService('Spa', 'Sauna Gratis')" 
                                class="w-full text-left border-2 border-orange-200 bg-orange-50 p-5 rounded-2xl font-bold text-orange-800 hover:border-orange-500 transition flex items-center gap-4 active:scale-95 mb-4 shadow-md animate-pulse">
                                <span class="text-3xl">🔥</span> 
                                <div>
                                    <span class="block text-lg">¡Tienes un Sauna Gratis!</span>
                                    <span class="text-xs font-normal uppercase tracking-wider">Click aquí para agendar</span>
                                </div>
                            </button>
                        `;
                        menuContainer.insertAdjacentHTML('afterbegin', promoBtnHtml);
                    }
                }
                // ==================================

                showMenu('existing');
            } else {
                document.getElementById('regPhone').value = data.phoneClean || phone.replace(/\D/g, '');
                showStep('stepRegister');
            }
        })
        .catch(err => {
            console.error(err);
            document.getElementById('loader').classList.add('hidden');
            Swal.fire({
                title: 'Error de conexión',
                text: 'No pudimos verificar tu usuario. Intenta recargar.',
                icon: 'error',
                width: '90%', maxWidth: '400px', confirmButtonColor: '#000'
            });
        });
}

document.getElementById('regForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.innerText = "Registrando...";

    const data = {
        nombre: document.getElementById('regName').value,
        cedula: document.getElementById('regCedula').value,
        correo: document.getElementById('regEmail').value,
        telefono: document.getElementById('regPhone').value
    };

    fetch('/api/public/quick-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
        .then(res => res.json())
        .then(res => {
            if (res.success) {
                document.getElementById('gUserId').value = res.userId;
                document.getElementById('userName').innerText = data.nombre.split(' ')[0];

                // Usuario nuevo siempre es Cortesía -> Límite 1
                globalUserLimit = 1;
                globalUserActiveAppointments = 0;

                showMenu('new');
            } else {
                Swal.fire({ title: 'Error', text: 'No se pudo registrar. Intenta nuevamente.', icon: 'error', width: '90%', maxWidth: '400px', confirmButtonColor: '#000' });
                btn.disabled = false;
                btn.innerText = "Continuar";
            }
        })
        .catch(() => {
            btn.disabled = false;
            btn.innerText = "Continuar";
        });
});

function showMenu(type) {
    const menuExisting = document.getElementById('menuExistingUsers');
    const menuNew = document.getElementById('menuNewUsers');

    if (type === 'existing') {
        menuExisting.classList.remove('hidden');
        menuNew.classList.add('hidden');
    } else {
        menuExisting.classList.add('hidden');
        menuNew.classList.remove('hidden');
    }
    showStep('stepService');
}

// ----------------------------------------------------
// MÓDULO MIS CITAS
// ----------------------------------------------------
function showMyAppointments() {
    showStep('stepMyAppointments');
    const container = document.getElementById('appointmentsListContainer');
    const loader = document.getElementById('appointmentsLoader');
    const userId = document.getElementById('gUserId').value;

    container.innerHTML = '';
    loader.classList.remove('hidden');

    fetch(`/api/public/my-appointments/${userId}`)
        .then(res => res.json())
        .then(data => {
            loader.classList.add('hidden');
            if (data.success && data.appointments.length > 0) {
                renderAppointments(data.appointments);
            } else {
                container.innerHTML = `
                    <div class="text-center p-8 bg-gray-50 rounded-xl border border-gray-100">
                        <p class="text-gray-400 font-bold mb-2">No tienes citas próximas</p>
                        <p class="text-xs text-gray-400">Tus agendamientos confirmados aparecerán aquí.</p>
                    </div>
                `;
            }
        })
        .catch(err => {
            loader.classList.add('hidden');
            container.innerHTML = `<p class="text-center text-red-500">Error cargando citas.</p>`;
        });
}

function renderAppointments(appointments) {
    const container = document.getElementById('appointmentsListContainer');
    container.innerHTML = '';

    appointments.forEach(appt => {
        // Corregimos la interpretación de la fecha para que no salte de día al mostrarla
        const dateParts = appt.appointment_date.split('T')[0].split('-');
        const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
        
        const day = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });

        const [h, m] = appt.start_time.split(':');
        const hourInt = parseInt(h);
        const ampm = hourInt >= 12 ? 'PM' : 'AM';
        const hour12 = hourInt % 12 || 12;
        const timeStr = `${hour12}:${m} ${ampm}`;

        const card = document.createElement('div');
        card.className = "bg-white border border-gray-200 p-4 rounded-xl shadow-sm flex justify-between items-center slide-up";

        card.innerHTML = `
            <div>
                <p class="font-bold text-gray-800 capitalize">${day}</p>
                <p class="text-2xl font-black text-blue-600">${timeStr}</p>
                <p class="text-xs text-gray-500 mt-1 uppercase tracking-wider">
                    ${appt.service_name || 'Servicio'} con ${appt.staff_name}
                </p>
            </div>
            <button onclick="cancelMyAppointment(${appt.id})" class="text-red-500 hover:bg-red-50 p-2 rounded-full transition">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
            </button>
        `;
        container.appendChild(card);
    });
}

function cancelMyAppointment(id) {
    Swal.fire({
        title: '¿Cancelar Cita?',
        text: "Esta acción liberará el espacio inmediatamente.",
        icon: 'warning',
        width: '90%', maxWidth: '400px',
        showCancelButton: true,
        confirmButtonColor: '#d33', cancelButtonColor: '#000',
        confirmButtonText: 'Sí, cancelar', cancelButtonText: 'Volver'
    }).then((result) => {
        if (result.isConfirmed) {
            fetch(`/api/public/cancel-appointment/${id}`, { method: 'DELETE' })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        Swal.fire({ title: 'Cancelada', text: 'Tu cita ha sido eliminada.', icon: 'success', width: '90%', maxWidth: '400px', confirmButtonColor: '#000' }).then(() => {
                            globalUserActiveAppointments = Math.max(0, globalUserActiveAppointments - 1);
                            showMyAppointments();
                        });
                    } else {
                        Swal.fire({ title: 'Error', text: 'No se pudo cancelar la cita.', icon: 'error', width: '90%', maxWidth: '400px', confirmButtonColor: '#000' });
                    }
                });
        }
    });
}

// ----------------------------------------------------
// SELECCIÓN DE SERVICIOS
// ----------------------------------------------------
function renderOtherServices() {
    const container = document.getElementById('otherServicesContainer');
    container.innerHTML = '';
    otherServicesList.forEach(srv => {
        const btn = document.createElement('button');
        btn.className = "w-full text-left bg-white border border-gray-200 p-4 rounded-xl text-sm font-semibold text-gray-700 hover:border-purple-500 hover:bg-purple-50 transition active:scale-95 shadow-sm";
        btn.innerHTML = srv.name;
        btn.onclick = () => selectService(srv.role, srv.name);
        container.appendChild(btn);
    });
}

function showOtherServices() {
    showStep('stepOtherList');
}

function selectService(dbRole, serviceName) {
    // === REGLA LORENA (CONTACT_ONLY): REDIRECCIÓN WHATSAPP ===
    if (dbRole === "CONTACT_ONLY") {
        const message = `Hola, me interesa el servicio de ${serviceName} con la Dra. Lorena Gonzalez. Quisiera más información.`;
        const url = `https://wa.me/${WHATSAPP_ASESOR}?text=${encodeURIComponent(message)}`;
        showWhatsappRedirect(url, "Este servicio requiere una valoración previa con la Dra. Lorena.");
        return;
    }

    // === REGLA SIMULADOR (CONTACT_ONLY_GENERIC): REDIRECCIÓN WHATSAPP GENÉRICA ===
    if (dbRole === "CONTACT_ONLY_GENERIC") {
        const message = `Hola, estoy interesado en el ${serviceName}. Quisiera más información y agendar.`;
        const url = `https://wa.me/${WHATSAPP_ASESOR}?text=${encodeURIComponent(message)}`;
        showWhatsappRedirect(url, "Comunícate con un asesor para programar tu sesión en el simulador.");
        return;
    }

    if (serviceName === "Clase de Cortesía") {
        Swal.fire({
            title: '⚠️ Importante',
            text: 'Recuerda que debes estar 30 minutos antes para un tamizaje previo.',
            icon: 'info',
            width: '90%', maxWidth: '400px',
            confirmButtonText: 'Entendido', confirmButtonColor: '#000'
        }).then(() => {
            proceedSelection(dbRole, serviceName);
        });
    } else {
        proceedSelection(dbRole, serviceName);
    }
}

function showWhatsappRedirect(url, text) {
    Swal.fire({
        title: 'Atención Especializada',
        html: `
            <div class="text-center">
                <p class="text-gray-600 mb-6 text-sm">${text}</p>
                <a href="${url}" target="_blank" 
                   class="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition transform hover:scale-105 shadow-lg w-full">
                    <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                Comunicar con Asesor
            </a>
        </div>
    `,
        icon: 'info',
        showConfirmButton: false,
        showCloseButton: true,
        customClass: { popup: 'rounded-2xl' }
    });
}

function proceedSelection(dbRole, serviceName) {
    document.getElementById('gRole').value = dbRole;
    document.getElementById('gServiceName').value = serviceName;
    document.getElementById('serviceTitleDisplay').innerText = serviceName;

    showStep('stepTime');
    loadServiceHours(dbRole, serviceName); // Se pasa serviceName
}

function loadServiceHours(role, serviceName) {
    const grid = document.getElementById('timeGrid');
    const loader = document.getElementById('timeLoader');
    grid.innerHTML = '';
    loader.classList.remove('hidden');

    fetch('/api/public/get-service-hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: role, serviceName: serviceName }) // Envío del nombre del servicio
    })
        .then(res => res.json())
        .then(data => {
            loader.classList.add('hidden');
            if (!data.hours || data.hours.length === 0) {
                grid.innerHTML = '<p class="col-span-3 text-center text-gray-400 text-sm">No hay horarios disponibles.</p>';
                return;
            }

            data.hours.forEach(timeStr => {
                const [h, m] = timeStr.split(':');
                const hourInt = parseInt(h);
                const hour12 = hourInt % 12 || 12;
                const ampm = hourInt >= 12 ? 'PM' : 'AM';
                const displayTime = `${hour12}:${m} ${ampm}`;

                const btn = document.createElement('button');
                btn.className = "py-3 bg-white border border-gray-200 rounded-xl font-bold text-gray-700 hover:border-blue-500 hover:bg-blue-50 transition active:scale-95 shadow-sm";
                btn.innerText = displayTime;
                btn.onclick = () => selectTime(timeStr, displayTime);
                grid.appendChild(btn);
            });
        });
}

function selectTime(timeVal, displayTime) {
    document.getElementById('gTime').value = timeVal;
    document.getElementById('confirmTimeDisplay').innerText = displayTime;
    selectedDates.clear();
    updateFloatingButton();
    showStep('stepDay');
    loadDays();
}
//::::::::::::::::::::::::::::::
function loadDays() {
    const list = document.getElementById('daysList');
    const loader = document.getElementById('loadingDays');
    const noDays = document.getElementById('noDays');

    list.innerHTML = '';
    list.classList.add('hidden');
    noDays.classList.add('hidden');
    loader.classList.remove('hidden');

    fetch('/api/public/get-available-days', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            role: document.getElementById('gRole').value,
            time: document.getElementById('gTime').value,
            serviceName: document.getElementById('gServiceName').value
        })
    })
    .then(res => res.json())
    .then(data => {
        loader.classList.add('hidden');
        if (!data.days || data.days.length === 0) {
            noDays.classList.remove('hidden');
            return;
        }
        list.classList.remove('hidden');
        data.days.forEach(day => {
            const label = document.createElement('label');
            label.className = "block cursor-pointer tap-highlight-transparent";
            
            // Usamos directamente day.dateStr que viene del servidor como "YYYY-MM-DD"
            label.innerHTML = `
                <input type="checkbox" value="${day.dateStr}" class="hidden day-check" onchange="toggleDate(this)">
                <div class="border border-gray-200 bg-white p-4 rounded-xl flex justify-between items-center transition-all hover:bg-gray-50 shadow-sm">
                    <span class="font-bold text-gray-700 text-lg capitalize">${day.displayDate}</span>
                    <div class="w-6 h-6 rounded-full border-2 border-gray-300 flex items-center justify-center check-circle bg-white">
                        <svg class="w-4 h-4 text-white check-icon hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path>
                        </svg>
                    </div>
                </div>
            `;
            list.appendChild(label);
        });
    });
}
//..................................
function toggleDate(checkbox) {
    const container = checkbox.nextElementSibling;
    const circle = container.querySelector('.check-circle');
    const icon = container.querySelector('.check-icon');

    const role = document.getElementById('gRole').value;
    const isCourtesy = globalUserLimit === 1;

    if (checkbox.checked) {
        // === REGLA: Límite dinámico ===
        let limit = globalUserLimit; 

        if (!isCourtesy && role !== 'Entrenador') {
            limit = 99; 
        }

        const potentialTotal = globalUserActiveAppointments + selectedDates.size + 1;

        if (potentialTotal > limit) {
            checkbox.checked = false; 

            let title = 'Límite Alcanzado';
            let msg = '';

            if (isCourtesy) {
                title = 'Usuario de Cortesía / Nuevo';
                msg = `Solo puedes tener <b>1 cita activa</b>. Asiste a tu sesión para formalizar tu membresía.`;
            } else {
                msg = `Solo puedes tener un máximo de <b>${limit} sesiones de entrenamiento activas</b>.`;
            }

            Swal.fire({
                title: title,
                html: `<div class="text-left text-sm text-gray-600">${msg}</div>`,
                icon: 'warning',
                width: '90%', maxWidth: '400px', confirmButtonColor: '#000', confirmButtonText: 'Entendido'
            });
            return;
        }

        selectedDates.add(checkbox.value);
        container.classList.add('border-green-500', 'bg-green-50');
        circle.classList.add('bg-green-500', 'border-green-500');
        icon.classList.remove('hidden');
    } else {
        selectedDates.delete(checkbox.value);
        container.classList.remove('border-green-500', 'bg-green-50');
        circle.classList.remove('bg-green-500', 'border-green-500');
        icon.classList.add('hidden');
    }
    updateFloatingButton();
}

function updateFloatingButton() {
    const count = selectedDates.size;
    const floatBtn = document.getElementById('floatingConfirm');
    document.getElementById('countSelected').innerText = count;
    if (count > 0) floatBtn.classList.remove('hidden');
    else floatBtn.classList.add('hidden');
}

// ----------------------------------------------------
// CONFIRMACIÓN Y RESULTADOS
// ----------------------------------------------------
function confirmBatchBooking() {
    const datesArray = Array.from(selectedDates);
    const serviceName = document.getElementById('gServiceName').value;

    let textSwal = 'Se intentarán agendar las fechas seleccionadas.';
    if (serviceName === "Clase de Cortesía") {
        textSwal = 'Recuerda llegar 30 min antes. ¿Confirmar reservas?';
    }
    // Aviso para Circuito de Recuperación
    if (serviceName === "Circuito Recuperación") {
        textSwal = 'Este servicio reserva 2 horas consecutivas. ¿Confirmar?';
    }

    Swal.fire({
        title: '¿Confirmar?',
        text: textSwal,
        icon: 'question',
        width: '90%', maxWidth: '400px',
        showCancelButton: true,
        confirmButtonColor: '#000', confirmButtonText: 'Sí, confirmar', cancelButtonText: 'Revisar'
    }).then((res) => {
        if (res.isConfirmed) {
            Swal.fire({ title: 'Verificando...', text: 'Por favor espera un momento.', allowOutsideClick: false, width: '90%', maxWidth: '300px', didOpen: () => Swal.showLoading() });

            fetch('/api/public/confirm-booking-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: document.getElementById('gUserId').value,
                    role: document.getElementById('gRole').value,
                    serviceName: serviceName,
                    time: document.getElementById('gTime').value,
                    dates: datesArray
                })
            })
                .then(r => r.json())
                .then(resp => {
                    if (resp.success) {
                        let htmlMsg = '<div class="text-left text-sm space-y-3">';

                        if (resp.results.booked.length > 0) {
                            htmlMsg += `
                            <div class="bg-green-50 p-3 rounded-lg border border-green-100">
                                <h4 class="font-bold text-green-700 text-xs uppercase mb-1">✅ Exitosas</h4>
                                <ul class="list-disc pl-4 text-green-800 text-xs">`;
                            resp.results.booked.forEach(item => {
                                htmlMsg += `<li>${item.date} | ${item.time}<br><span class="text-[10px] text-green-600 font-bold">Staff: ${item.staff}</span></li>`;
                            });
                            htmlMsg += `</ul></div>`;
                        }

                        if (resp.results.failed.length > 0) {
                            htmlMsg += `
                            <div class="bg-red-50 p-3 rounded-lg border border-red-100">
                                <h4 class="font-bold text-red-700 text-xs uppercase mb-1">⛔ No agendadas</h4>
                                <ul class="list-disc pl-4 text-red-800 text-xs">`;
                            resp.results.failed.forEach(item => {
                                htmlMsg += `<li>${item.date} | ${item.time}<br><span class="text-[10px]">${item.reason}</span></li>`;
                            });
                            htmlMsg += `</ul></div>`;
                        }
                        htmlMsg += '</div>';

                        const isPartial = resp.results.failed.length > 0;
                        const finalIcon = isPartial ? 'warning' : 'success';
                        const finalTitle = isPartial ? 'Proceso Finalizado' : '¡Todo Listo!';

                        Swal.fire({
                            icon: finalIcon, title: finalTitle, html: htmlMsg, width: '90%', maxWidth: '400px',
                            confirmButtonText: 'Entendido', confirmButtonColor: '#000',
                            customClass: { popup: 'rounded-2xl' }
                        }).then(() => {
                            window.location.reload();
                        });

                    } else {
                        Swal.fire({ title: 'Atención', text: resp.message || 'Error desconocido', icon: 'error', width: '90%', maxWidth: '400px', confirmButtonColor: '#000' });
                    }
                })
                .catch(err => {
                    console.error(err);
                    Swal.fire({ title: 'Error', text: 'Fallo de conexión al confirmar.', icon: 'error', width: '90%', maxWidth: '400px', confirmButtonColor: '#000' });
                });
        }
    });
}

function showStep(id) {
    ['stepRegister', 'stepService', 'stepOtherList', 'stepTime', 'stepDay', 'stepMyAppointments'].forEach(s => document.getElementById(s).classList.add('hidden'));
    document.getElementById('floatingConfirm').classList.add('hidden');
    document.getElementById(id).classList.remove('hidden');
}