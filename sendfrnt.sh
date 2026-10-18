#!/usr/bin/env bash
docker compose build
docker build -t drawboard-frontend:latest .
docker save drawboard-frontend:latest -o drawboard-frontend.tar
scp drawboard-frontend.tar root@138.124.121.179:/root/board-frontend
scp makefrnt.sh setup_git_projects.sh root@138.124.121.179:/root/board-frontend