// public/expiring.js

// Variable global para almacenar usuarios y filtrar localmente
let globalAllUsers = [];

document.addEventListener('DOMContentLoaded', () => {
    loadExpiring();
    loadExpired();
    
    // Listeners para el plan "Otro"
    const planSelect = document.getElementById('planSelect');
    const planInput = document.getElementById('planManualInput');
    if (planSelect && planInput) {
        planSelect.addEventListener('change', (e) => {
            if (e.target.value === 'Otro') {
                planInput.classList.remove('hidden');
                planInput.focus();
            } else {
                planInput.classList.add('hidden');
                planInput.value = '';
            }
        });
    }
});

// 1. MEMBRESÍAS POR VENCER (ACTIVOS - Próximos 10 días)
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
            
            // Ajuste zona horaria simple para visualización
            const fechaVenc = u.F_VENCIMIENTO ? u.F_VENCIMIENTO.split('T')[0] : 'N/A';

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

// 2. MEMBRESÍAS VENCIDAS (ESTADO VENCIDO)
function loadExpired() {
    fetch('/api/memberships/expired')
    .then(res => res.json())
    .then(users => {
        const tbody = document.getElementById('expiredTableBody');
        tbody.innerHTML = '';

        if(users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-gray-500">No hay membresías vencidas recientemente.</td></tr>`;
            return;
        }

        users.forEach(u => {
            const fechaVenc = u.F_VENCIMIENTO ? u.F_VENCIMIENTO.split('T')[0] : 'N/A';
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
        mensaje = `Hola ${user.USUARIO}! Esperamos que estés muy bien. Queríamos recordarte que tu plan venció el día *${fechaVenc}*. ¡Te extrañamos en CardioFit! Escríbenos para renovar y seguir entrenando con toda la energía. 💪`;
        colorBtn = 'bg-gray-700 hover:bg-black';
    }

    const url = `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`;
    
    return `
        <a href="${url}" target="_blank" class="${colorBtn} text-white px-3 py-2 rounded-lg font-bold flex items-center justify-center gap-2 shadow transition hover:scale-105" title="Enviar WhatsApp">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
            WhatsApp
        </a>
    `;
}

// 3. CARGAR TODOS LOS USUARIOS Y GUARDAR EN GLOBAL
function toggleAllUsers() {
    const section = document.getElementById('allUsersSection');
    const isHidden = section.classList.contains('hidden');
    
    if (isHidden) {
        section.classList.remove('hidden');
        // Cargamos usuarios desde la API
        fetch('/api/memberships/all')
        .then(res => res.json())
        .then(users => {
            globalAllUsers = users; // Guardar en memoria
            applyUserFilter();      // Renderizar aplicando el filtro actual (default 'all')
        });
    } else {
        section.classList.add('hidden');
    }
}

// 4. APLICAR FILTRO DE PAGO Y RENDERIZAR TABLA
function applyUserFilter() {
    const filterValue = document.getElementById('filterPaymentMethod').value;
    const tbody = document.getElementById('allUsersTableBody');
    tbody.innerHTML = '';

    // Filtrar los datos en memoria
    const filteredUsers = globalAllUsers.filter(u => {
        if (filterValue === 'all') return true;
        // Compara exactamente el texto guardado en BD
        return (u.METODO_PAGO || '') === filterValue;
    });

    if (filteredUsers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-gray-400">No se encontraron usuarios con este método de pago.</td></tr>`;
        return;
    }

    filteredUsers.forEach(u => {
        const fecha = u.F_VENCIMIENTO ? u.F_VENCIMIENTO.split('T')[0] : 'Sin fecha';
        
        let estadoClass = 'bg-gray-100 text-gray-500';
        if (u.ESTADO === 'ACTIVO') estadoClass = 'bg-green-100 text-green-800';
        if (u.ESTADO === 'VENCIDO') estadoClass = 'bg-red-100 text-red-800';
        if (u.ESTADO === 'CONGELADO') estadoClass = 'bg-blue-100 text-blue-800';

        // Construir celda de Pago
        let pagoInfo = '<span class="text-gray-400 text-xs italic">Pendiente</span>';
        if (u.METODO_PAGO) {
            const monto = u.MONTO_PAGO ? `$${Number(u.MONTO_PAGO).toLocaleString()}` : '';
            pagoInfo = `
                <div class="flex flex-col">
                    <span class="font-bold text-xs text-blue-900">${u.METODO_PAGO}</span>
                    <span class="text-xs text-green-600 font-mono font-bold">${monto}</span>
                </div>
            `;
        }

        tbody.innerHTML += `
            <tr class="hover:bg-blue-50 border-b border-gray-100 transition">
                <td class="p-3 font-bold text-gray-700">${u.USUARIO}</td>
                <td class="p-3 text-gray-500 text-xs">${u.N_CEDULA || ''}</td>
                <td class="p-3"><span class="px-2 py-1 rounded text-xs font-bold ${estadoClass}">${u.ESTADO}</span></td>
                <td class="p-3">${pagoInfo}</td>
                <td class="p-3 text-sm text-gray-600">${fecha}</td>
                <td class="p-3 text-center">
                    <button onclick="openUserModal(${u.id})" class="text-blue-600 hover:text-blue-800 font-bold text-sm bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded transition">Editar</button>
                </td>
            </tr>
        `;
    });
}

// 5. ABRIR MODAL Y CARGAR DATOS
function formatDateForInput(dateString) {
    if (!dateString) return '';
    return dateString.split('T')[0];
}

function openUserModal(id) {
    fetch(`/api/users/${id}`)
    .then(res => res.json())
    .then(user => {
        // IDs básicos
        document.getElementById('editUserId').value = user.id;
        document.getElementById('editNombre').value = user.USUARIO || '';
        document.getElementById('editCedula').value = user.N_CEDULA || '';
        document.getElementById('editTelefono').value = user.TELEFONO || '';
        document.getElementById('editCorreo').value = user.CORREO_ELECTRONICO || '';
        document.getElementById('editDireccion').value = user.DIRECCION_O_BARRIO || '';
        
        // Estado y Fechas
        document.getElementById('editEstado').value = user.ESTADO || 'ACTIVO';
        document.getElementById('editFVencimiento').value = formatDateForInput(user.F_VENCIMIENTO);
        document.getElementById('editFechaPago').value = formatDateForInput(user.FECHA_PAGO);

        // --- NUEVOS CAMPOS DE PAGO ---
        document.getElementById('editMetodoPago').value = user.METODO_PAGO || '';
        document.getElementById('editMontoPago').value = user.MONTO_PAGO || '';
        // -----------------------------

        // Lógica de Plan
        const planSelect = document.getElementById('planSelect');
        const planInput = document.getElementById('planManualInput');
        const planesEstandar = ["EXPERIENCIA FITNESS PLAN BÁSICO", "EXPERIENCIA FITNESS (ESTÁNDAR)", "EXPERIENCIA FITNESS DE LUJO", "EXPERIENCIA BIKE FIT DE LUJO"];
        
        if (planesEstandar.includes(user.PLAN)) {
            planSelect.value = user.PLAN;
            planInput.classList.add('hidden');
        } else {
            planSelect.value = "Otro";
            planInput.classList.remove('hidden');
            planInput.value = user.PLAN || "";
        }

        // Campos ocultos pero necesarios para el update completo
        if(document.getElementById('editNacimiento')) document.getElementById('editNacimiento').value = formatDateForInput(user.F_N);
        if(document.getElementById('editEdad')) document.getElementById('editEdad').value = user.EDAD || '';
        if(document.getElementById('editSexo')) document.getElementById('editSexo').value = user.SEXO || 'M';
        if(document.getElementById('editFIngreso')) document.getElementById('editFIngreso').value = formatDateForInput(user.F_INGRESO);
        if(document.getElementById('editFExamen')) document.getElementById('editFExamen').value = formatDateForInput(user.F_EXAMEN_LABORATORIO);
        if(document.getElementById('editFNutricion')) document.getElementById('editFNutricion').value = formatDateForInput(user.F_CITA_NUTRICION);
        if(document.getElementById('editFDeportiva')) document.getElementById('editFDeportiva').value = user.F_CITA_MED_DEPORTIVA || '';
        if(document.getElementById('editPlanInfo')) document.getElementById('editPlanInfo').value = user.PLAN_INFO || '';
        if(document.getElementById('editNotas')) document.getElementById('editNotas').value = user.NOTAS || '';

        const modal = document.getElementById('userModal');
        modal.classList.remove('hidden');
    });
}

function closeModal() {
    document.getElementById('userModal').classList.add('hidden');
}

// 6. GUARDAR CAMBIOS
function saveUserChanges() {
    const id = document.getElementById('editUserId').value;
    const planSelect = document.getElementById('planSelect');
    const planInput = document.getElementById('planManualInput');
    
    let planFinal = planSelect.value === 'Otro' ? planInput.value.trim() : planSelect.value;

    const data = {
        usuario: document.getElementById('editNombre').value,
        cedula: document.getElementById('editCedula').value,
        telefono: document.getElementById('editTelefono').value,
        correo: document.getElementById('editCorreo').value,
        direccion: document.getElementById('editDireccion').value,
        estado: document.getElementById('editEstado').value,
        f_vencimiento: document.getElementById('editFVencimiento').value,
        plan: planFinal,
        
        // Pagos
        fecha_pago: document.getElementById('editFechaPago').value,
        metodo_pago: document.getElementById('editMetodoPago').value,
        monto_pago: document.getElementById('editMontoPago').value,

        // Campos ocultos
        f_nacimiento: document.getElementById('editNacimiento').value,
        edad: document.getElementById('editEdad').value,
        sexo: document.getElementById('editSexo').value,
        f_ingreso: document.getElementById('editFIngreso').value,
        f_examen: document.getElementById('editFExamen').value,
        f_nutricion: document.getElementById('editFNutricion').value,
        f_deportiva: document.getElementById('editFDeportiva').value,
        plan_info: document.getElementById('editPlanInfo').value,
        notas: document.getElementById('editNotas').value
    };

    fetch(`/api/Users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(res => res.json())
    .then(res => {
        if(res.success) {
            Swal.fire('Guardado', 'Datos actualizados correctamente.', 'success');
            closeModal();
            loadExpiring(); // Recargar listas principales
            loadExpired();
            
            // Si la lista completa está abierta, recargarla también
            if(!document.getElementById('allUsersSection').classList.contains('hidden')) {
                toggleAllUsers(); // Esto vuelve a hacer fetch y refresca
            }
        } else {
            Swal.fire('Error', res.message, 'error');
        }
    })
    .catch(err => Swal.fire('Error', 'Fallo de conexión.', 'error'));
}