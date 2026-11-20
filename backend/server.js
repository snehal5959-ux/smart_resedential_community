const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./db");
const { requireAuth, requireRole } = require("./auth");

const app = express();

const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGINS || "http://localhost:5174")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin));
  },
  credentials: true,
}));
app.use(express.json({ limit: "20kb" }));

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api", require("./routes/communityRoutes"));
app.get("/api/test-db", requireAuth, requireRole("manager"), async (req, res) => {
  try {
    const [rows] = await db.query("SELECT 1 AS result");

    res.json({
      message: "MySQL connected successfully!",
      data: rows,
    });
  } catch (error) {
    console.error("MySQL test failed:", error.message);
    res.status(503).json({
      message: "Database connection failed.",
    });
  }
});

app.use("/api/residents", require("./routes/residentRoutes"));
app.use("/api/flats", require("./routes/flatRoutes"));
app.use("/api/assistant", require("./routes/assistantRoutes"));
app.use("/api", (req, res) => {
  res.status(404).json({ message: "API endpoint not found", path: req.originalUrl });
});
app.use("/api", (error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error("API request failed:", error.message);
  res.status(error.code === "ER_DUP_ENTRY" ? 409 : 500).json({
    message: error.code === "ER_DUP_ENTRY" ? "A matching record already exists." : "The API request could not be completed.",
  });
});

// Serve the Vite production build from the same server as the API.
const frontendDist = path.join(__dirname, "..", "frontend", "dist");
app.use(express.static(frontendDist));

// Let client-side routes load the React app without masking unknown API routes.
app.get("/{*path}", (req, res, next) => {
  if (req.path === "/api" || req.path.startsWith("/api/")) return next();

  res.sendFile(path.join(frontendDist, "index.html"), (error) => {
    if (error) next(error);
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
