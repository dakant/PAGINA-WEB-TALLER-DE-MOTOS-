-- Script DDL para MySQL basado en el diagrama entidad-relación
DROP DATABASE IF EXISTS taller_motos;

CREATE DATABASE taller_motos
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE taller_motos;

-- -----------------------------------------------------
-- Tabla: USUARIO
-- -----------------------------------------------------
CREATE TABLE USUARIO (
  id_usuario INT AUTO_INCREMENT PRIMARY KEY,
  nombre_usuario VARCHAR(40) NOT NULL,
  correo VARCHAR(50) NOT NULL UNIQUE,
  telefono VARCHAR(13),
  `contraseña` VARCHAR(20) NOT NULL, -- Ampliar a VARCHAR(255) si se almacenan hashes (ej. bcrypt)
  rol VARCHAR(13) NOT NULL
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- Tabla: MECANICO (relación 1:1 con USUARIO)
-- -----------------------------------------------------
CREATE TABLE MECANICO (
  id_mecanico INT AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT NOT NULL UNIQUE,
  especialidad VARCHAR(40),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_mecanico_usuario
    FOREIGN KEY (id_usuario) REFERENCES USUARIO(id_usuario)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- Tabla: MOTO (relación 1:N con USUARIO)
-- -----------------------------------------------------
CREATE TABLE MOTO (
  placa INT PRIMARY KEY, -- Cambiar a VARCHAR(10) si se requieren placas alfanuméricas
  id_cliente INT NOT NULL,
  marca VARCHAR(30) NOT NULL,
  modelo VARCHAR(30) NOT NULL,
  cilindraje INT,
  CONSTRAINT fk_moto_cliente
    FOREIGN KEY (id_cliente) REFERENCES USUARIO(id_usuario)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- Tabla: SERVICIO
-- -----------------------------------------------------
CREATE TABLE SERVICIO (
  id_servicio INT AUTO_INCREMENT PRIMARY KEY,
  nombre_servicio VARCHAR(35) NOT NULL,
  descripcion VARCHAR(100),
  duracion_min INT,
  precio_base DECIMAL(10, 2) NOT NULL
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- Tabla: CITA (relación 1:N con USUARIO, MOTO y MECANICO)
-- -----------------------------------------------------
CREATE TABLE CITA (
  id_cita INT AUTO_INCREMENT PRIMARY KEY,
  id_cliente INT NOT NULL,
  placa INT NOT NULL,
  id_mecanico INT NOT NULL,
  fecha_hora DATETIME NOT NULL,
  estado VARCHAR(12) NOT NULL,
  observaciones VARCHAR(200),
  motivo_rechazo VARCHAR(200),
  CONSTRAINT fk_cita_cliente
    FOREIGN KEY (id_cliente) REFERENCES USUARIO(id_usuario)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_cita_moto
    FOREIGN KEY (placa) REFERENCES MOTO(placa)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_cita_mecanico
    FOREIGN KEY (id_mecanico) REFERENCES MECANICO(id_mecanico)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------
-- Tabla: DETALLE_CITA (relación N:M entre CITA y SERVICIO)
-- -----------------------------------------------------
CREATE TABLE DETALLE_CITA (
  id_cita INT NOT NULL,
  fecha_hora DATETIME NOT NULL,
  id_servicio INT NOT NULL,
  nombre_servicio VARCHAR(35) NOT NULL,
  precio_acordado DECIMAL(10, 2) NOT NULL,
  PRIMARY KEY (id_cita, id_servicio),
  CONSTRAINT fk_detalle_cita
    FOREIGN KEY (id_cita) REFERENCES CITA(id_cita)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_detalle_servicio
    FOREIGN KEY (id_servicio) REFERENCES SERVICIO(id_servicio)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB;