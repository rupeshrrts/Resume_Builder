#!/usr/bin/env bash
# Runs on the server for every deploy (started by .github/workflows/deploy.yml). Safe to run again:
# the first run installs Docker, opens the firewall and adds swap; every run rebuilds and restarts the app.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -s .env ]; then
  echo "deploy/.env is missing: add the APP_ENV secret in GitHub (see deploy/README.md)." >&2
  exit 1
fi
for key in DOMAIN DATABASE_URL; do
  if ! grep -q "^$key=." .env; then
    echo "$key is not set in the APP_ENV secret (see deploy/app.env.example)." >&2
    exit 1
  fi
done

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker…"
  curl -fsSL https://get.docker.com | sudo sh
fi

# Make sure the server's own firewall lets web traffic in (Azure's network rule is opened by azure-create-server.sh).
for rule in "-p tcp --dport 80" "-p tcp --dport 443" "-p udp --dport 443"; do
  # shellcheck disable=SC2086
  sudo iptables -C INPUT $rule -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 $rule -j ACCEPT
done
if command -v netfilter-persistent >/dev/null 2>&1; then sudo netfilter-persistent save >/dev/null 2>&1 || true; fi

# Building the website needs a few GB of memory; small servers get a swap file.
if [ "$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)" -lt 4000 ] && [ "$(swapon --show | wc -l)" -eq 0 ]; then
  echo "Adding 4 GB of swap…"
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# The website and the API share this secret. It's made once and kept outside the app folder,
# so it stays the same across deploys.
secret_file="$HOME/.resume-builder-proxy-secret"
if [ ! -s "$secret_file" ]; then (umask 077; openssl rand -hex 32 > "$secret_file"); fi
grep -q '^PROXY_SECRET=' .env || echo "PROXY_SECRET=$(cat "$secret_file")" >> .env

trap 'echo "Deploy failed. Recent logs:" >&2; sudo docker compose logs --tail=60 api web caddy >&2' ERR

# Images are built before the running containers are replaced, so the site is only down for a few seconds.
# One at a time: building both at once runs a 1 GB server out of memory.
sudo docker compose build api
sudo docker compose build web
sudo docker compose up -d --remove-orphans --wait --wait-timeout 300
sudo docker image prune -f >/dev/null

echo "Deployed: https://$(grep '^DOMAIN=' .env | cut -d= -f2-)"
