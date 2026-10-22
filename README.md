# 🎙️ PodLive

**PodLive** is a next-generation live podcast and streaming platform. Creators can go live with ultra-low latency, invite any viewer onto the stage in real time (like receiving a phone call), and have every session automatically recorded, transcoded, and published to their profile.

🌐 **Live demo:** [podlive-sigma.vercel.app](https://podlive-sigma.vercel.app)

> *Har Awaaz Ko Ek Stage!*

---

## ✨ Key Features

- ⚡ **Ultra-low latency streaming** powered by WebRTC and a LiveKit SFU (target: 300–800 ms)
- 🎤 **Stage Invite** — the host searches a viewer by their unique handle and invites them live; the viewer gets an Accept / Decline popup and joins the conversation instantly
- 🆔 **Unique user handles** — Instagram-style `@username` identity for every user
- 💬 **Live chat** and real-time viewer count
- 🔴 **Auto-recording and upload** — recordings are processed with FFmpeg, encoded into multiple qualities, and published to the host's profile automatically
- 📝 **Automatic subtitle generation** and VOD management
- 📺 **HLS adaptive bitrate** playback for large audiences
- 📈 **Built to scale** — WebRTC for the first batch of viewers, HLS over CDN beyond that

---

## 🧰 Tech Stack

| Layer | Technology |
| --- | --- |
| **Frontend** | Next.js (React), TypeScript, Tailwind CSS, Zustand, Framer Motion |
| **Real-time / Video** | LiveKit (WebRTC SFU), LiveKit Client SDK, Video.js + HLS.js |
| **Backend** | Node.js, Express, Socket.io |
| **Database** | PostgreSQL with Prisma ORM |
| **Storage** | Supabase Storage / S3-compatible (Cloudflare R2) |
| **Media processing** | FFmpeg, LiveKit Egress |
| **Auth** | JWT + bcrypt |

---

## 📁 Project Structure

```
Podlive/
├── infra/livekit/                 # LiveKit server configuration
├── podlive-backend/               # Node.js + Express API
├── podlive-web/                   # Next.js web app
├── PodLive_Complete_Roadmap.txt   # Full architecture and roadmap
├── PodLive_Complete_Roadmap.docx  # Roadmap (Word version)
├── start.sh                       # Starts LiveKit, backend, and frontend together
└── test-live.js                   # Live streaming test script
```

---

## 🏗️ How It Works

### Going live
1. The host logs in and clicks **Go Live**.
2. The backend creates a live session and generates a LiveKit room token.
3. The host's browser joins the LiveKit room and publishes audio/video over WebRTC.
4. Viewers are notified through Socket.io and join with the WebRTC or HLS player.
5. LiveKit Egress records the session in the background.

### Stage Invite
1. The host types a viewer's unique handle in the dashboard.
2. The backend looks up the user and emits a `stage_invite` event over Socket.io.
3. The viewer sees an **Accept / Decline** popup.
4. On accept, the backend issues a LiveKit participant token and the viewer joins the room.
5. Host and guest talk in real time while every other viewer watches.

### After the live ends
1. The recording is merged and encoded with FFmpeg.
2. The final video and thumbnail are uploaded to storage.
3. The recording appears automatically on the host's profile.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL
- [LiveKit server](https://docs.livekit.io/home/self-hosting/local/) installed locally (or a LiveKit Cloud project)
- FFmpeg (for recording processing)

### 1. Clone the repository

```bash
git clone https://github.com/Amiteshyadav3333/Podlive.git
cd Podlive
```

### 2. Install dependencies

```bash
cd podlive-backend && npm install
cd ../podlive-web && npm install
cd ..
```

### 3. Configure environment variables

Create a `.env` file in `podlive-backend/`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/podlive
JWT_ACCESS_SECRET=your-access-secret
JWT_REFRESH_SECRET=your-refresh-secret

LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
LIVEKIT_HOST=ws://127.0.0.1:7880

# Storage (Supabase / S3 / Cloudflare R2)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=
```

> ⚠️ Never commit `.env` files or API keys to GitHub.

### 4. Set up the database

```bash
cd podlive-backend
npx prisma migrate dev
```

### 5. Run everything

From the project root:

```bash
./start.sh
```

This starts all three services:

| Service | URL |
| --- | --- |
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5005 |
| LiveKit server | ws://127.0.0.1:7880 |

Press `Ctrl+C` to stop them all.

---

## 🗺️ Roadmap

| Phase | Focus |
| --- | --- |
| 1. Foundation | Authentication, unique handles, profiles, database |
| 2. Live Core | LiveKit streaming, host dashboard, viewer page, live chat |
| 3. Stage Invite | Invite viewers to stage, accept/decline flow, guest controls |
| 4. Recording | Auto-recording, FFmpeg processing, multi-quality upload |
| 5. Scale & Polish | HLS fallback, load testing, push notifications, discover page |

The complete plan, database schema, API design, and cost estimates are in [`PodLive_Complete_Roadmap.txt`](./PodLive_Complete_Roadmap.txt).

---

## 🤝 Contributing

1. Fork the repository
2. Create a branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "Add your feature"`
4. Push the branch: `git push origin feature/your-feature`
5. Open a Pull Request

---

## 👨‍💻 Author

**Amitesh Yadav** — [@Amiteshyadav3333](https://github.com/Amiteshyadav3333)

---

⭐ If you like this project, give it a star!
