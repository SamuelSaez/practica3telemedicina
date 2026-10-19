var express = require("express");
var app = express();
var conexion = require('./conexion_mysql.js');
var ws = require('./servidor_ws.js');
var jwt = require("jsonwebtoken");
var SECRETO = process.env.JWT_SECRET || "secreto_de_desarrollo";

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

function getInfoRecurso(idRecurso, callback) {
    var sql = "SELECT r.numero_serie, m.nombre AS modelo_nombre, c.nombre AS categoria_nombre " +
        "FROM recursos r " +
        "JOIN modelos m ON r.modelo = m.id " +
        "JOIN categorias c ON m.categoria = c.id " +
        "WHERE r.id = ?";
    conexion.query(sql, [idRecurso], function (err, rows) {
        if (err || rows.length === 0) return callback(null);
        callback(rows[0]);
    });
}

function getNombreGestor(idGestor, callback) {
    conexion.query("SELECT nombre, apellidos FROM gestores WHERE id = ?", [idGestor], function (err, rows) {
        if (err || rows.length === 0) return callback("Gestor");
        callback(rows[0].nombre + " " + rows[0].apellidos);
    });
}

function getNombreSanitario(idSanitario, callback) {
    conexion.query("SELECT nombre, apellidos FROM sanitarios WHERE id = ?", [idSanitario], function (err, rows) {
        if (err || rows.length === 0) return callback("Sanitario");
        callback(rows[0].nombre + " " + rows[0].apellidos);
    });
}

app.get("/api/ubicaciones", function (req, res) {
    conexion.query("SELECT * FROM ubicaciones", function (err, ubicaciones) {
        if (err) {
            console.log("Error al consultar ubicaciones", err);
            return res.status(500).json("Error al consultar ubicaciones");
        }
        res.status(200).json(ubicaciones);
    });
});

app.get("/api/categorias", function (req, res) {
    conexion.query("SELECT * FROM categorias", function (err, categorias) {
        if (err) {
            console.log("Error al consultar categorias", err);
            return res.status(500).json("Error al consultar categorias");
        }
        res.status(200).json(categorias);
    });
});

app.get("/api/modelos", function (req, res) {
    conexion.query("SELECT * FROM modelos", function (err, modelos) {
        if (err) {
            console.log("Error al consultar modelos", err);
            return res.status(500).json("Error al consultar modelos");
        }
        res.status(200).json(modelos);
    });
});

app.post("/api/gestores/login", function (req, res) {
    var sql = "SELECT id FROM gestores WHERE usuario = ? AND password = ?";
    conexion.query(sql, [req.body.login, req.body.password], function (err, gestores) {
        if (err) {
            console.log("Error al comprobar credenciales", err);
            return res.status(500).json("Error al comprobar credenciales");
        }
        if (gestores.length === 1) {
            var token = jwt.sign({ id: gestores[0].id }, SECRETO, { expiresIn: "2h" });
            res.status(200).json({ id: gestores[0].id, token: token });
}
        else res.status(403).json("Credenciales incorrectas");
    });
});

app.post("/api/gestores", function (req, res) {
    conexion.query("SELECT id FROM gestores WHERE usuario = ?", [req.body.login], function (err, existentes) {
        if (err) {
            console.log("Error al comprobar el usuario", err);
            return res.status(500).json("Error al comprobar el usuario");
        }
        if (existentes.length > 0) return res.status(400).json("El usuario ya existe");

        var sql = "INSERT INTO gestores (nombre, apellidos, usuario, password) VALUES (?, ?, ?, ?)";
        var valores = [req.body.nombre, req.body.apellidos, req.body.login, req.body.password];
        conexion.query(sql, valores, function (err, resultado) {
            if (err) {
            console.log("Error al crear el gestor", err);
            return res.status(500).json("Error al crear el gestor");
        }
            res.status(201).json("Gestor creado");
        });
    });
});

app.get("/api/gestores/:id", function (req, res) {
    var sql = "SELECT id, nombre, apellidos, usuario FROM gestores WHERE id = ?";
    conexion.query(sql, [req.params.id], function (err, gestores) {
        if (err) {
            console.log("Error al consultar el gestor", err);
            return res.status(500).json("Error al consultar el gestor");
        }
        if (gestores.length === 1) res.status(200).json(gestores[0]);
        else res.status(404).json("Gestor no encontrado");
    });
});

app.put("/api/gestores/:id", function (req, res) {
    conexion.query("SELECT * FROM gestores WHERE id = ?", [req.params.id], function (err, gestores) {
        if (err) {
            console.log("Error al consultar el gestor", err);
            return res.status(500).json("Error al consultar el gestor");
        }
        if (gestores.length === 0) return res.status(404).json("No encontrado");
        var g = gestores[0];

        function actualizar() {
            var nombre = req.body.nombre || g.nombre;
            var apellidos = req.body.apellidos || g.apellidos;
            var usuario = req.body.login || g.usuario;
            var password = req.body.password || g.password;
            var sql = "UPDATE gestores SET nombre = ?, apellidos = ?, usuario = ?, password = ? WHERE id = ?";
            conexion.query(sql, [nombre, apellidos, usuario, password, req.params.id], function (err) {
                if (err) {
            console.log("Error al actualizar el gestor", err);
            return res.status(500).json("Error al actualizar el gestor");
        }
                res.status(200).json("Gestor actualizado");
            });
        }

        if (req.body.login && req.body.login !== g.usuario) {
            conexion.query("SELECT id FROM gestores WHERE usuario = ?", [req.body.login], function (err, existentes) {
                if (err) {
            console.log("Error al comprobar el usuario", err);
            return res.status(500).json("Error al comprobar el usuario");
        }
                if (existentes.length > 0) return res.status(400).json("Login en uso");
                actualizar();
            });
        } else {
            actualizar();
        }
    });
});



app.get("/api/sanitarios/:id", function (req, res) {
    var sql = "SELECT id, nombre, apellidos FROM sanitarios WHERE id = ?";
    conexion.query(sql, [req.params.id], function (err, sanitarios) {
        if (err) {
            console.log("Error al consultar el sanitario", err);
            return res.status(500).json("Error al consultar el sanitario");
        }
        if (sanitarios.length === 1) res.status(200).json(sanitarios[0]);
        else res.status(404).json("Sanitario no encontrado");
    });
});

app.get("/api/recursos", function (req, res) {
    var sql = "SELECT r.* FROM recursos r JOIN modelos m ON r.modelo = m.id WHERE 1 = 1";
    var valores = [];

    if (req.query.categoria && req.query.categoria !== "Todos") {
        sql += " AND m.categoria = ?";
        valores.push(req.query.categoria);
    }
    if (req.query.modelo && req.query.modelo !== "Todos") {
        sql += " AND r.modelo = ?";
        valores.push(req.query.modelo);
    }
    if (req.query.ubicacion && req.query.ubicacion !== "Todos") {
        sql += " AND r.ubicacion = ?";
        valores.push(req.query.ubicacion);
    }
    if (req.query.estado && req.query.estado !== "Todos") {
        sql += " AND r.estado = ?";
        valores.push(req.query.estado);
    }

    conexion.query(sql, valores, function (err, recursos) {
        if (err) {
            console.log("Error al consultar recursos", err);
            return res.status(500).json("Error al consultar recursos");
        }
        res.status(200).json(recursos);
    });
});

app.get("/api/recursos/:id", function (req, res) {
    conexion.query("SELECT * FROM recursos WHERE id = ?", [req.params.id], function (err, recursos) {
        if (err) {
            console.log("Error al consultar el recurso", err);
            return res.status(500).json("Error al consultar el recurso");
        }
        if (recursos.length === 1) res.status(200).json(recursos[0]);
        else res.status(404).json("Recurso no encontrado");
    });
});

app.post("/api/recursos", function (req, res) {
    var sql = "INSERT INTO recursos (modelo, ubicacion, numero_serie, estado) VALUES (?, ?, ?, ?)";
    var valores = [
        parseInt(req.body.modelo),
        parseInt(req.body.ubicacion),
        req.body.numero_serie,
        parseInt(req.body.estado)
    ];
    conexion.query(sql, valores, function (err, resultado) {
        if (err) {
            console.log("Error al crear el recurso", err);
            return res.status(500).json("Error al crear el recurso");
        }
        var idNuevoRecurso = resultado.insertId;
        res.status(201).json("Recurso creado");

        var idGestor = req.gestorId;   // antes: req.headers['x-gestor-id']
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
});

app.put("/api/recursos/:id", function (req, res) {
    conexion.query("SELECT * FROM recursos WHERE id = ?", [req.params.id], function (err, recursos) {
        if (err) {
            console.log("Error al consultar el recurso", err);
            return res.status(500).json("Error al consultar el recurso");
        }
        if (recursos.length === 0) return res.status(404).json("Error");
        var r = recursos[0];

        var modelo = req.body.modelo ? parseInt(req.body.modelo) : r.modelo;
        var ubicacion = req.body.ubicacion ? parseInt(req.body.ubicacion) : r.ubicacion;
        var numero_serie = req.body.numero_serie ? req.body.numero_serie : r.numero_serie;
        var estado = req.body.estado !== undefined ? parseInt(req.body.estado) : r.estado;

        var sql = "UPDATE recursos SET modelo = ?, ubicacion = ?, numero_serie = ?, estado = ? WHERE id = ?";
        conexion.query(sql, [modelo, ubicacion, numero_serie, estado, req.params.id], function (err) {
            if (err) {
            console.log("Error al actualizar el recurso", err);
            return res.status(500).json("Error al actualizar el recurso");
        }
            res.status(200).json("Actualizado");
        });
    });
});

app.delete("/api/recursos/:id", function (req, res) {
    conexion.query("DELETE FROM recursos WHERE id = ?", [req.params.id], function (err, resultado) {
        if (err) {
            console.log("Error al borrar el recurso", err);
            return res.status(500).json("Error al borrar el recurso");
        }
        if (resultado.affectedRows > 0) res.status(200).json("Borrado");
        else res.status(404).json("No encontrado");
    });
});

app.get("/api/recursos/:id/reservas", function (req, res) {
    conexion.query("SELECT * FROM reservas WHERE recurso = ?", [req.params.id], function (err, reservas) {
        if (err) {
            console.log("Error al consultar reservas", err);
            return res.status(500).json("Error al consultar reservas");
        }
        res.status(200).json(reservas);
    });
});

app.get("/api/recursos/:id/resenyas", function (req, res) {
    conexion.query("SELECT * FROM resenyas WHERE recurso = ?", [req.params.id], function (err, resenyas) {
        if (err) {
            console.log("Error al consultar reseñas", err);
            return res.status(500).json("Error al consultar reseñas");
        }
        res.status(200).json(resenyas);
    });
});


app.post("/api/recursos/:id/reservas", function (req, res) {
    var sql = "INSERT INTO reservas (recurso, sanitario, horas_estimadas, fecha_peticion, fecha_inicio, fecha_fin) " +
        "VALUES (?, ?, ?, NOW(), NULL, NULL)";
    var valores = [parseInt(req.params.id), parseInt(req.body.sanitario), parseInt(req.body.horas_estimadas)];
    conexion.query(sql, valores, function (err, resultado) {
        if (err) {
            console.log("Error al crear la reserva", err);
            return res.status(500).json("Error al crear la reserva");
        }
        res.status(201).json("Reserva creada");
    });
});

app.post("/api/recursos/:id/resenyas", function (req, res) {
    var sql = "INSERT INTO resenyas (recurso, sanitario, fecha, valor, descripcion) VALUES (?, ?, NOW(), ?, ?)";
    var valores = [parseInt(req.params.id), parseInt(req.body.sanitario), parseInt(req.body.valor), req.body.descripcion];
    conexion.query(sql, valores, function (err, resultado) {
        if (err) {
            console.log("Error al crear la reseña", err);
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
});



app.listen(3000, function () {
    console.log("Servidor REST arrancado en el puerto 3000");
});
