require('dotenv').config();
const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');

const app = express();
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
  return res.status(500).json({ error: 'Error interno del servidor. Intenta nuevamente.' });
}


// Autenticación administrativa y sesiones
const crypto = require('crypto');
const SESSION_COOKIE = 'taller_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;
const loginAttempts = new Map();
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function scryptAsync(password, salt, keyLength, options) {
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, keyLength, options, (err, key) => err ? reject(err) : resolve(key)));
}
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return ['scrypt', 32768, 8, 1, salt.toString('base64url'), key.toString('base64url')].join('$');
}
async function verifyPassword(password, stored) {
  const [scheme, n, r, p, saltText, keyText] = String(stored || '').split('$');
  const N = Number(n), R = Number(r), P = Number(p);
  const salt = Buffer.from(saltText || '', 'base64url');
  const expected = Buffer.from(keyText || '', 'base64url');
  if (scheme !== 'scrypt' || !Number.isSafeInteger(N) || N < 16384 || N > 131072 ||
      !Number.isSafeInteger(R) || R < 1 || R > 16 || !Number.isSafeInteger(P) || P < 1 || P > 4 ||
      salt.length < 16 || expected.length !== 64) return false;
  const actual = await scryptAsync(password, salt, expected.length, { N, r: R, p: P, maxmem: 256 * 1024 * 1024 });
  return crypto.timingSafeEqual(actual, expected);
}
function cookieValue(req, name) {
  const prefix = name + '=';
  const raw = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(prefix));
  if (!raw) return null;
  try { return decodeURIComponent(raw.slice(prefix.length)); } catch { return null; }
}
function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' });
}
function publicUser(user) {
  return { id_usuario: user.id_usuario, nombre_usuario: user.nombre_usuario, correo: user.correo, rol: user.rol };
}
function failedLogin(ip) {
  const now = Date.now(), item = loginAttempts.get(ip);
  if (!item || now - item.startedAt >= LOGIN_WINDOW_MS) loginAttempts.set(ip, { startedAt: now, count: 1 });
  else item.count += 1;
}
async function findSessionUser(req) {
  const token = cookieValue(req, SESSION_COOKIE);
  if (!token) return null;
  const [rows] = await pool.query(
    "SELECT u.id_usuario, u.nombre_usuario, u.correo, u.rol FROM APP_SESSION s JOIN USUARIO u ON u.id_usuario=s.id_usuario WHERE s.token_hash=? AND s.expires_at > NOW() AND LOWER(u.rol)='admin' LIMIT 1",
    [sha256(token)]
  );
  return rows[0] || null;
}
app.get('/api/auth/session', async (req, res) => {
  try {
    const user = await findSessionUser(req);
    if (!user) clearSessionCookie(res);
    res.json({ user: user ? publicUser(user) : null });
  } catch (err) { handleDbError(res, err); }
});
app.post('/api/auth/login', async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const recent = loginAttempts.get(ip);
  if (recent && recent.count >= MAX_LOGIN_ATTEMPTS && Date.now() - recent.startedAt < LOGIN_WINDOW_MS) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
  }
  try {
    const correo = String(req.body.correo || '').trim().toLowerCase();
    const password = String(req.body.contrasena || '');
    const [rows] = await pool.query(
      "SELECT id_usuario, nombre_usuario, correo, `contraseña` AS contrasena, rol FROM USUARIO WHERE LOWER(correo)=? AND LOWER(rol)='admin' LIMIT 1",
      [correo]
    );
    const user = rows[0];
    if (!correo || !password || password.length > 128 || !user || !await verifyPassword(password, user.contrasena)) {
      failedLogin(ip);
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }
    loginAttempts.delete(ip);
    const token = crypto.randomBytes(32).toString('base64url');
    await pool.query('DELETE FROM APP_SESSION WHERE expires_at <= NOW()');
    await pool.query('INSERT INTO APP_SESSION (token_hash, id_usuario, expires_at) VALUES (?, ?, ?)',
      [sha256(token), user.id_usuario, new Date(Date.now() + SESSION_TTL_MS)]);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: SESSION_TTL_MS, path: '/'
    });
    res.json({ ok: true, user: publicUser(user) });
  } catch (err) { handleDbError(res, err); }
});
app.post('/api/auth/logout', async (req, res) => {
  try {
    const token = cookieValue(req, SESSION_COOKIE);
    if (token) await pool.query('DELETE FROM APP_SESSION WHERE token_hash=?', [sha256(token)]);
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (err) { handleDbError(res, err); }
});
async function requireAdmin(req, res, next) {
  try {
    const user = await findSessionUser(req);
    if (!user) {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Inicia sesión para continuar.' });
    }
    req.user = user;
    next();
  } catch (err) { handleDbError(res, err); }
}
app.use('/api', requireAdmin);
async function initializeSecurity() {
  await pool.query('ALTER TABLE USUARIO MODIFY `contraseña` VARCHAR(255) NOT NULL');
  await pool.query(`CREATE TABLE IF NOT EXISTS APP_SESSION (
    token_hash CHAR(64) PRIMARY KEY,
    id_usuario INT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_app_session_expiration (expires_at),
    CONSTRAINT fk_app_session_usuario FOREIGN KEY (id_usuario)
      REFERENCES USUARIO(id_usuario) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB`);
  const [users] = await pool.query('SELECT id_usuario, `contraseña` AS contrasena FROM USUARIO');
  for (const user of users) {
    if (!String(user.contrasena).startsWith('scrypt$')) {
      await pool.query('UPDATE USUARIO SET `contraseña`=? WHERE id_usuario=?',
        [await hashPassword(String(user.contrasena)), user.id_usuario]);
    }
  }
  const [admins] = await pool.query("SELECT id_usuario FROM USUARIO WHERE LOWER(rol)='admin' LIMIT 1");
  if (!admins.length && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const email = process.env.ADMIN_EMAIL.trim().toLowerCase(), password = process.env.ADMIN_PASSWORD;
    const name = (process.env.ADMIN_NAME || 'Administrador').trim();
    if (password.length < 12 || password.length > 128) throw new Error('ADMIN_PASSWORD debe tener de 12 a 128 caracteres.');
    if (!email || email.length > 50 || !name || name.length > 40) throw new Error('ADMIN_EMAIL o ADMIN_NAME excede el límite de la base de datos.');
    const [existing] = await pool.query('SELECT id_usuario FROM USUARIO WHERE LOWER(correo)=? LIMIT 1', [email]);
    if (existing.length) throw new Error('ADMIN_EMAIL ya existe con otro rol. Asigna el rol Admin en la base de datos.');
    await pool.query('INSERT INTO USUARIO (nombre_usuario, correo, telefono, `contraseña`, rol) VALUES (?, ?, NULL, ?, ?)',
      [name, email, await hashPassword(password), 'Admin']);
    console.log('Cuenta administrativa inicial creada.');
  }
}

// Carga inicial de todas las tablas
app.get('/api/data', async (_req, res) => {
  try {
    const [usuarios] = await pool.query('SELECT id_usuario, nombre_usuario, correo, telefono, rol FROM USUARIO ORDER BY id_usuario');
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
    if (!contrasena || String(contrasena).length < 12 || String(contrasena).length > 128) {
      return res.status(400).json({ error: 'La contraseña debe tener entre 12 y 128 caracteres.' });
    }
    const [r] = await pool.query(
      'INSERT INTO USUARIO (nombre_usuario, correo, telefono, `contraseña`, rol) VALUES (?, ?, ?, ?, ?)',
      [nombre_usuario, correo, telefono || null, await hashPassword(String(contrasena)), rol]
    );
    res.status(201).json({ id_usuario: r.insertId });
  } catch (err) { handleDbError(res, err); }
});

app.put('/api/usuarios/:id', async (req, res) => {
  try {
    const { nombre_usuario, correo, telefono, contrasena, rol } = req.body;
    if (contrasena) {
      if (String(contrasena).length < 12 || String(contrasena).length > 128) {
        return res.status(400).json({ error: 'La contraseña debe tener entre 12 y 128 caracteres.' });
      }
      await pool.query(
        'UPDATE USUARIO SET nombre_usuario=?, correo=?, telefono=?, `contraseña`=?, rol=? WHERE id_usuario=?',
        [nombre_usuario, correo, telefono || null, await hashPassword(String(contrasena)), rol, req.params.id]
      );
    } else {
      await pool.query(
        'UPDATE USUARIO SET nombre_usuario=?, correo=?, telefono=?, rol=? WHERE id_usuario=?',
        [nombre_usuario, correo, telefono || null, rol, req.params.id]
      );
    }
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
initializeSecurity()
  .then(() => app.listen(PORT, () => console.log(`Servidor Taller Motos corriendo en http://localhost:${PORT}`)))
  .catch(err => {
    console.error('No se pudo inicializar la seguridad:', err.message);
    process.exit(1);
  });
