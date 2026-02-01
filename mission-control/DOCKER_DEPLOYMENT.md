# Docker Deployment Guide

## Prerequisites

Before building the Docker image, ensure you have built the Next.js application locally:

```bash
pnpm install
pnpm build
```

## Building the Docker Image

### Single Platform Build (for local testing only)

From the `mission-control` directory:

```bash
# Build for your current architecture only (ARM or AMD64)
docker build -t mission-control:latest .
```

**Note:** This will only work on machines with the same architecture as your build machine.

### Multi-Platform Build (Recommended for Production)

If you're building on ARM (Apple Silicon, ARM64 VM) but need to deploy to AMD64/x86 VMs, use Docker Buildx to create multi-platform images:

```bash
# Create and use a new builder instance (one-time setup)
docker buildx create --name multiplatform --use
docker buildx inspect --bootstrap

# Build and push multi-platform image directly to registry
# This builds for both ARM64 and AMD64
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t your-registry/mission-control:latest \
  --push \
  .

# Or build for AMD64 only (most cloud VMs)
docker buildx build \
  --platform linux/amd64 \
  -t your-registry/mission-control:latest \
  --push \
  .
```

**Important:** Multi-platform builds with `--push` directly push to the registry. You cannot load multi-platform images locally with `--load`.

### Build and Load Locally (Single Platform)

To build for a specific platform and test locally:

```bash
# Build AMD64 image on ARM machine (for testing)
docker buildx build \
  --platform linux/amd64 \
  -t mission-control:latest \
  --load \
  .

# Note: You can only --load single platform images
```

## Running Locally

```bash
# Run the container
docker run -p 3000:3000 mission-control:latest

# Run with environment variables
docker run -p 3000:3000 \
  -e DATABASE_URL="your-database-url" \
  -e GOOGLE_API_KEY="your-api-key" \
  mission-control:latest

# Run with .env file
docker run -p 3000:3000 --env-file .env mission-control:latest
```

## Pushing to Container Registry

**Important:** If you're on an ARM machine and your VMs are AMD64, use the multi-platform build commands above which automatically push to the registry.

### DigitalOcean Container Registry (Recommended)

```bash
# Install doctl (if not already installed)
# macOS
brew install doctl

# Linux
cd ~
wget https://github.com/digitalocean/doctl/releases/download/v1.104.0/doctl-1.104.0-linux-amd64.tar.gz
tar xf doctl-*.tar.gz
sudo mv doctl /usr/local/bin

# Authenticate
doctl auth init

# Login to container registry
doctl registry login

# Build multi-platform and push directly
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t registry.digitalocean.com/utrahacks/mission-control:latest \
  --push \
  .

# Or build AMD64 only (most common)
docker buildx build \
  --platform linux/amd64 \
  -t registry.digitalocean.com/utrahacks/mission-control:latest \
  --push \
  .
```

### Docker Hub

```bash
# If you already built with buildx --push, skip the tag and push steps
# Otherwise, for single-platform images:

# Tag the image
docker tag mission-control:latest your-dockerhub-username/mission-control:latest

# Login to Docker Hub
docker login

# Push the image
docker push your-dockerhub-username/mission-control:latest

# OR: Build multi-platform and push directly
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t your-dockerhub-username/mission-control:latest \
  --push \
  .
```

### Google Container Registry (GCR)

```bash
# Configure Docker to use gcloud credentials
gcloud auth configure-docker

# Build multi-platform and push directly
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t gcr.io/your-project-id/mission-control:latest \
  --push \
  .
```

### AWS ECR

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin your-account-id.dkr.ecr.us-east-1.amazonaws.com

# Build multi-platform and push directly
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t your-account-id.dkr.ecr.us-east-1.amazonaws.com/mission-control:latest \
  --push \
  .
```

### Azure Container Registry (ACR)

```bash
# Login to ACR
az acr login --name yourregistryname

# Build multi-platform and push directly
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t yourregistryname.azurecr.io/mission-control:latest \
  --push \
  .
```

## Deploying to VM

### SSH into your VM and pull the image

```bash
# SSH into VM
ssh user@your-vm-ip

# Pull the image
docker pull your-registry/mission-control:latest

# Stop existing container (if any)
docker stop mission-control || true
docker rm mission-control || true

# Run the new container
docker run -d \
  --name mission-control \
  -p 3000:3000 \
  --restart unless-stopped \
  -e DATABASE_URL="your-database-url" \
  -e GOOGLE_API_KEY="your-api-key" \
  your-registry/mission-control:latest
```

### Using docker-compose (recommended)

Create a `docker-compose.yml` on your VM:

```yaml
version: '3.8'

services:
  mission-control:
    image: your-registry/mission-control:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - GOOGLE_API_KEY=${GOOGLE_API_KEY}
      - NODE_ENV=production
    restart: unless-stopped
```

Then run:

```bash
docker-compose up -d
```

## Environment Variables

Make sure to set these environment variables when running the container:

- `DATABASE_URL` - Your Prisma database connection string
- `GOOGLE_API_KEY` - Your Google API key for AI features
- Any other environment variables your app needs

## Health Checks

You can verify the container is running:

```bash
# Check container status
docker ps

# View logs
docker logs mission-control

# Follow logs in real-time
docker logs -f mission-control
```

## Notes

- The Dockerfile uses Node.js 20 Alpine for a smaller image size
- Runs as a non-root user for security
- Port 3000 is exposed by default (Next.js default)
- Telemetry is disabled for production
- Database migrations should be run separately before starting the container

### Architecture Compatibility

- **ARM builds on ARM machines** will only work on ARM VMs (e.g., AWS Graviton, Azure ARM-based VMs)
- **AMD64 builds** are needed for most cloud VMs (AWS EC2, Google Compute Engine, Azure standard VMs)
- **Use multi-platform builds** (`docker buildx`) when building on ARM but deploying to AMD64 VMs
- Node.js Alpine base image supports both architectures natively

### Platform Detection

To check what platform your image was built for:

```bash
docker image inspect mission-control:latest | grep Architecture
```

To check your current machine architecture:

```bash
uname -m  # arm64 = ARM, x86_64 = AMD64
```

## Building from Project Root

If you need to build from the project root directory, use:

```bash
docker build -f mission-control/Dockerfile -t mission-control:latest mission-control/
```
