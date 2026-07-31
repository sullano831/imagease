# ImagEase

A React + Vite web app that lets you upload an image and automatically generates cropped/resized versions for predefined slots — all client-side, nothing uploaded to any server.

## Features

- **6 preset sizes** with centered `object-fit: cover` crop
- **Custom sizes** — add as many as you like
- **Output formats** — WEBP, PNG, or JPEG
- **Download All** as a ZIP
- **Individual download** per image
- **Light / Dark mode** toggle
- Fully client-side — images never leave your browser

## Preset Sizes

| Filename | Width × Height |
|---|---|
| header-image | 1920 × 1080 |
| header-image-mobile | 480 × 720 |
| amenities-image | 480 × 720 |
| top-program-image | 480 × 720 |
| community-image | 510 × 620 |
| about-us-image | 510 × 620 |

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
