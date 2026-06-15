#!/bin/bash
set -e

echo "==> Installing dependencies..."
npm install

echo "==> Generating Prisma Client..."
npx prisma generate

echo "==> Resolving any failed migrations..."
# Mark the init migration as applied (safe to run even if already resolved)
npx prisma migrate resolve --applied "20260411000000_init_postgresql" 2>/dev/null || echo "Migration already resolved, skipping..."

echo "==> Deploying remaining migrations..."
npx prisma migrate deploy

echo "==> Build complete!"
