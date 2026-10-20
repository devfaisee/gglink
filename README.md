# GGLINK — Minimalist In-Game Media Sharer & Link Hub

An ultra-fast, mobile-first media sharing tool engineered for gaming communities (Free Fire, PUBG Mobile, King's Choice, COD Mobile, MLBB). Allows players to drop voice notes, screenshots, and shortlinks with a 4-character URL that can be typed directly into restricted in-game chat boxes.

## Architecture

- **Backend:** Node.js / Express configured for both local development and Vercel Serverless Functions (`@vercel/node`).
- **Frontend:** Vanilla HTML5, modern Tailwind CSS, Web Audio API with real-time waveform visualizer, client-side WebP canvas compression, and WebM Opus audio encoding.
- **Storage Strategy:** Memory-backed + local JSON fallback with data URI encoding for instant serverless deployment without external bucket dependencies.
- **Monetization Engine:** Tasteful, non-intrusive native sponsored cards (designed for Google AdSense responsive units + universal gaming affiliate top-up cards).
- **Security:** Built-in rate limiting, automated anti-phishing keyword guards, and abuse reporting.

## Deploying to Vercel

```bash
npm install -g vercel
vercel deploy --prod
```

## Running Locally

```bash
npm install
node server.js
```
