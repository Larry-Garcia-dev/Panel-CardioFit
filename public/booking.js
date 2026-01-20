// public/booking.js

let selectedDates = new Set(); 

// LISTA DE OTROS SERVICIOS Y SU ROL EN BASE DE DATOS
const otherServicesList = [
    { name: "Análisis Biomecánico", role: "Fisioterapia" }, // OJO: Si tienes rol 'Biomecánico' en DB usalo, si no 'Fisioterapia'
    { name: "Baño Terapéutico", role: "Spa" },
    { name: "Masaje Terapéutico/Relajante", role: "Spa" },
    { name: "Fisioterapia (Paquete 10)", role: "Fisioterapia" },
    { name: "Fisioterapia (Individual)", role: "Fisioterapia" },
    { name: "Electrocardiograma", role: "Admin" },
    { name: "Monitoreo Holter (24h)", role: "Admin" },
    { name: "Monitoreo Presión Arterial", role: "Admin" },
    { name: "Circuito Recuperación", role: "Entrenador" },
    { name: "Masaje Rejuvenecimiento Facial", role: "Spa" },
    { name: "Terapia de Compresión", role: "Fisioterapia" },
    { name: "Infrarrojo", role: "Fisioterapia" },
    { name: "Entrenamiento Simulador", role: "Entrenador" },
    { name: "Sauna Infrarrojo (40min)", role: "Spa" }
];

document.addEventListener('DOMContentLoaded', () => {
    const phone = window.location.pathname.substring(1);
    if(!phone || phone.includes('booking')) {
        Swal.fire('Error', 'Enlace incompleto', 'error');
        return;
    }
    identifyUser(phone);
    renderOtherServices(); // Pre-cargar lista
});

function identifyUser(phone) {
    fetch(`/api/public/identify/${encodeURIComponent(phone)}`)
        .then(res => res.json())
        .then(data => {
            document.getElementById('loader').classList.add('hidden');
            if(data.found) {
                document.getElementById('gUserId').value = data.user.id;
                document.getElementById('userName').innerText = data.user.USUARIO.split(' ')[0];
                showStep('stepService');
            } else {
                document.getElementById('regPhone').value = data.phoneClean;
                showStep('stepRegister');
            }
        });
}

document.getElementById('regForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
        nombre: document.getElementById('regName').value,
        cedula: document.getElementById('regCedula').value,
        correo: document.getElementById('regEmail').value,
        telefono: document.getElementById('regPhone').value
    };
    fetch('/api/public/quick-register', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)})
    .then(res => res.json())
    .then(res => {
        if(res.success) {
            document.getElementById('gUserId').value = res.userId;
            document.getElementById('userName').innerText = data.nombre.split(' ')[0];
            showStep('stepService');
        }
    });
});

// ============================================
// LÓGICA SERVICIOS
// ============================================

// 1. Renderizar lista "Otros"
function renderOtherServices() {
    const container = document.getElementById('otherServicesContainer');
    container.innerHTML = '';
    otherServicesList.forEach(srv => {
        const btn = document.createElement('button');
        btn.className = "w-full text-left bg-white border border-gray-200 p-4 rounded-xl text-sm font-semibold text-gray-700 hover:border-purple-500 hover:bg-purple-50 transition active:scale-95 shadow-sm";
        btn.innerHTML = srv.name;
        // Al hacer clic, enviamos el ROL DE DB y el NOMBRE REAL
        btn.onclick = () => selectService(srv.role, srv.name);
        container.appendChild(btn);
    });
}

// 2. Mostrar la pantalla "Otros Servicios"
function showOtherServices() {
    showStep('stepOtherList');
}

// 3. Selección Genérica (Principal u Otros)
function selectService(dbRole, serviceName) {
    document.getElementById('gRole').value = dbRole;
    document.getElementById('gServiceName').value = serviceName; // Guardamos nombre real
    document.getElementById('serviceTitleDisplay').innerText = serviceName; // Título en paso Hora
    
    showStep('stepTime');
    loadServiceHours(dbRole); // Buscamos horas según el rol de la DB
}

// Volver atrás inteligente
function goBackToServiceSelection() {
    // Si estamos en un sub-servicio, ¿volvemos a la lista o al principal?
    // Por simplicidad, volveremos siempre al menú principal de servicios
    showStep('stepService'); 
}

// ============================================
// CARGA DE HORAS Y DÍAS (Igual que antes)
// ============================================

function loadServiceHours(role) {
    const grid = document.getElementById('timeGrid');
    const loader = document.getElementById('timeLoader');
    grid.innerHTML = '';
    loader.classList.remove('hidden');

    fetch('/api/public/get-service-hours', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ role: role })
    })
    .then(res => res.json())
    .then(data => {
        loader.classList.add('hidden');
        if(!data.hours || data.hours.length === 0) {
            grid.innerHTML = '<p class="col-span-3 text-center text-gray-400 text-sm">No hay horarios configurados para este perfil.</p>';
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
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            role: document.getElementById('gRole').value,
            time: document.getElementById('gTime').value
        })
    })
    .then(res => res.json())
    .then(data => {
        loader.classList.add('hidden');
        
        if(!data.days || data.days.length === 0) {
            noDays.classList.remove('hidden');
            return;
        }

        list.classList.remove('hidden');
        data.days.forEach(day => {
            const label = document.createElement('label');
            label.className = "block cursor-pointer tap-highlight-transparent";
            
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

function toggleDate(checkbox) {
    const container = checkbox.nextElementSibling;
    const circle = container.querySelector('.check-circle');
    const icon = container.querySelector('.check-icon');

    if (checkbox.checked) {
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

function confirmBatchBooking() {
    const datesArray = Array.from(selectedDates);
    Swal.fire({
        title: `¿Confirmar ${datesArray.length} citas?`,
        text: 'Se agendarán inmediatamente.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#000',
        confirmButtonText: 'Confirmar',
        cancelButtonText: 'Cancelar'
    }).then((res) => {
        if(res.isConfirmed) {
            Swal.fire({ title: 'Procesando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            
            fetch('/api/public/confirm-booking-batch', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    userId: document.getElementById('gUserId').value,
                    role: document.getElementById('gRole').value, // Rol DB
                    serviceName: document.getElementById('gServiceName').value, // Nombre Real
                    time: document.getElementById('gTime').value,
                    dates: datesArray
                })
            })
            .then(r => r.json())
            .then(resp => {
                if(resp.success) {
                    Swal.fire({
                        icon: 'success',
                        title: '¡Agenda Exitosa!',
                        text: `Has reservado ${resp.booked} citas para: ${document.getElementById('gServiceName').value}`,
                        confirmButtonText: 'Finalizar'
                    }).then(() => window.location.reload());
                } else {
                    Swal.fire('Error', resp.message, 'error');
                }
            });
        }
    });
}

function showStep(id) {
    ['stepRegister', 'stepService', 'stepOtherList', 'stepTime', 'stepDay'].forEach(s => document.getElementById(s).classList.add('hidden'));
    document.getElementById('floatingConfirm').classList.add('hidden'); 
    document.getElementById(id).classList.remove('hidden');
}