import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { isAbsolute, normalize } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_PLAYLIST_ITEMS = 10;
const MAX_BUFFER_SIZE = 1024 * 1024 * 50;
const YT_DLP_FORMAT = "b[height<=720]/best[height<=720]/b/best";

type YtDlpCommand = {
  binary: string;
  prefixArgs: string[];
};
const YT_DLP_RESOLUTION_RETRY_MS = 60_000;

function resolveConfiguredYtDlpBinary(): string | null {
  const configuredBinary = process.env.YT_DLP_BIN?.trim();
  if (!configuredBinary) {
    return null;
  }

  const safeCommandPattern = /^[A-Za-z0-9._-]+$/;
  if (safeCommandPattern.test(configuredBinary) && !configuredBinary.startsWith("-")) {
    return configuredBinary;
  }

  const safePathPattern = /^[A-Za-z0-9._/-]+$/;
  const normalizedPath = normalize(configuredBinary);
  const isSafePath =
    safePathPattern.test(configuredBinary) &&
    isAbsolute(configuredBinary) &&
    !configuredBinary.includes("..") &&
    normalizedPath === configuredBinary;

  return isSafePath ? configuredBinary : null;
}

function getYtDlpCandidates(): YtDlpCommand[] {
  const configuredBinary = resolveConfiguredYtDlpBinary();
  const candidates: YtDlpCommand[] = [
    { binary: "yt-dlp", prefixArgs: [] },
    { binary: "python3", prefixArgs: ["-m", "yt_dlp"] },
    { binary: "python", prefixArgs: ["-m", "yt_dlp"] },
    { binary: "py", prefixArgs: ["-m", "yt_dlp"] },
  ];

  if (configuredBinary) {
    candidates.unshift({ binary: configuredBinary, prefixArgs: [] });
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.binary} ${candidate.prefixArgs.join(" ")}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

let cachedYtDlpCommand: YtDlpCommand | null = null;
let cachedYtDlpResolutionError: Error | null = null;
let cachedYtDlpResolutionErrorAt = 0;
let ytDlpResolutionPromise: Promise<YtDlpCommand> | null = null;

function formatYtDlpCommand(command: YtDlpCommand): string {
  return [command.binary, ...command.prefixArgs].join(" ");
}

async function resolveYtDlpCommand(): Promise<YtDlpCommand> {
  if (cachedYtDlpCommand) {
    return cachedYtDlpCommand;
  }

  const now = Date.now();
  const hasRecentResolutionError =
    cachedYtDlpResolutionError && now - cachedYtDlpResolutionErrorAt < YT_DLP_RESOLUTION_RETRY_MS;
  if (hasRecentResolutionError && cachedYtDlpResolutionError) {
    throw cachedYtDlpResolutionError;
  }

  if (ytDlpResolutionPromise) {
    return ytDlpResolutionPromise;
  }

  const candidates = getYtDlpCandidates();
  ytDlpResolutionPromise = (async () => {
    for (const candidate of candidates) {
      try {
        await execFileAsync(candidate.binary, [...candidate.prefixArgs, "--version"], {
          maxBuffer: MAX_BUFFER_SIZE,
        });
        cachedYtDlpCommand = candidate;
        cachedYtDlpResolutionError = null;
        cachedYtDlpResolutionErrorAt = 0;
        return candidate;
      } catch {
        continue;
      }
    }

    const attemptedCommands = candidates.map(formatYtDlpCommand).join(", ");
    const resolutionError = new Error(
      `Video downloader is not configured on the server. Install yt-dlp (or Python module yt_dlp) and optionally set YT_DLP_BIN. Tried: ${attemptedCommands}`
    );
    cachedYtDlpResolutionError = resolutionError;
    cachedYtDlpResolutionErrorAt = Date.now();
    throw resolutionError;
  })();

  try {
    return await ytDlpResolutionPromise;
  } finally {
    ytDlpResolutionPromise = null;
  }
}

function isPickerItem(item: unknown): item is {
  url: string;
  thumb?: string;
  type?: string;
} {
  if (typeof item !== "object" || item === null) return false;

  const candidate = item as Record<string, unknown>;

  return (
    typeof candidate.url === "string" &&
    candidate.url.length > 0 &&
    (candidate.thumb === undefined || typeof candidate.thumb === "string") &&
    (candidate.type === undefined || typeof candidate.type === "string")
  );
}

type YtDlpEntry = {
  url?: string;
  webpage_url?: string;
  thumbnail?: string;
};

type YtDlpMetadata = {
  title?: string;
  ext?: string;
  entries?: YtDlpEntry[];
};

function isYtDlpEntry(value: unknown): value is YtDlpEntry {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Record<string, unknown>;
  return (
    (candidate.url === undefined || typeof candidate.url === "string") &&
    (candidate.webpage_url === undefined || typeof candidate.webpage_url === "string") &&
    (candidate.thumbnail === undefined || typeof candidate.thumbnail === "string")
  );
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim();
}

function getErrorMessage(error: unknown): string {
  const defaultMessage = "Failed to process this URL with yt-dlp.";

  if (!error || typeof error !== "object") {
    return defaultMessage;
  }

  const err = error as {
    code?: string;
    stderr?: string;
    message?: string;
    shortMessage?: string;
    path?: string;
  };

  if (err.code === "ENOENT") {
    const missingBinary = err.path ? ` (${err.path} not found)` : "";
    return `Video downloader is not configured on the server${missingBinary}. Install yt-dlp (or Python module yt_dlp) and optionally set YT_DLP_BIN.`;
  }

  const details = err.stderr?.trim() || err.shortMessage?.trim() || err.message?.trim();
  return details || defaultMessage;
}

async function runYtDlp(args: string[]): Promise<string> {
  try {
    const command = await resolveYtDlpCommand();
    const { stdout } = await execFileAsync(command.binary, [...command.prefixArgs, ...args], {
      maxBuffer: MAX_BUFFER_SIZE,
    });
    return stdout.trim();
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

async function fetchMetadata(url: string): Promise<YtDlpMetadata> {
  const output = await runYtDlp([
    "--no-warnings",
    "--skip-download",
    "--dump-single-json",
    "--",
    url,
  ]);

  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("Unable to parse downloader metadata.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Downloader metadata has an unexpected format.");
  }

  const metadata = parsed as Record<string, unknown>;
  const entries =
    Array.isArray(metadata.entries) && metadata.entries.every(isYtDlpEntry)
      ? metadata.entries
      : undefined;

  return {
    title: typeof metadata.title === "string" ? metadata.title : undefined,
    ext: typeof metadata.ext === "string" ? metadata.ext : undefined,
    entries,
  };
}

async function fetchDirectUrl(url: string): Promise<string> {
  const output = await runYtDlp([
    "--no-warnings",
    "--no-playlist",
    "-f",
    YT_DLP_FORMAT,
    "-g",
    "--",
    url,
  ]);

  const directUrl = output.split(/\r?\n/).find((line) => line.trim().length > 0);
  if (!directUrl) {
    throw new Error("Unable to resolve a direct download URL.");
  }

  return directUrl;
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: "Only HTTP(S) video URLs are supported" }, { status: 400 });
    }

    const metadata = await fetchMetadata(url);

    if (Array.isArray(metadata.entries) && metadata.entries.length > 1) {
      const limitedEntries = metadata.entries.slice(0, MAX_PLAYLIST_ITEMS);
      const resolvedItems: Array<{ url: string; thumb?: string; type: "video" } | null> = [];

      for (const [entryIndex, entry] of limitedEntries.entries()) {
        const entryUrl = entry.webpage_url || entry.url;
        if (!entryUrl) {
          resolvedItems.push(null);
          continue;
        }

        try {
          const directUrl = await fetchDirectUrl(entryUrl);
          resolvedItems.push({
            url: directUrl,
            thumb: entry.thumbnail,
            type: "video",
          });
        } catch (entryError) {
          console.warn(
            `Skipping playlist item ${entryIndex + 1} after extraction failure: ${getErrorMessage(entryError)}`
          );
          resolvedItems.push(null);
        }
      }

      const items = resolvedItems.filter(isPickerItem);
      if (items.length > 0) {
        return NextResponse.json({
          success: true,
          multiple: true,
          items,
        });
      }
    }

    const downloadUrl = await fetchDirectUrl(url);
    const extension = metadata.ext || "mp4";
    const filename = metadata.title
      ? `${sanitizeFilename(metadata.title)}.${extension}`
      : `video.${extension}`;

    return NextResponse.json({
      success: true,
      downloadUrl,
      filename,
    });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server error. Please try again." },
      { status: 500 }
    );
  }
}
