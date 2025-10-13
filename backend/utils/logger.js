/**
 * Centralized Logging System
 * Logs to console and optionally to file
 */

const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logDir = path.join(__dirname, '../logs');
        this.createLogDir();
        this.currentLogFile = this.getLogFileName();
    }

    createLogDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    getLogFileName() {
        const date = new Date().toISOString().split('T')[0];
        return path.join(this.logDir, `surgical-${date}.log`);
    }

    formatMessage(level, category, message, data = null) {
        const timestamp = new Date().toISOString();
        const dataStr = data ? `\n${JSON.stringify(data, null, 2)}` : '';
        return `[${timestamp}] [${level}] [${category}] ${message}${dataStr}`;
    }

    writeToFile(message) {
        try {
            fs.appendFileSync(this.currentLogFile, message + '\n');
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    log(level, category, message, data = null) {
        const formatted = this.formatMessage(level, category, message, data);
        
        // Console output with colors
        const colors = {
            'INFO': '\x1b[36m',    // Cyan
            'SUCCESS': '\x1b[32m', // Green
            'WARNING': '\x1b[33m', // Yellow
            'ERROR': '\x1b[31m',   // Red
            'DEBUG': '\x1b[90m'    // Gray
        };
        
        const color = colors[level] || '\x1b[0m';
        const reset = '\x1b[0m';
        
        console.log(`${color}${formatted}${reset}`);
        
        // Write to file
        this.writeToFile(formatted);
    }

    info(category, message, data) {
        this.log('INFO', category, message, data);
    }

    success(category, message, data) {
        this.log('SUCCESS', category, message, data);
    }

    warning(category, message, data) {
        this.log('WARNING', category, message, data);
    }

    error(category, message, data) {
        this.log('ERROR', category, message, data);
    }

    debug(category, message, data) {
        if (process.env.NODE_ENV === 'development') {
            this.log('DEBUG', category, message, data);
        }
    }

    // Specialized logging methods
    logWebSocket(action, clientId, data) {
        this.info('WEBSOCKET', `${action} - Client: ${clientId}`, data);
    }

    logAPI(method, endpoint, status, duration, data) {
        const message = `${method} ${endpoint} - ${status} - ${duration}ms`;
        if (status >= 400) {
            this.error('API', message, data);
        } else {
            this.info('API', message, data);
        }
    }

    logDatabase(action, table, data) {
        this.info('DATABASE', `${action} - ${table}`, data);
    }

    logDragon(action, command, data) {
        this.success('DRAGON', `${action} - ${command}`, data);
    }

    logPatient(action, mrn, data) {
        this.info('PATIENT', `${action} - MRN: ${mrn}`, data);
    }
}

// Singleton instance
const logger = new Logger();

module.exports = logger;