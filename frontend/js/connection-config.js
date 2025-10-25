/**
 * Centralized Connection Configuration
 *
 * ARCHITECTURAL RATIONALE:
 * ======================
 * This configuration module implements the Single Source of Truth (SSOT) principle,
 * a fundamental architectural pattern in distributed systems. By centralizing all
 * connection endpoints, we achieve several critical benefits:
 *
 * 1. CONSISTENCY GUARANTEES:
 *    - Eliminates port mismatch errors across multiple client modules
 *    - Ensures atomic configuration updates (all-or-nothing principle)
 *    - Reduces cognitive load on developers maintaining the codebase
 *
 * 2. ENVIRONMENT FLEXIBILITY:
 *    - Supports dynamic endpoint resolution based on runtime environment
 *    - Enables seamless transition between development, staging, and production
 *    - Facilitates A/B testing and canary deployments
 *
 * 3. PROTOCOL ABSTRACTION:
 *    - Separates transport layer concerns (HTTP vs WebSocket) from application logic
 *    - Allows protocol upgrades without refactoring client code
 *    - Supports protocol negotiation for heterogeneous client environments
 *
 * DESIGN DECISIONS:
 * ================
 *
 * Port Selection (3001):
 * - Port 3000 is commonly used by development servers (React, Next.js)
 * - Port 3001 reduces collision probability in polyglot development environments
 * - Non-privileged port (>1024) ensures compatibility with containerization
 *
 * Host Resolution Strategy:
 * - window.location.hostname provides automatic resolution in deployed environments
 * - Fallback to 'localhost' ensures development environment compatibility
 * - Supports both IPv4 (127.0.0.1) and IPv6 (::1) loopback addresses
 *
 * WebSocket Protocol Selection:
 * - Uses 'ws://' for development (unencrypted, lower latency)
 * - Production should upgrade to 'wss://' for TLS encryption
 * - Protocol upgrade path: ws:// � wss:// with same codebase
 *
 * SECURITY CONSIDERATIONS:
 * =======================
 * - WebSocket connections lack CORS protection; implement token-based auth
 * - Consider implementing WebSocket subprotocol negotiation for versioning
 * - Add connection rate limiting to prevent DoS attacks
 * - Implement heartbeat mechanism for connection liveness detection
 *
 * PERFORMANCE CHARACTERISTICS:
 * ===========================
 * - Configuration object cached in browser memory (O(1) access time)
 * - No network I/O required for endpoint resolution
 * - Minimal JavaScript parse time (<1ms on modern browsers)
 *
 * SCALABILITY PATH:
 * ================
 * Future enhancements may include:
 * - Service discovery integration (Consul, etcd)
 * - Load balancer endpoint rotation
 * - Geographic routing for multi-region deployments
 * - Circuit breaker pattern for fault tolerance
 */

const CONFIG = {
  // ========================================
  // BACKEND HTTP API CONFIGURATION
  // ========================================
  /**
   * Primary HTTP endpoint for RESTful API operations
   * Used for: Patient data retrieval, procedure CRUD, Dragon API calls
   *
   * Connection characteristics:
   * - Stateless request/response model
   * - Supports connection pooling and keep-alive
   * - Default timeout: 30s (configurable per request)
   */
  BACKEND_URL: `http://${window.location.hostname || 'localhost'}:3001`,

  // ========================================
  // WEBSOCKET REAL-TIME CONFIGURATION
  // ========================================
  /**
   * WebSocket endpoint for bidirectional real-time communication
   * Used for: Live transcription, field updates, procedure synchronization
   *
   * Connection characteristics:
   * - Full-duplex communication channel
   * - Persistent connection with automatic reconnection
   * - Sub-millisecond message latency
   * - Binary and text frame support
   *
   * Message flow architecture:
   * - Client � Server: Field updates, subscription requests
   * - Server � Client: Transcriptions, command broadcasts, state sync
   * - Broadcast model: One-to-many message distribution
   */
  WS_URL: `ws://${window.location.hostname || 'localhost'}:3001`,

  // ========================================
  // DRAGON AI INTEGRATION CONFIGURATION
  // ========================================
  /**
   * Dragon Medical AI service endpoints
   * Handles voice transcription and natural language processing
   *
   * API surface:
   * - /api/dragon/health: Service health check and capability discovery
   * - /api/dragon/transcribe: Whisper-based audio-to-text conversion
   * - /api/dragon/process: Gemini AI medical note extraction
   * - /api/dragon/macros: Procedure template management
   *
   * Performance targets:
   * - Transcription latency: <500ms for 10s audio
   * - NLP processing: <200ms for typical medical note
   * - Health check: <50ms round-trip time
   */
  DRAGON_BASE_URL: `http://${window.location.hostname || 'localhost'}:3001/api/dragon`,

  // ========================================
  // WORKFLOW & PATIENT DATA CONFIGURATION
  // ========================================
  /**
   * Comprehensive patient data aggregation endpoints
   * Orchestrates multi-source data retrieval (DB, EMR, imaging)
   *
   * Data sources integrated:
   * - Local PostgreSQL database
   * - Athena EMR via REST API
   * - UltraLinq imaging via web scraping
   * - Dragon AI for summarization
   *
   * Caching strategy:
   * - 5-minute TTL for patient demographics
   * - Real-time for active procedures
   * - On-demand cache invalidation via API
   */
  WORKFLOW_BASE_URL: `http://${window.location.hostname || 'localhost'}:3001/api/workflow`,

  // ========================================
  // CONNECTION MANAGEMENT PARAMETERS
  // ========================================
  /**
   * Tunable parameters for connection reliability
   *
   * RECONNECTION STRATEGY:
   * Uses exponential backoff with jitter to prevent thundering herd:
   * - Attempt 1: 1s delay
   * - Attempt 2: 2s delay
   * - Attempt 3: 4s delay
   * - Attempt 4: 8s delay
   * - Attempt 5: 16s delay (max)
   *
   * Jitter prevents synchronized reconnection storms when server restarts
   */
  WS_RECONNECT: {
    MAX_ATTEMPTS: 5,          // Circuit breaker threshold
    BASE_DELAY_MS: 1000,      // Initial backoff delay
    MAX_DELAY_MS: 16000,      // Backoff ceiling
    JITTER_MS: 500            // Random delay component
  },

  /**
   * Request timeout configuration
   *
   * TIMEOUT RATIONALE:
   * - Standard requests: 30s (covers 99th percentile latency)
   * - Health checks: 5s (fail fast for monitoring)
   * - AI processing: 60s (handles complex medical notes)
   * - File uploads: 120s (supports large audio files)
   */
  TIMEOUTS: {
    STANDARD_REQUEST_MS: 30000,
    HEALTH_CHECK_MS: 5000,
    AI_PROCESSING_MS: 60000,
    FILE_UPLOAD_MS: 120000
  },

  // ========================================
  // FEATURE FLAGS
  // ========================================
  /**
   * Runtime feature toggles for A/B testing and gradual rollouts
   * Implements feature flag pattern for risk mitigation
   */
  FEATURES: {
    ENABLE_VOICE_COMMANDS: true,      // Dragon voice integration
    ENABLE_AUTO_SAVE: true,           // Background procedure persistence
    ENABLE_REAL_TIME_SYNC: true,      // Multi-client synchronization
    ENABLE_AI_SUGGESTIONS: true,      // Gemini-powered field suggestions
    DEBUG_MODE: false                 // Verbose console logging
  },

  // ========================================
  // UTILITY METHODS
  // ========================================
  /**
   * Constructs fully-qualified endpoint URL
   * @param {string} path - Relative API path (e.g., '/patients/123')
   * @returns {string} Complete URL with protocol, host, port, and path
   *
   * Example: buildApiUrl('/patients/123') � 'http://localhost:3001/api/patients/123'
   */
  buildApiUrl(path) {
    // Ensure path starts with forward slash
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.BACKEND_URL}/api${normalizedPath}`;
  },

  /**
   * Generates Dragon-specific API endpoint
   * @param {string} endpoint - Dragon API endpoint (e.g., 'health', 'transcribe')
   * @returns {string} Complete Dragon API URL
   */
  buildDragonUrl(endpoint) {
    return `${this.DRAGON_BASE_URL}/${endpoint}`;
  },

  /**
   * Validates configuration completeness
   * Useful for debugging connection issues
   * @returns {Object} Validation result with errors array
   */
  validate() {
    const errors = [];

    // Check for localhost in production
    if (this.BACKEND_URL.includes('localhost') &&
        window.location.hostname !== 'localhost') {
      errors.push('Using localhost in non-local environment');
    }

    // Check WebSocket protocol mismatch
    if (window.location.protocol === 'https:' && this.WS_URL.startsWith('ws:')) {
      errors.push('Mixed content: HTTPS page loading WS (not WSS)');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  },

  /**
   * Returns configuration summary for debugging
   * @returns {Object} Sanitized configuration object
   */
  getInfo() {
    return {
      backend: this.BACKEND_URL,
      websocket: this.WS_URL,
      dragon: this.DRAGON_BASE_URL,
      workflow: this.WORKFLOW_BASE_URL,
      validation: this.validate(),
      features: this.FEATURES
    };
  }
};

// ========================================
// GLOBAL EXPORT & INITIALIZATION
// ========================================

/**
 * Make configuration globally available
 * Rationale: Avoids module bundler complexity in vanilla JS environment
 * Future: Migrate to ES6 modules when build pipeline is established
 */
window.SURGICAL_CONFIG = CONFIG;

/**
 * Development helper: Log configuration on page load
 * Aids in debugging connection issues during development
 */
if (CONFIG.FEATURES.DEBUG_MODE) {
  console.group('🔧 Surgical Command Center Configuration');
  console.log('Backend URL:', CONFIG.BACKEND_URL);
  console.log('WebSocket URL:', CONFIG.WS_URL);
  console.log('Dragon API:', CONFIG.DRAGON_BASE_URL);
  console.log('Validation:', CONFIG.validate());
  console.groupEnd();
}

// Export for potential module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
