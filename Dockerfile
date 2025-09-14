# Base image
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./
COPY /src/db/prisma ./prisma/

# Install dependencies
RUN npm install
RUN npx prisma generate
# Copy the rest of the client code
COPY . .

RUN npm run build

FROM node:16-alpine

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 5004
# CMD [ "npm", "run", "start:prod" ]
COPY entrypoint.sh /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]

