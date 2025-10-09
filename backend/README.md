# Surgical Command Center - Backend Server

Complete backend setup for voice-activated vascular procedure documentation with Dragon Dictation integration.

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│     Frontend (Surgical Command UI)      │
└───────────────┬─────────────────────────┘
                │ WebSocket + REST API
┌───────────────▼─────────────────────────┐
│       Node.js Express Server            │
│  • REST API                             │
│  • WebSocket Server                     │
│  • Real-time Communication              │
└───────────────┬─────────────────────────┘
                │
┌───────────────▼─────────────────────────┐
│       PostgreSQL Database               │
│  • Procedure Storage                    │
│  • Patient Data                         │
│  • Audit Logs                           │
└─────────────────────────────────────────┘
```

## 📋 Prerequisites

- **Node.js** (v16 or higher)
- **PostgreSQL** (v12 or higher)
- **Ubuntu** (or any Linux/macOS)

## 🚀 Installation

### Step 1: Install PostgreSQL

```bash
# Update package list
sudo apt update

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verify it's running
sudo systemctl status postgresql
```

### Step 2: Create Database and User

```bash
# Switch to postgres user
sudo -i -u postgres

# Create database
createdb surgical_command_center

# Create user with password
psql -c "CREATE USER surgical_user WITH PASSWORD 'surgical_pass_2025';"

# Grant privileges
psql -c "GRANT ALL PRIVILEGES ON DATABASE surgical_command_center TO surgical_user;"

# Exit postgres user
exit
```

### Step 3: Test Database Connection

```bash
# Try to connect (should work without error)
psql -U surgical_user -d surgical_command_center -h localhost

# Type \q to exit when successful
```

### Step 4: Install Node.js Dependencies

```bash
# Navigate to backend directory
cd surgical-command-center-backend

# Install dependencies
npm install
```

### Step 5: Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env file with your settings (already pre-configured for local setup)
nano .env
```

### Step 6: Start the Server

```bash
# Start in development mode (with auto-reload)
npm run dev

# OR start in production mode
npm start
```

You should see:

```
✅ ═══════════════════════════════════════════════════════
   🏥 Surgical Command Center Backend Server
   ═══════════════════════════════════════════════════════
   🌐 HTTP Server: http://localhost:3000
   🔌 WebSocket: ws://localhost:3000
   📊 Database: PostgreSQL (surgical_command_center)
   🔧 Environment: development
   ═══════════════════════════════════════════════════════

   Ready for connections! 🚀
```

## 📡 API Endpoints

### Procedures

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/procedures` | Get all procedures (with filters) |
| `GET` | `/api/procedures/:id` | Get single procedure |
| `POST` | `/api/procedures` | Create new procedure |
| `PUT` | `/api/procedures/:id` | Update procedure |
| `PATCH` | `/api/procedures/:id/vessel` | Update specific vessel |
| `PATCH` | `/api/procedures/:id/status` | Update status |
| `DELETE` | `/api/procedures/:id` | Delete procedure |
| `GET` | `/api/procedures/stats/summary` | Get statistics |

### Health Check

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Server health status |

## 🔌 WebSocket Events

### Client → Server

```javascript
// Register client
{
  type: 'register',
  clientType: 'dragon' | 'ui'
}

// Voice transcription (from Dragon)
{
  type: 'voice_transcription',
  text: 'set superficial femoral occlusion to 8 centimeters'
}

// Voice command (parsed)
{
  type: 'voice_command',
  command: 'set_field',
  params: {
    field: 'superficial_femoral',
    value: { occlusion_length: '8cm' }
  }
}

// Field update (from UI)
{
  type: 'field_update',
  procedureId: 'uuid',
  field: 'procedure_side',
  value: 'left'
}
```

### Server → Client

```javascript
// Transcription broadcast
{
  type: 'transcription',
  text: 'set superficial femoral...',
  timestamp: '2025-10-08T...'
}

// Field updated
{
  type: 'field_updated',
  field: 'procedure_side',
  value: 'left',
  procedureId: 'uuid'
}

// Procedure saved
{
  type: 'procedure_saved',
  procedureId: 'uuid',
  message: 'Procedure saved successfully'
}
```

## 🧪 Testing the API

### Create a test procedure:

```bash
curl -X POST http://localhost:3000/api/procedures \
  -H "Content-Type: application/json" \
  -d '{
    "patient_name": "Jones, William R.",
    "mrn": "MRN-458932",
    "dob": "1958-03-15",
    "age": 67,
    "procedure_type": "Lower Extremity Angiogram",
    "surgeon": "Dr. Morgan",
    "procedure_side": "left",
    "access_site": "femoral"
  }'
```

### Get all procedures:

```bash
curl http://localhost:3000/api/procedures
```

### Update a vessel:

```bash
curl -X PATCH http://localhost:3000/api/procedures/{id}/vessel \
  -H "Content-Type: application/json" \
  -d '{
    "vessel_name": "superficial_femoral",
    "vessel_data": {
      "occlusion_length": "8cm",
      "treatment": "PTA + Stent",
      "tasc": "C"
    }
  }'
```

## 🗂️ Database Schema

### Procedures Table

Key fields:
- Patient info (name, MRN, DOB, age)
- Procedure details (type, date, surgeon, side)
- Access information (site, guide, sheath size)
- Vessel data (stored as JSONB for flexibility)
  - common_iliac
  - external_iliac
  - common_femoral
  - superficial_femoral
  - profunda
  - popliteal
  - anterior_tibial
  - posterior_tibial
  - peroneal
- Complications
- Status (draft, in_progress, completed, finalized)
- Timestamps (created_at, updated_at)

## 🔧 Development

### Watch mode with auto-reload:

```bash
npm run dev
```

### View database:

```bash
psql -U surgical_user -d surgical_command_center -h localhost

# Useful commands:
\dt              # List tables
\d procedures    # Describe procedures table
SELECT * FROM procedures;  # View all procedures
```

## 🚨 Troubleshooting

### Database connection error:

```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Check if user exists
sudo -u postgres psql -c "\du"

# Reset password if needed
sudo -u postgres psql -c "ALTER USER surgical_user WITH PASSWORD 'surgical_pass_2025';"
```

### Port already in use:

```bash
# Find process using port 3000
sudo lsof -i :3000

# Kill the process
kill -9 <PID>
```

### Module not found errors:

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

## 📊 Monitoring

View logs in real-time:

```bash
# Server logs show:
# - HTTP requests (via morgan)
# - WebSocket connections
# - Database queries (in development)
# - Errors and warnings
```

## 🔐 Security Notes

**Current Setup (Development):**
- No authentication (add before production)
- CORS allows all origins
- No encryption (add SSL/TLS for production)
- Database password in .env (never commit this file)

**For Production:**
- Implement JWT authentication
- Enable HIPAA compliance features
- Use SSL/TLS certificates
- Enable audit logging
- Encrypt sensitive data
- Use environment-specific secrets

## 📞 Next Steps

1. ✅ Backend server is running
2. ⏭️ Connect Dragon Dictation (Python WebSocket client)
3. ⏭️ Update Frontend UI with WebSocket client
4. ⏭️ Add data source integrations (UltraLinq, Athena, etc.)

## 🤝 Support

For issues or questions, check the logs and database connection first.

---

Built with ❤️ for streamlined surgical documentation