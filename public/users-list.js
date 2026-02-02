// public/users-list.js

let currentPage = 1;
let totalPages = 1;
const LIMIT = 50;

document.addEventListener('DOMContentLoaded', () => {
    applyUserFilter(true); 

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

function changePage(direction) {
    const newPage = currentPage + direction;
    if (newPage > 0 && newPage <= totalPages) {
        currentPage = newPage;
        applyUserFilter(false);
    }
}

function applyUserFilter(resetPage = true) {
    if (resetPage) currentPage = 1;

    const tbody = document.getElementById('allUsersTableBody');
    tbody.innerHTML = `<tr><td colspan="8" class="p-10 text-center"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div><p class="text-xs text-gray-400 mt-2 font-bold">Cargando...</p></td></tr>`;

    document.getElementById('btnPrev').disabled = true;
    document.getElementById('btnNext').disabled = true;

    // Recoger parámetros de filtros
    const params = new URLSearchParams({
        paymentMethod: document.getElementById('filterPaymentMethod').value,
        ingresoStart: document.getElementById('filterIngresoStart').value,
        ingresoEnd: document.getElementById('filterIngresoEnd').value,
        pagoStart: document.getElementById('filterPagoStart').value,
        pagoEnd: document.getElementById('filterPagoEnd').value,
        registroStart: document.getElementById('filterRegistroStart').value,
        registroEnd: document.getElementById('filterRegistroEnd').value,
        page: currentPage,
        limit: LIMIT
    });

    fetch(`/api/memberships/filter?${params.toString()}`)
        .then(res => res.json())
        .then(response => {
            const users = response.data;
            const total = response.total;
            totalPages = response.totalPages;

            document.getElementById('totalCountHeader').innerText = total;
            document.getElementById('showingCount').innerText = users.length;
            document.getElementById('currentPageDisplay').innerText = currentPage;
            document.getElementById('totalPagesDisplay').innerText = totalPages || 1;

            document.getElementById('btnPrev').disabled = currentPage === 1;
            document.getElementById('btnNext').disabled = currentPage >= totalPages;

            if (users.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="p-10 text-center text-gray-400 font-medium bg-gray-50 rounded-lg m-4">No se encontraron resultados.</td></tr>`;
                return;
            }

            let htmlRows = '';

            users.forEach(u => {
                const fVenc = u.F_VENCIMIENTO ? u.F_VENCIMIENTO.split('T')[0] : '--';
                const fIngreso = u.F_INGRESO ? u.F_INGRESO.split('T')[0] : '--';
                const fPago = u.FECHA_PAGO ? u.FECHA_PAGO.split('T')[0] : null;
                const fRegistro = u.FECHA_REGISTRO ? u.FECHA_REGISTRO.split('T')[0] : '<span class="text-gray-300 italic">--</span>';

                let estadoClass = '';
                if(u.ESTADO === 'ACTIVO') estadoClass = 'bg-green-100 text-green-700 border-green-200';
                else if(u.ESTADO === 'VENCIDO') estadoClass = 'bg-red-100 text-red-700 border-red-200';
                else if(u.ESTADO === 'CONGELADO') estadoClass = 'bg-blue-100 text-blue-700 border-blue-200';
                else estadoClass = 'bg-gray-100 text-gray-600 border-gray-200';

                let pagoInfo = '<span class="text-gray-300 text-xs italic">Sin registro</span>';
                if (u.METODO_PAGO || fPago) {
                    const metodo = u.METODO_PAGO || 'Desconocido';
                    const monto = u.MONTO_PAGO ? `$${Number(u.MONTO_PAGO).toLocaleString()}` : '';
                    pagoInfo = `<div class="flex flex-col"><span class="font-bold text-xs text-slate-700">${metodo}</span><span class="text-green-600 font-mono text-xs font-bold">${monto}</span><span class="text-[10px] text-gray-400 mt-0.5">${fPago || ''}</span></div>`;
                }

                htmlRows += `
                    <tr class="hover:bg-blue-50 border-b border-gray-100 transition duration-150 group">
                        <td class="p-3 align-middle text-center"><span class="bg-slate-100 text-slate-500 font-mono text-[10px] px-2 py-1 rounded border border-slate-200 font-bold">#${u.id}</span></td>
                        <td class="p-3 align-top"><div class="font-bold text-slate-800 text-sm group-hover:text-blue-700 transition">${u.USUARIO}</div><div class="text-[10px] text-gray-500 font-medium uppercase mt-1 tracking-wide">${u.PLAN || 'Sin plan'}</div></td>
                        <td class="p-3 align-top text-xs font-mono text-slate-600 font-bold tracking-wide">${u.N_CEDULA || '--'}</td>
                        <td class="p-3 align-middle text-center"><span class="${estadoClass} px-2 py-1 rounded-full text-[10px] font-bold border shadow-sm">${u.ESTADO}</span></td>
                        <td class="p-3 align-top">${pagoInfo}</td>
                        <td class="p-3 align-top text-xs"><div class="mb-1"><span class="text-gray-400 font-bold w-10 inline-block">INI:</span><span class="text-slate-600">${fIngreso}</span></div><div><span class="text-red-300 font-bold w-10 inline-block">FIN:</span><span class="text-red-500 font-bold">${fVenc}</span></div></td>
                        <td class="p-3 align-middle text-center font-bold text-indigo-700 text-xs">${fRegistro}</td>
                        <td class="p-3 align-middle text-center">
                            <button onclick="openUserModal(${u.id})" class="text-slate-500 hover:text-white hover:bg-slate-800 p-2 rounded-lg transition border border-gray-200 hover:border-slate-800 shadow-sm">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                            </button>
                        </td>
                    </tr>`;
            });

            tbody.innerHTML = htmlRows;
        })
        .catch(err => {
            console.error(err);
            tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-red-500 font-bold">Error de conexión.</td></tr>`;
        });
}

function clearFilters() {
    document.getElementById('filterPaymentMethod').value = 'all';
    document.getElementById('filterIngresoStart').value = '';
    document.getElementById('filterIngresoEnd').value = '';
    document.getElementById('filterPagoStart').value = '';
    document.getElementById('filterPagoEnd').value = '';
    document.getElementById('filterRegistroStart').value = '';
    document.getElementById('filterRegistroEnd').value = '';
    applyUserFilter(true);
}

// === NUEVA FUNCIÓN: EXPORTAR A EXCEL (CSV) ===
function exportToExcel() {
    // 1. Mostrar notificación de "Generando..."
    Swal.fire({
        title: 'Generando Reporte',
        text: 'Por favor espera, estamos procesando los datos...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    // 2. Recoger filtros
    const params = new URLSearchParams({
        paymentMethod: document.getElementById('filterPaymentMethod').value,
        ingresoStart: document.getElementById('filterIngresoStart').value,
        ingresoEnd: document.getElementById('filterIngresoEnd').value,
        pagoStart: document.getElementById('filterPagoStart').value,
        pagoEnd: document.getElementById('filterPagoEnd').value,
        registroStart: document.getElementById('filterRegistroStart').value,
        registroEnd: document.getElementById('filterRegistroEnd').value
    });

    // 3. Llamar al endpoint /export (que no tiene paginación)
    fetch(`/api/memberships/export?${params.toString()}`)
        .then(res => res.json())
        .then(data => {
            if (!data || data.length === 0) {
                Swal.fire('Atención', 'No hay datos para exportar con los filtros actuales.', 'warning');
                return;
            }

            // 4. Convertir JSON a CSV
            let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // BOM para acentos
            
            // Cabeceras
            const headers = ["ID", "Usuario", "Cedula", "Telefono", "Correo", "Direccion", "Plan", "Estado", "F_Ingreso", "F_Vencimiento", "F_Pago", "Metodo_Pago", "Monto", "F_Registro"];
            csvContent += headers.join(",") + "\r\n";

            // Filas
            data.forEach(row => {
                const formatDate = (d) => d ? d.split('T')[0] : '';
                
                const rowData = [
                    row.id,
                    `"${(row.USUARIO || '').replace(/"/g, '""')}"`, // Escapar comillas
                    `"${(row.N_CEDULA || '')}"`,
                    `"${(row.TELEFONO || '')}"`,
                    `"${(row.CORREO_ELECTRONICO || '')}"`,
                    `"${(row.DIRECCION_O_BARRIO || '').replace(/"/g, '""')}"`,
                    `"${(row.PLAN || '').replace(/"/g, '""')}"`,
                    row.ESTADO,
                    formatDate(row.F_INGRESO),
                    formatDate(row.F_VENCIMIENTO),
                    formatDate(row.FECHA_PAGO),
                    row.METODO_PAGO || '',
                    row.MONTO_PAGO || 0,
                    row.FECHA_REGISTRO ? row.FECHA_REGISTRO.replace('T', ' ').substring(0, 19) : ''
                ];
                csvContent += rowData.join(",") + "\r\n";
            });

            // 5. Descargar Archivo
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `reporte_usuarios_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            Swal.close();
        })
        .catch(err => {
            console.error(err);
            Swal.fire('Error', 'No se pudo generar el reporte.', 'error');
        });
}

// === FUNCIONES MODAL (Iguales) ===
function openUserModal(id) {
    fetch(`/api/users/${id}`)
    .then(res => res.json())
    .then(user => {
        const getVal = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ''; };
        const formatDate = (date) => date ? date.split('T')[0] : '';
        const formatDateTime = (dateString) => {
            if (!dateString) return '';
            const date = new Date(dateString);
            const pad = (n) => n < 10 ? '0' + n : n;
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
        };

        getVal('editUserId', user.id);
        getVal('editNombre', user.USUARIO);
        getVal('editCedula', user.N_CEDULA);
        getVal('editTelefono', user.TELEFONO);
        getVal('editCorreo', user.CORREO_ELECTRONICO);
        getVal('editDireccion', user.DIRECCION_O_BARRIO);
        getVal('editEstado', user.ESTADO || 'ACTIVO');
        getVal('editFIngreso', formatDate(user.F_INGRESO));
        getVal('editFVencimiento', formatDate(user.F_VENCIMIENTO));
        getVal('editFechaPago', formatDate(user.FECHA_PAGO));
        getVal('editMetodoPago', user.METODO_PAGO);
        getVal('editMontoPago', user.MONTO_PAGO);
        getVal('editFechaRegistro', formatDateTime(user.FECHA_REGISTRO));

        getVal('editNacimiento', formatDate(user.F_N));
        getVal('editEdad', user.EDAD);
        getVal('editSexo', user.SEXO);
        getVal('editFExamen', formatDate(user.F_EXAMEN_LABORATORIO));
        getVal('editFNutricion', formatDate(user.F_CITA_NUTRICION));
        getVal('editFDeportiva', user.F_CITA_MED_DEPORTIVA);
        getVal('editPlanInfo', user.PLAN_INFO);
        getVal('editNotas', user.NOTAS);

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
    const planFinal = planSelect.value === 'Otro' ? planInput.value.trim() : planSelect.value;

    const data = {
        usuario: document.getElementById('editNombre').value,
        cedula: document.getElementById('editCedula').value,
        telefono: document.getElementById('editTelefono').value,
        correo: document.getElementById('editCorreo').value,
        direccion: document.getElementById('editDireccion').value,
        estado: document.getElementById('editEstado').value,
        plan: planFinal,
        f_ingreso: document.getElementById('editFIngreso').value,
        f_vencimiento: document.getElementById('editFVencimiento').value,
        fecha_pago: document.getElementById('editFechaPago').value,
        metodo_pago: document.getElementById('editMetodoPago').value,
        monto_pago: document.getElementById('editMontoPago').value,
        fecha_registro: document.getElementById('editFechaRegistro').value,
        f_nacimiento: document.getElementById('editNacimiento').value,
        edad: document.getElementById('editEdad').value,
        sexo: document.getElementById('editSexo').value,
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
            Swal.fire({ title: 'Actualizado', text: 'Usuario guardado', icon: 'success', timer: 1500, showConfirmButton: false });
            closeModal();
            applyUserFilter(false);
        } else {
            Swal.fire('Error', res.message, 'error');
        }
    });
}