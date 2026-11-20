const fs = require("fs");
const path = require("path");

const localEnv = path.join(__dirname, ".env");
if (fs.existsSync(localEnv)) {
  require("dotenv").config({ path: localEnv });
}

const mysql = require("mysql2/promise");

const requiredVariables = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
const missingVariables = requiredVariables.filter(
  (variable) => !process.env[variable]
);

const dbError = () =>
  new Error(
    `Missing MySQL environment variables: ${missingVariables.join(", ")}`
  );

const pool = missingVariables.length
  ? null
  : mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: Number(process.env.DB_PORT || 3306),
      waitForConnections: true,
      connectionLimit: 10,
    });

if (!pool) {
  console.warn(
    `MySQL pool not initialized. Missing environment variables: ${missingVariables.join(", ")}`
  );
}

module.exports = pool || {
  query: async () => {
    throw dbError();
  },
  execute: async () => {
    throw dbError();
  },
  getConnection: async () => {
    throw dbError();
  },
};
