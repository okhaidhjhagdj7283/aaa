import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { readBlob, deleteBlob, getBlobInfo } from "@/lib/shelby";
import { getDropStatus, getBlobHash, recordRead } from "@/lib/aptos";

export async function GET(
  req: NextRequest,
  { params }: { params: { dropId: string } }
) {
  const { dropId } = params;

  // encKey được truyền qua query param (đã extract từ URL fragment ở client)
  // Fragment (#key=...) không bao giờ gửi lên server — client tự extract và gửi qua param
  const encKey = req.nextUrl.searchParams.get("encKey");

  if (!encKey) {
    return NextResponse.json(
      { error: "Encryption key required" },
      { status: 400 }
    );
  }

  try {
    // --- 1. Kiểm tra on-chain status ---
    const { isValid, readsRemaining, expiresAt } = await getDropStatus(dropId);

    if (!isValid) {
      return NextResponse.json(
        {
          error: "Drop expired or destroyed",
          code: "DROP_DEAD",
        },
        { status: 410 } // 410 Gone
      );
    }

    // --- 2. Lấy blobId từ Aptos events / indexer ---
    // Simplification: blobId = dropId (hoặc lookup từ indexer)
    // Production: query Aptos indexer để lấy blobId từ DropCreatedEvent
    const blobId = dropId; // placeholder

    // --- 3. Fetch encrypted blob từ Shelby ---
    const encryptedPayload = await readBlob(blobId);

    // --- 4. Verify integrity: hash phải khớp on-chain ---
    const blobHash = await getBlobHash(dropId);
    const computedHash = crypto
      .createHash("sha256")
      .update(encryptedPayload)
      .digest("hex");

    if (computedHash !== blobHash) {
      return NextResponse.json(
        { error: "Integrity check failed — file may be corrupted" },
        { status: 422 }
      );
    }

    // --- 5. Record read on-chain (trừ quota) ---
    const txHash = await recordRead(dropId);

    // --- 6. Decrypt AES-256-GCM ---
    const keyBuffer = Buffer.from(encKey, "base64url");
    const iv = encryptedPayload.subarray(0, 16);
    const authTag = encryptedPayload.subarray(16, 32);
    const ciphertext = encryptedPayload.subarray(32);

    const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer, iv);
    decipher.setAuthTag(authTag);

    let decrypted: Buffer;
    try {
      decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      return NextResponse.json(
        { error: "Decryption failed — invalid key" },
        { status: 403 }
      );
    }

    // --- 7. Tự hủy blob nếu quota = 0 ---
    const newReadsRemaining = readsRemaining - 1;
    if (newReadsRemaining <= 0) {
      // Fire-and-forget: xóa blob khỏi Shelby
      deleteBlob(blobId).catch(console.error);
    }

    // --- 8. Trả file về client ---
    const blobInfo = await getBlobInfo(blobId).catch(() => null);
    const filename = blobInfo?.metadata?.filename ?? "file";
    const mimeType = blobInfo?.metadata?.mimeType ?? "application/octet-stream";

    return new NextResponse(decrypted, {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename="${filename}"`,
        "X-Drop-Reads-Remaining": String(newReadsRemaining),
        "X-Drop-Expires-At": String(expiresAt),
        "X-Aptos-Tx": txHash,
        // Prevent caching — file có thể đã self-destruct
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("[read] error:", err);

    if (err.message?.includes("E_DROP_NOT_FOUND")) {
      return NextResponse.json({ error: "Drop not found" }, { status: 404 });
    }
    if (err.message?.includes("E_QUOTA_EXHAUSTED")) {
      return NextResponse.json({ error: "This drop has been destroyed" }, { status: 410 });
    }
    if (err.message?.includes("E_DROP_EXPIRED")) {
      return NextResponse.json({ error: "Drop has expired" }, { status: 410 });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
