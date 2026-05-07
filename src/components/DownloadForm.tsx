"use client";

import { useState } from "react";
import { Loader2, Download as DownloadIcon, Clipboard, AlertCircle, CheckCircle } from "lucide-react";
import { Platform, DownloadItem } from "@/types";

interface DownloadFormProps {
  platform: Platform;
}

export default function DownloadForm({ platform }: DownloadFormProps) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [multipleItems, setMultipleItems] = useState<DownloadItem[]>([]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      setError("");
    } catch {
      setError("Failed to read clipboard. Please paste manually.");
    }
  };

  const triggerDownload = (downloadUrl: string, filename: string) => {
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownload = async () => {
    if (!url.trim()) {
      setError("Please enter a video URL");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    setMultipleItems([]);

    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to download video");
        return;
      }

      if (data.multiple && data.items) {
        setMultipleItems(data.items);
        setSuccess(`Found ${data.items.length} items. Click on any to download.`);
      } else if (data.downloadUrl) {
        triggerDownload(data.downloadUrl, data.filename || "video.mp4");
        setSuccess("Download started! Check your downloads folder.");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleItemDownload = (item: DownloadItem) => {
    triggerDownload(item.url, "video.mp4");
    setSuccess("Download started!");
  };

  return (
    <div className="glass-card p-6">
      {/* Platform Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className={`${platform.bgColor} rounded-lg p-3`}>
          <span className="text-3xl">{platform.icon}</span>
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-800">{platform.name}</h2>
          <p className="text-sm text-gray-600">Download videos easily</p>
        </div>
      </div>

      {/* URL Input */}
      <div className="mb-4">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={platform.placeholder}
          className="w-full px-4 py-3 border-2 border-teal-400 rounded-xl focus:outline-none focus:border-teal-600 transition-colors"
          disabled={loading}
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle size={20} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle size={20} />
          <span className="text-sm">{success}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleDownload}
          disabled={loading}
          className="flex-1 btn-primary flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <DownloadIcon size={20} />
              Download
            </>
          )}
        </button>
        <button
          onClick={handlePaste}
          disabled={loading}
          className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors"
        >
          <Clipboard size={20} />
        </button>
      </div>

      {/* Multiple Items Grid */}
      {multipleItems.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Available Items</h3>
          <div className="grid grid-cols-2 gap-3">
            {multipleItems.map((item, index) => (
              <button
                key={index}
                onClick={() => handleItemDownload(item)}
                className="relative rounded-lg overflow-hidden hover:opacity-90 transition-opacity"
              >
                {item.thumb && (
                  <img
                    src={item.thumb}
                    alt={`Item ${index + 1}`}
                    className="w-full h-32 object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <DownloadIcon size={32} className="text-white" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
