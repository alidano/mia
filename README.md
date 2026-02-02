# 🎙️ VoiceAI Hub

Servidor de bots de voz con IA usando Telnyx para Revita Wellness.  
Recibe llamadas → AI contesta → Guarda logs → Expone API para dashboard.

---

## Arquitectura

```
Cliente llama ──► Telnyx PSTN ──► Webhook ──► Este servidor
                                                   │
                                    ┌──────────────┼──────────────┐
                                    ▼              ▼              ▼
                              AI Assistant    SQLite DB     REST API
                              (STT+LLM+TTS)  (call logs)   (dashboard)
```

---

## Requisitos

- Node.js 18+
- Cuenta Telnyx con:
  - API Key (Mission Control → API Keys)
  - Número de teléfono con voz habilitada
  - Voice App configurada (ver paso 3)
- EC2 (Ubuntu 22/24) o cualquier VPS
- GitHub account

---

## Setup Local (Desarrollo)

### 1. Clonar e instalar

```bash
git clone https://github.com/YOUR_USER/voiceai-hub.git
cd voiceai-hub
npm install
```

### 2. Configurar environment

```bash
cp .env.example .env
# Editar .env con tus valores reales
```

### 3. Crear Voice App en Telnyx

1. Ir a [Mission Control](https://portal.telnyx.com) → Voice → Programmable Voice
2. Click "Create Voice App"
3. Configurar:
   - **App Name:** `VoiceAI Hub`
   - **Webhook URL:** `https://TU_NGROK_URL/webhooks/voice` (por ahora)
   - **API Version:** v2
   - **First Received Webhook:** `call.initiated`
4. En "Inbound" tab:
   - **Answering Machine Detection:** Disabled (para inbound)
   - **Receive Method:** POST
5. Save → Copiar el **Connection ID** → Pegar en .env como `TELNYX_CONNECTION_ID`
6. Ir a Numbers → Tu número → Asignar la Voice App que acabas de crear

### 4. Ejecutar en desarrollo

```bash
# Terminal 1 — Servidor
npm run dev

# Terminal 2 — Túnel público para webhooks
npx ngrok http 3000
```

Copiar la URL de ngrok (ej: `https://abc123.ngrok.io`) y actualizar:
- `.env` → `BASE_URL=https://abc123.ngrok.io`
- Telnyx Voice App → Webhook URL → `https://abc123.ngrok.io/webhooks/voice`

### 5. Probar

Llamar a tu número Telnyx → El bot debe contestar.

---

## Deploy a EC2 (Producción)

### 1. Crear EC2 Instance

- **AMI:** Ubuntu 22.04 o 24.04 LTS
- **Instance type:** t3.micro (suficiente para empezar, gratis en free tier)
- **Storage:** 20 GB gp3
- **Security Group:**
  - SSH (22) — Tu IP
  - HTTP (80) — 0.0.0.0/0
  - HTTPS (443) — 0.0.0.0/0
- **Key pair:** Crear o usar existente (.pem)

### 2. Conectar y setup inicial

```bash
ssh -i tu-key.pem ubuntu@TU_EC2_IP

# Ejecutar script de setup
bash scripts/ec2-setup.sh
```

### 3. Clonar repo y configurar

```bash
cd /home/ubuntu
git clone https://github.com/YOUR_USER/voiceai-hub.git
cd voiceai-hub
npm ci --production
cp .env.example .env
nano .env  # Llenar con valores reales
```

### 4. Iniciar servidor

```bash
pm2 start src/server.js --name voiceai-hub
pm2 save
```

### 5. (Opcional) SSL con dominio

```bash
# Apuntar tu dominio al EC2 IP en DNS
sudo certbot --nginx -d tudominio.com
```

### 6. Actualizar Telnyx

En Mission Control → Voice App:
- Webhook URL: `http://TU_EC2_IP/webhooks/voice`
- (o `https://tudominio.com/webhooks/voice` si tienes SSL)

---

## Deploy Automático (CI/CD)

Cada push a `main` deploya automáticamente a EC2.

### Configurar GitHub Secrets

En tu repo → Settings → Secrets → Actions:

| Secret | Valor |
|--------|-------|
| `EC2_HOST` | IP pública de tu EC2 |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | Contenido de tu archivo .pem |

---

## API Endpoints

### Webhooks (Telnyx → Este servidor)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/webhooks/voice` | POST | Eventos de llamada Telnyx |
| `/webhooks/tools/book-appointment` | POST | Callback de herramienta AI |

### REST API (Dashboard → Este servidor)

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/calls` | GET | Lista llamadas (con filtros) |
| `/api/calls/recent` | GET | Últimas 20 llamadas |
| `/api/calls/:callControlId` | GET | Detalle + transcripción |
| `/api/calls/outbound` | POST | Iniciar llamada saliente |
| `/api/stats/today` | GET | Estadísticas del día |
| `/api/stats/range` | GET | Stats por rango de fechas |
| `/api/health` | GET | Health check |

### Ejemplos de uso

```bash
# Llamadas recientes
curl http://localhost:3000/api/calls/recent

# Stats de hoy
curl http://localhost:3000/api/stats/today

# Llamadas filtradas
curl "http://localhost:3000/api/calls?direction=inbound&status=ended&limit=10"

# Iniciar llamada outbound
curl -X POST http://localhost:3000/api/calls/outbound \
  -H "Content-Type: application/json" \
  -d '{"to": "+15551234567"}'
```

---

## Estructura del Proyecto

```
voiceai-hub/
├── .env.example              ← Variables de entorno
├── .github/workflows/
│   └── deploy.yml            ← CI/CD auto-deploy a EC2
├── scripts/
│   └── ec2-setup.sh          ← Setup inicial del servidor
├── src/
│   ├── server.js             ← Express server principal
│   ├── config/
│   │   ├── index.js          ← Configuración centralizada
│   │   └── assistant-instructions.js  ← Prompt del bot
│   ├── models/
│   │   └── database.js       ← SQLite schema + queries
│   ├── routes/
│   │   ├── webhooks.js       ← Handlers de webhooks Telnyx
│   │   └── api.js            ← REST API para dashboard
│   └── services/
│       └── telnyx.js         ← Telnyx SDK wrapper
├── data/                     ← SQLite database (gitignored)
├── package.json
└── README.md
```

---

## Personalización

### Cambiar la voz del bot

En `.env`, cambiar `AI_VOICE`. Opciones populares en español:

| Voice | Provider | Calidad |
|-------|----------|---------|
| `Azure.es-MX-DaliaNeural` | Azure | ⭐⭐⭐⭐⭐ |
| `Azure.es-ES-ElviraNeural` | Azure | ⭐⭐⭐⭐ |
| `AWS.Polly.Lupe-Neural` | AWS | ⭐⭐⭐⭐ |
| `Telnyx.NaturalHD.Estelle` | Telnyx | ⭐⭐⭐ |

### Cambiar las instrucciones del bot

Editar `src/config/assistant-instructions.js` con los servicios, precios y personalidad que necesites.

### Conectar al portal de Revita Wellness

El REST API en `/api/*` está listo para ser consumido. Ejemplo con fetch:

```javascript
// Desde el portal admin de Revita Wellness
const response = await fetch('https://tuservidor.com/api/calls/recent');
const { data } = await response.json();
// data = array de llamadas con transcripción, sentimiento, etc.
```
