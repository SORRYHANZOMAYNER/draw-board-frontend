docker compose build
docker build -t drawboard-frontend:latest .
docker save drawboard-frontend:latest -o drawboard-frontend.tar
scp drawboard-frontend.tar root@138.124.121.179:/root/board-frontend
gunzip -c drawboard-frontend.tar.gz | docker load
docker run -d \
  --name drawboard-frontend \
  --restart unless-stopped \
  -p 80:80 \
  -e BACKEND_URL=http://138.124.121.179:5465 \
  drawboard-frontend:latest

  docker run --rm -p 80:80 \ 
  -v letsencrypt:/etc/letsencrypt \
  certbot/certbot certonly --standalone \
  -d drawboard.duckdns.org \
  --email egoraksenov821@gmail.com --agree-tos --no-eff-email