/**
 * Updated backend/server.js
 * Integrates Docker services and patient workflow
 * PORT: 3001 (as specified)
 */

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
require("dotenv").config();
const path = require("path");

const { testConnection, initDatabase } = require("./config/database");
const WebSocketServer = require("./websocket/server");
const procedureRoutes = require("./routes/procedures");
const ultralinqRoutes = require("./routes/ultralinqRoutes");
const dragonRoutes = require("./routes/dragon");
const patientRoutes = require("./routes/patients");

// NEW: Import workflow and Docker services
const patientWorkflowRoutes = require("./routes/patientWorkflow");
const dockerServices = require("./services/dockerServicesClient");
const logger = require("./utils/logger");

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// Serve static frontend files
app.use(express.static(path.join(__dirname, "../frontend")));

// Serve index.html for root path
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// API Routes
app.use("/api/procedures", procedureRoutes);
app.use("/api/ultralinq", ultralinqRoutes);
app.use("/api/dragon", dragonRoutes);
app.use("/api/patients", patientRoutes);

// NEW: Patient workflow routes (comprehensive data)
app.use("/api/workflow", patientWorkflowRoutes);

// Health check endpoint
app.get("/health", async (req, res) => {
  // Check Docker services health
  const dragonHealth = await dockerServices.checkDragonHealth();

  res.json({
    status: "ok",
    timestamp: new Date(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    services: {
      dragon_ai: dragonHealth.healthy,
      database: true, // Will be checked during startup
    },
  });
});

// API Root endpoint
app.get("/api", (req, res) => {
  res.json({
    message: "Surgical Command Center API",
    version: "2.0.0",
    endpoints: {
      procedures: "/api/procedures",
      patients: "/api/patients",
      workflow: "/api/workflow",
      ultralinq: "/api/ultralinq",
      dragon: "/api/dragon",
      health: "/health",
      websocket: `ws://${process.env.HOST}:${process.env.PORT}`,
    },
  });
});

// 404 handler for API routes
app.use("/api/*", (req, res) => {
  res.status(404).json({
    success: false,
    error: `API endpoint not found: ${req.originalUrl}`,
  });
});

// Fallback for frontend routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// Global Error handler
app.use((err, req, res, next) => {
  logger.error("SERVER", "Global error handler", { error: err.message });

  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal server error",
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});

// Initialize server
const PORT = process.env.PORT || 3001; // Changed to 3001
const HOST = process.env.HOST || "localhost";

const startServer = async () => {
  try {
    console.log("\n" + "═".repeat(60));
    console.log("   🏥 Surgical Command Center Backend Server");
    console.log("═".repeat(60));

    // Test database connection
    console.log("🔍 Testing database connection...");
    const dbConnected = await testConnection();

    if (!dbConnected) {
      console.error(
        "❌ Failed to connect to database. Please check your configuration."
      );
      process.exit(1);
    }

    // Initialize database (create tables)
    console.log("🔧 Initializing database...");
    await initDatabase();

    // Initialize Docker services connection
    console.log("🐳 Connecting to Docker services...");
    const dockerConnected = await dockerServices.initialize();

    if (!dockerConnected) {
      console.warn("⚠️  Docker services not fully available");
      console.warn("⚠️  Some features may be limited");
    }

    // Initialize WebSocket server
    console.log("🔌 Initializing WebSocket server...");
    const wsServer = new WebSocketServer(server);

    // Make WebSocket server accessible to routes
    app.set("wsServer", wsServer);

    // Start HTTP server
    server.listen(PORT, HOST, () => {
      console.log("═".repeat(60));
      console.log(`   🌐 HTTP Server: http://${HOST}:${PORT}`);
      console.log(`   🔌 WebSocket: ws://${HOST}:${PORT}`);
      console.log(`   📊 Database: PostgreSQL (${process.env.DB_NAME})`);
      console.log(
        `   🐳 Docker Services: ${dockerConnected ? "Connected" : "Limited"}`
      );
      console.log(`   🔧 Environment: ${process.env.NODE_ENV}`);
      console.log("═".repeat(60));
      console.log("\n   Ready for connections! 🚀\n");
      console.log(
        "   Patient Lookup: http://localhost:3001/patient-lookup.html"
      );
      console.log("   Main Interface: http://localhost:3001/\n");
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n${signal} received, shutting down gracefully...`);

  // Stop Docker services health checks
  dockerServices.stopHealthChecks();

  // Close the HTTP server
  server.close(() => {
    console.log("✅ HTTP server closed.");
    process.exit(0);
  });
};

// Handle graceful shutdown
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Start the server
startServer();

module.exports = app;
