#!/usr/bin/env python3
"""
WebSocket Client for Dragon Dictation Integration
Connects Dragon MVP to the Surgical Command Center backend
"""
import asyncio
import json
import websockets
from pathlib import Path
from typing import Optional, Dict, Any
import logging

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class WebSocketClient:
    """WebSocket client to connect Dragon dictation to backend server"""
    
    def __init__(self, uri: str = "ws://localhost:3000", client_type: str = "dragon"):
        self.uri = uri
        self.client_type = client_type
        self.websocket = None
        self.connected = False
        self.client_id = None
        
    async def connect(self):
        """Establish WebSocket connection to backend"""
        try:
            self.websocket = await websockets.connect(self.uri)
            self.connected = True
            logger.info(f"✅ Connected to backend at {self.uri}")
            
            # Register as Dragon client
            await self.register()
            
            # Start listening for responses
            asyncio.create_task(self.listen())
            
        except Exception as e:
            logger.error(f"❌ Failed to connect: {e}")
            self.connected = False
            raise
    
    async def register(self):
        """Register this client with the backend"""
        message = {
            "type": "register",
            "clientType": self.client_type
        }
        await self.send(message)
        logger.info(f"📝 Registered as '{self.client_type}' client")
    
    async def send(self, message: Dict[str, Any]):
        """Send message to backend"""
        if not self.connected or not self.websocket:
            logger.warning("⚠️ Not connected to backend")
            return
        
        try:
            await self.websocket.send(json.dumps(message))
            logger.debug(f"📤 Sent: {message.get('type')}")
        except Exception as e:
            logger.error(f"❌ Error sending message: {e}")
    
    async def send_transcription(self, text: str):
        """Send raw transcription to backend"""
        message = {
            "type": "voice_transcription",
            "text": text,
            "timestamp": asyncio.get_event_loop().time()
        }
        await self.send(message)
        logger.info(f"🎙️ Transcription sent: {text[:50]}...")
    
    async def send_command(self, command: str, params: Dict[str, Any]):
        """Send parsed voice command to backend"""
        message = {
            "type": "voice_command",
            "command": command,
            "params": params,
            "timestamp": asyncio.get_event_loop().time()
        }
        await self.send(message)
        logger.info(f"🎤 Command sent: {command}")
    
    async def send_field_update(self, field: str, value: Any, procedure_id: Optional[str] = None):
        """Send field update to backend"""
        message = {
            "type": "field_update",
            "field": field,
            "value": value,
            "procedureId": procedure_id
        }
        await self.send(message)
    
    async def listen(self):
        """Listen for messages from backend"""
        try:
            async for message in self.websocket:
                data = json.loads(message)
                await self.handle_message(data)
        except websockets.exceptions.ConnectionClosed:
            logger.warning("⚠️ Connection closed by server")
            self.connected = False
        except Exception as e:
            logger.error(f"❌ Error in listen loop: {e}")
    
    async def handle_message(self, data: Dict[str, Any]):
        """Handle incoming messages from backend"""
        msg_type = data.get("type")
        
        if msg_type == "connection":
            logger.info(f"✅ {data.get('message')}")
            
        elif msg_type == "registered":
            self.client_id = data.get("clientId")
            logger.info(f"✅ Registered with ID: {self.client_id}")
            
        elif msg_type == "field_updated":
            field = data.get("field")
            value = data.get("value")
            logger.info(f"✅ Field updated: {field} = {value}")
            
        elif msg_type == "procedure_saved":
            logger.info(f"✅ Procedure saved: {data.get('message')}")
            
        else:
            logger.debug(f"📨 Received: {msg_type}")
    
    async def close(self):
        """Close WebSocket connection"""
        if self.websocket:
            await self.websocket.close()
            self.connected = False
            logger.info("🔌 Disconnected from backend")


async def test_connection():
    """Test WebSocket connection"""
    client = WebSocketClient()
    
    try:
        await client.connect()
        
        # Test transcription
        await client.send_transcription("Test transcription from Dragon")
        
        # Test command
        await client.send_command("set_field", {
            "field": "procedure_side",
            "value": "left"
        })
        
        # Keep connection alive for a bit
        await asyncio.sleep(5)
        
    except Exception as e:
        logger.error(f"Test failed: {e}")
    finally:
        await client.close()


if __name__ == "__main__":
    print("🔌 Testing WebSocket Connection...")
    print("Make sure backend server is running at http://localhost:3000")
    print("")
    asyncio.run(test_connection())