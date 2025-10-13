#!/usr/bin/env python3
"""
Dragon Dictation - Headless Server Mode
No GUI - runs as background service
Perfect for SSH/Tailscale access
"""
import argparse
import json
import os
import sys
import tempfile
import threading
import asyncio
from datetime import datetime
from pathlib import Path

# Core Libraries (NO TKINTER!)
import numpy as np
import sounddevice as sd
import soundfile as sf
from pynput import keyboard

# Import our custom modules
from vascular_commands import VascularCommandParser
from websocket_client import WebSocketClient

try:
    from faster_whisper import WhisperModel
except ImportError:
    print("\n[ERROR] faster-whisper not installed. Run: pip install faster-whisper\n", file=sys.stderr)
    sys.exit(1)

# --- Configuration ---
DEFAULT_SR = 16000
CHANNELS = 1
TOGGLE_KEY = 'r'
CONFIG_DIR = Path("config")


class HeadlessDragonServer:
    """Dragon Dictation in headless server mode - no GUI needed"""
    
    def __init__(self, model_size="small.en", device="auto", compute_type="default", 
                 backend_uri="ws://localhost:3000"):
        self.is_recording = False
        self.recorder = Recorder()
        self.macros = self._load_json(CONFIG_DIR / "macros.json")
        self.hotwords = self._load_hotwords(CONFIG_DIR / "hotwords.txt")
        self.current_buffer = ""
        self.current_procedure_id = None
        
        # Initialize command parser
        self.parser = VascularCommandParser()
        
        # Initialize WebSocket client
        self.ws_client = WebSocketClient(uri=backend_uri)
        self.ws_connected = False
        
        print(f"🔄 Loading Whisper model '{model_size}'...")
        self.model = WhisperModel(model_size, device=device, compute_type=compute_type)
        print("✅ Model loaded successfully.")

    def _load_json(self, path: Path) -> dict:
        if not path.exists(): 
            print(f"⚠️ Warning: {path} not found")
            return {}
        with open(path, "r", encoding="utf-8") as f: 
            return json.load(f)

    def _load_hotwords(self, path: Path) -> list:
        if not path.exists(): 
            print(f"⚠️ Warning: {path} not found")
            return []
        with open(path, "r", encoding="utf-8") as f: 
            return [line.strip() for line in f if line.strip()]

    async def connect_to_backend(self):
        """Connect to backend server via WebSocket"""
        try:
            await self.ws_client.connect()
            self.ws_connected = True
            print("✅ Connected to backend server")
        except Exception as e:
            print(f"❌ Failed to connect to backend: {e}")
            print("⚠️ Running in offline mode")
            self.ws_connected = False

    def toggle_recording(self):
        if self.is_recording:
            # --- Stop Recording ---
            print("🔄 Transcribing...")
            self.is_recording = False
            audio_file = self.recorder.stop_recording()
            if audio_file:
                self.transcribe_and_process(audio_file)
        else:
            # --- Start Recording ---
            print("🔴 Recording... (press 'r' again to stop)")
            self.is_recording = True
            self.recorder.start_recording()
            
    def transcribe_and_process(self, audio_path: str):
        """Transcribe audio and process command"""
        try:
            initial_prompt = ", ".join(self.hotwords)
            segments, _ = self.model.transcribe(
                audio_path, 
                beam_size=5, 
                initial_prompt=initial_prompt
            )
            
            full_text = "".join(segment.text for segment in segments).strip()
            print(f"\n🎙️ Transcribed: {full_text}")
            
            # Send to backend if connected
            if self.ws_connected:
                asyncio.run(self.ws_client.send_transcription(full_text))
            
            # Process command
            self.process_command(full_text)
            
            print("\n✅ Ready (press 'r' to record)")
            
        except Exception as e:
            print(f"❌ Error transcribing: {e}")
        finally:
            if os.path.exists(audio_path):
                os.remove(audio_path)

    def process_command(self, text: str):
        """Process transcribed text for commands"""
        # Try to parse as vascular command
        result = self.parser.parse(text)
        
        if result:
            command_type, params = result
            print(f"✅ Command: {command_type}")
            print(f"   Params: {params}")
            
            # Handle different command types
            if command_type == "insert_macro":
                self.handle_insert_macro(params)
            
            elif command_type == "set_field":
                self.handle_set_field(params)
            
            elif command_type == "set_vessel_field":
                self.handle_set_vessel_field(params)
            
            elif command_type == "save_procedure":
                if self.ws_connected:
                    asyncio.run(self.save_procedure())
                else:
                    print("⚠️ Cannot save - backend not connected")
            
            elif command_type == "clear_buffer":
                self.current_buffer = ""
                print("🗑️ Buffer cleared")
            
            elif command_type == "show_fields":
                self.show_remaining_fields()
            
            # Send command to backend
            if self.ws_connected:
                asyncio.run(self.ws_client.send_command(command_type, params))
        
        else:
            # Not a command, just append text
            self.current_buffer += " " + text
            print(f"📝 Added to buffer")

    def handle_insert_macro(self, params):
        """Insert a macro template"""
        macro_name = params.get("macro_name", "vascular_procedure")
        
        if macro_name in self.macros:
            template = self.macros[macro_name]
            if "{date}" in template:
                template = template.replace(
                    "{date}", 
                    datetime.now().strftime("%B %d, %Y")
                )
            
            self.current_buffer = template
            print(f"✅ Loaded template: {macro_name}")
        else:
            print(f"❌ Macro not found: {macro_name}")

    def handle_set_field(self, params):
        """Set a standard procedure field"""
        field = params.get("field")
        value = params.get("value")
        placeholder = f"{{{field}}}"
        
        if placeholder in self.current_buffer:
            self.current_buffer = self.current_buffer.replace(placeholder, value, 1)
            print(f"✅ Set {field} = {value}")
        else:
            print(f"⚠️ Field {field} not found in buffer")

    def handle_set_vessel_field(self, params):
        """Set a vessel-specific field"""
        vessel = params.get("vessel")
        prop = params.get("property")
        value = params.get("value")
        
        placeholder = f"{{{vessel}_{prop}}}"
        
        if placeholder in self.current_buffer:
            self.current_buffer = self.current_buffer.replace(placeholder, value, 1)
            print(f"✅ Set {vessel} {prop} = {value}")
        else:
            # Try alternate format
            alt_placeholder = f"{{{vessel}}}"
            if alt_placeholder in self.current_buffer:
                vessel_text = f"Occlusion: {value}" if prop == "occlusion_length" else f"Treatment: {value}"
                self.current_buffer = self.current_buffer.replace(alt_placeholder, vessel_text, 1)
                print(f"✅ Updated {vessel}")
            else:
                print(f"⚠️ Field {vessel}_{prop} not found in buffer")

    def show_remaining_fields(self):
        """Show remaining unfilled fields"""
        import re
        fields = re.findall(r'\{([^}]+)\}', self.current_buffer)
        
        if fields:
            print(f"\n📋 Remaining fields ({len(fields)}):")
            for field in fields[:10]:
                print(f"   • {field}")
            if len(fields) > 10:
                print(f"   ... and {len(fields) - 10} more")
        else:
            print("✅ All fields filled!")

    async def save_procedure(self):
        """Save procedure to backend database"""
        try:
            await self.ws_client.send_command("save_procedure", {
                "narrative": self.current_buffer,
                "status": "completed"
            })
            
            print("✅ Procedure saved to database!")
        except Exception as e:
            print(f"❌ Error saving procedure: {e}")

    def start(self):
        """Start the headless server"""
        # Connect to backend
        asyncio.run(self.connect_to_backend())
        
        print("\n" + "="*60)
        print("🏥 Dragon Dictation - Headless Server Mode")
        print("="*60)
        print(f"🔌 Backend: {'Connected ✅' if self.ws_connected else 'Offline ⚠️'}")
        print("🎤 Press 'r' to toggle recording")
        print("🖥️ No GUI - running in terminal")
        print("="*60 + "\n")
        print("✅ Ready (press 'r' to record)\n")
        
        # Start keyboard listener
        self.start_keyboard_listener()

    def start_keyboard_listener(self):
        """Listen for keyboard input"""
        def on_press(key):
            try:
                if key.char == TOGGLE_KEY:
                    self.toggle_recording()
            except AttributeError:
                pass
        
        with keyboard.Listener(on_press=on_press) as listener:
            listener.join()


class Recorder:
    """Simple audio recorder"""
    def __init__(self, samplerate=DEFAULT_SR, channels=CHANNELS):
        self.samplerate = samplerate
        self.channels = channels
        self._frames = []
        self._stream = None

    def start_recording(self):
        self._frames = []
        self._stream = sd.InputStream(
            samplerate=self.samplerate,
            channels=self.channels,
            callback=lambda d, f, t, s: self._frames.append(d.copy()),
            dtype='float32'
        )
        self._stream.start()

    def stop_recording(self):
        if not self._stream: 
            return None
        self._stream.stop()
        self._stream.close()

        if not self._frames: 
            return None
        audio_data = np.concatenate(self._frames, axis=0)
        temp_file = tempfile.mktemp(suffix=".wav", prefix="dictation_")
        sf.write(temp_file, audio_data, self.samplerate)
        return temp_file


def main():
    parser = argparse.ArgumentParser(
        description="Dragon Dictation - Headless Server Mode (No GUI)"
    )
    parser.add_argument(
        "--model", 
        default="small.en", 
        help="Faster-Whisper model size"
    )
    parser.add_argument(
        "--device", 
        default="auto", 
        help="Device ('cpu', 'cuda', 'auto')"
    )
    parser.add_argument(
        "--compute_type", 
        default="default", 
        help="Compute type"
    )
    parser.add_argument(
        "--backend", 
        default="ws://localhost:3000",
        help="Backend WebSocket URI (use Tailscale IP if remote)"
    )
    args = parser.parse_args()

    server = HeadlessDragonServer(
        model_size=args.model,
        device=args.device,
        compute_type=args.compute_type,
        backend_uri=args.backend
    )
    
    try:
        server.start()
    except KeyboardInterrupt:
        print("\n\n👋 Shutting down gracefully...")
        sys.exit(0)


if __name__ == "__main__":
    main()