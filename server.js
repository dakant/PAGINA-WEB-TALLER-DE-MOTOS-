require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'taller_motos',
  waitForConnections: true,
  connectionLimit: 10
});

function handleDbError(res, err) {
  console.error(err);
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Ya existe un registro con ese identificador o correo.' });
  }
  if (err.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(409).json({ error: 'No se puede eliminar porque tiene registros asociados en otra tabla.' });
  }
  return res.status(500).json({ error: err.message || 'Error en la base de datos' });
}

// Carga inicial de todas las tablas
app.get('/api/data', async (_req, res) => {
  try {
    const [usuarios] = await pool.query('SELECT id_usuario, nombre_usuario, correo, telefono, `contraseña` AS contrasena, rol FROM USUARIO ORDER BY id_usuario');
    const [mecanicos] = await pool.query('SELECT id_mecanico, id_usuario, especialidad, activo FROM MECANICO ORDER BY id_mecanico');
    const [motos] = await pool.query('SELECT placa, id_cliente, marca, modelo, cilindraje FROM MOTO ORDER BY placa');
    const [servicios] = await pool.query('SELECT id_servicio, nombre_servicio, descripcion, duracion_min, precio_base FROM SERVICIO ORDER BY id_servicio');
    const [citas] = await pool.query("SELECT id_cita, id_cliente, placa, id_mecanico, DATE_FORMAT(fecha_hora, '%Y-%m-%dT%H:%i') AS fecha_hora, estado, observaciones, motivo_rechazo FROM CITA ORDER BY fecha_hora DESC");
    const [detalles_cita] = await pool.query("SELECT id_cita, DATE_FORMAT(fecha_hora, '%Y-%m-%dT%H:%i') AS fecha_hora, id_servicio, nombre_servicio, precio_acordado FROM DETALLE_CITA");
    res.json({ usuarios, mecanicos, motos, servicios, citas, detalles_cita });
  } catch (err) {
    handleDbError(res, err);
  }
});

// USUARIO
app.post('/api/usuarios', async (req, res) => {
  try {
    const { nombre_usuario, correo, telefono, contrasena, rol } = req.body;
    const [r] = await pool.query(
      'INSERT INTO USUARIO (nombre_usuario, correo, telefono, `contraseña`, rol) VALUES (?, ?, ?, ?, ?)',
      [nombre_usuario, correo, telefono || null, contrasena, rol]
    );
    res.status(201).json({ id_usuario: r.insertId });
  } catch (err) { handleDbError(res, err); }
});

app.put('/api/usuarios/:id', async (req, res) => {
  try {
    const { nombre_usuario, correo, telefono, contrasena, rol } = req.body;
    await pool.query(
      'UPDATE USUARIO SET nombre_usuario=?, correo=?, telefono=?, `contraseña`=?, rol=? WHERE id_usuario=?',
      [nombre_usuario, correo, telefono || null, contrasena, rol, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { handleDbError(res, err); }
});

app.delete('/api/usuarios/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM USUARIO WHERE id_usuario=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { handleDbError(res, err); }
});

// MECANICO
app.post('/api/mecanicos', async (req, res) => {
  try {
    const { id_usuario, especialidad, activo } = req.body;
    const [r] = await pool.query(
      'INSERT INTO MECANICO (id_usuario, especialidad, activo) VALUES (?, ?, ?)',
      [id_usuario, especialidad || null, activo ? 1 : 0]
    );
    res.status(201).json({ id_mecanico: r.insertId });
  } catch (err) { handleDbError(res, err); }
});

app.put('/api/mecanicos/:id', async (req, res) => {
  try {
    const { id_usuario, especialidad, activo } = req.body;
    await pool.query(
      'UPDATE MECANICO SET id_usuario=?, especialidad=?, activo=? WHERE id_mecanico=?',
      [id_usuario, especialidad || null, activo ? 1 : 0, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { handleDbError(res, err); }
});

app.delete('/api/mecanicos/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM MECANICO WHERE id_mecanico=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { handleDbError(res, err); }
});

// MOTO
app.post('/api/motos', async (req, res) => {
  try {
    const { placa, id_cliente, marca, modelo, cilindraje } = req.body;
    await pool.query(
      'INSERT INTO MOTO (placa, id_cliente, marca, modelo, cilindraje) VALUES (?, ?, ?, ?, ?)',
      [placa, id_cliente, marca, modelo, cilindraje || null]
    );
    res.status(201).json({ ok: true });
  } catch (err) { handleDbError(res, err); }
});

app.put('/api/motos/:placa', async (req, res) => {
  try {
    const { id_cliente, marca, modelo, cilindraje } = req.body;
    await pool.query(
      'UPDATE MOTO SET id_cliente=?, marca=?, modelo=?, cilindraje=? WHERE placa=?',
      [id_cliente, marca, modelo, cilindraje || null, req.params.placa]
    );
    res.json({ ok: true });
  } catch (err) { handleDbError(res, err); }
});

app.delete('/api/motos/:placa', async (req, res) => {
  try {
    await pool.query('DELETE FROM MOTO WHERE placa=?', [req.params.placa]);
    res.json({ ok: true });
  } catch (err) { handleDbError(res, err); }
});

// SERVICIO
app.post('/api/servicios', async (req, res) => {
  try {
    const { nombre_servicio, descripcion, duracion_min, precio_base } = req.body;
    const [r] = await pool.query(
      'INSERT INTO SERVICIO (nombre_servicio, descripcion, duracion_min, precio_base) VALUES (?, ?, ?, ?)',
      [nombre_servicio, descripcion || null, duracion_min || null, precio_base]
    );
    res.status(201).json({ id_servicio: r.insertId });
  } catch (err) { handleDbError(res, err); }
});

app.put('/api/servicios/:id', async (req, res) => {
  try {
    const { nombre_servicio, descripcion, duracion_min, precio_base } = req.body;
    await pool.query(
      'UPDATE SERVICIO SET nombre_servicio=?, descripcion=?, duracion_min=?, precio_base=? WHERE id_servicio=?',
      [nombre_servicio, descripcion || null, duracion_min || null, precio_base, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { handleDbError(res, err); }
});

app.delete('/api/servicios/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM SERVICIO WHERE id_servicio=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { handleDbError(res, err); }
});

// CITA
app.post('/api/citas', async (req, res) => {
  try {
    const { id_cliente, placa, id_mecanico, fecha_hora, estado, observaciones, motivo_rechazo } = req.body;
    const fh = fecha_hora ? fecha_hora.replace('T', ' ') + ':00' : null;
    const [r] = await pool.query(
      'INSERT INTO CITA (id_cliente, placa, id_mecanico, fecha_hora, estado, observaciones, motivo_rechazo) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id_cliente, placa, id_mecanico, fh, estado, observaciones || null, motivo_rechazo || null]
    );
    res.status(201).json({ id_cita: r.insertId });
  } catch (err) { handleDbError(res, err); }
});

app.put('/api/citas/:id', async (req, res) => {
  try {
    const { id_cliente, placa, id_mecanico, fecha_hora, estado, observaciones, motivo_rechazo } = req.body;
    const fh = fecha_hora ? fecha_hora.replace('T', ' ') + ':00' : null;
    await pool.query(
      'UPDATE CITA SET id_cliente=?, placa=?, id_mecanico=?, fecha_hora=?, estado=?, observaciones=?, motivo_rechazo=? WHERE id_cita=?',
      [id_cliente, placa, id_mecanico, fh, estado, observaciones || null, motivo_rechazo || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { handleDbError(res, err); }
});

app.delete('/api/citas/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM CITA WHERE id_cita=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { handleDbError(res, err); }
});

// DETALLE_CITA
app.post('/api/detalles', async (req, res) => {
  try {
    const { id_cita, fecha_hora, id_servicio, nombre_servicio, precio_acordado } = req.body;
    const fh = fecha_hora ? fecha_hora.replace('T', ' ') + ':00' : null;
    await pool.query(
      'INSERT INTO DETALLE_CITA (id_cita, fecha_hora, id_servicio, nombre_servicio, precio_acordado) VALUES (?, ?, ?, ?, ?)',
      [id_cita, fh, id_servicio, nombre_servicio, precio_acordado]
    );
    res.status(201).json({ ok: true });
  } catch (err) { handleDbError(res, err); }
});

app.delete('/api/detalles/:id_cita/:id_servicio', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM DETALLE_CITA WHERE id_cita=? AND id_servicio=?',
      [req.params.id_cita, req.params.id_servicio]
    );
    res.json({ ok: true });
  } catch (err) { handleDbError(res, err); }
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`Servidor Taller Motos corriendo en http://localhost:${PORT}`);
});
