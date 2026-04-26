#!/bin/bash
set -e

npm install --legacy-peer-deps

echo "Pushing to GitHub (origin/main)..."
git push origin main
echo "Push to GitHub succeeded."
