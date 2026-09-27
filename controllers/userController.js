const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const connectDatabase = require("../database/db");

async function registerUser(req, res) {
    try {
        const pool = await connectDatabase();

        const { name, email, password } = req.body;

        const passwordHash = await bcrypt.hash(password, 10);

        await pool.request()
            .input("Name", name)
            .input("Email", email)
            .input("PasswordHash", passwordHash)
            .query(`
                INSERT INTO Users
                (
                    Name,
                    Email,
                    PasswordHash
                )
                VALUES
                (
                    @Name,
                    @Email,
                    @PasswordHash
                )
            `);

        res.status(201).json({
            message: "User registered successfully!"
        });

    } catch (error) {
        console.log("Error registering user:", error);

        res.status(500).json({
            message: "Failed to register user"
        });
    }
}

async function loginUser(req, res) {
    try {
        const pool = await connectDatabase();

        const { email, password } = req.body;

        const result = await pool.request()
            .input("Email", email)
            .query(`
                SELECT *
                FROM Users
                WHERE Email = @Email
            `);

        if (result.recordset.length === 0) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const user = result.recordset[0];

        const passwordMatch = await bcrypt.compare(
            password,
            user.PasswordHash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const token = jwt.sign(
        {
            userId: user.UserID,
            email: user.Email
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "1h"
        }
    );

    res.json({
         message: "Login successful!",
        token: token,
        userId: user.UserID,
        name: user.Name,
        email: user.Email
    });

    } catch (error) {
        console.log("Error logging in:", error);

        res.status(500).json({
            message: "Login failed"
        });
    }
}

module.exports = {
    registerUser,
    loginUser
};