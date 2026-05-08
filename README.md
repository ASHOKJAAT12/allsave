# Allsave

## Setup

This project now uses [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) for video URL extraction and downloads.

1. Install dependencies:
   ```bash
   npm ci
   ```
2. Ensure a downloader is available for the server runtime.
   - Preferred for Vercel/managed hosting: this project includes `yt-dlp-exec`, which bundles a `yt-dlp` binary at install time.
   - You can still install `yt-dlp` manually on the server or local machine.
   - Linux/macOS (with Python):
     ```bash
     python3 -m pip install -U yt-dlp
     ```
   - Windows (PowerShell with Python):
     ```powershell
     py -m pip install -U yt-dlp
     ```
   - Or download a standalone binary from the official `yt-dlp` release page.
   - Runtime fallback order is: `YT_DLP_BIN` (if set and valid), bundled `yt-dlp-exec` binary, `yt-dlp`, `python3 -m yt_dlp`, `python -m yt_dlp`, then `py -m yt_dlp`.
3. (Optional) Set a custom binary path:
   ```bash
   export YT_DLP_BIN=/absolute/path/to/yt-dlp
   ```
4. Run the app:
   ```bash
   npm run dev
   ```
