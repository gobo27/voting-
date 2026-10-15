const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

const promisePool = pool.promise();

promisePool.query(
    'SELECT DATABASE() AS db, @@hostname AS host'
)
.then(([rows]) => {
    console.log("CONNECTED DATABASE:", rows[0]);
})
.catch((err) => {
    console.error("MySQL connection failed:", err.message);
});

module.exports = promisePool;