// public/scheduler.js

const HOURS = [
    "05:00:00", "06:00:00", "07:00:00", "08:00:00", "09:00:00", "10:00:00", "11:00:00",
    "15:00:00", "16:00:00", "17:00:00", "18:00:00", "19:00:00", "20:00:00"
];

let currentStaffData = [];
let currentAppointments = [];
let selectedStaffId = null;
let selectedStaffName = '';
let selectedTime = null;

document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('currentDate');
    dateInput.value = new Date().toISOString().split('T')[0];
    dateInput.addEventListener('change', loadScheduler);
    document.getElementById('userSearchInput').addEventListener('input', handleUserSearch);
    loadScheduler();
});

function changeDate(days) {
    const dateInput = document.getElementById('currentDate');
    const date = new Date(dateInput.value);
    date.setDate(date.getDate() + days);
    dateInput.value = date.toISOString().split('T')[0];
    loadScheduler();
}

function loadScheduler() {
    const date = document.getElementById('currentDate').value;
    const tbody = document.getElementById('schedulerBody');
    tbody.innerHTML = '<tr><td colspan="14" class="text-center p-10"><div class="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-900 mx-auto"></div></td></tr>';

    fetch(`/api/scheduler/grid?date=${date}`)
        .then(res => res.json())
        .then(data => {
            currentStaffData = data.staff;
            currentAppointments = data.appointments;
            renderGrid();
        })
        .catch(err => {
            console.error(err);
            tbody.innerHTML = '<tr><td colspan="14" class="text-center text-red-500 font-bold p-10">Error cargando datos.</td></tr>';
        });
}

function renderGrid() {
    const tbody = document.getElementById('schedulerBody');
    tbody.innerHTML = '';

    if (currentStaffData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="14" class="text-center p-10 text-gray-500">No hay staff activo.</td></tr>';
        return;
    }

    currentStaffData.forEach(staff => {
        const row = document.createElement('tr');
        row.className = "border-b border-gray-200 hover:bg-gray-50 transition";

        // Celda Staff
        let html = `
            <td class="p-4 border-r border-gray-300 bg-gray-50 sticky left-0 z-10 shadow-sm">
                <div class="font-bold text-gray-800 text-lg leading-tight">${staff.name}</div>
                <div class="text-xs text-blue-600 uppercase font-bold mt-1">${staff.role}</div>
            </td>
        `;

        HOURS.forEach(time => {
            const appts = currentAppointments.filter(a => a.staff_id === staff.id && a.start_time === time);
            
            // Detección de bloqueo robusta (1 o true)
            const lockerAppt = appts.find(a => a.is_locking == 1 || a.is_locking === true);
            const isLocked = !!lockerAppt;
            const count = appts.length;
            
            let bgColor = 'bg-white';
            if (count > 0) bgColor = 'bg-green-50';
            if (count >= 5) bgColor = 'bg-red-50';
            if (isLocked) bgColor = 'bg-red-200'; // Rojo fuerte si bloqueado

            html += `<td class="p-2 border-r border-gray-200 align-top ${bgColor} relative grid-cell">`;
            
            let headerText = `${count}/5`;
            let headerClass = "text-green-600";
            let btnAdd = '';

            if (isLocked) {
                headerText = "🔒 BLOQUEADO";
                headerClass = "text-red-800 font-extrabold text-xs tracking-wider";
            } else if (count >= 5) {
                headerText = "FULL";
                headerClass = "text-red-600 font-bold";
            } else {
                btnAdd = `
                    <button onclick="openBookingModal(${staff.id}, '${staff.name}', '${time}', ${count})" 
                            class="bg-blue-600 text-white rounded w-6 h-6 flex items-center justify-center font-bold text-lg hover:bg-blue-700 transition shadow hover:scale-110" 
                            title="Agendar">
                        +
                    </button>
                `;
            }

            html += `
                <div class="flex justify-between items-center mb-2 border-b border-gray-300 pb-1 h-8">
                    <span class="text-xs ${headerClass}">${headerText}</span>
                    ${btnAdd}
                </div>
                <div class="space-y-1.5">
            `;

            appts.forEach(appt => {
                const isTheLocker = (appt.is_locking == 1 || appt.is_locking === true);
                const borderClass = isTheLocker ? 'border-red-500 bg-red-100 ring-1 ring-red-300' : 'border-gray-300 bg-white';

                html += `
                    <div class="user-chip flex justify-between items-center border ${borderClass} rounded px-2 py-1 shadow-sm group hover:shadow-md transition">
                        <div class="truncate w-full pr-1">
                            <span class="font-bold text-gray-800 text-xs block" title="${appt.cliente}">
                                ${isTheLocker ? '🔒 ' : ''}${appt.cliente.split(' ')[0]}
                            </span>
                        </div>
                        <div class="flex gap-1 items-center">
                            <button onclick="sendWhatsapp('${appt.cliente}', '${appt.TELEFONO}', '${time}')" class="text-green-600 hover:text-green-800" title="WhatsApp">
                                <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                            </button>
                            ${isTheLocker ? `
                                <button onclick="unlockSlot(${appt.id}, '${staff.name}')" class="text-orange-600 hover:text-orange-800" title="Desbloquear">🔓</button>
                            ` : ''}
                            <button onclick="cancelAppointment(${appt.id})" class="text-red-500 hover:text-red-700 font-bold" title="Eliminar">&times;</button>
                        </div>
                    </div>
                `;
            });
            html += `</div></td>`;
        });

        row.innerHTML = html;
        tbody.appendChild(row);
    });
}

function openBookingModal(staffId, staffName, time, count) {
    selectedStaffId = staffId;
    selectedTime = time;
    selectedStaffName = staffName;
    document.getElementById('modalStaffName').innerText = staffName;
    document.getElementById('modalTime').innerText = formatTime(time);
    document.getElementById('modalSlots').innerText = (5 - count);
    document.getElementById('userSearchInput').value = '';
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('actionButtons').classList.add('hidden');
    document.getElementById('bookingModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('userSearchInput').focus(), 100);
}

function closeBookingModal() {
    document.getElementById('bookingModal').classList.add('hidden');
}

function handleUserSearch(e) {
    const query = e.target.value.trim();
    const resultsBox = document.getElementById('searchResults');
    if (query.length < 2) { resultsBox.classList.add('hidden'); return; }

    fetch(`/api/users/search?q=${query}`)
        .then(res => res.json())
        .then(users => {
            resultsBox.innerHTML = '';
            if (users.length === 0) {
                resultsBox.innerHTML = '<div class="p-3 text-gray-500 text-sm text-center">No encontrado.</div>';
            } else {
                users.forEach(user => {
                    const div = document.createElement('div');
                    div.className = "p-3 border-b hover:bg-blue-50 cursor-pointer flex justify-between items-center group";
                    div.innerHTML = `
                        <div class="overflow-hidden">
                            <div class="font-bold text-gray-800 group-hover:text-blue-700 truncate">${user.USUARIO}</div>
                            <div class="text-xs text-gray-500">CC: ${user.N_CEDULA || '---'}</div>
                        </div>
                        <button class="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded font-bold group-hover:bg-blue-600 group-hover:text-white transition">Seleccionar</button>
                    `;
                    div.onclick = () => selectUser(user);
                    resultsBox.appendChild(div);
                });
            }
            resultsBox.classList.remove('hidden');
        });
}

function selectUser(user) {
    document.getElementById('selectedUserId').value = user.id;
    document.getElementById('selectedUserName').innerText = user.USUARIO;
    document.getElementById('searchResults').classList.add('hidden');
    document.getElementById('userSearchInput').value = user.USUARIO;
    document.getElementById('actionButtons').classList.remove('hidden');
}

// 5. CONFIRMAR (ENVÍO EXPLÍCITO DE 1 Ó 0)
function confirmBooking(isLocking) {
    const userId = document.getElementById('selectedUserId').value;
    const date = document.getElementById('currentDate').value;

    // FORZAR CONVERSIÓN A ENTERO
    const lockValue = isLocking ? 1 : 0;

    console.log("Enviando lock:", lockValue);

    fetch('/api/scheduler/book', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            userId: userId, staffId: selectedStaffId, date: date, time: selectedTime, lock: lockValue
        })
    }).then(res => res.json()).then(res => {
        if (res.success) {
            Swal.fire({ icon: 'success', title: isLocking ? 'Bloqueado' : 'Agendado', timer: 1500, showConfirmButton: false });
            closeBookingModal();
            loadScheduler();
        } else {
            Swal.fire('Error', res.message, 'warning');
        }
    });
}

function unlockSlot(id, name) {
    Swal.fire({
        title: '¿Desbloquear?', text: `Se permitirán agendamientos para ${name}.`, icon: 'warning',
        showCancelButton: true, confirmButtonText: 'Sí, desbloquear'
    }).then((res) => {
        if (res.isConfirmed) {
            fetch(`/api/scheduler/unlock/${id}`, { method: 'PUT' }).then(() => {
                Swal.fire('Listo', 'Horario liberado', 'success');
                loadScheduler();
            });
        }
    });
}

function cancelAppointment(id) {
    Swal.fire({
        title: '¿Eliminar?', text: "Se borrará permanentemente.", icon: 'error',
        showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'Eliminar'
    }).then((res) => {
        if (res.isConfirmed) {
            fetch(`/api/scheduler/cancel/${id}`, { method: 'DELETE' }).then(() => loadScheduler());
        }
    });
}

function sendWhatsapp(nombre, telefono, hora) {
    if (!telefono) return Swal.fire('Info', 'Sin teléfono.', 'info');
    let tel = telefono.replace(/\D/g, ''); 
    if (!tel.startsWith('57') && tel.length === 10) tel = '57' + tel; 
    const msg = `Hola ${nombre}, CardioFit confirma tu cita para las ${formatTime(hora)}. ¡Te esperamos!`;
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, '_blank');
}

function formatTime(timeStr) {
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
}