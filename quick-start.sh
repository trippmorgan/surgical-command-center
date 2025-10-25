#!/bin/bash

# Quick Start Script for Surgical Command Center with Docker Integration
# Run from project root directory

set -e  # Exit on error

echo "════════════════════════════════════════════════════════"
echo "   🏥 Surgical Command Center - Docker Integration"
echo "   Quick Start Setup"
echo "════════════════════════════════════════════════════════"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if running from correct directory
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}❌ Error: docker-compose.yml not found${NC}"
    echo "Please run this script from the project root directory"
    exit 1
fi

echo -e "${BLUE}📋 Step 1: Checking prerequisites...${NC}"
echo ""

# Check Docker
if command -v docker &> /dev/null; then
    echo -e "${GREEN}✅ Docker installed${NC}"
    docker --version
else
    echo -e "${RED}❌ Docker not found${NC}"
    echo "Please install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check Docker Compose
if command -v docker-compose &> /dev/null; then
    echo -e "${GREEN}✅ Docker Compose installed${NC}"
    docker-compose --version
else
    echo -e "${RED}❌ Docker Compose not found${NC}"
    echo "Please install Docker Compose"
    exit 1
fi

# Check Node.js
if command -v node &> /dev/null; then
    echo -e "${GREEN}✅ Node.js installed${NC}"
    node --version
else
    echo -e "${RED}❌ Node.js not found${NC}"
    echo "Please install Node.js v16+"
    exit 1
fi

echo ""
echo -e "${BLUE}📋 Step 2: Setting up environment...${NC}"
echo ""

# Check if .env exists
if [ ! -f "backend/.env" ]; then
    if [ -f "backend/.env.example" ]; then
        cp backend/.env.example backend/.env
        echo -e "${GREEN}✅ Created backend/.env from example${NC}"
        echo -e "${YELLOW}⚠️  Please edit backend/.env and add your API keys${NC}"
    else
        echo -e "${RED}❌ No .env.example found${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ backend/.env exists${NC}"
fi

# Update PORT to 3001 in .env if needed
if grep -q "^PORT=3000" backend/.env 2>/dev/null; then
    sed -i.bak 's/^PORT=3000/PORT=3001/' backend/.env
    echo -e "${GREEN}✅ Updated PORT to 3001 in .env${NC}"
fi

echo ""
echo -e "${BLUE}📋 Step 3: Installing Node.js dependencies...${NC}"
echo ""

cd backend
if [ ! -d "node_modules" ]; then
    npm install
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${GREEN}✅ Dependencies already installed${NC}"
fi

# Install additional dependencies
npm install axios form-data --save
echo -e "${GREEN}✅ Additional dependencies installed${NC}"

cd ..

echo ""
echo -e "${BLUE}📋 Step 4: Creating required directories...${NC}"
echo ""

mkdir -p backend/services
mkdir -p backend/logs
mkdir -p backend/utils

echo -e "${GREEN}✅ Directories created${NC}"

echo ""
echo -e "${BLUE}📋 Step 5: Starting Docker services...${NC}"
echo ""

# Check if services are already running
if docker ps | grep -q "central_postgres_db"; then
    echo -e "${YELLOW}⚠️  Docker services already running${NC}"
    read -p "Restart services? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker-compose down
        docker-compose up -d
    fi
else
    docker-compose up -d
fi

echo ""
echo -e "${YELLOW}⏳ Waiting for services to start...${NC}"
sleep 5

# Check PostgreSQL
echo -e "${BLUE}🔍 Checking PostgreSQL...${NC}"
if docker ps | grep -q "central_postgres_db"; then
    echo -e "${GREEN}✅ PostgreSQL container running${NC}"
else
    echo -e "${RED}❌ PostgreSQL container not running${NC}"
    exit 1
fi

# Check Dragon AI
echo -e "${BLUE}🔍 Checking Dragon AI service...${NC}"
if docker ps | grep -q "dragon_ai_service"; then
    echo -e "${GREEN}✅ Dragon AI container running${NC}"
    
    # Wait for service to be ready
    echo -e "${YELLOW}⏳ Waiting for Dragon AI to initialize...${NC}"
    sleep 10
    
    # Test connection
    if curl -s http://localhost:5005/ > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Dragon AI service responding${NC}"
    else
        echo -e "${YELLOW}⚠️  Dragon AI service not responding yet (may need more time)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Dragon AI container not running${NC}"
    echo "AI features will be limited"
fi

echo ""
echo -e "${BLUE}📋 Step 6: Checking required files...${NC}"
echo ""

MISSING_FILES=()

# Check for new integration files
if [ ! -f "backend/services/dockerServicesClient.js" ]; then
    MISSING_FILES+=("backend/services/dockerServicesClient.js")
fi

if [ ! -f "backend/services/patientWorkflow.js" ]; then
    MISSING_FILES+=("backend/services/patientWorkflow.js")
fi

if [ ! -f "backend/routes/patientWorkflow.js" ]; then
    MISSING_FILES+=("backend/routes/patientWorkflow.js")
fi

if [ ! -f "frontend/patient-lookup.html" ]; then
    MISSING_FILES+=("frontend/patient-lookup.html")
fi

if [ ! -f "frontend/js/dragon-connection.js" ]; then
    MISSING_FILES+=("frontend/js/dragon-connection.js")
fi

if [ ${#MISSING_FILES[@]} -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Missing integration files:${NC}"
    for file in "${MISSING_FILES[@]}"; do
        echo "   - $file"
    done
    echo ""
    echo -e "${YELLOW}Please copy these files from the artifacts provided by Claude${NC}"
    echo ""
fi

echo ""
echo -e "${BLUE}📋 Step 7: Service status check...${NC}"
echo ""

# Show Docker service status
echo -e "${BLUE}Docker Services:${NC}"
docker-compose ps

echo ""
echo "════════════════════════════════════════════════════════"
echo -e "   ${GREEN}✅ Setup Complete!${NC}"
echo "════════════════════════════════════════════════════════"
echo ""
echo -e "${BLUE}🚀 Next Steps:${NC}"
echo ""
echo "1. Copy missing integration files (if any listed above)"
echo ""
echo "2. Configure API keys in backend/.env:"
echo "   - GOOGLE_API_KEY (for Gemini AI)"
echo "   - ULTRALINQ_USERNAME & ULTRALINQ_PASSWORD"
echo "   - ATHENA_API_KEY (optional)"
echo ""
echo "3. Start the backend server:"
echo -e "   ${YELLOW}cd backend && npm run dev${NC}"
echo ""
echo "4. Open in browser:"
echo "   - Patient Lookup: http://localhost:3001/patient-lookup.html"
echo "   - Main Interface: http://localhost:3001/"
echo ""
echo "5. Test the system:"
echo -e "   ${YELLOW}curl http://localhost:3001/api/workflow/services/status${NC}"
echo ""
echo -e "${BLUE}📚 Documentation:${NC}"
echo "   - Setup Guide: See 'Complete Docker Integration Setup Guide' artifact"
echo "   - API Reference: http://localhost:3001/api"
echo ""
echo -e "${BLUE}🐛 Troubleshooting:${NC}"
echo "   - View logs: docker-compose logs -f"
echo "   - Restart: docker-compose restart"
echo "   - Stop: docker-compose down"
echo ""
echo "════════════════════════════════════════════════════════"