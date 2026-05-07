# Allsave

## Setup

This project now uses [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) for video URL extraction and downloads.

1. Install dependencies:
   ```bash
   npm ci
   ```
2. Install `yt-dlp` on the server or local machine running the Next.js app.
   - Linux/macOS (with Python):
     ```bash
     python3 -m pip install -U yt-dlp
     ```
   - Windows (PowerShell with Python):
     ```powershell
     py -m pip install -U yt-dlp
     ```
   - Or download a standalone binary from the official `yt-dlp` release page.
3. (Optional) Set a custom binary path:
   ```bash
   export YT_DLP_BIN=/absolute/path/to/yt-dlp
   ```
4. Run the app:
   ```bash
   npm run dev
   ```
