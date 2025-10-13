#!/usr/bin/env python3
"""
Dragon Dictation - SSH Server Mode
No GUI, No keyboard hooks - perfect for SSH/Tailscale
Control via terminal input or HTTP API
"""
import argparse
import json
import os
import sys
import tempfile
import threading
import asyncio
import time
from datetime import datetime
from pathlib import Path

# Core Libraries (NO TKINTER, NO PYNPUT!)
import numpy as np
import sounddevice as sd
import soundfile as sf

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
CONFIG_DIR = Path("config")


class SSHDragonServer:
    """Dragon Dictation for SSH - controlled via terminal commands"""
    
    def __init__(self, model_size="small.en", device="auto", compute_type="default", 
                 backend_uri="ws://localhost:3000"):
        self.is_recording = False
        self.recorder = Recorder()
        self.macros = self._load_json(CONFIG_DIR / "macros.json")
        self.hotwords = self._load_hotwords(CONFIG_DIR / "hotwords.txt")
        self.current_buffer = ""
        self.current_procedure_id = None
        self.running = True
        
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
            print(f"⚠️ Backend connection failed: {e}")
            print("⚠️ Running in offline mode - commands won't sync to UI")
            self.ws_connected = False

    def start_recording(self):
        """Start recording audio"""
        if self.is_recording:
            print("⚠️ Already recording!")
            return
        
        print("🔴 Recording... (type 'stop' or press Ctrl+C when done)")
        self.is_recording = True
        self.recorder.start_recording()
    
    def stop_recording(self):
        """Stop recording and transcribe"""
        if not self.is_recording:
            print("⚠️ Not currently recording!")
            return
        
        print("🔄 Stopping recording and transcribing...")
        self.is_recording = False
        audio_file = self.recorder.stop_recording()
        
        if audio_file:
            self.transcribe_and_process(audio_file)
        else:
            print("❌ No audio recorded")
            
    def transcribe_and_process(self, audio_path: str):
        """Transcribe audio and process command"""
        try:
            print("🔄 Transcribing (this may take a moment)...")
            initial_prompt = ", ".join(self.hotwords)
            segments, _ = self.model.transcribe(
                audio_path, 
                beam_size=5, 
                initial_prompt=initial_prompt
            )
            
            full_text = "".join(segment.text for segment in segments).strip()
            print(f"\n🎙️ Transcribed: \"{full_text}\"")
            
            # Send to backend if connected
            if self.ws_connected:
                asyncio.run(self.ws_client.send_transcription(full_text))
            
            # Process command
            self.process_command(full_text)
            
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
            print(f"✅ Parsed Command: {command_type}")
            print(f"   Parameters: {params}")
            
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
            print(f"📄 Buffer preview: {template[:100]}...")
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
            for i, field in enumerate(fields[:10], 1):
                print(f"   {i}. {field}")
            if len(fields) > 10:
                print(f"   ... and {len(fields) - 10} more")
        else:
            print("✅ All fields filled!")

    def view_buffer(self):
        """View current buffer"""
        if self.current_buffer:
            print("\n" + "="*60)
            print("CURRENT BUFFER:")
            print("="*60)
            print(self.current_buffer)
            print("="*60 + "\n")
        else:
            print("📭 Buffer is empty")

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

    def print_help(self):
        """Print available commands"""
        print("\n" + "="*60)
        print("AVAILABLE COMMANDS:")
        print("="*60)
        print("  record, r      - Start recording")
        print("  stop, s        - Stop recording and transcribe")
        print("  view, v        - View current buffer")
        print("  fields, f      - Show remaining fields")
        print("  save           - Save procedure to database")
        print("  clear          - Clear buffer")
        print("  help, h, ?     - Show this help")
        print("  quit, q, exit  - Exit program")
        print("="*60 + "\n")

    def run_interactive(self):
        """Run in interactive terminal mode"""
        # Connect to backend
        asyncio.run(self.connect_to_backend())
        
        print("\n" + "="*60)
        print("🏥 Dragon Dictation - SSH Server Mode")
        print("="*60)
        print(f"🔌 Backend: {'Connected ✅' if self.ws_connected else 'Offline ⚠️'}")
        print("🎤 Terminal control mode")
        print("💻 Type 'help' for commands")
        print("="*60 + "\n")
        
        self.print_help()
        
        print("✅ Ready! Type a command:\n")
        
        # Main command loop
        while self.running:
            try:
                cmd = input(">>> ").strip().lower()
                
                if not cmd:
                    continue
                
                if cmd in ['record', 'r']:
                    self.start_recording()
                
                elif cmd in ['stop', 's']:
                    self.stop_recording()
                
                elif cmd in ['view', 'v']:
                    self.view_buffer()
                
                elif cmd in ['fields', 'f']:
                    self.show_remaining_fields()
                
                elif cmd == 'save':
                    if self.ws_connected:
                        asyncio.run(self.save_procedure())
                    else:
                        print("⚠️ Cannot save - backend not connected")
                
                elif cmd == 'clear':
                    self.current_buffer = ""
                    print("🗑️ Buffer cleared")
                
                elif cmd in ['help', 'h', '?']:
                    self.print_help()
                
                elif cmd in ['quit', 'q', 'exit']:
                    print("\n👋 Shutting down...")
                    self.running = False
                
                else:
                    print(f"❌ Unknown command: '{cmd}'. Type 'help' for available commands.")
            
            except KeyboardInterrupt:
                if self.is_recording:
                    print("\n")
                    self.stop_recording()
                else:
                    print("\n\n👋 Shutting down...")
                    self.running = False
            
            except EOFError:
                print("\n\n👋 Shutting down...")
                self.running = False


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
        description="Dragon Dictation - SSH Server Mode (No GUI, No keyboard hooks)"
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
        help="Backend WebSocket URI"
    )
    args = parser.parse_args()

    server = SSHDragonServer(
        model_size=args.model,
        device=args.device,
        compute_type=args.compute_type,
        backend_uri=args.backend
    )
    
    server.run_interactive()


if __name__ == "__main__":
    main()