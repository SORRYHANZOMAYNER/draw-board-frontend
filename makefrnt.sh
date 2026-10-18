#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

docker network inspect board-net >/dev/null 2>&1 || docker network create board-net
docker rm -f drawboard-frontend 2>/dev/null || true
if [ -f drawboard-frontend.tar ]; then
  docker load -i drawboard-frontend.tar
fi
docker run -d \
  --name drawboard-frontend \
  --network board-net \
  --restart unless-stopped \
  -p 80:80 -p 443:443 \
  -e BACKEND_URL=http://drawboard-backend:5465 \
  -v letsencrypt:/etc/letsencrypt \
  -v certbot-www:/var/www/certbot \
  drawboard-frontend:latest
