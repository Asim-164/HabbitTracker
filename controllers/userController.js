const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const connectDatabase = require("../database/db");

async function registerUser(req, res) {
    try {
        const pool = await connectDatabase();

        const { name, email, password } = req.body;

        const passwordHash = await bcrypt.hash(password, 10);

        await pool.query(`
                INSERT INTO Users
                (
                    Name,
                    Email,
                    PasswordHash
                )
                VALUES
                (
                    $1,
                    $2,
                    $3
                )
            `, [name, email, passwordHash]);

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

        const result = await pool.query(`
                SELECT *
                FROM Users
                WHERE Email = $1
            `, [email]);

        if (result.rows.length === 0) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const user = result.rows[0];
        
        // Force the hash to be a clean string and trim any hidden spaces
        const cleanHash = String(user.passwordhash).trim();


        // -------------------
        
        // Check the password
        const passwordMatch = await bcrypt.compare(
            password,
            cleanHash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const token = jwt.sign(
            {
                userId: user.userid,
                email: user.email
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "1h"
            }
        );

        res.json({
            message: "Login successful",
            token,
            userId: user.userid,
            name: user.name,
            email: user.email,
            createdAt: user.createdat,
            avatarURL: user.avatarurl
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

        const existing = await pool.query(`
                SELECT UserID
                FROM Users
                WHERE Email = $1 AND UserID <> $2
            `, [email, userId]);

        if (existing.rows.length > 0) {
            return res.status(409).json({
                message: "That email is already in use"
            });
        }

        await pool.query(`
                UPDATE Users
                SET Name = $1, Email = $2
                WHERE UserID = $3
            `, [name, email, userId]);

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

        const result = await pool.query(`
                SELECT PasswordHash
                FROM Users
                WHERE UserID = $1
            `, [userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        const currentHash = result.rows[0].passwordhash;
        const matches = await bcrypt.compare(currentPassword, currentHash);

        if (!matches) {
            return res.status(401).json({
                message: "Current password is incorrect"
            });
        }

        const newHash = await bcrypt.hash(newPassword, 10);

        await pool.query(`
                UPDATE Users
                SET PasswordHash = $1
                WHERE UserID = $2
            `, [newHash, userId]);

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

async function updateAvatar(req, res) {
    try {
        const pool = await connectDatabase();
        const userId = req.user.userId;
        const { avatarURL } = req.body;

        if (avatarURL !== null && typeof avatarURL !== "string") {
            return res.status(400).json({ message: "avatarURL must be a string or null" });
        }

        if (typeof avatarURL === "string" && avatarURL.length > 50) {
            return res.status(400).json({ message: "avatarURL is too long" });
        }

        await pool.query(`UPDATE Users SET AvatarURL = $1 WHERE UserID = $2`, [avatarURL, userId]);

        res.json({
            message: "Avatar updated successfully",
            avatarURL
        });

    } catch (error) {
        console.log("Error updating avatar:", error);
        res.status(500).json({ message: "Failed to update avatar" });
    }
}

module.exports = {
    registerUser,
    loginUser,
    updateMe,
    updatePassword,
    updateAvatar
};