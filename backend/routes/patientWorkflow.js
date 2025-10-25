/**
 * Patient Workflow API Routes
 * Endpoint for comprehensive patient data retrieval
 *
 * backend/routes/patientWorkflow.js
 */

const express = require("express");
const router = express.Router();
const patientWorkflow = require("../services/patientWorkflow");
const dockerServices = require("../services/dockerServicesClient");
const logger = require("../utils/logger");

/**
 * GET /api/workflow/patient/:mrnOrId
 * Get comprehensive patient data (DB + Athena + UltraLinq + AI)
 */
router.get("/patient/:mrnOrId", async (req, res) => {
  const startTime = Date.now();
  const { mrnOrId } = req.params;

  try {
    logger.info("WORKFLOW", `Comprehensive data request for: ${mrnOrId}`);

    const data = await patientWorkflow.getPatientComprehensiveData(mrnOrId);

    const duration = Date.now() - startTime;
    logger.logAPI("GET", `/api/workflow/patient/${mrnOrId}`, 200, duration);

    res.json({
      success: true,
      data,
      duration_ms: duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.logAPI("GET", `/api/workflow/patient/${mrnOrId}`, 500, duration, {
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/workflow/search/:query
 * Search patients by name or MRN
 */
router.get("/search/:query", async (req, res) => {
  try {
    const { query } = req.params;

    logger.info("WORKFLOW", `Searching patients: ${query}`);

    const results = await patientWorkflow.searchPatients(query);

    res.json({
      success: true,
      results,
      count: results.length,
    });
  } catch (error) {
    logger.error("WORKFLOW", "Search failed", { error: error.message });

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/workflow/patient/:mrn/prepare
 * Prepare patient for procedure (fetch all data + generate summary)
 */
router.post("/patient/:mrn/prepare", async (req, res) => {
  const startTime = Date.now();

  try {
    const { mrn } = req.params;
    const { procedure_type } = req.body;

    logger.info("WORKFLOW", `Preparing patient ${mrn} for ${procedure_type}`);

    // Get comprehensive data
    const patientData = await patientWorkflow.getPatientComprehensiveData(mrn);

    // Generate procedure-specific summary
    const procedureContext = `
Patient ${patientData.patient.name} is scheduled for ${procedure_type}.
Review the patient's history and imaging to provide key procedural considerations.

${patientData.ai_summary?.summary || patientData.ai_summary?.fallback}
`;

    const aiResult = await dockerServices.processNote(
      procedureContext,
      "arteriogram"
    );

    const duration = Date.now() - startTime;

    res.json({
      success: true,
      patient: patientData,
      procedure_summary: aiResult.success
        ? {
            summary: aiResult.fields,
            confidence: aiResult.metadata,
          }
        : null,
      duration_ms: duration,
    });
  } catch (error) {
    logger.error("WORKFLOW", "Preparation failed", { error: error.message });

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/workflow/services/status
 * Check status of all connected services
 */
router.get("/services/status", async (req, res) => {
  try {
    logger.info("WORKFLOW", "Checking services status");

    const dragonHealth = await dockerServices.checkDragonHealth();

    // Test database
    let dbConnected = false;
    try {
      const { sequelize } = require("../config/database");
      await sequelize.authenticate();
      dbConnected = true;
    } catch (error) {
      logger.error("DB", "Connection check failed");
    }

    const status = {
      timestamp: new Date(),
      services: {
        database: {
          connected: dbConnected,
          type: "PostgreSQL",
        },
        dragon_ai: {
          connected: dragonHealth.healthy,
          url: dockerServices.dragonUrl,
          details: dragonHealth,
        },
        ultralinq: {
          configured: !!process.env.ULTRALINQ_USERNAME,
          status: "Ready",
        },
        athena: {
          configured: !!process.env.ATHENA_API_KEY,
          status: process.env.ATHENA_API_KEY ? "Ready" : "Not configured",
        },
      },
      overall: dbConnected && dragonHealth.healthy ? "healthy" : "degraded",
    };

    res.json({
      success: true,
      status,
    });
  } catch (error) {
    logger.error("WORKFLOW", "Status check failed", { error: error.message });

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/workflow/clear-cache
 * Clear patient data cache
 */
router.post("/clear-cache", async (req, res) => {
  try {
    patientWorkflow.clearCache();

    logger.info("WORKFLOW", "Cache cleared");

    res.json({
      success: true,
      message: "Cache cleared successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
