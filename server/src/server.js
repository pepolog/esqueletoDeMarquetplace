import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./src/routes/authRoutes.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || true }));
app.use(express.json());

app.get("/health", (req, res) => {
    res.json({ ok: true });
});

app.use("/api/auth", authRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));