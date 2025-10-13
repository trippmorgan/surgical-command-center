/**
 * WebSocket Client for Surgical Command Center Frontend
 * Connects to backend for real-time updates from Dragon dictation
 */

class SurgicalWebSocketClient {
    constructor(url = 'ws://localhost:3000') {
        this.url = url;
        this.ws = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.clientId = null;
        this.currentProcedureId = null;
        
        // Callbacks
        this.onConnectedCallback = null;
        this.onDisconnectedCallback = null;
        this.onTranscriptionCallback = null;
        this.onFieldUpdateCallback = null;
        this.onProcedureSavedCallback = null;
    }

    /**
     * Connect to WebSocket server
     */
    connect() {
        try {
            this.ws = new WebSocket(this.url);
            
            this.ws.onopen = () => this.handleOpen();
            this.ws.onmessage = (event) => this.handleMessage(event);
            this.ws.onclose = () => this.handleClose();
            this.ws.onerror = (error) => this.handleError(error);
            
        } catch (error) {
            console.error('WebSocket connection error:', error);
            this.scheduleReconnect();
        }
    }

    /**
     * Handle WebSocket open
     */
    handleOpen() {
        console.log('✅ Connected to backend WebSocket');
        this.connected = true;
        this.reconnectAttempts = 0;
        
        // Register as UI client
        this.register();
        
        // Notify callback
        if (this.onConnectedCallback) {
            this.onConnectedCallback();
        }
    }

    /**
     * Register this client with backend
     */
    register() {
        this.send({
            type: 'register',
            clientType: 'ui'
        });
    }

    /**
     * Subscribe to a specific procedure
     */
    subscribeProcedure(procedureId) {
        this.currentProcedureId = procedureId;
        this.send({
            type: 'subscribe_procedure',
            procedureId: procedureId
        });
    }

    /**
     * Send message to server
     */
    send(data) {
        if (this.connected && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            console.warn('WebSocket not connected, cannot send message');
        }
    }

    /**
     * Handle incoming messages
     */
    handleMessage(event) {
        try {
            const data = JSON.parse(event.data);
            console.log('📨 Received:', data.type);
            
            switch (data.type) {
                case 'connection':
                    console.log('Connection message:', data.message);
                    break;
                    
                case 'registered':
                    this.clientId = data.clientId;
                    console.log('✅ Registered with ID:', this.clientId);
                    break;
                    
                case 'transcription':
                    this.handleTranscription(data);
                    break;
                    
                case 'command':
                    this.handleCommand(data);
                    break;
                    
                case 'field_updated':
                    this.handleFieldUpdate(data);
                    break;
                    
                case 'procedure_saved':
                    this.handleProcedureSaved(data);
                    break;
                    
                case 'procedure_updated':
                    this.handleProcedureUpdate(data);
                    break;
                    
                default:
                    console.log('Unknown message type:', data.type);
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    }

    /**
     * Handle voice transcription
     */
    handleTranscription(data) {
        console.log('🎙️ Transcription:', data.text);
        
        // Update transcription display
        const transcriptionEl = document.getElementById('transcription-text');
        if (transcriptionEl) {
            transcriptionEl.textContent = data.text;
            
            // Fade out after 5 seconds
            setTimeout(() => {
                transcriptionEl.style.opacity = '0.5';
            }, 5000);
            
            // Reset opacity on next transcription
            transcriptionEl.style.opacity = '1';
        }
        
        if (this.onTranscriptionCallback) {
            this.onTranscriptionCallback(data.text);
        }
    }

    /**
     * Handle voice command
     */
    handleCommand(data) {
        console.log('🎤 Command:', data.command, data.params);
        
        const { command, params } = data;
        
        switch (command) {
            case 'set_field':
                this.updateFormField(params.field, params.value);
                break;
                
            case 'set_vessel_field':
                this.updateVesselField(params.vessel, params.property, params.value);
                break;
                
            case 'insert_macro':
                this.showNotification('Template loaded: ' + params.macro_name, 'success');
                break;
                
            case 'save_procedure':
                this.showNotification('Saving procedure...', 'info');
                break;
                
            case 'clear_buffer':
                this.showNotification('Buffer cleared', 'info');
                break;
        }
    }

    /**
     * Handle field update
     */
    handleFieldUpdate(data) {
        const { field, value } = data;
        this.updateFormField(field, value);
        
        if (this.onFieldUpdateCallback) {
            this.onFieldUpdateCallback(field, value);
        }
    }

    /**
     * Update a form field
     */
    updateFormField(field, value) {
        // Try to find input/select with matching name or id
        const input = document.querySelector(`[name="${field}"], #${field}`);
        
        if (input) {
            if (input.tagName === 'SELECT') {
                // Set select value
                const option = Array.from(input.options).find(opt => 
                    opt.value.toLowerCase() === value.toLowerCase()
                );
                if (option) {
                    input.value = option.value;
                }
            } else {
                // Set input value
                input.value = value;
            }
            
            // Add highlight animation
            this.highlightField(input);
            
            console.log(`✅ Updated field: ${field} = ${value}`);
        } else {
            console.warn(`Field not found: ${field}`);
        }
    }

    /**
     * Update vessel-specific field
     */
    updateVesselField(vessel, property, value) {
        // Try multiple field name patterns
        const possibleNames = [
            `${vessel}_${property}`,
            `${vessel}-${property}`,
            `vessel_${vessel}_${property}`
        ];
        
        for (const name of possibleNames) {
            const input = document.querySelector(`[name="${name}"], #${name}`);
            if (input) {
                input.value = value;
                this.highlightField(input);
                console.log(`✅ Updated vessel field: ${vessel} ${property} = ${value}`);
                return;
            }
        }
        
        console.warn(`Vessel field not found: ${vessel}.${property}`);
    }

    /**
     * Highlight a field with animation
     */
    highlightField(element) {
        element.classList.add('field-updated');
        element.style.transition = 'all 0.3s ease';
        element.style.borderColor = '#4CAF50';
        element.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
        
        setTimeout(() => {
            element.style.borderColor = '';
            element.style.backgroundColor = '';
            element.classList.remove('field-updated');
        }, 2000);
    }

    /**
     * Handle procedure saved
     */
    handleProcedureSaved(data) {
        console.log('✅ Procedure saved:', data.message);
        this.showNotification('Procedure saved successfully!', 'success');
        
        if (this.onProcedureSavedCallback) {
            this.onProcedureSavedCallback(data);
        }
    }

    /**
     * Handle procedure update
     */
    handleProcedureUpdate(data) {
        console.log('🔄 Procedure updated:', data.updates);
        // Update form with all changed fields
        Object.entries(data.updates).forEach(([field, value]) => {
            this.updateFormField(field, value);
        });
    }

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            border-radius: 8px;
            color: white;
            font-weight: 600;
            z-index: 10000;
            animation: slideIn 0.3s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        
        // Set background color based on type
        const colors = {
            success: '#4CAF50',
            error: '#f44336',
            warning: '#ff9800',
            info: '#2196F3'
        };
        notification.style.backgroundColor = colors[type] || colors.info;
        
        document.body.appendChild(notification);
        
        // Remove after 4 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }

    /**
     * Handle WebSocket close
     */
    handleClose() {
        console.log('❌ WebSocket connection closed');
        this.connected = false;
        
        if (this.onDisconnectedCallback) {
            this.onDisconnectedCallback();
        }
        
        // Attempt to reconnect
        this.scheduleReconnect();
    }

    /**
     * Handle WebSocket error
     */
    handleError(error) {
        console.error('WebSocket error:', error);
    }

    /**
     * Schedule reconnection attempt
     */
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached');
            this.showNotification('Connection lost. Please refresh the page.', 'error');
            return;
        }
        
        this.reconnectAttempts++;
        console.log(`Reconnecting in ${this.reconnectDelay/1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        setTimeout(() => {
            this.connect();
        }, this.reconnectDelay);
    }

    /**
     * Disconnect from WebSocket
     */
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
    }

    /**
     * Send field update to server
     */
    sendFieldUpdate(field, value, procedureId = null) {
        this.send({
            type: 'field_update',
            field: field,
            value: value,
            procedureId: procedureId || this.currentProcedureId
        });
    }

    /**
     * Send procedure update to server
     */
    sendProcedureUpdate(updates, procedureId = null) {
        this.send({
            type: 'procedure_update',
            procedureId: procedureId || this.currentProcedureId,
            updates: updates
        });
    }
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
    
    .field-updated {
        animation: fieldPulse 0.5s ease;
    }
    
    @keyframes fieldPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.02); }
    }
`;
document.head.appendChild(style);

// Export for use in HTML
window.SurgicalWebSocketClient = SurgicalWebSocketClient;