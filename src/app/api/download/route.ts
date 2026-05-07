import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const YT_DLP_BIN = process.env.YT_DLP_BIN || "yt-dlp";
const YT_DLP_FORMAT = "b[height<=720]/best[height<=720]/b/best";

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
  };

  if (err.code === "ENOENT") {
    return "Video downloader is not configured on the server (yt-dlp not found).";
  }

  const details = err.stderr?.trim() || err.shortMessage?.trim() || err.message?.trim();
  return details || defaultMessage;
}

async function runYtDlp(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(YT_DLP_BIN, args, { maxBuffer: 1024 * 1024 * 10 });
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
    "--no-playlist",
    url,
  ]);

  try {
    return JSON.parse(output) as YtDlpMetadata;
  } catch {
    throw new Error("Unable to parse downloader metadata.");
  }
}

async function fetchDirectUrl(url: string): Promise<string> {
  const output = await runYtDlp([
    "--no-warnings",
    "--no-playlist",
    "-f",
    YT_DLP_FORMAT,
    "-g",
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
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    const metadata = await fetchMetadata(url);

    if (Array.isArray(metadata.entries) && metadata.entries.length > 1) {
      const limitedEntries = metadata.entries.slice(0, 10);
      const resolvedItems = await Promise.all(
        limitedEntries.map(async (entry) => {
          const entryUrl = entry.webpage_url || entry.url;
          if (!entryUrl) return null;

          try {
            const directUrl = await fetchDirectUrl(entryUrl);
            return {
              url: directUrl,
              thumb: entry.thumbnail,
              type: "video",
            };
          } catch {
            return null;
          }
        })
      );

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
      { status: 502 }
    );
  }
}
