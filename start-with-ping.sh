#!/bin/bash

echo "🚀 Starting Dashboard with Ping Server..."

# Build and start services
docker compose up --build -d

echo ""
echo "✅ Services started!"
echo ""
echo "📊 Dashboard: http://localhost:3000"
echo "🏓 Ping Server: http://localhost:3001"
echo ""
echo "Test ping server: curl http://localhost:3001/ping/google.com"
echo ""
echo "View logs: docker compose logs -f"
echo "Stop services: docker compose down"
