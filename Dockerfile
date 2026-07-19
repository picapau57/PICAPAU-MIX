# Use the official Node.js 20 lightweight image as the base for building
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files to install dependencies
COPY package.json ./

# Install all dependencies (including devDependencies) so we can compile the app
RUN npm install

# Copy all project files to the builder
COPY . .

# Run the build script (Vite frontend build + esbuild backend compilation to dist/)
RUN npm run build

# Use a clean, small Node.js 20 lightweight image for the production runner
FROM node:20-slim

WORKDIR /app

# Copy the built folders and package configuration from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

# Install only production-needed packages to keep the container small and fast
# We ignore the postinstall script since the build was already completed in the builder stage
RUN npm install --omit=dev --ignore-scripts

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port 3000 to the container network
EXPOSE 3000

# Start the application using the custom start script
CMD ["npm", "start"]
