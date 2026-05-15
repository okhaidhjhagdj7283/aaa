import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { uploadBlob } from "@/lib/shelby";
import { registerDrop, generateDropId } from "@/lib/aptos";
import { Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";

export const config = { api: { bodyParser: false } };

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    // --- Parse fields ---
    const file = formData.get("file") as File | null;
    const ttlSeconds = parseInt(formData.get("ttlSeconds") as string) || 86400;
    const maxReads = parseInt(formData.get("maxReads") as string) || 1;
    // walletPrivateKey: gửi từ client (signed tx từ Aptos wallet)
    // Trong production: dùng wallet adapter để sign, không gửi private key
    const signerPrivateKey = formData.get("signerKey") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 100MB)" }, { status: 413 });
    }

    // --- Read file buffer ---
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // --- AES-256-GCM encrypt ---
    // Trong production: encrypt ở client-side, server chỉ nhận ciphertext
    // Ở đây encrypt server-side để demo
    const encKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", encKey, iv);
    const encrypted = Buffer.concat([cipher.update(fileBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Đóng gói: iv (16) + authTag (16) + ciphertext
    const payload = Buffer.concat([iv, authTag, encrypted]);

    // --- Hash ciphertext để lưu on-chain ---
    const blobHash = crypto.createHash("sha256").update(payload).digest("hex");

    // --- Upload lên Shelby ---
    const blobMeta = await uploadBlob({
      file: payload,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      ttlSeconds,
      maxReads,
      encryptionKey: encKey.toString("hex"),
    });

    // --- Generate drop ID ---
    const dropId = generateDropId();

    // --- Register on Aptos ---
    // NOTE: Trong production, client sign transaction bằng wallet adapter
    // Backend chỉ submit pre-signed tx
    let txHash = "";
    if (signerPrivateKey) {
      const senderKey = new Ed25519PrivateKey(signerPrivateKey);
      const senderAccount = Account.fromPrivateKey({ privateKey: senderKey });

      txHash = await registerDrop({
        dropId,
        blobId: blobMeta.blobId,
        blobHash,
        ttlSeconds,
        maxReads,
        senderAccount,
      });
    }

    // --- Response ---
    // encKey được trả về để client lưu vào link (fragment #key=...)
    // Server KHÔNG lưu encryption key
    return NextResponse.json({
      dropId,
      blobId: blobMeta.blobId,
      encKey: encKey.toString("base64url"), // embedded trong share link
      txHash,
      expiresAt: blobMeta.expiresAt,
      maxReads,
      shareUrl: `/drop/${dropId}#key=${encKey.toString("base64url")}`,
    });
  } catch (err: any) {
    console.error("[upload] error:", err);
    return NextResponse.json(
      { error: err.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
