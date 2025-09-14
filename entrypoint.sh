#!/bin/sh

# Run database migrations
npx prisma migrate deploy

# Start the backend application
exec npm run start:prod