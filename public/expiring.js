// public/expiring.js

document.addEventListener('DOMContentLoaded', () => {
    loadExpiring();
    loadExpired(); // Nueva función para cargar los vencidos
});

// 1. MEMBRESÍAS POR VENCER (ACTIVOS)
function loadExpiring() {
    fetch('/api/memberships/expiring')
    .then(res => res.json())
    .then(users => {
        const tbody = document.getElementById('expiringTableBody');
        tbody.innerHTML = '';

        if(users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-green-600 font-bold">✅ No hay membresías próximas a vencer.</td></tr>`;
            return;
        }

        users.forEach(u => {
            const dias = u.dias_restantes;
            let colorDias = dias <= 3 ? 'text-red-600 animate-pulse font-black' : 'text-orange-600 font-bold';
            const fechaVenc = new Date(u.F_VENCIMIENTO).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });

            const whatsappBtn = generateWhatsappBtn(u, 'expiring', fechaVenc);

            tbody.innerHTML += `
                <tr class="hover:bg-orange-50 border-b border-gray-100">
                    <td class="p-4 ${colorDias} text-lg">${dias} días</td>
                    <td class="p-4 text-gray-700">${fechaVenc}</td>
                    <td class="p-4 font-bold text-gray-800">${u.USUARIO}</td>
                    <td class="p-4 text-sm text-gray-600">${u.PLAN}</td>
                    <td class="p-4 flex gap-2 justify-center">
                        ${whatsappBtn}
                        <button onclick="openUserModal(${u.id})" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg font-bold shadow flex items-center gap-1">
                            ✏️
                        </button>
                    </td>
                </tr>
            `;
        });
    });
}

// 2. NUEVO: MEMBRESÍAS VENCIDAS (ESTADO VENCIDO)
function loadExpired() {
    fetch('/api/memberships/expired')
    .then(res => res.json())
    .then(users => {
        const tbody = document.getElementById('expiredTableBody');
        tbody.innerHTML = '';

        if(users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-gray-500">No hay membresías vencidas.</td></tr>`;
            return;
        }

        users.forEach(u => {
            const fechaVenc = new Date(u.F_VENCIMIENTO).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
            
            // Botón de WhatsApp con mensaje de RECUPERACIÓN
            const whatsappBtn = generateWhatsappBtn(u, 'expired', fechaVenc);

            tbody.innerHTML += `
                <tr class="hover:bg-gray-100 border-b border-gray-200 bg-gray-50">
                    <td class="p-4 font-bold text-gray-500">Hace ${u.dias_vencido} días</td>
                    <td class="p-4 text-gray-600">${fechaVenc}</td>
                    <td class="p-4 font-bold text-gray-700">${u.USUARIO}</td>
                    <td class="p-4 text-sm text-gray-500">${u.PLAN}</td>
                    <td class="p-4 flex gap-2 justify-center">
                        ${whatsappBtn}
                        <button onclick="openUserModal(${u.id})" class="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded-lg font-bold shadow flex items-center gap-1">
                            ✏️
                        </button>
                    </td>
                </tr>
            `;
        });
    });
}

// UTILIDAD: Generador de Botón WhatsApp
function generateWhatsappBtn(user, type, fechaVenc) {
    if(!user.TELEFONO) return '<span class="text-xs text-gray-400">Sin Tel</span>';

    let tel = user.TELEFONO.replace(/\D/g, '');
    if (!tel.startsWith('57') && tel.length === 10) tel = '57' + tel;

    let mensaje = '';
    let colorBtn = '';

    if (type === 'expiring') {
        mensaje = `Hola ${user.USUARIO}! Esperamos que estés teniendo una semana llena de energía en CardioFit Lab. Queríamos contarte amablemente que tu plan *${user.PLAN}* está próximo a finalizar el día *${fechaVenc}*. ¡No detengas tu proceso!`;
        colorBtn = 'bg-green-500 hover:bg-green-600';
    } else {
        // Mensaje para VENCIDOS
        mensaje = `Hola ${user.USUARIO}! Esperamos que estés muy bien. Queríamos recordarte que tu plan venció el día *${fechaVenc}*. ¡Te extrañamos en CardioFit! Escríbenos para renovar y seguir entrenando con toda la energía. 💪`;
        colorBtn = 'bg-gray-700 hover:bg-black'; // Botón más oscuro para vencidos
    }

    const url = `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`;
    
    return `
        <a href="${url}" target="_blank" class="${colorBtn} text-white px-3 py-2 rounded-lg font-bold flex items-center justify-center gap-2 shadow transition hover:scale-105" title="Enviar WhatsApp">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
            WhatsApp
        </a>
    `;
}

// 3. CARGAR TODOS LOS USUARIOS (Sin cambios mayores)
function toggleAllUsers() {
    const section = document.getElementById('allUsersSection');
    const isHidden = section.classList.contains('hidden');
    
    if (isHidden) {
        section.classList.remove('hidden');
        fetch('/api/memberships/all')
        .then(res => res.json())
        .then(users => {
            const tbody = document.getElementById('allUsersTableBody');
            tbody.innerHTML = '';
            users.forEach(u => {
                const fecha = u.F_VENCIMIENTO ? u.F_VENCIMIENTO.split('T')[0] : 'Sin fecha';
                let estadoClass = 'bg-gray-100 text-gray-500';
                if (u.ESTADO === 'ACTIVO') estadoClass = 'bg-green-100 text-green-800';
                if (u.ESTADO === 'VENCIDO') estadoClass = 'bg-red-100 text-red-800';
                
                tbody.innerHTML += `
                    <tr class="hover:bg-blue-50 border-b">
                        <td class="p-3 font-bold text-gray-700">${u.USUARIO}</td>
                        <td class="p-3 text-gray-500 text-xs">${u.N_CEDULA || ''}</td>
                        <td class="p-3"><span class="px-2 py-1 rounded text-xs font-bold ${estadoClass}">${u.ESTADO}</span></td>
                        <td class="p-3 text-sm">${fecha}</td>
                        <td class="p-3 text-center">
                            <button onclick="openUserModal(${u.id})" class="text-blue-600 hover:text-blue-800 font-bold text-sm">Editar</button>
                        </td>
                    </tr>
                `;
            });
        });
    } else {
        section.classList.add('hidden');
    }
}

// MODAL Y GUARDADO (Lógica existente)
const modal = document.getElementById('userModal');
const planSelect = document.getElementById('planSelect');
const planInput = document.getElementById('planManualInput');

if (planSelect) {
    planSelect.addEventListener('change', (e) => {
        if(e.target.value === 'Otro') planInput.classList.remove('hidden');
        else planInput.classList.add('hidden');
    });
}

function formatDateForInput(dateString) {
    if (!dateString) return '';
    return dateString.split('T')[0];
}

function openUserModal(id) {
    fetch(`/api/Users/${id}`)
    .then(res => res.json())
    .then(user => {
        document.getElementById('editUserId').value = user.id;
        document.getElementById('editNombre').value = user.USUARIO || '';
        document.getElementById('editCedula').value = user.N_CEDULA || '';
        document.getElementById('editTelefono').value = user.TELEFONO || '';
        document.getElementById('editCorreo').value = user.CORREO_ELECTRONICO || '';
        document.getElementById('editDireccion').value = user.DIRECCION_O_BARRIO || '';
        document.getElementById('editEstado').value = user.ESTADO || 'ACTIVO';
        document.getElementById('editFVencimiento').value = formatDateForInput(user.F_VENCIMIENTO);

        const planesEstandar = ["EXPERIENCIA FITNESS PLAN BÁSICO", "EXPERIENCIA FITNESS (ESTÁNDAR)", "EXPERIENCIA FITNESS DE LUJO"];
        if (planesEstandar.includes(user.PLAN)) {
            planSelect.value = user.PLAN;
            planInput.classList.add('hidden');
        } else {
            planSelect.value = "Otro";
            planInput.classList.remove('hidden');
            planInput.value = user.PLAN || "";
        }
        modal.classList.remove('hidden');
    });
}

function closeModal() {
    modal.classList.add('hidden');
}

function saveUserChanges() {
    const id = document.getElementById('editUserId').value;
    let planFinal = planSelect.value === 'Otro' ? planInput.value.trim() : planSelect.value;

    const data = {
        usuario: document.getElementById('editNombre').value,
        cedula: document.getElementById('editCedula').value,
        telefono: document.getElementById('editTelefono').value,
        correo: document.getElementById('editCorreo').value,
        direccion: document.getElementById('editDireccion').value,
        estado: document.getElementById('editEstado').value,
        f_vencimiento: document.getElementById('editFVencimiento').value,
        plan: planFinal
    };

    fetch(`/api/Users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(res => {
        if(res.success) {
            Swal.fire('Guardado', 'Datos actualizados', 'success');
            closeModal();
            loadExpiring();
            loadExpired(); // Recargar ambas listas
        } else {
            Swal.fire('Error', res.message, 'error');
        }
    });
}