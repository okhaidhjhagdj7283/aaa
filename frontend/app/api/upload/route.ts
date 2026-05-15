import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { uploadBlob } from "@/lib/shelby";
import { registerDrop, generateDropId } from "@/lib/aptos";
import { Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";

export const config = { api: { bodyParser: false } };

const MAX_FILE_SIZE = 100 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const file = formData.get("file") as File | null;
    const ttlSeconds = parseInt(formData.get("ttlSeconds") as string) || 86400;
    const maxReads = parseInt(formData.get("maxReads") as string) || 1;
    const originalName = formData.get("originalName") as string;
    const mimeType = formData.get("mimeType") as string;
    const encKey = formData.get("encryptionKey") as string;
    const iv = formData.get("iv") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 100MB)" }, { status: 413 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Compute hash for on-chain integrity
    const blobHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

    // Upload to Shelby
    const blobMeta = await uploadBlob({
      file: fileBuffer,
      filename: originalName,
      mimeType: mimeType || "application/octet-stream",
      ttlSeconds,
      maxReads,
      encryptionKey: encKey,
    });

    const dropId = generateDropId();

    // For demo, use a backend account
    // In production, client should sign
    const privateKey = process.env.APTOS_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("APTOS_PRIVATE_KEY not set");
    }
    const senderKey = new Ed25519PrivateKey(privateKey);
    const senderAccount = Account.fromPrivateKey({ privateKey: senderKey });

    const txHash = await registerDrop({
      dropId,
      blobId: blobMeta.blobId,
      blobHash,
      ttlSeconds,
      maxReads,
      senderAccount,
    });

    return NextResponse.json({
      dropId,
      blobId: blobMeta.blobId,
      encKey: encKey,
      txHash,
      expiresAt: blobMeta.expiresAt,
      maxReads,
      shareUrl: `/drop/${dropId}#key=${encKey}`,
    });
  } catch (err: any) {
    console.error("[upload] error:", err);
    return NextResponse.json(
      { error: err.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
