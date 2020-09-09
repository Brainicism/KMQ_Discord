const resolve = require("path").resolve;
require('dotenv').config({path: resolve(__dirname, "../../.env")});

module.exports = {
  client: 'mysql',
  connection: {
    user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_KPOP_DATA_TABLE_NAME, host: process.env.DB_HOST
  },
  pool: {
    min: 0,
    max: 10
  },
  migrations: {
    directory: "../../migrations"
  }
}
