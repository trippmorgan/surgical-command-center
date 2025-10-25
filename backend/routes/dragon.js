/**
 * Dragon AI Routes - Complete Implementation
 * Connects to Dragon Dictation Pro service via Tailscale
 * backend/routes/dragon.js
 */

const express = require("express");
const router = express.Router();
const axios = require("axios");
const logger = require("../utils/logger");

// Dragon service URL - will use Tailscale IP from environment
const DRAGON_URL = process.env.DRAGON_URL || "http://localhost:5005";

/**
 * GET /api/dragon/health
 * Check Dragon service health and connectivity
 */
router.get("/health", async (req, res) => {
  const startTime = Date.now();

  try {
    const response = await axios.get(`${DRAGON_URL}/`, {
      timeout: 5000,
    });

    const duration = Date.now() - startTime;

    if (logger) {
      logger.info("DRAGON", "Health check successful", {
        duration_ms: duration,
        status: response.data,
      });
    }

    res.json({
      success: true,
      connected: true,
      dragon_url: DRAGON_URL,
      dragon_status: response.data,
      response_time_ms: duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    if (logger) {
      logger.error("DRAGON", "Health check failed", {
        error: error.message,
        dragon_url: DRAGON_URL,
      });
    }

    res.status(503).json({
      success: false,
      connected: false,
      error: "Dragon service unavailable",
      message: error.message,
      dragon_url: DRAGON_URL,
      response_time_ms: duration,
      hint: "Check Tailscale connection and Dragon service status",
    });
  }
});

/**
 * POST /api/dragon/transcribe
 * Transcribe audio file using Whisper
 */
router.post("/transcribe", async (req, res) => {
  const startTime = Date.now();

  try {
    if (!req.files || !req.files.audio) {
      return res.status(400).json({
        success: false,
        error: "No audio file provided",
      });
    }

    if (logger) {
      logger.info("DRAGON", "Transcription request received");
    }

    const FormData = require("form-data");
    const formData = new FormData();
    formData.append("file", req.files.audio.data, {
      filename: req.files.audio.name,
      contentType: req.files.audio.mimetype,
    });

    const response = await axios.post(`${DRAGON_URL}/transcribe`, formData, {
      headers: formData.getHeaders(),
      timeout: 60000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    const { text, processing_time } = response.data;
    const duration = Date.now() - startTime;

    if (logger) {
      logger.success("DRAGON", "Transcription completed", {
        text_length: text.length,
        processing_time,
        total_duration: duration,
      });
    }

    res.json({
      success: true,
      text,
      ...response.data,
      total_duration_ms: duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    if (logger) {
      logger.error("DRAGON", "Transcription failed", {
        error: error.message,
        duration,
      });
    }

    res.status(500).json({
      success: false,
      error: "Transcription failed",
      message: error.message,
      total_duration_ms: duration,
    });
  }
});

/**
 * POST /api/dragon/process
 * Process medical note with Gemini AI
 */
router.post("/process", async (req, res) => {
  const startTime = Date.now();

  try {
    const { text, macro_key } = req.body;

    if (!text || !macro_key) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: text, macro_key",
      });
    }

    if (logger) {
      logger.info("DRAGON", "Processing note with AI", {
        macro_key,
        text_length: text.length,
      });
    }

    const response = await axios.post(
      `${DRAGON_URL}/process_note`,
      { text, macro_key },
      { timeout: 30000 }
    );

    const { fields, metadata } = response.data;
    const duration = Date.now() - startTime;

    if (logger) {
      logger.success("DRAGON", "AI processing completed", {
        macro_key,
        fields_extracted: Object.keys(fields).length,
        processing_time: metadata.processing_time,
        low_confidence_count: metadata.low_confidence_count,
        total_duration: duration,
      });
    }

    res.json({
      success: true,
      fields,
      metadata: {
        ...metadata,
        total_duration_ms: duration,
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    if (logger) {
      logger.error("DRAGON", "AI processing failed", {
        error: error.message,
        duration,
      });
    }

    res.status(500).json({
      success: false,
      error: "AI processing failed",
      message: error.message,
      total_duration_ms: duration,
    });
  }
});

/**
 * GET /api/dragon/macros
 * List all available procedure macros
 */
router.get("/macros", async (req, res) => {
  try {
    const response = await axios.get(`${DRAGON_URL}/list_macros`, {
      timeout: 5000,
    });

    if (logger) {
      logger.info("DRAGON", "Macros retrieved", {
        count: response.data.count,
      });
    }

    res.json({
      success: true,
      macros: response.data.macros,
      count: response.data.count,
    });
  } catch (error) {
    if (logger) {
      logger.error("DRAGON", "Failed to retrieve macros", {
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to fetch macros",
      message: error.message,
    });
  }
});

/**
 * GET /api/dragon/macros/:macro_key
 * Validate and get details of a specific macro
 */
router.get("/macros/:macro_key", async (req, res) => {
  try {
    const { macro_key } = req.params;

    const response = await axios.get(
      `${DRAGON_URL}/validate_macro/${macro_key}`,
      { timeout: 5000 }
    );

    if (logger) {
      logger.info("DRAGON", "Macro validated", {
        macro_key,
        fields: response.data.field_count,
      });
    }

    res.json({
      success: true,
      macro_key,
      ...response.data,
    });
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return res.status(404).json({
        success: false,
        error: "Macro not found",
        macro_key: req.params.macro_key,
      });
    }

    if (logger) {
      logger.error("DRAGON", "Macro validation failed", {
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: "Validation failed",
      message: error.message,
    });
  }
});

/**
 * POST /api/dragon/process-batch
 * Process multiple notes in batch
 */
router.post("/process-batch", async (req, res) => {
  const startTime = Date.now();

  try {
    const { notes } = req.body;

    if (!notes || !Array.isArray(notes)) {
      return res.status(400).json({
        success: false,
        error: "notes must be an array of {text, macro_key} objects",
      });
    }

    if (logger) {
      logger.info("DRAGON", "Batch processing request", {
        count: notes.length,
      });
    }

    const results = await Promise.allSettled(
      notes.map((note) =>
        axios.post(
          `${DRAGON_URL}/process_note`,
          { text: note.text, macro_key: note.macro_key },
          { timeout: 30000 }
        )
      )
    );

    const processed = results.map((result, index) => ({
      index,
      success: result.status === "fulfilled",
      data: result.status === "fulfilled" ? result.value.data : null,
      error: result.status === "rejected" ? result.reason.message : null,
    }));

    const duration = Date.now() - startTime;
    const successCount = processed.filter((r) => r.success).length;

    if (logger) {
      logger.success("DRAGON", "Batch processing completed", {
        total: notes.length,
        successful: successCount,
        failed: notes.length - successCount,
        duration,
      });
    }

    res.json({
      success: true,
      results: processed,
      summary: {
        total: notes.length,
        successful: successCount,
        failed: notes.length - successCount,
        duration_ms: duration,
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    if (logger) {
      logger.error("DRAGON", "Batch processing failed", {
        error: error.message,
        duration,
      });
    }

    res.status(500).json({
      success: false,
      error: "Batch processing failed",
      message: error.message,
      duration_ms: duration,
    });
  }
});

/**
 * GET /api/dragon/stats
 * Get Dragon service statistics
 */
router.get("/stats", async (req, res) => {
  try {
    // Get basic health info
    const healthResponse = await axios.get(`${DRAGON_URL}/`, {
      timeout: 5000,
    });

    res.json({
      success: true,
      stats: {
        service_status: healthResponse.data,
        dragon_url: DRAGON_URL,
        connection: "active",
        timestamp: new Date(),
      },
    });
  } catch (error) {
    if (logger) {
      logger.error("DRAGON", "Stats retrieval failed", {
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to get stats",
      message: error.message,
    });
  }
});

module.exports = router;
