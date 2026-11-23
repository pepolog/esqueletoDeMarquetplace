import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../config/db.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = Router();

const emailValido = (e) => typeof e === "string" && /^\S+@\S+\.\S+$/.test(e);

router.post("/register", async(req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!emailValido(email)) {
            return res.status(400).json({ error: "Email no válido" });
        }
        if (typeof password !== "string" || password.length < 8) {
            return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
        }

        const existe = await prisma.user.findUnique({ where: { email } });
        if (existe) return res.status(409).json({ error: "El email ya existe" });

        const hash = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: { email, password: hash, name },
        });

        res.status(201).json({ id: user.id, email: user.email, name: user.name });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error del servidor" });
    }
});

router.post("/login", async(req, res) => {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(401).json({ error: "Credenciales incorrectas" });

        const correcta = await bcrypt.compare(password, user.password);
        if (!correcta) return res.status(401).json({ error: "Credenciales incorrectas" });

        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || "1d",
        });

        res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error del servidor" });
    }
});

router.get("/me", authMiddleware, async(req, res) => {
            try {
                const router.get("/me", authMiddleware, async(req, res) => {
                    try {
                        const user = await prisma.user.findUnique({ where: { id: req.user.id } });
                        if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

                        res.json({ id: user.id, email: user.email, name: user.name });
                    } catch (error) {
                        console.error(error);
                        res.status(500).json({ error: "Error del servidor" });
                    }
                });

                export default router;