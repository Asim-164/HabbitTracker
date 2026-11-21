const { Pool } = require("pg");
require('dotenv').config();

// We create the pool using the Neon connection string from .env
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Required for Neon
    }
});

async function connectDatabase() {
    try {
        // Test the connection
        await pool.query('SELECT NOW()');
        console.log("Database connected successfully!");
        return pool;
    } catch (error) {
        console.log("Database connection failed:");
        console.log(error);
    }
}

module.exports = connectDatabase;