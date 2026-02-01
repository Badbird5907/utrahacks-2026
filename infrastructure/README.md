# Infrastructure Deployment

This directory contains the Docker Compose configuration for deploying the mission-control application with nginx as a reverse proxy.

## Files

- `docker-compose.yml` - Main Docker Compose configuration
- `nginx.conf` - Nginx reverse proxy configuration
- `.env.example` - Example environment variables (copy to `.env` and configure)

## Setup

1. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

2. Configure your environment variables in `.env`

3. Log in to DigitalOcean Container Registry:
   ```bash
   docker login registry.digitalocean.com
   ```

4. Pull the latest image:
   ```bash
   docker-compose pull
   ```

5. Start the services:
   ```bash
   docker-compose up -d
   ```

## Services

### mission-control
- **Image**: `registry.digitalocean.com/utrahacks/mission-control:latest`
- **Port**: 3000 (internal)
- **Description**: Next.js application

### nginx
- **Image**: `nginx:alpine`
- **Port**: 80 (external)
- **Description**: Reverse proxy that forwards requests to mission-control

## Management Commands

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f

# Restart services
docker-compose restart

# Pull latest image and restart
docker-compose pull && docker-compose up -d
```

## Nginx Configuration

The nginx service is configured to:
- Listen on port 80
- Proxy all requests to mission-control:3000
- Support WebSocket connections
- Include proper headers for proxying

## Notes

- The mission-control service is only exposed internally to the docker network
- All external traffic goes through nginx on port 80
- WebSocket support is enabled for real-time features
