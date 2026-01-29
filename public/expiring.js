// public/expiring.js

document.addEventListener('DOMContentLoaded', () => {
    loadExpiring();
    loadExpired();
    
    // Listeners para el plan "Otro" en el modal
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

    // Listeners para validación de fechas de congelamiento
    const startInput = document.getElementById('freezeStart');
    const endInput = document.getElementById('freezeEnd');
    if (startInput && endInput) {
        startInput.addEventListener('change', (e) => {
            endInput.min = e.target.value;
            if (endInput.value && endInput.value < e.target.value) {
                endInput.value = '';
            }
        });
    }
});

// 1. CARGAR MEMBRESÍAS POR VENCER
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
                        <button onclick="openUserModal(${u.id})" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg font-bold shadow flex items-center gap-1">✏️</button>
                    </td>
                </tr>`;
        });
    });
}

// 2. CARGAR MEMBRESÍAS VENCIDAS
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
                        <button onclick="openUserModal(${u.id})" class="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded-lg font-bold shadow flex items-center gap-1">✏️</button>
                    </td>
                </tr>`;
        });
    });
}

// 3. MOSTRAR SECCIÓN DE TODOS LOS USUARIOS
function toggleAllUsers() {
    const section = document.getElementById('allUsersSection');
    if (section.classList.contains('hidden')) {
        section.classList.remove('hidden');
        applyUserFilter(); // Carga inicial usando el filtro por defecto (todo)
    } else {
        section.classList.add('hidden');
    }
}

// 4. APLICAR FILTROS (OPTIMIZADO EN SERVIDOR)
function applyUserFilter() {
    const tbody = document.getElementById('allUsersTableBody');
    tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-blue-500"><div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>Cargando...</td></tr>`;

    // Obtener valores de los inputs
    const params = new URLSearchParams({
        paymentMethod: document.getElementById('filterPaymentMethod').value,
        ingresoStart: document.getElementById('filterIngresoStart').value,
        ingresoEnd: document.getElementById('filterIngresoEnd').value,
        pagoStart: document.getElementById('filterPagoStart').value,
        pagoEnd: document.getElementById('filterPagoEnd').value
    });

    // Llamada al endpoint optimizado
    fetch(`/api/memberships/filter?${params.toString()}`)
        .then(res => res.json())
        .then(users => {
            tbody.innerHTML = '';
            if (users.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-gray-400">No se encontraron resultados.</td></tr>`;
                return;
            }

            users.forEach(u => {
                const fVenc = u.F_VENCIMIENTO ? u.F_VENCIMIENTO.split('T')[0] : '--';
                const fIngreso = u.F_INGRESO ? u.F_INGRESO.split('T')[0] : '--';
                const fPago = u.FECHA_PAGO ? u.FECHA_PAGO.split('T')[0] : null;

                let estadoClass = u.ESTADO === 'ACTIVO' ? 'bg-green-100 text-green-800' :
                                  u.ESTADO === 'VENCIDO' ? 'bg-red-100 text-red-800' :
                                  u.ESTADO === 'CONGELADO' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-500';

                let pagoInfo = '<span class="text-gray-300 text-xs italic">--</span>';
                if (u.METODO_PAGO || fPago) {
                    const metodo = u.METODO_PAGO || 'Sin método';
                    const fechaP = fPago ? `<span class="text-gray-500 text-[10px] block">📅 ${fPago}</span>` : '';
                    const monto = u.MONTO_PAGO ? `<span class="text-green-600 font-mono font-bold">$${Number(u.MONTO_PAGO).toLocaleString()}</span>` : '';
                    pagoInfo = `<div class="leading-tight"><span class="font-bold text-xs text-blue-900 block">${metodo}</span>${monto}${fechaP}</div>`;
                }

                tbody.innerHTML += `
                    <tr class="hover:bg-blue-50 border-b border-gray-100 transition">
                        <td class="p-3"><div class="font-bold text-gray-700 text-sm">${u.USUARIO}</div><div class="text-[10px] text-gray-400">${u.PLAN || ''}</div></td>
                        <td class="p-3 text-gray-500 text-xs">${u.N_CEDULA || ''}</td>
                        <td class="p-3"><span class="px-2 py-1 rounded text-[10px] font-bold ${estadoClass}">${u.ESTADO}</span></td>
                        <td class="p-3">${pagoInfo}</td>
                        <td class="p-3"><div class="text-xs"><div class="text-gray-500" title="Fecha Ingreso">📥 ${fIngreso}</div><div class="text-red-500 font-medium" title="Fecha Vencimiento">🏁 ${fVenc}</div></div></td>
                        <td class="p-3 text-center"><button onclick="openUserModal(${u.id})" class="text-blue-600 hover:text-blue-800 font-bold text-xs bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded transition border border-blue-200">Editar</button></td>
                    </tr>`;
            });
        })
        .catch(err => {
            console.error(err);
            tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-red-500">Error al cargar datos.</td></tr>`;
        });
}

function clearFilters() {
    document.getElementById('filterPaymentMethod').value = 'all';
    document.getElementById('filterIngresoStart').value = '';
    document.getElementById('filterIngresoEnd').value = '';
    document.getElementById('filterPagoStart').value = '';
    document.getElementById('filterPagoEnd').value = '';
    applyUserFilter();
}

// 5. GESTIÓN DEL MODAL Y EDICIÓN
function openUserModal(id) {
    fetch(`/api/users/${id}`)
    .then(res => res.json())
    .then(user => {
        // Llenar campos básicos
        document.getElementById('editUserId').value = user.id;
        document.getElementById('editNombre').value = user.USUARIO || '';
        document.getElementById('editCedula').value = user.N_CEDULA || '';
        document.getElementById('editTelefono').value = user.TELEFONO || '';
        document.getElementById('editCorreo').value = user.CORREO_ELECTRONICO || '';
        document.getElementById('editDireccion').value = user.DIRECCION_O_BARRIO || '';
        document.getElementById('editEstado').value = user.ESTADO || 'ACTIVO';
        
        // Fechas
        const fVencimiento = formatDateForInput(user.F_VENCIMIENTO);
        document.getElementById('editFVencimiento').value = fVencimiento;
        document.getElementById('editFechaPago').value = formatDateForInput(user.FECHA_PAGO);
        document.getElementById('editMetodoPago').value = user.METODO_PAGO || '';
        document.getElementById('editMontoPago').value = user.MONTO_PAGO || '';

        // Plan
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

        // Otros campos
        if(document.getElementById('editNacimiento')) document.getElementById('editNacimiento').value = formatDateForInput(user.F_N);
        if(document.getElementById('editEdad')) document.getElementById('editEdad').value = user.EDAD || '';
        if(document.getElementById('editSexo')) document.getElementById('editSexo').value = user.SEXO || 'M';
        if(document.getElementById('editFIngreso')) document.getElementById('editFIngreso').value = formatDateForInput(user.F_INGRESO);
        if(document.getElementById('editFExamen')) document.getElementById('editFExamen').value = formatDateForInput(user.F_EXAMEN_LABORATORIO);
        if(document.getElementById('editFNutricion')) document.getElementById('editFNutricion').value = formatDateForInput(user.F_CITA_NUTRICION);
        if(document.getElementById('editFDeportiva')) document.getElementById('editFDeportiva').value = user.F_CITA_MED_DEPORTIVA || '';
        if(document.getElementById('editPlanInfo')) document.getElementById('editPlanInfo').value = user.PLAN_INFO || '';
        if(document.getElementById('editNotas')) document.getElementById('editNotas').value = user.NOTAS || '';

        // Congelamiento
        const infoCongelamientoDiv = document.getElementById('infoCongelamiento');
        if (infoCongelamientoDiv) {
            if (user.ESTADO === 'CONGELADO') {
                infoCongelamientoDiv.classList.remove('hidden');
                document.getElementById('viewInicioCongelamiento').value = formatDateForInput(user.F_INICIO_CONGELAMIENTO);
                document.getElementById('viewFinCongelamiento').value = formatDateForInput(user.F_FIN_CONGELAMIENTO);
            } else {
                infoCongelamientoDiv.classList.add('hidden');
            }
        }

        // Configurar límites de congelamiento
        const freezeStart = document.getElementById('freezeStart');
        const freezeEnd = document.getElementById('freezeEnd');
        if (freezeStart && freezeEnd) {
            const today = new Date().toISOString().split('T')[0];
            freezeStart.min = today;
            freezeStart.max = fVencimiento;
            freezeEnd.max = fVencimiento;
            freezeStart.value = '';
            freezeEnd.value = '';
        }

        document.getElementById('userModal').classList.remove('hidden');
    });
}

function closeModal() {
    document.getElementById('userModal').classList.add('hidden');
}

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
        fecha_pago: document.getElementById('editFechaPago').value,
        metodo_pago: document.getElementById('editMetodoPago').value,
        monto_pago: document.getElementById('editMontoPago').value,
        // Campos adicionales
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
            loadExpiring();
            loadExpired();
            if(!document.getElementById('allUsersSection').classList.contains('hidden')) {
                applyUserFilter();
            }
        } else {
            Swal.fire('Error', res.message, 'error');
        }
    })
    .catch(err => Swal.fire('Error', 'Fallo de conexión.', 'error'));
}

function freezeMembership() {
    const id = document.getElementById('editUserId').value;
    const start = document.getElementById('freezeStart').value;
    const end = document.getElementById('freezeEnd').value;

    if (!start || !end) {
        alert('⚠️ Selecciona ambas fechas.');
        return;
    }
    if (new Date(start) > new Date(end)) {
        alert('⚠️ Fecha inicio debe ser anterior a fecha fin.');
        return;
    }

    if (!confirm('¿Seguro que deseas congelar? Se extenderá la fecha de vencimiento.')) return;

    fetch(`/api/Users/${id}/freeze`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaInicio: start, fechaFin: end })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('❄️ ' + data.message);
            openUserModal(id);
        } else {
            alert('❌ Error: ' + data.message);
        }
    });
}

function formatDateForInput(dateString) {
    if (!dateString) return '';
    return dateString.split('T')[0];
}

function generateWhatsappBtn(user, type, fechaVenc) {
    if(!user.TELEFONO) return '<span class="text-xs text-gray-400">Sin Tel</span>';
    let tel = user.TELEFONO.replace(/\D/g, '');
    if (!tel.startsWith('57') && tel.length === 10) tel = '57' + tel;
    let mensaje = type === 'expiring' 
        ? `Hola ${user.USUARIO}! Tu plan *${user.PLAN}* vence el *${fechaVenc}*. ¡No detengas tu proceso!`
        : `Hola ${user.USUARIO}! Tu plan venció el *${fechaVenc}*. ¡Te extrañamos en CardioFit! Escríbenos para renovar. 💪`;
    const colorBtn = type === 'expiring' ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-700 hover:bg-black';
    return `<a href="https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}" target="_blank" class="${colorBtn} text-white px-3 py-2 rounded-lg font-bold flex items-center justify-center gap-2 shadow transition hover:scale-105"><svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg> WhatsApp </a>`;
}