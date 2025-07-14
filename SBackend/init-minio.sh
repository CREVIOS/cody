#!/bin/sh
# Wait for MinIO to be ready
echo "Waiting for MinIO to be ready..."
sleep 5

# Create the projects bucket
mc alias set myminio http://localhost:9000 minioadmin minioadmin
mc mb --ignore-existing myminio/projects

echo "MinIO bucket 'projects' created (or already exists)." 