# Together — Sangat Edition

A PC-first, mobile-friendly shared listening room with a modern Indian / Gen-Z visual identity.

## Visual update
- Uploaded 16:9 Indian music-room artwork is used as the full login background.
- Login is a translucent glass card with warm, earthy tones.
- Removed the old neon visual language.
- New palette: charcoal, cream, saffron, terracotta, muted leaf green and rose.
- Subtle Indian editorial feel without making the interface look traditional or cluttered.

## Features
- username + room code
- invite links
- synchronized YouTube playback
- play/pause/seek/next/previous
- queue + history
- live chat
- people in room
- YouTube music search via `/api/search` when `YOUTUBE_API_KEY` is configured
- Spotify playlist/track/album embed connection
- responsive PC/mobile layout

## Run locally
```bash
npm install
npm start
```
Open `http://localhost:3000`.

## YouTube search on Render
Add an environment variable named `YOUTUBE_API_KEY` in Render. The key is kept server-side and is not placed in the frontend.
