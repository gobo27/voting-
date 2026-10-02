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
 
// .promise() lets you use async/await with pool.execute(...)
const promisePool = pool.promise();
 
// Quick sanity check on startup — logs a clear error if credentials/host are wrong
promisePool.query('SELECT 1')
    .then(() => console.log('Connected to MySQL database:', process.env.DB_NAME))
    .catch((err) => console.error('MySQL connection failed:', err.message));
 
module.exports = promisePool;
 
