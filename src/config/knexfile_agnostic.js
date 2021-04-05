const resolve = require("path").resolve;
require('dotenv').config({path: resolve(__dirname, "../../.env")});

module.exports = {
  client: 'mysql',
  connection: {
    user: process.env.DB_USER, password: process.env.DB_PASS, host: process.env.DB_HOST, charset: "utf8mb4", port: parseInt(process.env.DB_PORT)
  },
  pool: {
    min: 0,
    max: 1
  },
  migrations: {
    directory: "../../migrations"
  }
}
