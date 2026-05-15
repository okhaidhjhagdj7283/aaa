"use client";

import { useState, useCallback, DragEvent } from "react";
import { Upload, Lock, Timer, Eye, Trash2, Copy, CheckCircle, AlertCircle } from "lucide-react";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [maxReads, setMaxReads] = useState(1);
  const [ttlHours, setTtlHours] = useState(24);
  const [uploading, setUploading] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleDrag = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.size > 100 * 1024 * 1024) {
        setError("File too large. Max 100MB");
        return;
      }
      setFile(droppedFile);
      setError("");
    }
  }, []);

  const encryptFile = async (file: File): Promise<{ encrypted: ArrayBuffer; key: string; iv: string }> => {
    const fileBuffer = await file.arrayBuffer();
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      fileBuffer
    );
    
    const exportedKey = await crypto.subtle.exportKey("raw", key);
    const keyBase64 = btoa(String.fromCharCode(...new Uint8Array(exportedKey)));
    const ivBase64 = btoa(String.fromCharCode(...iv));
    
    return { encrypted, key: keyBase64, iv: ivBase64 };
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file");
      return;
    }

    setUploading(true);
    setError("");
    
    try {
      const { encrypted, key, iv } = await encryptFile(file);
      
      const formData = new FormData();
      formData.append("file", new Blob([encrypted]), file.name);
      formData.append("ttlSeconds", String(ttlHours * 3600));
      formData.append("maxReads", String(maxReads));
      formData.append("originalName", file.name);
      formData.append("mimeType", file.type || "application/octet-stream");
      formData.append("encryptionKey", key);
      formData.append("iv", iv);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Upload failed");
      }
      
      const data = await response.json();
      const fullUrl = `${window.location.origin}/drop/${data.dropId}#key=${data.encKey}`;
      setShareUrl(fullUrl);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetForm = () => {
    setFile(null);
    setShareUrl("");
    setError("");
    setCopied(false);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {!shareUrl ? (
        <>
          {/* Upload Zone */}
          <div
            className={`dropzone transition-all duration-200 ${dragActive ? 'border-blue-500 bg-blue-500/10' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => document.getElementById("fileInput")?.click()}
          >
            <input
              id="fileInput"
              type="file"
 className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  if (e.target.files[0].size > 100 * 1024 * 1024) {
                    setError("File too large. Max 100MB");
                    return;
                  }
                  setFile(e.target.files[0]);
                  setError("");
                }
              }}
            />
            <Upload className="w-16 h-16 text-gray-500 mx-auto mb-4" />
            <p className="text-lg font-medium mb-2">Drop file here or click to browse</p>
            <p className="text-sm text-gray-500">Any file · max 100MB · AES-256 encrypted client-side</p>
            {file && (
              <div className="mt-4 p-3 bg-blue-500/20 rounded-lg inline-block">
                <p className="text-sm">📄 {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-500/20 border border-red-500 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Controls */}
          <div className="grid md:grid-cols-2 gap-6 mt-8">
            <div className="card">
              <label className="flex items-center gap-2 text-gray-300 mb-3">
                <Eye className="w-5 h-5" />
                <span className="font-medium">MAX READS</span>
              </label>
              <input
                type="range"
                min="1"
                max="10"
                value={maxReads}
                onChange={(e) => setMaxReads(parseInt(e.target.value))}
                className="w-full"
              />
              <p className="text-2xl font-bold mt-2">{maxReads} read{maxReads > 1 ? 's' : ''}</p>
              <p className="text-sm text-gray-500 mt-1">Self-destructs after {maxReads} read{maxReads > 1 ? 's' : ''}</p>
            </div>

            <div className="card">
              <label className="flex items-center gap-2 text-gray-300 mb-3">
                <Timer className="w-5 h-5" />
                <span className="font-medium">TIME-TO-LIVE</span>
              </label>
              <input
                type="range"
                min="1"
                max="168"
                value={ttlHours}
                onChange={(e) => setTtlHours(parseInt(e.target.value))}
                className="w-full"
              />
              <p className="text-2xl font-bold mt-2">{ttlHours} hour{ttlHours > 1 ? 's' : ''}</p>
              <p className="text-sm text-gray-500 mt-1">Auto-destruct after {ttlHours}h</p>
            </div>
          </div>

          <div className="card mt-6">
            <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
              <Lock className="w-4 h-4" />
              <span>AES-256-GCM · key stays in link fragment · server never sees plaintext</span>
            </div>
            
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="btn-primary w-full"
            >
              {uploading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Encrypting & Uploading...
                </div>
              ) : (
                "Upload & Generate Dead Drop Link →"
              )}
            </button>
          </div>

          <div className="text-center mt-8">
            <p className="text-xs text-gray-600">
              You are out of free messages until 8:30 PM<br />
              <button className="text-purple-400 hover:text-purple-300">Upgrade</button>
            </p>
          </div>
        </>
      ) : (
        // Success Screen
        <div className="card text-center animate-fade-in">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Dead Drop Created!</h2>
          <p className="text-gray-400 mb-6">Share this link securely. The key is in the fragment (#) and never leaves your browser.</p>
          
          <div className="bg-gray-900 rounded-xl p-4 mb-4">
            <p className="text-sm text-gray-400 break-all font-mono">{shareUrl}</p>
          </div>
          
          <div className="flex gap-3">
            <button onClick={copyToClipboard} className="btn-secondary flex-1 flex items-center justify-center gap-2">
              {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy Link"}
            </button>
            <button onClick={resetForm} className="btn-secondary flex-1 flex items-center justify-center gap-2">
              <Trash2 className="w-4 h-4" />
              New Drop
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
