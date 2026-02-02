#!/bin/bash
# ============================================================
# EC2 Initial Setup Script — Run this ONCE on a fresh Ubuntu 22/24
# Usage: ssh into EC2 then run:
#   curl -sL https://raw.githubusercontent.com/YOUR_USER/voiceai-hub/main/scripts/ec2-setup.sh | bash
#   OR copy this file to EC2 and run: bash ec2-setup.sh
# ============================================================

set -e

echo "╔══════════════════════════════════════════╗"
echo "║   🚀 VoiceAI Hub — EC2 Setup            ║"
echo "╚══════════════════════════════════════════╝"

# ---- 1. System updates ----
echo "📦 Updating system..."
sudo apt update && sudo apt upgrade -y

# ---- 2. Install Node.js 20 LTS ----
echo "📦 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

echo "   Node: $(node -v)"
echo "   NPM:  $(npm -v)"

# ---- 3. Install PM2 (process manager) ----
echo "📦 Installing PM2..."
sudo npm install -g pm2

# ---- 4. Install Nginx (reverse proxy) ----
echo "📦 Installing Nginx..."
sudo apt install -y nginx

# ---- 5. Install Certbot (SSL) ----
echo "📦 Installing Certbot..."
sudo apt install -y certbot python3-certbot-nginx

# ---- 6. Install Git ----
echo "📦 Installing Git..."
sudo apt install -y git

# ---- 7. Clone the repo ----
echo "📂 Cloning repository..."
cd /home/ubuntu
if [ -d "voiceai-hub" ]; then
  echo "   Directory exists, pulling latest..."
  cd voiceai-hub && git pull origin main
else
  echo "   ⚠️  Clone your repo manually:"
  echo "   git clone https://github.com/YOUR_USER/voiceai-hub.git"
  echo "   cd voiceai-hub"
  mkdir -p voiceai-hub
  cd voiceai-hub
fi

# ---- 8. Create data directory ----
mkdir -p data

# ---- 9. Setup .env ----
if [ ! -f .env ]; then
  echo "📝 Creating .env from template..."
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "   ⚠️  Edit .env with your actual values:"
    echo "   nano /home/ubuntu/voiceai-hub/.env"
  else
    echo "   ⚠️  No .env.example found — create .env manually"
  fi
fi

# ---- 10. Install npm deps ----
if [ -f package.json ]; then
  echo "📦 Installing Node.js dependencies..."
  npm ci --production
fi

# ---- 11. Nginx config ----
echo "🌐 Configuring Nginx..."
sudo tee /etc/nginx/sites-available/voiceai-hub > /dev/null <<'NGINX'
server {
    listen 80;
    server_name _;  # Replace _ with your domain if you have one

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/voiceai-hub /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx

# ---- 12. Setup PM2 startup on reboot ----
echo "⚙️  Setting up PM2 startup..."
pm2 startup systemd -u ubuntu --hp /home/ubuntu | tail -1 | sudo bash

# ---- 13. Firewall ----
echo "🔥 Configuring firewall..."
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw --force enable

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   ✅ Setup Complete!                                ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║                                                      ║"
echo "║  Next steps:                                         ║"
echo "║                                                      ║"
echo "║  1. Clone your repo (if not done):                   ║"
echo "║     cd /home/ubuntu                                  ║"
echo "║     git clone YOUR_REPO_URL voiceai-hub              ║"
echo "║     cd voiceai-hub && npm ci --production            ║"
echo "║                                                      ║"
echo "║  2. Edit your .env:                                  ║"
echo "║     nano /home/ubuntu/voiceai-hub/.env               ║"
echo "║                                                      ║"
echo "║  3. Start the server:                                ║"
echo "║     cd /home/ubuntu/voiceai-hub                      ║"
echo "║     pm2 start src/server.js --name voiceai-hub       ║"
echo "║     pm2 save                                         ║"
echo "║                                                      ║"
echo "║  4. (Optional) Setup SSL with your domain:           ║"
echo "║     sudo certbot --nginx -d yourdomain.com           ║"
echo "║                                                      ║"
echo "║  5. Update Telnyx Voice App webhook URL:             ║"
echo "║     http://YOUR_EC2_IP/webhooks/voice                ║"
echo "║     (or https://yourdomain.com/webhooks/voice)       ║"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
