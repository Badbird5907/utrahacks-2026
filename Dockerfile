# Use Node.js 20 LTS as the base image
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY mission-control/package.json mission-control/pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy the built application
# Assumes you've already run 'pnpm build' locally
COPY mission-control/.next ./.next
COPY mission-control/public ./public
COPY mission-control/package.json ./package.json
COPY mission-control/next.config.ts ./next.config.ts

# Copy prisma if it exists (for database migrations)
COPY mission-control/prisma ./prisma

# Set correct permissions
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose the port the app runs on
EXPOSE 3000

# Set default port
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the application
CMD ["node_modules/.bin/next", "start"]
