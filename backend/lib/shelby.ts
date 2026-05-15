import ShelbySDK from "@shelby-protocol/sdk";

const shelby = new ShelbySDK({
  apiKey: process.env.SHELBY_API_KEY!,
  network: process.env.SHELBY_NETWORK ?? "testnet", // "testnet" | "mainnet"
});

export interface UploadBlobOptions {
  file: Buffer;
  filename: string;
  mimeType: string;
  ttlSeconds: number;    // Time-to-live: blob tự xóa sau bao lâu
  maxReads: number;      // Quota đọc tối đa
  encryptionKey: string; // AES-256 key (client-side encrypted, ta chỉ lưu ciphertext)
}

export interface BlobMeta {
  blobId: string;
  hash: string;
  size: number;
  createdAt: number;
  expiresAt: number;
}

/**
 * Upload encrypted blob lên Shelby storage
 * File đã được mã hóa AES-256 ở client trước khi gửi lên
 */
export async function uploadBlob(opts: UploadBlobOptions): Promise<BlobMeta> {
  const result = await shelby.blobs.upload({
    data: opts.file,
    metadata: {
      filename: opts.filename,
      mimeType: opts.mimeType,
      ttl: opts.ttlSeconds,
      maxReads: opts.maxReads,
    },
    accessControl: {
      payPerRead: false,   // Dead Drop: miễn phí đọc nếu có link
      maxReads: opts.maxReads,
      ttl: opts.ttlSeconds,
    },
  });

  return {
    blobId: result.blobId,
    hash: result.contentHash,
    size: result.size,
    createdAt: Date.now(),
    expiresAt: Date.now() + opts.ttlSeconds * 1000,
  };
}

/**
 * Đọc blob — Shelby tự trừ quota on-chain
 */
export async function readBlob(blobId: string): Promise<Buffer> {
  const data = await shelby.blobs.read(blobId);
  return Buffer.from(data);
}

/**
 * Xóa blob thủ công (khi quota = 0 hoặc user tự hủy)
 */
export async function deleteBlob(blobId: string): Promise<void> {
  await shelby.blobs.delete(blobId);
}

/**
 * Lấy metadata blob (số lần đọc còn lại, TTL...)
 */
export async function getBlobInfo(blobId: string) {
  return shelby.blobs.getInfo(blobId);
}
