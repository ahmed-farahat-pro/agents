# EC2 / network: dashboard, Socket.IO, and voice meeting

Use this when deploying the dashboard + meeting room (`/meeting-room.html`) and Telegram links behind **AWS EC2**.

## What needs inbound traffic

| Service | Port | Notes |
|--------|------|--------|
| **SSH** | 22 | Your IP (or bastion) only — not `0.0.0.0/0` in production |
| **HTTP** | 80 | If using nginx/Certbot → redirects to HTTPS |
| **HTTPS** | 443 | **Preferred** for browser mic + Web Speech API (many browsers require secure context except `localhost`) |
| **Dashboard (direct)** | **4000** (or `DASHBOARD_PORT`) | Only if you expose the Node process **without** nginx. If nginx terminates TLS on 443 and proxies to `127.0.0.1:4000`, **do not** open 4000 to the world — keep it **localhost-only** on the instance |

**Jitsi** (`meet.jit.si` or your `JITSI_DOMAIN`) runs in the **user’s browser** and connects **outbound** to Jitsi servers. You do **not** open extra EC2 ports for Jitsi.

**Telegram bot** uses **long polling** by default: the instance makes **outbound** HTTPS to `api.telegram.org`. No inbound port for Telegram unless you switch to webhooks (then you’d expose HTTPS and register the webhook URL).

## Socket.IO (dashboard real-time)

Socket.IO uses the **same HTTP(S) server** as Express (same port as the dashboard). It is not a separate TCP port.

- If users hit **`https://your-domain` (443)** → nginx proxies to Node → **WebSockets** must be allowed on that proxy (see below).
- **Security group:** allow **443** (and **80** if needed). No extra “Socket.IO port”.

### nginx (WebSocket upgrade)

If you terminate TLS on nginx, ensure something like:

```nginx
location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Socket.IO default path is `/socket.io/` — same `location /` usually works.

## Environment on the server

```bash
# Public URL users + Telegram will use (HTTPS, no trailing slash)
PUBLIC_DASHBOARD_URL=https://your-domain.com

# If bot runs on another host than the dashboard:
MEETING_INTERNAL_SECRET=<same secret on both>
```

- **`PUBLIC_DASHBOARD_URL`** must match how users open the site (scheme + host + port if not 443).
- **Meeting + mic:** prefer **HTTPS** so browsers allow microphone and speech APIs.

## Quick checklist

1. **Security group:** inbound **22** (restricted), **80** / **443** as needed.
2. **Do not** expose **4000** publicly if nginx listens on **443** and proxies to localhost:4000.
3. **nginx:** WebSocket `Upgrade` / `Connection` headers for Socket.IO.
4. **`.env`:** `PUBLIC_DASHBOARD_URL=https://...`, `DASHBOARD_PORT=4000` (internal), optional `MEETING_INTERNAL_SECRET` for split bot/dashboard.
5. **Firewall on the instance** (`ufw` / `firewalld`): align with the above (often allow 22, 80, 443; Node bound to localhost only).

## Troubleshooting

| Symptom | Check |
|--------|--------|
| Dashboard loads but live updates never connect | Socket.IO blocked: nginx missing WebSocket headers; or wrong `PUBLIC_DASHBOARD_URL`; mixed content (HTTPS page calling HTTP API). |
| Meeting room: mic / speech not working | Use **HTTPS**; grant mic permission in browser; try Chrome/Edge. |
| Telegram `/meeting` link wrong host | Fix `PUBLIC_DASHBOARD_URL` and restart bot + dashboard. |
| 401 on meeting API from browser | Session token routes: use `meeting-room.html?token=...` for public roundtable; dashboard still needs login for `/api/meeting/sessions` (generate link). |
