import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { authorizeProofSubmission } from "@/lib/deals/deliverableAccess";
import { presignProofUpload, proofStorageDriver } from "@/lib/aws/s3";
import {
  PROOF_MAX_IMAGES,
  PROOF_MAX_FILE_BYTES,
  isAllowedProofImageType,
  extForProofMime,
  proofObjectKey,
} from "@/lib/deals/deliverableProof";

export const runtime = "nodejs";

/**
 * POST /api/deals/[id]/deliverables/[deliverableId]/proof-upload-url
 *
 * body: { files: [{ contentType: string, size: number }] }
 * 200:  { mode: "s3", uploads: [{ key, url, contentType }] }
 *       { mode: "supabase" }  <- flag is off; the client should use the legacy multipart POST
 *
 * Mints one short-lived presigned PUT per file so the browser uploads straight to S3 and
 * the image bytes never transit this server. Authorization runs FIRST, before any URL is
 * minted — a presigned PUT is a write credential.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; deliverableId: string }> }
) {
  const { id: partnershipId, deliverableId } = await params;

  const access = await authorizeProofSubmission(partnershipId, deliverableId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  if (proofStorageDriver() !== "s3") {
    return NextResponse.json({ mode: "supabase" });
  }

  let body: { files?: { contentType?: unknown; size?: unknown }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const files = Array.isArray(body.files) ? body.files : [];
  if (files.length === 0) {
    return NextResponse.json({ error: "Add at least one image." }, { status: 400 });
  }
  if (files.length > PROOF_MAX_IMAGES) {
    return NextResponse.json(
      { error: `You can attach at most ${PROOF_MAX_IMAGES} images.` },
      { status: 400 }
    );
  }

  const planned: { key: string; contentType: string; size: number }[] = [];
  for (const f of files) {
    const contentType = typeof f?.contentType === "string" ? f.contentType : "";
    const size = typeof f?.size === "number" ? f.size : -1;

    const ext = extForProofMime(contentType);
    if (!isAllowedProofImageType(contentType) || !ext) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, WebP, and GIF images are allowed." },
        { status: 400 }
      );
    }
    if (size <= 0 || size > PROOF_MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          error: `Each image must be at most ${Math.round(
            PROOF_MAX_FILE_BYTES / 1024 / 1024
          )} MB.`,
        },
        { status: 400 }
      );
    }

    planned.push({
      key: proofObjectKey(partnershipId, deliverableId, randomUUID(), ext),
      contentType,
      size,
    });
  }

  try {
    const uploads = await Promise.all(
      planned.map(async (p) => ({
        key: p.key,
        contentType: p.contentType,
        url: await presignProofUpload(p.key, p.contentType, p.size),
      }))
    );
    return NextResponse.json({ mode: "s3", uploads });
  } catch (err) {
    console.error("proof presign failed:", err);
    return NextResponse.json(
      { error: "Could not prepare the upload. Please try again." },
      { status: 500 }
    );
  }
}
