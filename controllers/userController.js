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

async function updateMe(req, res) {
    try {
        const pool = await connectDatabase();

        const userId = req.user.userId;
        const { name, email } = req.body;

        if (!name || !email) {
            return res.status(400).json({
                message: "Name and email are required"
            });
        }

        const existing = await pool.request()
            .input("Email", email)
            .input("UserID", userId)
            .query(`
                SELECT UserID
                FROM Users
                WHERE Email = @Email AND UserID <> @UserID
            `);

        if (existing.recordset.length > 0) {
            return res.status(409).json({
                message: "That email is already in use"
            });
        }

        await pool.request()
            .input("UserID", userId)
            .input("Name", name)
            .input("Email", email)
            .query(`
                UPDATE Users
                SET Name = @Name, Email = @Email
                WHERE UserID = @UserID
            `);

        res.json({
            message: "Profile updated successfully!",
            user: { userId, name, email }
        });

    } catch (error) {
        console.log("Error updating profile:", error);

        res.status(500).json({
            message: "Failed to update profile"
        });
    }
}

async function updatePassword(req, res) {
    try {
        const pool = await connectDatabase();

        const userId = req.user.userId;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                message: "Current and new password are required"
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                message: "New password must be at least 6 characters"
            });
        }

        const result = await pool.request()
            .input("UserID", userId)
            .query(`
                SELECT PasswordHash
                FROM Users
                WHERE UserID = @UserID
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        const currentHash = result.recordset[0].PasswordHash;
        const matches = await bcrypt.compare(currentPassword, currentHash);

        if (!matches) {
            return res.status(401).json({
                message: "Current password is incorrect"
            });
        }

        const newHash = await bcrypt.hash(newPassword, 10);

        await pool.request()
            .input("UserID", userId)
            .input("PasswordHash", newHash)
            .query(`
                UPDATE Users
                SET PasswordHash = @PasswordHash
                WHERE UserID = @UserID
            `);

        res.json({
            message: "Password updated successfully!"
        });

    } catch (error) {
        console.log("Error updating password:", error);

        res.status(500).json({
            message: "Failed to update password"
        });
    }
}

module.exports = {
    registerUser,
    loginUser,
    updateMe,
    updatePassword
};