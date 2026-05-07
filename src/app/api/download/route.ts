import { NextRequest, NextResponse } from "next/server";

const COBALT_API_URL = process.env.COBALT_API_URL || "http://localhost:9000";

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

    // Call Cobalt API
    const cobaltResponse = await fetch(`${COBALT_API_URL}/api/json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        url: url,
        vQuality: "720",
        filenamePattern: "pretty",
        isAudioOnly: false,
        disableMetadata: false,
      }),
    });

    const data = await cobaltResponse.json();

    // Handle error response
    if (data.status === "error") {
      return NextResponse.json(
        { error: data.text || "Failed to process video" },
        { status: 400 }
      );
    }

    // Handle single video (redirect or stream)
    if (data.status === "redirect" || data.status === "stream") {
      return NextResponse.json({
        success: true,
        downloadUrl: data.url,
        filename: data.filename || "video.mp4",
      });
    }

    // Handle multiple items (picker - Instagram carousels, etc.)
    if (data.status === "picker") {
      const pickerItems: unknown[] = Array.isArray(data.picker) ? data.picker : [];

      return NextResponse.json({
        success: true,
        multiple: true,
        items: pickerItems.filter(isPickerItem)
          .map((item) => ({
            url: item.url,
            thumb: item.thumb,
            type: item.type,
          })),
      });
    }

    return NextResponse.json({ error: "Unexpected response" }, { status: 500 });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json(
      { error: "Server error. Please try again." },
      { status: 500 }
    );
  }
}
