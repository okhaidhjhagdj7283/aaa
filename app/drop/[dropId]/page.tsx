"use client";

import { useState, useEffect } from "react";
import { Download, Lock, Eye, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";

export default function DropPage({ params }: { params: { dropId: string } }) {
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState("");
  const [encKey, setEncKey] = useState("");

  useEffect(() => {
    // Extract key from URL fragment
    const hash = window.location.hash;
    const keyMatch = hash.match(/key=([^&]+)/);
    if (keyMatch) {
      setEncKey(keyMatch[1]);
    } else {
      setError("Encryption key not found in URL. Make sure you copied the full link.");
    }

    // Check drop status
    fetch(`/api/status/${params.dropId}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setStatus(data);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.dropId]);

  const handleDownload = async () => {
    if (!encKey) return;
    
    setDownloading(true);
    setError("");
    
    try {
      const response = await fetch(`/api/read/${params.dropId}?encKey=${encKey}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Download failed");
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = response.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/["']/g, "") || "file";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-12 h-12 animate-spin text-purple-500" />
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="card text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Drop Not Found</h2>
          <p className="text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="card">
        {status?.isValid ? (
          <>
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-center mb-2">Secure Dead Drop</h2>
            <p className="text-gray-400 text-center mb-6">This file is encrypted and will self-destruct after download</p>
            
            <div className="space-y-3 mb-6">
              <div className="flex justify-between p-3 bg-gray-900 rounded-lg">
                <span className="text-gray-400">Reads remaining:</span>
                <span className="font-mono font-bold">{status.readsRemaining}</span>
              </div>
              <div className="flex justify-between p-3 bg-gray-900 rounded-lg">
                <span className="text-gray-400">Expires at:</span>
                <span className="font-mono">{new Date(status.expiresAt * 1000).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                <Lock className="w-4 h-4" />
                <span>AES-256-GCM encrypted</span>
              </div>
            </div>
            
            {error && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
            
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {downloading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Decrypting & Downloading...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Download File
                </>
              )}
            </button>
            
            <p className="text-xs text-center text-gray-600 mt-4">
              ⚠️ This file will self-destruct after download. Make sure to save it locally.
            </p>
          </>
        ) : (
          <>
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-center mb-2">Dead Drop Expired</h2>
            <p className="text-gray-400 text-center">
              This file has already been destroyed or expired.
              {status?.readsRemaining === 0 && " It was already downloaded the maximum number of times."}
              {status?.expiresAt && Date.now() / 1000 > status.expiresAt && " The TTL has expired."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
