#!/bin/bash
# ============================================================
# EC2 Initial Setup Script — Amazon Linux 2023
# Usage: ssh into EC2 then run: bash ec2-setup.sh
# ============================================================

set -e

echo "=== VoiceAI Hub — EC2 Setup ==="

# ---- 1. System updates ----
echo "Updating system..."
sudo dnf update -y

# ---- 2. Install Node.js 20 LTS ----
echo "Installing Node.js 20..."
sudo dnf install -y nodejs20 npm
sudo alternatives --set node /usr/bin/node20

echo "   Node: $(node -v)"
echo "   NPM:  $(npm -v)"

# ---- 3. Install PM2 (process manager) ----
echo "Installing PM2..."
sudo npm install -g pm2

# ---- 4. Install Nginx (reverse proxy) ----
echo "Installing Nginx..."
sudo dnf install -y nginx
sudo systemctl enable nginx

# ---- 5. Install Git ----
echo "Installing Git..."
sudo dnf install -y git

# ---- 6. Clone the repo ----
echo "Cloning repository..."
cd /home/ec2-user
if [ -d "voiceai-hub" ]; then
  echo "   Directory exists, pulling latest..."
  cd voiceai-hub && git pull origin main
else
  git clone https://github.com/alidano/mia.git voiceai-hub
  cd voiceai-hub
fi

# ---- 7. Create data directory ----
mkdir -p data

# ---- 8. Setup .env ----
if [ ! -f .env ]; then
  echo "Creating .env from template..."
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "   Edit .env with your actual values: nano .env"
  fi
fi

# ---- 9. Install npm deps ----
if [ -f package.json ]; then
  echo "Installing Node.js dependencies..."
  npm ci --production
fi

# ---- 10. Nginx config ----
echo "Configuring Nginx..."
sudo tee /etc/nginx/conf.d/voiceai-hub.conf > /dev/null <<'NGINX'
server {
    listen 80;
    server_name _;

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

sudo nginx -t && sudo systemctl restart nginx

# ---- 11. Setup PM2 startup on reboot ----
echo "Setting up PM2 startup..."
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user

echo ""
echo "=== Setup Complete! ==="
echo ""
echo "Next steps:"
echo "  1. Edit .env: nano /home/ec2-user/voiceai-hub/.env"
echo "  2. Start server: cd /home/ec2-user/voiceai-hub && pm2 start src/server.js --name voiceai-hub && pm2 save"
echo "  3. Update Telnyx webhook URL to: http://54.212.78.198/webhooks/voice"
