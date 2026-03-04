#!/bin/bash
# Script to run database migrations for the Dashboard application

set -e

echo "Running database migrations..."

# Use environment variables or defaults
DB_HOST=${DB_HOST:-postgres}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-dashboard}
DB_USER=${DB_USER:-dashboard}
DB_PASSWORD=${DB_PASSWORD:-dashboard123}

# Run migrations
for migration in ../migrations/*.sql; do
    if [ -f "$migration" ]; then
        echo "Applying migration: $(basename "$migration")"
        docker exec -i dashboard-postgres psql -U "$DB_USER" -d "$DB_NAME" < "$migration"
    fi
done

echo "All migrations applied successfully!"
