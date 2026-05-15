import ShelbySDK from "@shelby-protocol/sdk";

const shelby = new ShelbySDK({
  apiKey: process.env.SHELBY_API_KEY!,
  network: process.env.SHELBY_NETWORK ?? "testnet",
});

export interface UploadBlobOptions {
  file: Buffer;
  filename: string;
  mimeType: string;
  ttlSeconds: number;
  maxReads: number;
  encryptionKey: string;
}

export interface BlobMeta {
  blobId: string;
  hash: string;
  size: number;
  createdAt: number;
  expiresAt: number;
}

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
      payPerRead: false,
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

export async function readBlob(blobId: string): Promise<Buffer> {
  const data = await shelby.blobs.read(blobId);
  return Buffer.from(data);
}

export async function deleteBlob(blobId: string): Promise<void> {
  await shelby.blobs.delete(blobId);
}

export async function getBlobInfo(blobId: string) {
  return shelby.blobs.getInfo(blobId);
}
