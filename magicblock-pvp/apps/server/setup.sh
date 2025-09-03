#!/bin/bash

echo "🚀 MagicBlock PvP Server Setup Script"
echo "======================================"

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "✅ .env file created. Please update it with your actual values."
else
    echo "✅ .env file already exists"
fi

# Check PostgreSQL
echo ""
echo "📊 Checking PostgreSQL..."
if command -v psql &> /dev/null; then
    echo "✅ PostgreSQL is installed"
    echo "   To start: brew services start postgresql@16 (macOS) or sudo systemctl start postgresql (Linux)"
else
    echo "❌ PostgreSQL not found. Please install it:"
    echo "   macOS: brew install postgresql@16"
    echo "   Linux: sudo apt-get install postgresql"
fi

# Check Redis
echo ""
echo "💾 Checking Redis..."
if command -v redis-cli &> /dev/null; then
    echo "✅ Redis is installed"
    echo "   To start: brew services start redis (macOS) or sudo systemctl start redis (Linux)"
else
    echo "❌ Redis not found. Please install it:"
    echo "   macOS: brew install redis"
    echo "   Linux: sudo apt-get install redis-server"
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Generate Prisma client
echo ""
echo "🔨 Generating Prisma client..."
npx prisma generate

# Setup database
echo ""
echo "🗄️ Setting up database..."
echo "Running database migrations..."
npx prisma migrate deploy 2>/dev/null || {
    echo "⚠️  Migrations failed. Creating database and trying again..."
    npx prisma db push
}

echo ""
echo "✨ Setup Complete!"
echo ""
echo "Next steps:"
echo "1. Update the .env file with your database and Redis credentials"
echo "2. Start PostgreSQL and Redis services"
echo "3. Run: npm run dev"
echo ""
echo "Available scripts:"
echo "  npm run dev       - Start development server"
echo "  npm run build     - Build for production"
echo "  npm run start     - Start production server"
echo "  npm run test      - Run tests"
echo ""