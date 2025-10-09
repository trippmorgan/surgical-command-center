#!/bin/bash

# Surgical Command Center - Backend Setup Script
# Run this script to automatically set up the backend

echo "════════════════════════════════════════════════════════"
echo "   🏥 Surgical Command Center - Backend Setup"
echo "════════════════════════════════════════════════════════"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running on Ubuntu/Debian
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
    echo "✅ Detected OS: $OS"
else
    echo "❌ Cannot detect OS"
    exit 1
fi

# Check if Node.js is installed
echo ""
echo "🔍 Checking Node.js..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo "✅ Node.js is installed: $NODE_VERSION"
else
    echo "❌ Node.js is not installed"
    echo "Please install Node.js v16 or higher:"
    echo "  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -"
    echo "  sudo apt-get install -y nodejs"
    exit 1
fi

# Check if PostgreSQL is installed
echo ""
echo "🔍 Checking PostgreSQL..."
if command -v psql &> /dev/null; then
    PG_VERSION=$(psql --version | awk '{print $3}')
    echo "✅ PostgreSQL is installed: $PG_VERSION"
else
    echo "❌ PostgreSQL is not installed"
    echo ""
    read -p "Would you like to install PostgreSQL now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "📦 Installing PostgreSQL..."
        sudo apt update
        sudo apt install -y postgresql postgresql-contrib
        sudo systemctl start postgresql
        sudo systemctl enable postgresql
        echo "✅ PostgreSQL installed successfully"
    else
        echo "❌ PostgreSQL is required. Exiting..."
        exit 1
    fi
fi

# Setup PostgreSQL database
echo ""
echo "🗄️  Setting up PostgreSQL database..."
echo ""

DB_NAME="surgical_command_center"
DB_USER="surgical_user"
DB_PASS="surgical_pass_2025"

# Check if database exists
if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo "⚠️  Database '$DB_NAME' already exists"
    read -p "Would you like to drop and recreate it? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo -u postgres psql -c "DROP DATABASE IF EXISTS $DB_NAME;"
        sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;"
        echo "✅ Database recreated"
    fi
else
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;"
    echo "✅ Database '$DB_NAME' created"
fi

# Check if user exists
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    echo "⚠️  User '$DB_USER' already exists"
else
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
    echo "✅ User '$DB_USER' created"
fi

# Grant privileges
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
sudo -u postgres psql -d $DB_NAME -c "GRANT ALL ON SCHEMA public TO $DB_USER;"
echo "✅ Privileges granted"

# Test database connection
echo ""
echo "🔍 Testing database connection..."
if PGPASSWORD=$DB_PASS psql -U $DB_USER -d $DB_NAME -h localhost -c "SELECT 1" &> /dev/null; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed"
    echo "Please check your PostgreSQL configuration"
    exit 1
fi

# Create .env file if it doesn't exist
echo ""
echo "⚙️  Setting up environment configuration..."
if [ -f .env ]; then
    echo "⚠️  .env file already exists"
    read -p "Would you like to overwrite it? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cp .env.example .env
        echo "✅ .env file created from template"
    fi
else
    cp .env.example .env
    echo "✅ .env file created from template"
fi

# Install Node.js dependencies
echo ""
echo "📦 Installing Node.js dependencies..."
npm install
if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Summary
echo ""
echo "════════════════════════════════════════════════════════"
echo "   ✅ Setup Complete!"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Database Configuration:"
echo "  📊 Database: $DB_NAME"
echo "  👤 User: $DB_USER"
echo "  🔑 Password: $DB_PASS"
echo "  🌐 Host: localhost"
echo "  🔌 Port: 5432"
echo ""
echo "Next Steps:"
echo "  1. Review .env file if needed: nano .env"
echo "  2. Start the server: npm run dev"
echo "  3. Test the API: curl http://localhost:3000/health"
echo ""
echo "To start the server now, run:"
echo "  ${GREEN}npm run dev${NC}"
echo ""
echo "════════════════════════════════════════════════════════"