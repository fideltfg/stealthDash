#!/bin/bash

# Dashboard Setup Script (Docker-based)

echo "🚀 Setting up Dashboard with Docker..."
echo ""

# Check if docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed."
    echo ""
    echo "Please install Docker first:"
    echo "  https://docs.docker.com/get-docker/"
    echo ""
    exit 1
fi

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
    echo "❌ Docker Compose is not installed."
    echo ""
    echo "Please install Docker Compose:"
    echo "  https://docs.docker.com/compose/install/"
    echo ""
    exit 1
fi

echo "✅ Docker is installed"
echo ""

# Detect Docker Compose command (V1 vs V2)
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    COMPOSE_CMD="docker compose"
fi

# Ask user which mode to run
echo "Select mode:"
echo "  1) Development (with hot reload)"
echo "  2) Production (optimized build)"
echo ""
read -p "Enter choice [1-2]: " choice

case $choice in
    1)
        echo ""
        echo "🔨 Building development environment..."
        $COMPOSE_CMD up --build -d
        
        echo ""
        echo "✅ Development server is starting!"
        echo ""
        echo "📝 Dashboard will be available at: http://localhost:3000"
        echo ""
        echo "Useful commands:"
        echo "  View logs:     $COMPOSE_CMD logs -f"
        echo "  Stop server:   $COMPOSE_CMD down"
        echo "  Restart:       $COMPOSE_CMD restart"
        echo ""
        ;;
    2)
        echo ""
        echo "🔨 Building production environment..."
        $COMPOSE_CMD -f docker-compose.prod.yml up --build -d
        
        echo ""
        echo "✅ Production server is running!"
        echo ""
        echo "🌐 Dashboard is available at: http://localhost:8080"
        echo ""
        echo "Useful commands:"
        echo "  View logs:     $COMPOSE_CMD -f docker-compose.prod.yml logs -f"
        echo "  Stop server:   $COMPOSE_CMD -f docker-compose.prod.yml down"
        echo "  Restart:       $COMPOSE_CMD -f docker-compose.prod.yml restart"
        echo ""
        ;;
    *)
        echo "Invalid choice. Exiting."
        exit 1
        ;;
esac
