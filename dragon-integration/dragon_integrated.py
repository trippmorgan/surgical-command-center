#!/usr/bin/env python3
"""
Dragon Dictation - Surgical Command Center Integration
Connects voice dictation to the backend server with real-time updates
"""
import argparse
import json
import os
import sys
import tempfile
import threading
import queue
import asyncio
from datetime import datetime
from pathlib import Path

# GUI Library
import tkinter as tk
from tkinter import scrolledtext

# Core Libraries
import numpy as np
import sounddevice as sd
import soundfile as sf
from pynput import keyboard
import pyperclip

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


class IntegratedDictationApp:
    """Dragon Dictation integrated with Surgical Command Center backend"""
    
    def __init__(self, model_size="small.en", device="auto", compute_type="default", 
                 backend_uri="ws://localhost:3000"):
        self.is_recording = False
        self.recorder = Recorder()
        self.macros = self._load_json(CONFIG_DIR / "macros.json")
        self.hotwords = self._load_hotwords(CONFIG_DIR / "hotwords.txt")
        self.transcription_queue = queue.Queue()
        self.current_procedure_id = None
        
        # Initialize command parser
        self.parser = VascularCommandParser()
        
        # Initialize WebSocket client
        self.ws_client = WebSocketClient(uri=backend_uri)
        self.ws_connected = False
        
        print(f"Loading Whisper model '{model_size}'...")
        self.model = WhisperModel(model_size, device=device, compute_type=compute_type)
        print("✅ Model loaded successfully.")

        # --- GUI Setup ---
        self.root = tk.Tk()
        self.root.title("Surgical Command Center - Dragon Dictation")
        self.root.geometry("900x700")

        # Main text widget
        self.text_widget = scrolledtext.ScrolledText(
            self.root, wrap=tk.WORD, font=("Arial", 12)
        )
        self.text_widget.pack(expand=True, fill='both', padx=10, pady=5)

        # Control frame
        control_frame = tk.Frame(self.root)
        control_frame.pack(fill='x', padx=10, pady=5)
        
        # Status label
        self.status_label = tk.Label(
            control_frame, 
            text="Status: Connecting to backend...", 
            bd=1, 
            relief=tk.SUNKEN, 
            anchor=tk.W,
            fg="orange"
        )
        self.status_label.pack(side=tk.LEFT, expand=True, fill='x')

        # WebSocket status indicator
        self.ws_indicator = tk.Label(
            control_frame,
            text="⚪ Backend",
            bd=1,
            relief=tk.SUNKEN,
            width=15
        )
        self.ws_indicator.pack(side=tk.LEFT, padx=5)

        # Buttons
        copy_button = tk.Button(
            control_frame, 
            text="Copy to Clipboard", 
            command=self.copy_to_clipboard
        )
        copy_button.pack(side=tk.RIGHT, padx=2)
        
        save_button = tk.Button(
            control_frame,
            text="Save Procedure",
            command=self.save_procedure_manual,
            bg="#4CAF50",
            fg="white"
        )
        save_button.pack(side=tk.RIGHT, padx=2)

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

    def connect_to_backend(self):
        """Connect to backend server via WebSocket"""
        async def connect():
            try:
                await self.ws_client.connect()
                self.ws_connected = True
                self.root.after(0, self.update_ws_status, True)
                print("✅ Connected to backend server")
            except Exception as e:
                print(f"❌ Failed to connect to backend: {e}")
                self.root.after(0, self.update_ws_status, False)
        
        # Run in separate thread
        thread = threading.Thread(
            target=lambda: asyncio.run(connect()), 
            daemon=True
        )
        thread.start()

    def update_ws_status(self, connected: bool):
        """Update WebSocket status indicator"""
        if connected:
            self.ws_indicator.config(text="🟢 Backend", fg="green")
            self.update_status("Ready | Press 'r' to Record", "black")
        else:
            self.ws_indicator.config(text="🔴 Backend", fg="red")
            self.update_status("Backend disconnected - working offline", "red")

    def copy_to_clipboard(self):
        text_to_copy = self.text_widget.get("1.0", tk.END)
        pyperclip.copy(text_to_copy)
        self.update_status("Text copied to clipboard!", "green")

    def save_procedure_manual(self):
        """Manually save procedure via button"""
        if self.ws_connected:
            asyncio.run(self.save_procedure())
        else:
            self.update_status("Cannot save - backend not connected", "red")

    def toggle_recording(self):
        if self.is_recording:
            # --- Stop Recording ---
            self.update_status("Transcribing...", "orange")
            self.is_recording = False
            audio_file = self.recorder.stop_recording()
            if audio_file:
                threading.Thread(
                    target=self.transcribe_audio_thread, 
                    args=(audio_file,), 
                    daemon=True
                ).start()
        else:
            # --- Start Recording ---
            self.update_status("🔴 Recording...", "red")
            self.is_recording = True
            self.recorder.start_recording()
            
    def transcribe_audio_thread(self, audio_path: str):
        """Transcribe audio in background thread"""
        initial_prompt = ", ".join(self.hotwords)
        segments, _ = self.model.transcribe(
            audio_path, 
            beam_size=5, 
            initial_prompt=initial_prompt
        )
        os.remove(audio_path)
        
        full_text = "".join(segment.text for segment in segments).strip()
        self.transcription_queue.put(full_text)
    
    def process_queue(self):
        """Check queue for transcribed text"""
        try:
            text = self.transcription_queue.get_nowait()
            
            # Send raw transcription to backend
            if self.ws_connected:
                asyncio.run(self.ws_client.send_transcription(text))
            
            # Process the command
            self.process_command(text)
            
            self.update_status("Ready | Press 'r' to Record", "black")
        except queue.Empty:
            pass
        finally:
            self.root.after(100, self.process_queue)

    def process_command(self, text: str):
        """Process transcribed text for commands"""
        print(f"\n🎙️ Transcribed: {text}")
        
        # Try to parse as vascular command
        result = self.parser.parse(text)
        
        if result:
            command_type, params = result
            print(f"✅ Parsed command: {command_type} - {params}")
            
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
            
            elif command_type == "clear_buffer":
                self.text_widget.delete("1.0", tk.END)
                self.update_status("Buffer cleared", "orange")
            
            elif command_type == "show_fields":
                self.show_remaining_fields()
            
            # Send command to backend
            if self.ws_connected:
                asyncio.run(self.ws_client.send_command(command_type, params))
        
        else:
            # Not a command, just append text
            self.text_widget.insert(tk.END, " " + text)
            print("ℹ️ Appended as text")

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
            
            self.text_widget.delete("1.0", tk.END)
            self.text_widget.insert("1.0", template)
            self.update_status(f"Loaded template: {macro_name}", "green")
        else:
            self.update_status(f"Macro not found: {macro_name}", "red")

    def handle_set_field(self, params):
        """Set a standard procedure field"""
        field = params.get("field")
        value = params.get("value")
        placeholder = f"{{{field}}}"
        
        current_text = self.text_widget.get("1.0", tk.END)
        if placeholder in current_text:
            new_text = current_text.replace(placeholder, value, 1)
            self.text_widget.delete("1.0", tk.END)
            self.text_widget.insert("1.0", new_text)
            self.update_status(f"Set {field} = {value}", "green")
        else:
            self.update_status(f"Field {field} not found in template", "orange")

    def handle_set_vessel_field(self, params):
        """Set a vessel-specific field"""
        vessel = params.get("vessel")
        prop = params.get("property")
        value = params.get("value")
        
        placeholder = f"{{{vessel}_{prop}}}"
        
        current_text = self.text_widget.get("1.0", tk.END)
        if placeholder in current_text:
            new_text = current_text.replace(placeholder, value, 1)
            self.text_widget.delete("1.0", tk.END)
            self.text_widget.insert("1.0", new_text)
            self.update_status(f"Set {vessel} {prop} = {value}", "green")
        else:
            # Try alternate format
            alt_placeholder = f"{{{vessel}}}"
            if alt_placeholder in current_text:
                vessel_text = f"Occlusion: {value}" if prop == "occlusion_length" else f"Treatment: {value}"
                new_text = current_text.replace(alt_placeholder, vessel_text, 1)
                self.text_widget.delete("1.0", tk.END)
                self.text_widget.insert("1.0", new_text)
                self.update_status(f"Updated {vessel}", "green")

    def show_remaining_fields(self):
        """Show remaining unfilled fields"""
        import re
        current_text = self.text_widget.get("1.0", tk.END)
        fields = re.findall(r'\{([^}]+)\}', current_text)
        
        if fields:
            fields_str = ", ".join(fields[:5])
            if len(fields) > 5:
                fields_str += f"... ({len(fields)} total)"
            self.update_status(f"Remaining fields: {fields_str}", "blue")
        else:
            self.update_status("All fields filled!", "green")

    async def save_procedure(self):
        """Save procedure to backend database"""
        try:
            # Get current text
            procedure_text = self.text_widget.get("1.0", tk.END).strip()
            
            # Send save command
            await self.ws_client.send_command("save_procedure", {
                "narrative": procedure_text,
                "status": "completed"
            })
            
            self.update_status("Procedure saved to database!", "green")
        except Exception as e:
            print(f"Error saving procedure: {e}")
            self.update_status(f"Save failed: {e}", "red")

    def update_status(self, message, color="black"):
        self.status_label.config(text=f"Status: {message}", fg=color)

    def start_app(self):
        """Start the application"""
        # Connect to backend
        self.connect_to_backend()
        
        # Start keyboard listener
        listener_thread = threading.Thread(
            target=self.start_keyboard_listener, 
            daemon=True
        )
        listener_thread.start()
        
        # Start processing queue
        self.process_queue()
        
        # Start GUI
        print("\n" + "="*60)
        print("🏥 Surgical Command Center - Dragon Dictation")
        print("="*60)
        print("✅ GUI is running")
        print("🎤 Press 'r' anywhere to toggle recording")
        print("🔌 Backend connection status shown in window")
        print("="*60 + "\n")
        
        self.root.mainloop()

    def start_keyboard_listener(self):
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
        description="Dragon Dictation - Surgical Command Center Integration"
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

    app = IntegratedDictationApp(
        model_size=args.model,
        device=args.device,
        compute_type=args.compute_type,
        backend_uri=args.backend
    )
    app.start_app()


if __name__ == "__main__":
    main()