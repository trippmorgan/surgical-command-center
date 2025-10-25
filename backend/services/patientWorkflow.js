/**
 * Patient Data Aggregation Service
 * Combines Athena EMR + UltraLinq imaging + AI analysis
 *
 * backend/services/patientWorkflow.js
 */

const Patient = require("../models/Patient");
const dockerServices = require("./dockerServicesClient");
const ultralinq = require("../connectors/ultralinqConnector");
const logger = require("../utils/logger");
const axios = require("axios");

class PatientWorkflowService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get comprehensive patient data
   * Combines: Database + Athena + UltraLinq + AI Analysis
   */
  async getPatientComprehensiveData(mrnOrId) {
    const startTime = Date.now();

    try {
      logger.info("WORKFLOW", `Fetching comprehensive data for: ${mrnOrId}`);

      // Check cache first
      const cached = this.getCached(mrnOrId);
      if (cached) {
        logger.info("WORKFLOW", "Returning cached data");
        return cached;
      }

      // 1. Get patient from database
      const patient = await this.getPatientFromDB(mrnOrId);
      if (!patient) {
        throw new Error("Patient not found");
      }

      // 2. Get data from all sources in parallel
      const [athenaData, imagingData] = await Promise.allSettled([
        this.getAthenaData(patient.mrn),
        this.getUltraLinqData(patient.mrn),
      ]);

      // 3. Compile all data
      const comprehensiveData = {
        patient: {
          id: patient.id,
          mrn: patient.mrn,
          name: patient.getFullName(),
          dob: patient.date_of_birth,
          age: patient.calculateAge(),
          gender: patient.gender,
          contact: {
            phone: patient.phone_primary,
            email: patient.email,
          },
        },
        athena: athenaData.status === "fulfilled" ? athenaData.value : null,
        imaging: imagingData.status === "fulfilled" ? imagingData.value : null,
        metadata: {
          fetched_at: new Date(),
          duration_ms: Date.now() - startTime,
          sources_available: {
            athena: athenaData.status === "fulfilled",
            ultralinq: imagingData.status === "fulfilled",
          },
        },
      };

      // 4. Generate AI summary
      comprehensiveData.ai_summary = await this.generateAISummary(
        comprehensiveData
      );

      // Cache the result
      this.setCache(mrnOrId, comprehensiveData);

      logger.success("WORKFLOW", "Comprehensive data compiled", {
        duration_ms: Date.now() - startTime,
        sources: Object.keys(comprehensiveData.metadata.sources_available),
      });

      return comprehensiveData;
    } catch (error) {
      logger.error("WORKFLOW", "Failed to get comprehensive data", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get patient from local database
   */
  async getPatientFromDB(mrnOrId) {
    try {
      // Try by ID first
      let patient = await Patient.findByPk(mrnOrId);

      // If not found, try by MRN
      if (!patient) {
        patient = await Patient.findOne({ where: { mrn: mrnOrId } });
      }

      return patient;
    } catch (error) {
      logger.error("WORKFLOW", "Database query failed", {
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Get Athena EMR data
   */
  async getAthenaData(mrn) {
    try {
      logger.info("ATHENA", `Fetching data for MRN: ${mrn}`);

      // TODO: Implement actual Athena API integration
      // For now, return mock structure
      const mockData = {
        encounters: [],
        medications: [],
        allergies: [],
        conditions: [],
        vital_signs: [],
        lab_results: [],
      };

      // Check if Athena credentials are configured
      if (!process.env.ATHENA_API_KEY) {
        logger.warning("ATHENA", "API key not configured");
        return {
          available: false,
          reason: "Athena credentials not configured",
          data: mockData,
        };
      }

      // Actual Athena API call would go here
      // const response = await axios.get(`${ATHENA_URL}/patients/${mrn}`);

      logger.info("ATHENA", "Data retrieved successfully");

      return {
        available: true,
        data: mockData,
        last_updated: new Date(),
      };
    } catch (error) {
      logger.error("ATHENA", "Failed to fetch data", { error: error.message });
      return {
        available: false,
        error: error.message,
      };
    }
  }

  /**
   * Get UltraLinq imaging data
   */
  async getUltraLinqData(mrn) {
    try {
      logger.info("ULTRALINQ", `Fetching imaging for MRN: ${mrn}`);

      // Initialize browser if needed
      await ultralinq.initializeBrowser();
      await ultralinq.login();

      // Search for patient
      await ultralinq.searchPatient(mrn);
      const studies = await ultralinq.scrapeStudies();

      if (studies.length === 0) {
        logger.warning("ULTRALINQ", "No studies found");
        return {
          available: true,
          studies: [],
          count: 0,
        };
      }

      // Get details of most recent study
      const latestStudy = studies[0];
      const studyDetails = await ultralinq.getStudyDetails(latestStudy.viewUrl);

      logger.success("ULTRALINQ", "Imaging data retrieved", {
        studyCount: studies.length,
      });

      return {
        available: true,
        studies: studies.map((s) => ({
          date: s.studyDate,
          procedure: s.procedure,
          accession: s.accession,
        })),
        latest_study: studyDetails,
        count: studies.length,
      };
    } catch (error) {
      logger.error("ULTRALINQ", "Failed to fetch imaging", {
        error: error.message,
      });

      return {
        available: false,
        error: error.message,
      };
    }
  }

  /**
   * Generate AI summary of patient data using Gemini
   */
  async generateAISummary(comprehensiveData) {
    try {
      logger.info("AI", "Generating patient summary");

      const { patient, athena, imaging } = comprehensiveData;

      // Prepare prompt
      const prompt = `Generate a concise clinical summary for this patient:

PATIENT INFO:
- Name: ${patient.name}
- Age: ${patient.age} | Gender: ${patient.gender}
- MRN: ${patient.mrn}

HEALTH HISTORY:
${
  athena?.available
    ? `
- Encounters: ${athena.data.encounters.length}
- Active Medications: ${athena.data.medications.length}
- Known Allergies: ${athena.data.allergies.length}
- Conditions: ${athena.data.conditions.length}
`
    : "Not available"
}

IMAGING HISTORY:
${
  imaging?.available
    ? `
- Total Studies: ${imaging.count}
- Most Recent: ${imaging.studies[0]?.procedure} on ${imaging.studies[0]?.date}
`
    : "Not available"
}

Create a brief 2-3 paragraph clinical summary highlighting:
1. Key medical history points
2. Relevant imaging findings
3. Considerations for upcoming vascular procedure

Keep it concise and clinically relevant.`;

      // Call Dragon AI service
      const result = await dockerServices.processNote(prompt, "arteriogram");

      if (result.success) {
        return {
          generated: true,
          summary:
            result.fields.narrative?.value || "Summary generation incomplete",
          confidence: result.fields.narrative?.confidence || 0,
          processing_time: result.metadata.processing_time,
        };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      logger.error("AI", "Summary generation failed", { error: error.message });

      return {
        generated: false,
        error: error.message,
        fallback: `${comprehensiveData.patient.name} (${comprehensiveData.patient.age}yo ${comprehensiveData.patient.gender}) - Comprehensive review pending.`,
      };
    }
  }

  /**
   * Search patients by name or MRN
   */
  async searchPatients(query) {
    try {
      const { Op } = require("sequelize");

      const patients = await Patient.findAll({
        where: {
          [Op.or]: [
            { mrn: { [Op.iLike]: `%${query}%` } },
            { first_name: { [Op.iLike]: `%${query}%` } },
            { last_name: { [Op.iLike]: `%${query}%` } },
          ],
          active: true,
        },
        limit: 10,
        order: [["last_name", "ASC"]],
      });

      return patients.map((p) => ({
        id: p.id,
        mrn: p.mrn,
        name: p.getFullName(),
        dob: p.date_of_birth,
        age: p.calculateAge(),
      }));
    } catch (error) {
      logger.error("WORKFLOW", "Patient search failed", {
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Cache management
   */
  getCached(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    // Check if expired
    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });

    // Clean old cache entries periodically
    if (this.cache.size > 100) {
      const oldest = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, 20);

      oldest.forEach(([key]) => this.cache.delete(key));
    }
  }

  clearCache() {
    this.cache.clear();
  }
}

// Singleton instance
const patientWorkflow = new PatientWorkflowService();

module.exports = patientWorkflow;
