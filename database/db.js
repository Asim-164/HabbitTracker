const sql = require("mssql");

const config = {
    server: process.env.DB_SERVER,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
        trustServerCertificate: true
    }
};


async function connectDatabase() {
    try {
        const pool = await sql.connect(config);
        console.log("Database connected successfully!");
        return pool;
    } catch (error) {
        console.log("Database connection failed:");
        console.log(error);
    }
}

module.exports = connectDatabase;