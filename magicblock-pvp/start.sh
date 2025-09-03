#!/bin/bash

echo "🚀 Starting MagicBlock PvP Development Environment"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Function to check if a service is running
check_service() {
    if command -v $1 &> /dev/null; then
        echo -e "${GREEN}✅ $2 is installed${NC}"
        return 0
    else
        echo -e "${RED}❌ $2 is not installed${NC}"
        return 1
    fi
}

# Check requirements
echo ""
echo "Checking requirements..."
check_service "psql" "PostgreSQL"
check_service "redis-cli" "Redis"
check_service "node" "Node.js"

# Start services
echo ""
echo "Starting services..."

# Start the server
echo -e "${YELLOW}Starting backend server...${NC}"
cd "$DIR/apps/server"

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file from example...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${GREEN}✅ Created .env file. Please update it with your credentials.${NC}"
    fi
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing server dependencies...${NC}"
    npm install
fi

# Generate Prisma client
echo -e "${YELLOW}Generating Prisma client...${NC}"
npx prisma generate

echo -e "${GREEN}✅ Backend server ready!${NC}"
echo ""
echo "To start the backend server, run:"
echo "  cd apps/server && npm run dev"
echo ""
echo "To start the frontend, run:"
echo "  cd apps/web && npm run dev"
echo ""
echo "Available at:"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:3001"
echo ""
echo -e "${GREEN}Happy coding! 🎮${NC}"