# DiscoRelay

Lightweight Discord webhook notification relay. Receives webhooks from your services, formats them into clean Discord embeds, and routes them to the right channel.

> **Lightweight Discord webhook relay that improves formatting and presentation of notifications. Not intended to replace [Notifiarr](https://github.com/Notifiarr)—if you want the most polished appearance and actively maintained solution, [Notifiarr](https://github.com/Notifiarr) remains the better choice.**

## Supported Sources

| Source | Endpoint | Routes to |
|--------|----------|-----------|
| Grafana | `/webhook/grafana` | critical/warning/daily (auto by severity) |
| Radarr | `/webhook/radarr` | media |
| Sonarr | `/webhook/sonarr` | media |
| Lidarr | `/webhook/lidarr` | media |
| Tautulli | `/webhook/tautulli` | media |
| Backrest | `/webhook/backrest` | critical (fail) / daily (success) |
| Uptime Kuma | `/webhook/uptimekuma` | critical (down) / daily (up) |

## Setup

```bash
cp config.example.json config.json
# Edit config.json — paste your Discord webhook URLs
docker compose up -d
```

## Config

Edit `config.json`:
- `discord.critical` — webhook URL for critical alerts
- `discord.warning` — webhook URL for warnings
- `discord.daily` — webhook URL for daily/resolved notifications
- `discord.media` — webhook URL for media notifications
- `port` — server port (default 3080)

## Service Configuration

Point each service's webhook/notification URL to `http://discorelay:3080/webhook/<source>`.

### Grafana
Alerting → Contact Points → New → Webhook → URL: `http://discorelay:3080/webhook/grafana`

### Radarr/Sonarr/Lidarr
Settings → Connect → Add → Webhook → URL: `http://discorelay:3080/webhook/radarr` (etc.)

### Tautulli
Settings → Notification Agents → Add → Webhook → URL: `http://discorelay:3080/webhook/tautulli`

### Backrest
Settings → Notifications → Webhook → URL: `http://discorelay:3080/webhook/backrest`

### Uptime Kuma
Settings → Notifications → Webhook → URL: `http://discorelay:3080/webhook/uptimekuma`

## Health Check

```
GET /health
```

## Adding New Sources

Drop a new parser in `src/parsers/<name>.js`. It should export a function that takes `(body, sourceConfig)` and returns an array of `{ route, embed }` objects. Restart the container.
