#!/bin/bash
# Run tests inside a container connected to the openchat network

docker run --rm \
  --network=openchat-network \
  --volume /home/gl1/openchat:/app \
  --workdir /app/apps/server \
  --env DATABASE_URL=postgresql://openchat:yktBNut9mexFzOjoKoz7s3CmE3ecNvhf@openchat-postgres:5432/openchat_dev \
  --env NODE_ENV=development \
  --env ELECTRIC_INSECURE=true \
  oven/bun:1 \
  bun test