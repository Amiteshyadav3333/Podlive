# PodLive Self-Hosted LiveKit Stack

This folder gives PodLive a self-hosted LiveKit setup with:

- LiveKit SFU
- Embedded TURN/STUN
- Redis for multi-node coordination and egress queues
- LiveKit Egress worker
- Caddy reverse proxy for HTTPS/WSS
- S3-compatible HLS/recording output
- Kubernetes/Helm starter values for moving beyond one VM

The included defaults use your current development credentials:

```txt
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=super-secret-and-very-secure-key-for-local-dev
```

Use these only for private testing. Rotate before production.

## Recommended Domains

Use separate subdomains:

```txt
live.yourdomain.com  -> LiveKit WebSocket/API through Caddy
turn.yourdomain.com  -> TURN/TLS domain
cdn.yourdomain.com   -> CDN in front of S3/R2/Supabase HLS objects
```

For your Vercel frontend:

```env
NEXT_PUBLIC_API_URL=https://podlive-api-18as.onrender.com
NEXT_PUBLIC_LIVEKIT_URL=wss://live.yourdomain.com
```

For your Render backend:

```env
LIVEKIT_URL=https://live.yourdomain.com
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=super-secret-and-very-secure-key-for-local-dev
ENABLE_LIVEKIT_HLS_EGRESS=true
```

## Single-VM Docker Compose

1. Copy the example env file:

```sh
cp infra/livekit/env.example infra/livekit/.env
```

2. Edit `infra/livekit/.env`:

```env
LIVEKIT_DOMAIN=live.yourdomain.com
TURN_DOMAIN=turn.yourdomain.com
PUBLIC_IP=your.vm.public.ip
S3_BUCKET=Podlive-videos
S3_ENDPOINT=https://dbliejijmxwjjsoigjvp.storage.supabase.co/storage/v1/s3
S3_PUBLIC_URL=https://cdn.yourdomain.com
```

3. Start the stack:

```sh
cd infra/livekit
docker compose up -d
```

4. Check logs:

```sh
docker compose logs -f livekit egress caddy
```

## Firewall Ports

Open these on your VM/security group:

```txt
80/tcp       Caddy HTTP challenge and redirect
443/tcp      HTTPS/WSS LiveKit API
7881/tcp     WebRTC TCP fallback
3478/udp     TURN/STUN UDP
5349/tcp     TURN/TLS if exposing directly
50000-60000/udp WebRTC media
```

Do not expose Redis publicly.

## HLS/CDN Strategy

For very large passive audiences, do not keep every viewer on WebRTC. Use this split:

```txt
Hosts/stage guests -> WebRTC through LiveKit
Interactive small audience -> WebRTC through LiveKit
Large passive audience -> HLS via S3/R2/Supabase Storage + CDN
```

Egress can publish HLS segments to your S3-compatible bucket. Put Cloudflare/CDN in front of the bucket and use that public URL in playback pages.

Backend env for automatic room HLS egress:

```env
ENABLE_LIVEKIT_HLS_EGRESS=true
LIVEKIT_URL=https://live.yourdomain.com
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=super-secret-and-very-secure-key-for-local-dev
S3_ENDPOINT=https://dbliejijmxwjjsoigjvp.storage.supabase.co/storage/v1/s3
S3_REGION=ap-south-1
S3_ACCESS_KEY=replace-me
S3_SECRET_KEY=replace-me
S3_BUCKET_NAME=Podlive-videos
S3_PUBLIC_URL=https://cdn.yourdomain.com
```

When a live session starts, the backend can request a LiveKit room-composite egress and publish a live HLS playlist at:

```txt
${S3_PUBLIC_URL}/live/<session-id>/live.m3u8
```

## Scaling Path

Single VM is good for validation. For serious scale:

- run LiveKit in Kubernetes or multiple high-network VMs
- use shared Redis
- place LiveKit API/WSS behind an L4/L7 load balancer
- keep UDP media ports reachable directly or via network load balancer
- run egress workers separately with autoscaling
- serve HLS with CDN, not from app servers
- shard giant events by room/region and push passive viewers to HLS

LiveKit self-hosted rooms are single-home SFU rooms. For "lakhs" of viewers, HLS/CDN is the scale layer.

## Files

- `docker-compose.yml` - single-VM LiveKit + Redis + Egress + Caddy stack
- `livekit.yaml` - LiveKit server config with embedded TURN
- `egress.yaml` - Egress config with S3 output placeholders
- `caddy/Caddyfile` - HTTPS/WSS reverse proxy
- `k8s/livekit-values.yaml` - Helm values starter for LiveKit
- `k8s/egress-values.yaml` - Helm values starter for Egress
