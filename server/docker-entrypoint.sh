#!/bin/sh
set -e

echo "=== Starting NKB SOP Management System in Docker ==="

# Ensure persistent directories exist
mkdir -p /app/data /app/uploads
chmod 755 /app/data /app/uploads

# Run Prisma schema push to ensure SQLite database tables are created & synchronized
echo "Synchronizing database schema..."
npx prisma db push --skip-generate

# Start the application server
echo "Launching server..."
exec node dist/index.js
