var express = require("express");
var app = express();
//var ws = require('./servidor_ws.js');
var jwt = require("jsonwebtoken");
var SECRETO = "secreto_de_desarrollo"; // en la Parte 2 esto estaba bien como variable de entorno; lo dejo fijo porque ya no usamos .env

// ============================================================
// Conexión a Supabase (cliente oficial, en vez del driver pg)
// ============================================================
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vcntxskuraicnxxnzekm.supabase.co'; // <-- pega aquí tu Project URL
const supabaseKey = 'sb_publishable_nrGokIk8XJoDwxzrrLLsog_2UlSYBke';          // <-- pega aquí tu anon public key
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.json());

app.use(express.static("cliente_rest"));
app.use('/sanitario', express.static('cliente_rpc'));

function verificarToken(req, res, next) {
    var ruta = req.baseUrl + req.path;

    if (req.method === "POST" && (ruta === "/api/gestores/login" || ruta === "/api/gestores")) {
        return next();
    }

    var cabecera = req.headers["authorization"];
    if (!cabecera || !cabecera.startsWith("Bearer ")) {
        return res.status(401).json("Token no proporcionado");
    }

    jwt.verify(cabecera.slice(7), SECRETO, function (err, payload) {
        if (err) return res.status(401).json("Token inválido o caducado");
        req.gestorId = payload.id;
        next();
    });
}

app.use("/api", verificarToken);

// ------------------------------------------------------------
// Funciones auxiliares (equivalentes a los JOIN que tenías en SQL)
// ------------------------------------------------------------

async function getInfoRecurso(idRecurso, callback) {
    const { data, error } = await supabase
        .from('recursos')
        .select('numero_serie, modelos(nombre, categorias(nombre))')
        .eq('id', idRecurso)
        .single();

    if (error || !data) return callback(null);

    callback({
        numero_serie: data.numero_serie,
        modelo_nombre: data.modelos.nombre,
        categoria_nombre: data.modelos.categorias.nombre
    });
}

async function getNombreGestor(idGestor, callback) {
    const { data, error } = await supabase
        .from('gestores')
        .select('nombre, apellidos')
        .eq('id', idGestor)
        .single();

    if (error || !data) return callback("Gestor");
    callback(data.nombre + " " + data.apellidos);
}

async function getNombreSanitario(idSanitario, callback) {
    const { data, error } = await supabase
        .from('sanitarios')
        .select('nombre, apellidos')
        .eq('id', idSanitario)
        .single();

    if (error || !data) return callback("Sanitario");
    callback(data.nombre + " " + data.apellidos);
}

// ------------------------------------------------------------
// Catálogos
// ------------------------------------------------------------

app.get("/api/ubicaciones", async (req, res) => {
    const { data: ubicaciones, error } = await supabase.from("ubicaciones").select("*");
    if (error) {
        console.log("Error al consultar ubicaciones", error);
        return res.status(500).json("Error al consultar ubicaciones");
    }
    res.status(200).json(ubicaciones);
});

app.get("/api/categorias", async (req, res) => {
    const { data: categorias, error } = await supabase.from("categorias").select("*");
    if (error) {
        console.log("Error al consultar categorias", error);
        return res.status(500).json("Error al consultar categorias");
    }
    res.status(200).json(categorias);
});

app.get("/api/modelos", async (req, res) => {
    const { data: modelos, error } = await supabase.from("modelos").select("*");
    if (error) {
        console.log("Error al consultar modelos", error);
        return res.status(500).json("Error al consultar modelos");
    }
    res.status(200).json(modelos);
});

// ------------------------------------------------------------
// Gestores
// ------------------------------------------------------------

app.post("/api/gestores/login", async (req, res) => {
    const { data: gestores, error } = await supabase
        .from("gestores")
        .select("id")
        .eq("usuario", req.body.login)
        .eq("password", req.body.password);

    if (error) {
        console.log("Error al comprobar credenciales", error);
        return res.status(500).json("Error al comprobar credenciales");
    }

    if (gestores.length === 1) {
        var token = jwt.sign({ id: gestores[0].id }, SECRETO, { expiresIn: "2h" });
        res.status(200).json({ id: gestores[0].id, token: token });
    } else {
        res.status(403).json("Credenciales incorrectas");
    }
});

app.post("/api/gestores", async (req, res) => {
    const { data: existentes, error } = await supabase
        .from("gestores")
        .select("id")
        .eq("usuario", req.body.login);

    if (error) {
        console.log("Error al comprobar el usuario", error);
        return res.status(500).json("Error al comprobar el usuario");
    }
    if (existentes.length > 0) return res.status(400).json("El usuario ya existe");

    const { error: errorInsert } = await supabase.from("gestores").insert({
        nombre: req.body.nombre,
        apellidos: req.body.apellidos,
        usuario: req.body.login,
        password: req.body.password
    });

    if (errorInsert) {
        console.log("Error al crear el gestor", errorInsert);
        return res.status(500).json("Error al crear el gestor");
    }
    res.status(201).json("Gestor creado");
});

app.get("/api/gestores/:id", async (req, res) => {
    const { data: gestores, error } = await supabase
        .from("gestores")
        .select("id, nombre, apellidos, usuario")
        .eq("id", req.params.id);

    if (error) {
        console.log("Error al consultar el gestor", error);
        return res.status(500).json("Error al consultar el gestor");
    }
    if (gestores.length === 1) res.status(200).json(gestores[0]);
    else res.status(404).json("Gestor no encontrado");
});

app.put("/api/gestores/:id", async (req, res) => {
    const { data: gestores, error } = await supabase
        .from("gestores")
        .select("*")
        .eq("id", req.params.id);

    if (error) {
        console.log("Error al consultar el gestor", error);
        return res.status(500).json("Error al consultar el gestor");
    }
    if (gestores.length === 0) return res.status(404).json("No encontrado");
    var g = gestores[0];

    async function actualizar() {
        var nombre = req.body.nombre || g.nombre;
        var apellidos = req.body.apellidos || g.apellidos;
        var usuario = req.body.login || g.usuario;
        var password = req.body.password || g.password;

        const { error: errorUpdate } = await supabase
            .from("gestores")
            .update({ nombre: nombre, apellidos: apellidos, usuario: usuario, password: password })
            .eq("id", req.params.id);

        if (errorUpdate) {
            console.log("Error al actualizar el gestor", errorUpdate);
            return res.status(500).json("Error al actualizar el gestor");
        }
        res.status(200).json("Gestor actualizado");
    }

    if (req.body.login && req.body.login !== g.usuario) {
        const { data: existentes, error: errorExistentes } = await supabase
            .from("gestores")
            .select("id")
            .eq("usuario", req.body.login);

        if (errorExistentes) {
            console.log("Error al comprobar el usuario", errorExistentes);
            return res.status(500).json("Error al comprobar el usuario");
        }
        if (existentes.length > 0) return res.status(400).json("Login en uso");
        actualizar();
    } else {
        actualizar();
    }
});

// ------------------------------------------------------------
// Sanitarios
// ------------------------------------------------------------

app.get("/api/sanitarios/:id", async (req, res) => {
    const { data: sanitarios, error } = await supabase
        .from("sanitarios")
        .select("id, nombre, apellidos")
        .eq("id", req.params.id);

    if (error) {
        console.log("Error al consultar el sanitario", error);
        return res.status(500).json("Error al consultar el sanitario");
    }
    if (sanitarios.length === 1) res.status(200).json(sanitarios[0]);
    else res.status(404).json("Sanitario no encontrado");
});

// ------------------------------------------------------------
// Recursos
// ------------------------------------------------------------

app.get("/api/recursos", async (req, res) => {
    var filtroCategoria = req.query.categoria && req.query.categoria !== "Todos";

    // Si hay que filtrar por categoría necesitamos "entrar" en modelos,
    // porque la categoría vive en esa tabla, no en recursos.
    var query = filtroCategoria
        ? supabase.from("recursos").select("id, modelo, ubicacion, numero_serie, estado, modelos!inner(categoria)")
        : supabase.from("recursos").select("id, modelo, ubicacion, numero_serie, estado");

    if (filtroCategoria) query = query.eq("modelos.categoria", req.query.categoria);
    if (req.query.modelo && req.query.modelo !== "Todos") query = query.eq("modelo", req.query.modelo);
    if (req.query.ubicacion && req.query.ubicacion !== "Todos") query = query.eq("ubicacion", req.query.ubicacion);
    if (req.query.estado && req.query.estado !== "Todos") query = query.eq("estado", req.query.estado);

    const { data: recursos, error } = await query;
    if (error) {
        console.log("Error al consultar recursos", error);
        return res.status(500).json("Error al consultar recursos");
    }

    // quitamos el campo "modelos" que solo usamos para poder filtrar
    var limpio = recursos.map(function (r) {
        var copia = Object.assign({}, r);
        delete copia.modelos;
        return copia;
    });
    res.status(200).json(limpio);
});

app.get("/api/recursos/:id", async (req, res) => {
    const { data: recursos, error } = await supabase
        .from("recursos")
        .select("*")
        .eq("id", req.params.id);

    if (error) {
        console.log("Error al consultar el recurso", error);
        return res.status(500).json("Error al consultar el recurso");
    }
    if (recursos.length === 1) res.status(200).json(recursos[0]);
    else res.status(404).json("Recurso no encontrado");
});

app.post("/api/recursos", async (req, res) => {
    const { data: insertado, error } = await supabase
        .from("recursos")
        .insert({
            modelo: parseInt(req.body.modelo),
            ubicacion: parseInt(req.body.ubicacion),
            numero_serie: req.body.numero_serie,
            estado: parseInt(req.body.estado)
        })
        .select("id")
        .single();

    if (error) {
        console.log("Error al crear el recurso", error);
        return res.status(500).json("Error al crear el recurso");
    }

    var idNuevoRecurso = insertado.id;
    res.status(201).json("Recurso creado");

    var idGestor = req.gestorId;
    getInfoRecurso(idNuevoRecurso, function (info) {
        if (!info) return;
        function avisar(origen) {
            var texto = "SE HA CREADO UN NUEVO RECURSO " + info.categoria_nombre.toUpperCase() +
                " MODELO " + info.modelo_nombre.toUpperCase() +
                " CON CÓDIGO " + info.numero_serie;
            ws.avisarNuevoRecurso(texto, origen);
        }
        if (idGestor) getNombreGestor(idGestor, avisar);
        else avisar("Gestor");
    });
});

app.put("/api/recursos/:id", async (req, res) => {
    const { data: recursos, error } = await supabase
        .from("recursos")
        .select("*")
        .eq("id", req.params.id);

    if (error) {
        console.log("Error al consultar el recurso", error);
        return res.status(500).json("Error al consultar el recurso");
    }
    if (recursos.length === 0) return res.status(404).json("Error");
    var r = recursos[0];

    var modelo = req.body.modelo ? parseInt(req.body.modelo) : r.modelo;
    var ubicacion = req.body.ubicacion ? parseInt(req.body.ubicacion) : r.ubicacion;
    var numero_serie = req.body.numero_serie ? req.body.numero_serie : r.numero_serie;
    var estado = req.body.estado !== undefined ? parseInt(req.body.estado) : r.estado;

    const { error: errorUpdate } = await supabase
        .from("recursos")
        .update({ modelo: modelo, ubicacion: ubicacion, numero_serie: numero_serie, estado: estado })
        .eq("id", req.params.id);

    if (errorUpdate) {
        console.log("Error al actualizar el recurso", errorUpdate);
        return res.status(500).json("Error al actualizar el recurso");
    }
    res.status(200).json("Actualizado");
});

app.delete("/api/recursos/:id", async (req, res) => {
    const { data: borrados, error } = await supabase
        .from("recursos")
        .delete()
        .eq("id", req.params.id)
        .select("id");

    if (error) {
        console.log("Error al borrar el recurso", error);
        return res.status(500).json("Error al borrar el recurso");
    }
    if (borrados.length > 0) res.status(200).json("Borrado");
    else res.status(404).json("No encontrado");
});

app.get("/api/recursos/:id/reservas", async (req, res) => {
    const { data: reservas, error } = await supabase
        .from("reservas")
        .select("*")
        .eq("recurso", req.params.id);

    if (error) {
        console.log("Error al consultar reservas", error);
        return res.status(500).json("Error al consultar reservas");
    }
    res.status(200).json(reservas);
});

app.get("/api/recursos/:id/resenyas", async (req, res) => {
    const { data: resenyas, error } = await supabase
        .from("resenyas")
        .select("*")
        .eq("recurso", req.params.id);

    if (error) {
        console.log("Error al consultar reseñas", error);
        return res.status(500).json("Error al consultar reseñas");
    }
    res.status(200).json(resenyas);
});

app.post("/api/recursos/:id/reservas", async (req, res) => {
    const { error } = await supabase.from("reservas").insert({
        recurso: parseInt(req.params.id),
        sanitario: parseInt(req.body.sanitario),
        horas_estimadas: parseInt(req.body.horas_estimadas),
        fecha_peticion: new Date().toISOString(),
        fecha_inicio: null,
        fecha_fin: null
    });

    if (error) {
        console.log("Error al crear la reserva", error);
        return res.status(500).json("Error al crear la reserva");
    }
    res.status(201).json("Reserva creada");
});

app.post("/api/recursos/:id/resenyas", async (req, res) => {
    const { error } = await supabase.from("resenyas").insert({
        recurso: parseInt(req.params.id),
        sanitario: parseInt(req.body.sanitario),
        fecha: new Date().toISOString(),
        valor: parseInt(req.body.valor),
        descripcion: req.body.descripcion
    });

    if (error) {
        console.log("Error al crear la reseña", error);
        return res.status(500).json("Error al crear la reseña");
    }
    res.status(201).json("Reseña creada");

    var idSanitario = req.body.sanitario;
    getNombreSanitario(idSanitario, function (origen) {
        getInfoRecurso(req.params.id, function (info) {
            if (!info) return;
            var texto = "SE HA CREADO UNA RESEÑA PARA EL " + info.categoria_nombre.toUpperCase() +
                " MODELO " + info.modelo_nombre.toUpperCase() +
                " CON CÓDIGO " + info.numero_serie +
                " Y PUNTUACIÓN " + req.body.valor;
            ws.avisarResenya(texto, origen);
        });
    });
});

app.listen(3000, function () {
    console.log("Servidor REST arrancado en el puerto 3000");
});
