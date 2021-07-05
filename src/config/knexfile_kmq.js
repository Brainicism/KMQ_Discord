const resolve = require("path").resolve;
require('dotenv').config({path: resolve(__dirname, "../../.env")});

module.exports = {
  client: 'mysql2',
  connection: {
    user: process.env.DB_USER, password: process.env.DB_PASS, database: "kmq", host: process.env.DB_HOST, charset: "utf8mb4", port: parseInt(process.env.DB_PORT), decimalNumbers: true
  },
  pool: {
    min: 0,
    max: 10
  },
  migrations: {
    directory: resolve(__dirname, "../../src/migrations")
  }
}
