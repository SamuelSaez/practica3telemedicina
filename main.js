var gestorId = null;
var ubicaciones = [];
var categorias = [];
var modelos = [];


var wsGestor = null;

rest.onNoAutorizado = function () {
    if (gestorId === null) return;
    alert("Sesión caducada, vuelve a iniciar sesión");
    salir();
};

function conectarWS() {
    wsGestor = new WebSocket("ws://localhost:3502");

    wsGestor.onopen = function() {
        
        wsGestor.send(JSON.stringify({ tipo: 'registro', rol: 'gestor', idUsuario: gestorId }));
    };

    wsGestor.onmessage = function(event) {
        try {
            var aviso = JSON.parse(event.data);
            if (aviso.tipo === 'aviso') {
                añadirAviso(aviso);
            }
        } catch(e) {
            console.error("Error procesando aviso WS:", e);
        }
    };

    wsGestor.onerror = function(e) {
        console.error("Error WS gestor:", e);
    };
}

function desconectarWS() {
    if (wsGestor) {
        wsGestor.close();
        wsGestor = null;
    }
}

function añadirAviso(aviso) {
    var tbody = document.getElementById('tabla-avisos');
    if (!tbody) return;
    var claseColor = 'aviso-' + aviso.color;
    var fila = document.createElement('tr');
    fila.className = claseColor;
    fila.innerHTML = '<td>' + aviso.fecha + '</td><td>' + aviso.origen + '</td><td>' + aviso.texto + '</td>';
    tbody.insertBefore(fila, tbody.firstChild); // más reciente arriba
}



function mostrarVista(id) {
    document.querySelectorAll('.vista').forEach(d => d.classList.remove('activo'));
    document.getElementById(id).classList.add('activo');
}

function irInicio() {
    cargarAuxiliares(function() {
        actualizarInfoGestor();
        buscarRecursos();
        cargarRanking();
        mostrarVista('vista-inicio');
    });
}

function irRegistro() {
    document.getElementById('reg_nombre').value = "";
    document.getElementById('reg_apellidos').value = "";
    document.getElementById('reg_user').value = "";
    document.getElementById('reg_pass').value = "";
    document.getElementById('titulo-registro').innerText = "Registro Nuevo Gestor";
    mostrarVista('vista-registro');
}

function salir() {
    desconectarWS();
    gestorId = null;
    rest.token = null;
    mostrarVista('vista-login');
}

function cancelarRegistro() {
    if (gestorId) irInicio();
    else salir();
}

function hacerLogin() {
    var u = document.getElementById('login_user').value;
    var p = document.getElementById('login_pass').value;
    rest.post("/api/gestores/login", { login: u, password: p }, function(status, data) {
        if (status == 200) {
            gestorId = data.id;
            rest.token = data.token;
            conectarWS();
            irInicio();
    }   else {
            alert("Error: " + data);
        }
    });
}

function guardarGestor() {
    var datos = {
        nombre: document.getElementById('reg_nombre').value,
        apellidos: document.getElementById('reg_apellidos').value,
        login: document.getElementById('reg_user').value,
        password: document.getElementById('reg_pass').value
    };

    if (gestorId) {
        rest.put("/api/gestores/" + gestorId, datos, function(s, d) {
            if (s == 200) irInicio();
            else alert(d);
        });
    } else {
        rest.post("/api/gestores", datos, function(s, d) {
            if (s == 201) { alert("Registrado"); salir(); }
            else alert(d);
        });
    }
}

function editarPerfil() {
    rest.get("/api/gestores/" + gestorId, function(s, data) {
        if (s == 200) {
            document.getElementById('reg_nombre').value = data.nombre;
            document.getElementById('reg_apellidos').value = data.apellidos;
            document.getElementById('reg_user').value = data.usuario;
            document.getElementById('reg_pass').value = "";
            document.getElementById('titulo-registro').innerText = "Editar Mis Datos";
            mostrarVista('vista-registro');
        }
    });
}

function actualizarInfoGestor() {
    rest.get("/api/gestores/" + gestorId, function(s, data) {
        if (s == 200) {
            document.getElementById('bienvenida').innerHTML = "Bienvenido <b>" + data.nombre + " " + data.apellidos + "</b>";
        }
    });
}

function cargarAuxiliares(callback) {
    rest.get("/api/ubicaciones", function(s, u) { ubicaciones = u;
        rest.get("/api/categorias", function(s, c) { categorias = c;
            rest.get("/api/modelos", function(s, m) { modelos = m;
                rellenarSelect('bus_cat', categorias, true);
                rellenarSelect('bus_mod', modelos, true);
                rellenarSelect('bus_ubi', ubicaciones, true);
                if (callback) callback();
            });
        });
    });
}

function rellenarSelect(idElem, arrayDatos, conTodos) {
    var sel = document.getElementById(idElem);
    sel.innerHTML = conTodos ? "<option value='Todos'>Todos</option>" : "";
    arrayDatos.forEach(x => {
        sel.innerHTML += "<option value='" + x.id + "'>" + x.nombre + "</option>";
    });
}

function buscarRecursos() {
    var q = "?";
    var cat = document.getElementById('bus_cat').value;
    var mod = document.getElementById('bus_mod').value;
    var ubi = document.getElementById('bus_ubi').value;
    var est = document.getElementById('bus_est').value;

    if (cat != 'Todos') q += "categoria=" + cat + "&";
    if (mod != 'Todos') q += "modelo=" + mod + "&";
    if (ubi != 'Todos') q += "ubicacion=" + ubi + "&";
    if (est != 'Todos') q += "estado=" + est + "&";

    rest.get("/api/recursos" + q, function(s, lista) {
        var tbody = document.getElementById('tabla-recursos-body');
        tbody.innerHTML = "";
        lista.forEach(r => {
            var nomCat = categorias.find(c => { 
                var m = modelos.find(md => md.id == r.modelo);
                return m && m.categoria == c.id; 
            })?.nombre || "-";
            var nomMod = modelos.find(m => m.id == r.modelo)?.nombre || "-";
            var nomUbi = ubicaciones.find(u => u.id == r.ubicacion)?.nombre || "-";
            var txtEst = r.estado == 0 ? "Operativo" : (r.estado == 1 ? "Baja" : "Mant.");

            tbody.innerHTML += `<tr>
                <td>${r.numero_serie}</td>
                <td>${nomCat}</td>
                <td>${nomMod}</td>
                <td>${nomUbi}</td>
                <td>${txtEst}</td>
                <td>
                    <button onclick='abrirRecurso(${r.id})'>Abrir</button>
                    <button onclick='borrarRecurso(${r.id})'>X</button>
                </td>
            </tr>`;
        });
    });
}

function borrarRecurso(id) {
    if(confirm("¿Borrar recurso?")) {
        rest.delete("/api/recursos/" + id, function(s, d) {
            buscarRecursos();
        });
    }
}

function nuevoRecurso() {
    document.getElementById('rec_id').value = "";
    document.getElementById('seccion-reservas-resenyas').style.display = 'none'; 
    rellenarSelect('rec_cat', categorias, false);
    rellenarSelect('rec_ubi', ubicaciones, false);
    filtrarModelosEnFicha(); 
    document.getElementById('rec_serie').value = "";
    mostrarVista('vista-recurso');
}

function filtrarModelosEnFicha() {
    var catId = document.getElementById('rec_cat').value;
    var modelosFiltrados = modelos.filter(m => m.categoria == catId);
    rellenarSelect('rec_mod', modelosFiltrados, false);
}

function abrirRecurso(id) {
    document.getElementById('rec_id').value = id;
    document.getElementById('seccion-reservas-resenyas').style.display = 'block';

    rest.get("/api/recursos/" + id, function(s, r) {
        if (s != 200) return;
        rellenarSelect('rec_cat', categorias, false);
        rellenarSelect('rec_ubi', ubicaciones, false);
        var modObj = modelos.find(m => m.id == r.modelo);
        if (modObj) {
            document.getElementById('rec_cat').value = modObj.categoria;
            filtrarModelosEnFicha();
            document.getElementById('rec_mod').value = r.modelo;
        }
        document.getElementById('rec_serie').value = r.numero_serie;
        document.getElementById('rec_ubi').value = r.ubicacion;
        document.getElementById('rec_estado').value = r.estado;
        cargarReservasYResenyas(id);
        mostrarVista('vista-recurso');
    });
}

function cargarReservasYResenyas(idRecurso) {
    rest.get("/api/recursos/" + idRecurso + "/reservas", function(s, reservas) {
        var tbody = document.getElementById('tabla-reservas');
        tbody.innerHTML = "";
        reservas.forEach(res => {
            var clase = "res-verde"; 
            var now = new Date();
            var inicio = res.fecha_inicio ? new Date(res.fecha_inicio) : null;
            var fin = res.fecha_fin ? new Date(res.fecha_fin) : null;

            if (fin != null) {
                clase = "res-blanco";
            } else if (inicio != null) {
                var diffHoras = (now - inicio) / 36e5;
                if (diffHoras > res.horas_estimadas) clase = "res-rojo";
                else clase = "res-azul";
            }

            rest.get("/api/sanitarios/" + res.sanitario, function(s2, san) {
                var nombreSan = (s2 == 200) ? san.nombre + " " + san.apellidos : "ID " + res.sanitario;
                tbody.innerHTML += `<tr class="${clase}">
                    <td>${nombreSan}</td>
                    <td>${res.horas_estimadas}</td>
                    <td>${formatoFecha(res.fecha_peticion)}</td>
                    <td>${formatoFecha(res.fecha_inicio)}</td>
                    <td>${formatoFecha(res.fecha_fin)}</td>
                </tr>`;
            });
        });
    });

    rest.get("/api/recursos/" + idRecurso + "/resenyas", function(s, resenyas) {
        var tbody = document.getElementById('tabla-resenyas');
        tbody.innerHTML = "";
        resenyas.forEach(rev => {
            rest.get("/api/sanitarios/" + rev.sanitario, function(s2, san) {
                var nombreSan = (s2 == 200) ? san.nombre + " " + san.apellidos : "ID " + rev.sanitario;
                tbody.innerHTML += `<tr>
                    <td>${formatoFecha(rev.fecha)}</td>
                    <td>${nombreSan}</td>
                    <td>${rev.valor}</td>
                    <td>${rev.descripcion}</td>
                </tr>`;
            });
        });
    });
}

function guardarRecurso() {
    var id = document.getElementById('rec_id').value;
    var data = {
        modelo: document.getElementById('rec_mod').value,
        numero_serie: document.getElementById('rec_serie').value,
        ubicacion: document.getElementById('rec_ubi').value,
        estado: document.getElementById('rec_estado').value
    };

    if (id) {
        rest.put("/api/recursos/" + id, data, function(s, d) {
            if(s==200) { alert("Guardado"); irInicio(); }
            else alert("Error al guardar");
        });
    }else {
    rest.post("/api/recursos", data, function(s, d) {
        if (s == 201) { alert("Creado"); irInicio(); }
        else alert("Error al crear");
    });
}
}

function formatoFecha(isoString) {
    if (!isoString) return "-";
    var d = new Date(isoString);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString();
}

function crearReserva() {
    var idRecurso = document.getElementById('rec_id').value;
    if (!idRecurso) {
        alert("Primero debes guardar el recurso para poder añadirle una reserva.");
        return;
    }
    var datos = {
        horas_estimadas: document.getElementById('reserva_horas').value,
        sanitario: document.getElementById('reserva_sanitario').value
    };
    rest.post("/api/recursos/" + idRecurso + "/reservas", datos, function(estado, respuesta) {
        if (estado === 201) {
            alert(respuesta);
            document.getElementById('reserva_horas').value = "1";
            cargarReservasYResenyas(idRecurso);
        } else {
            alert("Error al crear reserva");
        }
    });
}

function crearResenya() {
    var idRecurso = document.getElementById('rec_id').value;
    if (!idRecurso) {
        alert("Primero debes guardar el recurso para poder añadirle una reseña.");
        return;
    }
    var datos = {
        valor: document.getElementById('resenya_valor').value,
        descripcion: document.getElementById('resenya_desc').value,
        sanitario: document.getElementById('resenya_sanitario').value
    };
    rest.post("/api/recursos/" + idRecurso + "/resenyas", datos, function(estado, respuesta) {
        if (estado === 201) {
            alert(respuesta);
            document.getElementById('resenya_valor').value = "5";
            document.getElementById('resenya_desc').value = "";
            cargarReservasYResenyas(idRecurso);
        } else {
            alert("Error al crear reseña");
        }
    });
}


// ---------- Ministerio de Sanidad (todo desde el cliente) ----------
const MINISTERIO = "https://undefined.ua.es/telemedicina/api/datos"; // confirmar URL real

const AREAS = {
    1: "Alergología", 2: "Anestesiología", 3: "Cardiología", 4: "Cirugía General",
    5: "Dermatología", 6: "Aparato Digestivo", 7: "Endocrinología", 8: "Ginecología",
    9: "Hematología", 10: "Medicina Interna", 11: "Neumología", 12: "Neurología",
    13: "Oftalmología", 14: "Oncología", 15: "Pediatría", 16: "Psiquiatría",
    17: "Traumatología", 18: "Urología"
};

// rest.get con promesa, para poder usar await dentro de los bucles
function restGet(url) {
    return new Promise(function (resolve, reject) {
        rest.get(url, function (status, data) {
            if (status >= 200 && status < 300) resolve(data);
            else reject(new Error("GET " + url + " devolvió " + status));
        });
    });
}

// Define aquí el ID del área asignada a tu grupo
const MI_AREA = 5; 

async function enviarAlMinisterio() {
    try {
        const recursos = await restGet("/api/recursos");
        const listaDatos = [];
        const sanitarios = {}; // Caché para no repetir peticiones GET de sanitarios

        for (const rec of recursos) {
            const mod = modelos.find(m => m.id == rec.modelo);
            const cat = mod ? categorias.find(c => c.id == mod.categoria) : null;
            const nombreCat = cat ? cat.nombre : "-";

            const reservas = await restGet("/api/recursos/" + rec.id + "/reservas");
            for (const r of reservas) {
                // Obtener datos del sanitario
                if (!sanitarios[r.sanitario]) {
                    sanitarios[r.sanitario] = await restGet("/api/sanitarios/" + r.sanitario);
                }
                const san = sanitarios[r.sanitario];

                // Todas las reservas van directamente al área de tu grupo
                listaDatos.push({
                    nombre: san.nombre,
                    apellidos: san.apellidos,
                    "categoría": nombreCat,
                    horas_estimadas: r.horas_estimadas,
                    fec_pet: r.fecha_peticion,
                    fec_ini: r.fecha_inicio,
                    fecha_fin: r.fecha_fin
                });
            }
        }

        if (listaDatos.length === 0) {
            alert("No hay reservas que enviar");
            return;
        }

        const hoy = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD
        
        // Un solo POST enviando tu área fija y todas las reservas
        const resp = await fetch(MINISTERIO, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id_area: MI_AREA,
                fecha: hoy,
                datos: listaDatos
            })
        });

        if (!resp.ok) throw new Error("El Ministerio rechazó el envío (" + resp.status + ")");

        alert("Enviadas " + listaDatos.length + " reservas para el área " + (AREAS[MI_AREA] || MI_AREA));
        cargarRanking();
    } catch (e) {
        console.error(e);
        alert("Error al enviar al Ministerio: " + e.message);
    }
}

async function cargarRanking() {
    const tbody = document.getElementById('tabla-ranking');
    tbody.innerHTML = "";
    try {
        const resp = await fetch(MINISTERIO);
        if (!resp.ok) return;
        const datos = await resp.json();
        console.log("Respuesta del Ministerio:", datos); // para comprobar la estructura real

        // Normalizar: aceptar [{id_area, datos:[...]}] o {"17": [...], "15": [...]}
        const envios = Array.isArray(datos)
            ? datos
            : Object.keys(datos).map(id => ({ id_area: id, datos: datos[id] }));

        // Bucle: contar reservas por área
        const conteo = {};
        for (const envio of envios) {
            const n = Array.isArray(envio.datos) ? envio.datos.length : 0;
            conteo[envio.id_area] = (conteo[envio.id_area] || 0) + n;
        }

        const ranking = Object.keys(conteo)
            .map(id => ({ area: AREAS[id] || ("Área " + id), total: conteo[id] }))
            .sort((a, b) => b.total - a.total);

        ranking.forEach(function (r, i) {
            tbody.innerHTML += `<tr>
                <td>${i + 1}</td>
                <td>${r.area}</td>
                <td>${r.total}</td>
            </tr>`;
        });
    } catch (e) {
        console.error("No se pudo cargar el ranking:", e);
    }
}

