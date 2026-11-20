USE taller_motos;

ALTER TABLE USUARIO
  MODIFY `contraseña` VARCHAR(255) NOT NULL;

CREATE TABLE IF NOT EXISTS APP_SESSION (
  token_hash CHAR(64) PRIMARY KEY,
  id_usuario INT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_app_session_expiration (expires_at),
  CONSTRAINT fk_app_session_usuario
    FOREIGN KEY (id_usuario) REFERENCES USUARIO(id_usuario)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;
