# ImagEase

A React + Vite web app that lets you upload an image and automatically generates cropped/resized versions for predefined slots — all client-side, nothing uploaded to any server.

## Features

- **5 preset sizes** with centered `object-fit: cover` crop
- **Custom sizes** — add as many as you like
- **Output formats** — WEBP, PNG, or JPEG
- **Download All** as a ZIP
- **Individual download** per image
- **Light / Dark mode** toggle
- Fully client-side — images never leave your browser

## Preset Sizes

| Filename | Width × Height |
|---|---|
| hero-image-desktop | 1440 × 800 |
| hero-image-mobile | 375 × 720 |
| program-image | 375 × 470 |
| amenities-image | 342 × 428 |
| community-image | 300 × 300 |

## Getting Started

```bash
npm install
npm run dev
```

## Deploy to Vercel

Push to GitHub and connect the repo in Vercel. Vercel will auto-detect Vite and build with:

- **Build command**: `npm run build`
- **Output directory**: `dist`

The included `vercel.json` handles SPA routing.
