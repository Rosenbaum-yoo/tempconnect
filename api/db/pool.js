/**
 * DB client: single pool instance. Must be initialized after config.
 */

import { Pool } from "pg";
import { config, logger } from "../config/index.js";

const sslRequired = (config.PGSSLMODE || "").toLowerCase() === "require";
const sslConfig = sslRequired ? { ssl: { rejectUnauthorized: false } } : {};

const poolConfig = config.DATABASE_URL
  ? { connectionString: config.DATABASE_URL, ...sslConfig }
  : {
      host: config.DB_HOST,
      port: config.DB_PORT,
      database: config.POSTGRES_DB,
      user: config.POSTGRES_USER,
      password: config.POSTGRES_PASSWORD,
      ...sslConfig
    };

if (!config.DATABASE_URL && !config.DB_HOST && !config.POSTGRES_PASSWORD) {
  logger.fatal("DATABASE_URL oder (DB_HOST + POSTGRES_*) fehlt");
  process.exit(1);
}

const poolOptions = {
  max: config.PGPOOL_MAX,
  idleTimeoutMillis: config.PGPOOL_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: config.PGPOOL_CONN_TIMEOUT_MS
};

export const pool = new Pool({ ...poolConfig, ...poolOptions });
