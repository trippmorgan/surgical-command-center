# 🎙️ Dragon Dictation - Surgical Command Center Integration

Voice-activated vascular procedure documentation with real-time backend synchronization.

## 🎯 What This Does

Connects your Dragon Dictation MVP to the Surgical Command Center backend, enabling:
- **Voice-activated form filling** - Speak to populate procedure fields
- **Real-time synchronization** - Changes instantly appear in web UI
- **Automatic database storage** - Procedures saved to PostgreSQL
- **Smart command parsing** - Understands vascular procedure terminology
- **Template system** - Load procedure templates via voice

## 📁 Files Overview

```
dragon-integration/
├── dragon_integrated.py          # Main integrated app (use this!)
├── dragon_mvp.py                 # Original standalone version
├── websocket_client.py           # Backend WebSocket connection
├── vascular_commands.py          # Voice command parser
├── config/
│   ├── macros.json               # Procedure templates
│   ├── field_mappings.json       # Voice → field mappings
│   ├── vascular_macro.json       # Vascular template
│   └── hotwords.txt              # Medical vocabulary
├── requirements.txt              # Python dependencies
└── README.md                     # This file
```

## 🚀 Setup

### 1. Install Dependencies

```bash
# Activate your conda environment
conda activate surgical_backend

# Install Python packages
pip install -r requirements.txt
```

### 2. Verify Backend is Running

```bash
# In another terminal, make sure backend is running
cd ../backend
npm run dev

# You should see: "Ready for connections! 🚀"
```

### 3. Start Integrated Dragon

```bash
# Start the integrated version
python dragon_integrated.py --model small.en

# Or use the original standalone (no backend connection)
python dragon_mvp.py --model small.en
```

## 🎤 Voice Commands

### Load Templates

```
"insert vascular procedure"
"insert bilateral arteriogram"
"insert shuntogram"
```

### Set Procedure Fields

```
"set procedure side to left"
"set access to femoral"
"set sheath size to 5 french"
"set closure to mynx"
```

### Set Vessel Information

```
"set superficial femoral occlusion to 8 centimeters"
"set superficial femoral treatment to PTA and stent"
"set common iliac TASC to C"
"set external iliac calcification to moderate"
```

### Control Commands

```
"save procedure"           # Save to database
"clear buffer"            # Start over
"show fields"             # List remaining fields
```

## 📊 Example Workflow

1. **Start recording**: Press **R** key
2. **Say**: *"insert vascular procedure"*
3. **Release**: Press **R** again
   - ✅ Template loads in window
   - 🔌 Backend notified

4. **Press R**: Start recording
5. **Say**: *"set procedure side to left"*
6. **Release R**
   - ✅ Field updates in window
   - 🔌 Backend updated
   - 🌐 Web UI updates in real-time

7. **Continue filling fields** via voice

8. **Save**: Say *"save procedure"* or click button
   - 💾 Saved to PostgreSQL
   - ✅ Confirmation shown

## 🔧 Configuration

### Backend Connection

Edit in `dragon_integrated.py` or use command line:

```bash
python dragon_integrated.py --backend ws://localhost:3000
```

### Whisper Model

Choose model size based on your hardware:

```bash
# Fastest (less accurate)
python dragon_integrated.py --model tiny.en

# Balanced (recommended)
python dragon_integrated.py --model small.en

# Best accuracy (slower)
python dragon_integrated.py --model medium.en
```

### Add Custom Vocabulary

Edit `config/hotwords.txt`:

```
aneurysm
endoleak
graft
deployment
```

### Add Custom Macros

Edit `config/macros.json`:

```json
{
  "my_custom_template": "Your template text with {placeholders}"
}
```

## 🐛 Troubleshooting

### "Failed to connect to backend"

```bash
# Check if backend is running
curl http://localhost:3000/health

# If not running, start it:
cd ../backend
npm run dev
```

### "Module not found: websockets"

```bash
pip install websockets
```

### Audio not recording

```bash
# Test microphone
python -c "import sounddevice as sd; print(sd.query_devices())"

# Check permissions (Linux)
sudo usermod -a -G audio $USER
```

### Transcription inaccurate

1. Speak closer to microphone
2. Reduce background noise
3. Use larger model: `--model medium.en`
4. Add medical terms to `hotwords.txt`

## 📖 How It Works

```
┌─────────────────────────────────────────────┐
│  Press 'R' → Record Audio                    │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  Faster-Whisper Transcribes Audio           │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  Vascular Command Parser                    │
│  "set SFA occlusion to 8 cm"                │
│  → {vessel: "superficial_femoral",          │
│      property: "occlusion_length",          │
│      value: "8 cm"}                         │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  WebSocket Client sends to Backend          │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  Backend Node.js Server                     │
│  • Validates data                           │
│  • Saves to PostgreSQL                      │
│  • Broadcasts to Web UI                     │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  Real-time Updates Everywhere               │
│  • Dragon GUI window                        │
│  • Web browser UI                           │
│  • Database                                 │
└─────────────────────────────────────────────┘
```

## 🎯 Status Indicators

| Indicator | Meaning |
|-----------|---------|
| 🟢 Backend | Connected to server |
| 🔴 Backend | Disconnected - offline mode |
| 🔴 Recording... | Currently recording audio |
| 🟠 Transcribing... | Processing audio |
| ⚪ Ready | Idle, press 'r' to record |

## 🔐 Security Notes

**Development Mode:**
- WebSocket not encrypted (ws://)
- No authentication
- Local network only

**For Production:**
- Use WSS (encrypted WebSocket)
- Implement authentication
- Enable HIPAA compliance features

## 📝 Next Steps

1. ✅ Dragon integrated with backend
2. ⏭️ Connect Web UI with WebSocket
3. ⏭️ Add real-time form field updates in browser
4. ⏭️ Add data source integrations (UltraLinq, Athena, etc.)

## 🤝 Testing

### Test WebSocket Connection

```bash
python websocket_client.py
```

Should show:
```
✅ Connected to backend at ws://localhost:3000
📝 Registered as 'dragon' client
```

### Test Command Parser

```bash
python vascular_commands.py
```

Shows test commands and their parsed output.

---

**Ready to dictate!** Press 'R' and start speaking! 🎙️