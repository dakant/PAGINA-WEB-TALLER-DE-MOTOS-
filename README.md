# Taller Motos — Node.js + Express + MySQL

## Requisitos

- Node.js 18 o superior
- MySQL Server

## Instalación limpia

1. Copia `.env.example` a `.env`.
2. Configura `DB_USER` y `DB_PASSWORD` para MySQL.
3. Completa `ADMIN_NAME`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` con tu propia cuenta. La contraseña debe tener entre 12 y 128 caracteres.
4. Ejecuta `taller_motos.sql` una sola vez en MySQL Workbench.
5. Instala y ejecuta:

   ```bash
   npm install
   npm start
   ```

6. Abre `http://localhost:3000` e inicia sesión con la cuenta administrativa del archivo `.env`.

Al iniciar, el servidor amplía la columna de contraseña, crea la tabla de sesiones y convierte las contraseñas antiguas a hashes scrypt. Conserva `.env` en privado.

## Base de datos existente

No vuelvas a ejecutar `taller_motos.sql` sobre una instalación existente. Ese archivo es para una instalación nueva. Ejecuta `migrations/001_seguridad.sql` en la base `taller_motos`, completa las variables `ADMIN_*` si todavía no existe un usuario Admin y reinicia el servidor. El servidor migra automáticamente las contraseñas antiguas a hashes al iniciar.

## Ejecución

```bash
npm start
```

El panel usa una cookie de sesión `HttpOnly` y restringe las rutas API a usuarios con rol Admin.
