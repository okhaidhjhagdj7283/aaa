import { NextRequest, NextResponse } from "next/server";
import { getDropStatus, getBlobHash } from "@/lib/aptos";

export async function GET(
  _req: NextRequest,
  { params }: { params: { dropId: string } }
) {
  const { dropId } = params;

  try {
    const { isValid, readsRemaining, expiresAt } = await getDropStatus(dropId);
    const blobHash = await getBlobHash(dropId);

    return NextResponse.json({
      dropId,
      isValid,
      readsRemaining,
      expiresAt,
      expiresAtHuman: new Date(expiresAt * 1000).toISOString(),
      blobHash,
    });
  } catch (err: any) {
    if (err.message?.includes("E_DROP_NOT_FOUND")) {
      return NextResponse.json({ error: "Drop not found" }, { status: 404 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
