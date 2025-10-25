/**
 * Docker Services Integration Layer
 * Connects frontend (port 3001) to Docker services container
 *
 * backend/services/dockerServicesClient.js
 */

const axios = require("axios");
const logger = require("../utils/logger");

// Docker services configuration
const DOCKER_SERVICES = {
  dragon: "http://dragon_ai_service:5005",
  postgres: "postgresql://central_postgres_db:5432",
};

class DockerServicesClient {
  constructor() {
    this.dragonUrl = process.env.DRAGON_URL || DOCKER_SERVICES.dragon;
    this.connected = false;
    this.healthCheckInterval = null;
  }

  /**
   * Initialize connection to Docker services
   */
  async initialize() {
    logger.info("DOCKER", "Initializing Docker services connection...");

    try {
      // Check Dragon AI service
      await this.checkDragonHealth();

      // Start periodic health checks
      this.startHealthChecks();

      this.connected = true;
      logger.success("DOCKER", "Connected to Docker services");
      return true;
    } catch (error) {
      logger.error("DOCKER", "Failed to connect to services", {
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Check Dragon AI service health
   */
  async checkDragonHealth() {
    try {
      const response = await axios.get(`${this.dragonUrl}/`, {
        timeout: 5000,
      });

      logger.info("DRAGON", "Health check passed", response.data);
      return {
        healthy: true,
        ...response.data,
      };
    } catch (error) {
      logger.warning("DRAGON", "Health check failed", {
        error: error.message,
      });
      return {
        healthy: false,
        error: error.message,
      };
    }
  }

  /**
   * Process medical note with Gemini via Dragon service
   */
  async processNote(text, macroKey = "arteriogram") {
    try {
      logger.info("DRAGON", "Processing medical note", {
        macro: macroKey,
        textLength: text.length,
      });

      const response = await axios.post(
        `${this.dragonUrl}/process_note`,
        { text, macro_key: macroKey },
        { timeout: 30000 }
      );

      const { fields, metadata } = response.data;

      logger.success("DRAGON", "Note processed successfully", {
        fieldsExtracted: Object.keys(fields).length,
        processingTime: metadata.processing_time,
        lowConfidence: metadata.low_confidence_count,
      });

      return {
        success: true,
        fields,
        metadata,
      };
    } catch (error) {
      logger.error("DRAGON", "Note processing failed", {
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Transcribe audio file
   */
  async transcribeAudio(audioBuffer) {
    try {
      const FormData = require("form-data");
      const formData = new FormData();
      formData.append("file", audioBuffer, {
        filename: "audio.wav",
        contentType: "audio/wav",
      });

      const response = await axios.post(
        `${this.dragonUrl}/transcribe`,
        formData,
        {
          headers: formData.getHeaders(),
          timeout: 60000,
        }
      );

      logger.success("DRAGON", "Audio transcribed", {
        textLength: response.data.text.length,
        processingTime: response.data.processing_time,
      });

      return {
        success: true,
        ...response.data,
      };
    } catch (error) {
      logger.error("DRAGON", "Transcription failed", {
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get available macros
   */
  async getMacros() {
    try {
      const response = await axios.get(`${this.dragonUrl}/list_macros`);

      return {
        success: true,
        macros: response.data.macros,
        count: response.data.count,
      };
    } catch (error) {
      logger.error("DRAGON", "Failed to get macros", {
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Validate macro structure
   */
  async validateMacro(macroKey) {
    try {
      const response = await axios.get(
        `${this.dragonUrl}/validate_macro/${macroKey}`
      );

      return {
        success: true,
        ...response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Check every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      const health = await this.checkDragonHealth();
      this.connected = health.healthy;
    }, 30000);
  }

  /**
   * Stop health checks
   */
  stopHealthChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.connected,
      dragonUrl: this.dragonUrl,
      timestamp: new Date(),
    };
  }
}

// Singleton instance
const dockerServicesClient = new DockerServicesClient();

module.exports = dockerServicesClient;
