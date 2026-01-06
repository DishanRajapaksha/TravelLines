#!/bin/bash
set -e

echo "Building project..."
npm run build

echo "Creating directory on server..."
ssh galenor "mkdir -p ~/travellines"

echo "Copying files to server..."
scp -r dist docker-compose.yml galenor:~/travellines/

echo "Starting docker-compose on server..."
ssh galenor "cd ~/travellines && sudo docker compose up -d"

echo "Deployment complete! Your website should be live on http://galenor/travelines"
