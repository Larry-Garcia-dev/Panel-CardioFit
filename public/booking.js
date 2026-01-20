// public/booking.js

let selectedDates = new Set(); 

// LISTA DE OTROS SERVICIOS (Común para ambos)
const otherServicesList = [
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
    // 1. Decodificar la URL para evitar errores con el símbolo '+'
    const rawPath = window.location.pathname.substring(1);
    const phone = decodeURIComponent(rawPath); 

    if(!phone || phone.includes('booking')) {
        document.getElementById('loader').classList.add('hidden');
        Swal.fire('Enlace incompleto', 'Por favor usa el enlace enviado a tu WhatsApp.', 'error');
        return;
    }
    
    identifyUser(phone);
    renderOtherServices(); 
});

function identifyUser(phone) {
    // Codificamos de nuevo solo para el transporte HTTP seguro
    fetch(`/api/public/identify/${encodeURIComponent(phone)}`)
        .then(res => {
            if(!res.ok) throw new Error("Error en servidor");
            return res.json();
        })
        .then(data => {
            document.getElementById('loader').classList.add('hidden');
            
            if(data.found) {
                // USUARIO ANTIGUO -> Menú Normal
                document.getElementById('gUserId').value = data.user.id;
                document.getElementById('userName').innerText = data.user.USUARIO.split(' ')[0];
                showMenu('existing'); 
            } else {
                // USUARIO NUEVO -> Formulario -> Menú Nuevo
                // El backend nos devuelve el número limpio en 'phoneClean'
                document.getElementById('regPhone').value = data.phoneClean || phone.replace(/\D/g, ''); 
                showStep('stepRegister');
            }
        })
        .catch(err => {
            console.error(err);
            document.getElementById('loader').classList.add('hidden');
            Swal.fire('Error de conexión', 'No pudimos verificar tu usuario. Intenta recargar.', 'error');
        });
}

// REGISTRO DE NUEVO USUARIO
document.getElementById('regForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.innerText = "Registrando...";

    const data = {
        nombre: document.getElementById('regName').value,
        cedula: document.getElementById('regCedula').value,
        correo: document.getElementById('regEmail').value,
        telefono: document.getElementById('regPhone').value // Ya viene limpio del paso anterior
    };

    fetch('/api/public/quick-register', { 
        method: 'POST', 
        headers: {'Content-Type': 'application/json'}, 
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(res => {
        if(res.success) {
            document.getElementById('gUserId').value = res.userId;
            document.getElementById('userName').innerText = data.nombre.split(' ')[0];
            // MOSTRAR MENÚ PARA NUEVOS
            showMenu('new');
        } else {
            Swal.fire('Error', 'No se pudo registrar. Intenta nuevamente.', 'error');
            btn.disabled = false;
            btn.innerText = "Continuar";
        }
    })
    .catch(() => {
        btn.disabled = false;
        btn.innerText = "Continuar";
    });
});

// CONTROL DE MENÚS (NUEVO vs ANTIGUO)
function showMenu(type) {
    const menuExisting = document.getElementById('menuExistingUsers');
    const menuNew = document.getElementById('menuNewUsers');
    
    if(type === 'existing') {
        menuExisting.classList.remove('hidden');
        menuNew.classList.add('hidden');
    } else {
        menuExisting.classList.add('hidden');
        menuNew.classList.remove('hidden');
    }
    showStep('stepService');
}

// LÓGICA DE SERVICIOS
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
    // 1. ALERTA PARA CLASE DE CORTESÍA
    if (serviceName === "Clase de Cortesía") {
        Swal.fire({
            title: '⚠️ Información Importante',
            text: 'Recuerda que debes estar 30 minutos antes para un tamizaje previo.',
            icon: 'info',
            confirmButtonText: 'Entendido, continuar',
            confirmButtonColor: '#000'
        }).then(() => {
            proceedSelection(dbRole, serviceName);
        });
    } else {
        proceedSelection(dbRole, serviceName);
    }
}

function proceedSelection(dbRole, serviceName) {
    document.getElementById('gRole').value = dbRole;
    document.getElementById('gServiceName').value = serviceName;
    document.getElementById('serviceTitleDisplay').innerText = serviceName;
    
    showStep('stepTime');
    loadServiceHours(dbRole); 
}

// CARGA DE HORAS
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
    const serviceName = document.getElementById('gServiceName').value;
    
    // MENSAJE DE CONFIRMACIÓN DIFERENTE SI ES CORTESÍA
    let textSwal = 'Se agendarán inmediatamente.';
    if(serviceName === "Clase de Cortesía") {
        textSwal = 'Recuerda llegar 30 min antes para tu tamizaje. ¿Confirmar?';
    }

    Swal.fire({
        title: `¿Confirmar ${datesArray.length} citas?`,
        text: textSwal,
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
                    role: document.getElementById('gRole').value,
                    serviceName: serviceName,
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
                        text: `Has reservado ${resp.booked} citas.`,
                        confirmButtonText: 'Finalizar'
                    }).then(() => window.location.reload());
                } else {
                    Swal.fire('Error', resp.message || 'Error desconocido', 'error');
                }
            })
            .catch(err => {
                console.error(err);
                Swal.fire('Error', 'Fallo de conexión al confirmar.', 'error');
            });
        }
    });
}

function showStep(id) {
    ['stepRegister', 'stepService', 'stepOtherList', 'stepTime', 'stepDay'].forEach(s => document.getElementById(s).classList.add('hidden'));
    document.getElementById('floatingConfirm').classList.add('hidden'); 
    document.getElementById(id).classList.remove('hidden');
}