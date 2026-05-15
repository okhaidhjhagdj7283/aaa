import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { readBlob, deleteBlob, getBlobInfo } from "@/lib/shelby";
import { getDropStatus, getBlobHash, recordRead } from "@/lib/aptos";

export async function GET(
  req: NextRequest,
  { params }: { params: { dropId: string } }
) {
  const { dropId } = params;
  const encKey = req.nextUrl.searchParams.get("encKey");

  if (!encKey) {
    return NextResponse.json(
      { error: "Encryption key required" },
      { status: 400 }
    );
  }

  try {
    const { isValid, readsRemaining, expiresAt } = await getDropStatus(dropId);

    if (!isValid) {
      return NextResponse.json(
        { error: "Drop expired or destroyed", code: "DROP_DEAD" },
        { status: 410 }
      );
    }

    const blobId = dropId;

    const encryptedPayload = await readBlob(blobId);

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

    const txHash = await recordRead(dropId);

    // Decrypt: key from URL (base64url)
    const keyBuffer = Buffer.from(encKey, "base64");
    const iv = encryptedPayload.subarray(0, 12);
    const ciphertext = encryptedPayload.subarray(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(iv) },
      await crypto.subtle.importKey("raw", keyBuffer, "AES-GCM", false, ["decrypt"]),
      ciphertext
    );

    const newReadsRemaining = readsRemaining - 1;
    if (newReadsRemaining <= 0) {
      deleteBlob(blobId).catch(console.error);
    }

    const blobInfo = await getBlobInfo(blobId).catch(() => null);
    const filename = blobInfo?.metadata?.filename ?? "file";
    const mimeType = blobInfo?.metadata?.mimeType ?? "application/octet-stream";

    return new NextResponse(Buffer.from(decrypted), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `inline; filename="${filename}"`,
        "X-Drop-Reads-Remaining": String(newReadsRemaining),
        "X-Drop-Expires-At": String(expiresAt),
        "X-Aptos-Tx": txHash,
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
