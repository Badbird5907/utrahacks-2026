# Docker Deployment Guide

## Prerequisites

Before building the Docker image, ensure you have built the Next.js application locally:

```bash
cd mission-control
pnpm install
pnpm build
```

## Building the Docker Image

From the project root directory:

```bash
# Build the image
docker build -t mission-control:latest .

# Build with a specific tag
docker build -t mission-control:v1.0.0 .
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
docker run -p 3000:3000 --env-file mission-control/.env mission-control:latest
```

## Pushing to Container Registry

### Docker Hub

```bash
# Tag the image
docker tag mission-control:latest your-dockerhub-username/mission-control:latest

# Login to Docker Hub
docker login

# Push the image
docker push your-dockerhub-username/mission-control:latest
```

### Google Container Registry (GCR)

```bash
# Tag the image
docker tag mission-control:latest gcr.io/your-project-id/mission-control:latest

# Configure Docker to use gcloud credentials
gcloud auth configure-docker

# Push the image
docker push gcr.io/your-project-id/mission-control:latest
```

### AWS ECR

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin your-account-id.dkr.ecr.us-east-1.amazonaws.com

# Tag the image
docker tag mission-control:latest your-account-id.dkr.ecr.us-east-1.amazonaws.com/mission-control:latest

# Push the image
docker push your-account-id.dkr.ecr.us-east-1.amazonaws.com/mission-control:latest
```

### Azure Container Registry (ACR)

```bash
# Login to ACR
az acr login --name yourregistryname

# Tag the image
docker tag mission-control:latest yourregistryname.azurecr.io/mission-control:latest

# Push the image
docker push yourregistryname.azurecr.io/mission-control:latest
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
