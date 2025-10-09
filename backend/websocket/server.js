const WebSocket = require('ws');
const Procedure = require('../models/Procedure');

class WebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.clients = new Map(); // Store connected clients with metadata
    this.setupServer();
  }

  setupServer() {
    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      console.log(`✅ New WebSocket client connected: ${clientId}`);
      
      // Store client with metadata
      this.clients.set(clientId, {
        ws,
        type: 'unknown', // 'dragon', 'ui', or 'unknown'
        procedureId: null,
        connectedAt: new Date()
      });

      // Send welcome message
      this.sendToClient(ws, {
        type: 'connection',
        message: 'Connected to Surgical Command Center',
        clientId
      });

      // Handle incoming messages
      ws.on('message', (data) => {
        this.handleMessage(clientId, data);
      });

      // Handle client disconnect
      ws.on('close', () => {
        console.log(`❌ Client disconnected: ${clientId}`);
        this.clients.delete(clientId);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
      });
    });

    console.log('🔌 WebSocket server initialized');
  }

  handleMessage(clientId, data) {
    try {
      const message = JSON.parse(data);
      const client = this.clients.get(clientId);

      console.log(`📨 Message from ${clientId}:`, message.type);

      switch (message.type) {
        case 'register':
          this.handleRegister(clientId, message);
          break;
        
        case 'voice_transcription':
          this.handleVoiceTranscription(clientId, message);
          break;
        
        case 'voice_command':
          this.handleVoiceCommand(clientId, message);
          break;
        
        case 'field_update':
          this.handleFieldUpdate(clientId, message);
          break;
        
        case 'procedure_update':
          this.handleProcedureUpdate(clientId, message);
          break;
        
        case 'subscribe_procedure':
          this.handleSubscribeProcedure(clientId, message);
          break;
        
        default:
          console.log(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  handleRegister(clientId, message) {
    const client = this.clients.get(clientId);
    if (client) {
      client.type = message.clientType; // 'dragon' or 'ui'
      console.log(`✅ Client ${clientId} registered as: ${message.clientType}`);
      
      this.sendToClient(client.ws, {
        type: 'registered',
        clientId,
        clientType: message.clientType
      });
    }
  }

  handleVoiceTranscription(clientId, message) {
    // Dragon sends raw transcription
    console.log(`🎙️ Voice transcription: "${message.text}"`);
    
    // Broadcast to all UI clients
    this.broadcastToType('ui', {
      type: 'transcription',
      text: message.text,
      timestamp: new Date()
    });
  }

  handleVoiceCommand(clientId, message) {
    // Dragon sends parsed command
    console.log(`🎤 Voice command: ${message.command}`, message.params);
    
    // Broadcast to all UI clients
    this.broadcastToType('ui', {
      type: 'command',
      command: message.command,
      params: message.params,
      timestamp: new Date()
    });

    // Handle specific commands
    switch (message.command) {
      case 'set_field':
        this.handleSetFieldCommand(message.params);
        break;
      
      case 'save_procedure':
        this.handleSaveProcedureCommand(message.params);
        break;
      
      case 'clear_buffer':
        this.broadcastToType('ui', {
          type: 'clear_buffer'
        });
        break;
    }
  }

  async handleSetFieldCommand(params) {
    const { field, value, procedureId } = params;
    
    // Update procedure in database if procedureId exists
    if (procedureId) {
      try {
        const procedure = await Procedure.findByPk(procedureId);
        if (procedure) {
          await procedure.update({ [field]: value });
          
          // Broadcast update to all UI clients
          this.broadcastToType('ui', {
            type: 'field_updated',
            field,
            value,
            procedureId
          });
        }
      } catch (error) {
        console.error('Error updating field:', error);
      }
    }
  }

  async handleSaveProcedureCommand(params) {
    try {
      const { procedureId, data } = params;
      
      if (procedureId) {
        const procedure = await Procedure.findByPk(procedureId);
        if (procedure) {
          await procedure.update(data);
          
          this.broadcastToType('ui', {
            type: 'procedure_saved',
            procedureId,
            message: 'Procedure saved successfully'
          });
        }
      }
    } catch (error) {
      console.error('Error saving procedure:', error);
    }
  }

  handleFieldUpdate(clientId, message) {
    // UI client sends field update
    const { procedureId, field, value } = message;
    
    // Broadcast to other UI clients
    this.broadcastToType('ui', {
      type: 'field_updated',
      field,
      value,
      procedureId,
      source: clientId
    }, clientId); // Exclude sender
  }

  async handleProcedureUpdate(clientId, message) {
    try {
      const { procedureId, updates } = message;
      
      const procedure = await Procedure.findByPk(procedureId);
      if (procedure) {
        await procedure.update(updates);
        
        // Broadcast to all clients subscribed to this procedure
        this.broadcastToProcedure(procedureId, {
          type: 'procedure_updated',
          procedureId,
          updates
        });
      }
    } catch (error) {
      console.error('Error updating procedure:', error);
    }
  }

  handleSubscribeProcedure(clientId, message) {
    const client = this.clients.get(clientId);
    if (client) {
      client.procedureId = message.procedureId;
      console.log(`Client ${clientId} subscribed to procedure ${message.procedureId}`);
      
      this.sendToClient(client.ws, {
        type: 'subscribed',
        procedureId: message.procedureId
      });
    }
  }

  // Helper methods
  sendToClient(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  broadcastToType(clientType, data, excludeClientId = null) {
    this.clients.forEach((client, clientId) => {
      if (client.type === clientType && clientId !== excludeClientId) {
        this.sendToClient(client.ws, data);
      }
    });
  }

  broadcastToProcedure(procedureId, data) {
    this.clients.forEach((client) => {
      if (client.procedureId === procedureId) {
        this.sendToClient(client.ws, data);
      }
    });
  }

  broadcastToAll(data, excludeClientId = null) {
    this.clients.forEach((client, clientId) => {
      if (clientId !== excludeClientId) {
        this.sendToClient(client.ws, data);
      }
    });
  }

  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getConnectedClients() {
    return Array.from(this.clients.entries()).map(([id, client]) => ({
      id,
      type: client.type,
      procedureId: client.procedureId,
      connectedAt: client.connectedAt
    }));
  }
}

module.exports = WebSocketServer;