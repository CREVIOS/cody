# Use the official lightweight Node.js image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install the matching version of pnpm
RUN npm install -g pnpm@9.15.4

# Copy only dependency files first (for caching)
COPY package.json pnpm-lock.yaml ./

# Install dependencies (strict lockfile match)
RUN pnpm install --frozen-lockfile

# Copy the rest of the source code
COPY . .

# Build the Next.js app
RUN pnpm build

# Expose app port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Start the production server
CMD ["pnpm", "start"]
