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

// NEW: Import the UltraLinq routes and connector
const ultralinqRoutes = require("./routes/ultralinqRoutes");
const { closeBrowser } = require("./connectors/ultralinqConnector");

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Consider enabling with a proper policy for production
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
app.use(morgan("dev")); // HTTP request logger

// Serve static frontend files
app.use(express.static(path.join(__dirname, "../frontend")));

// Serve index.html for root path to support Single Page Applications
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// API Routes
app.use("/api/procedures", procedureRoutes);
// NEW: Add the UltraLinq API routes
app.use("/api/ultralinq", ultralinqRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  });
});

// API Root endpoint (optional, can be removed if frontend handles root)
app.get("/api", (req, res) => {
  res.json({
    message: "Surgical Command Center API",
    version: "1.0.0",
    endpoints: {
      procedures: "/api/procedures",
      ultralinq: "/api/ultralinq", // NEW: Document the new endpoint
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

// Fallback for frontend routing (sends index.html for any non-API route)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// Global Error handler
app.use((err, req, res, next) => {
  console.error("Global Error Handler:", err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal server error",
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});

// Initialize server
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "localhost";

const startServer = async () => {
  try {
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

    // Initialize WebSocket server
    console.log("🔌 Initializing WebSocket server...");
    const wsServer = new WebSocketServer(server);

    // Make WebSocket server accessible to routes if needed
    app.set("wsServer", wsServer);

    // Start HTTP server
    server.listen(PORT, HOST, () => {
      console.log(
        "\n✅ ═══════════════════════════════════════════════════════"
      );
      console.log("   🏥 Surgical Command Center Backend Server");
      console.log("   ═══════════════════════════════════════════════════════");
      console.log(`   🌐 HTTP Server: http://${HOST}:${PORT}`);
      console.log(`   🔌 WebSocket: ws://${HOST}:${PORT}`);
      console.log(`   📊 Database: PostgreSQL (${process.env.DB_NAME})`);
      console.log(`   🔧 Environment: ${process.env.NODE_ENV}`);
      console.log(
        "   ═══════════════════════════════════════════════════════\n"
      );
      console.log("   Ready for connections! 🚀\n");
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

// NEW: Create a dedicated graceful shutdown function
const shutdown = async (signal) => {
  console.log(`\n${signal} received, shutting down gracefully...`);

  // Close the Puppeteer browser instance first
  await closeBrowser();

  // Then close the HTTP server
  server.close(() => {
    console.log("✅ HTTP server closed.");
    // The process will exit naturally now
    process.exit(0);
  });
};

// Handle graceful shutdown for Puppeteer and the server
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Start the server
startServer();

module.exports = app;
