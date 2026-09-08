import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { authorizeProofSubmission } from "@/lib/deals/deliverableAccess";
import { createServiceClient } from "@/lib/supabase/server";
import {
  deleteProofObjects,
  headProofObject,
  proofStorageDriver,
  readObjectPrefix,
} from "@/lib/aws/s3";
import {
  PROOF_MAX_FILE_BYTES,
  PROOF_MAX_IMAGES,
  PROOF_MIN_DESCRIPTION_LENGTH,
  S3_REF_PREFIX,
  extForProofMime,
  isAllowedProofImageType,
  isValidProofKey,
  parseProofImageRefs,
  sniffImageMime,
  thumbKeyFor,
} from "@/lib/deals/deliverableProof";

const LEGACY_BUCKET = "deliverable-proofs";

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * POST /api/deals/[id]/deliverables/[deliverableId]/submit
 *
 * Two body shapes, selected by PROOF_STORAGE_DRIVER:
 *
 *   driver = "s3"       JSON  { description, keys: string[] }
 *                       The images were already PUT straight to S3 by the browser using
 *                       presigned URLs from ../proof-upload-url. This route only verifies
 *                       and commits them - no image bytes transit the server.
 *
 *   driver = "supabase" multipart/form-data  (legacy)
 *                       Kept verbatim so flipping the flag back is an instant rollback.
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

  const driver = proofStorageDriver();
  const contentType = request.headers.get("content-type") ?? "";

  if (driver === "s3") {
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { error: "Expected a JSON body. Reload the page and try again." },
        { status: 415 }
      );
    }
    return submitFromS3Keys(request, partnershipId, deliverableId, access.service);
  }

  return submitFromMultipart(request, partnershipId, deliverableId, access.service);
}

/* -- S3 path ---------------------------------------------------------------- */

async function submitFromS3Keys(
  request: NextRequest,
  partnershipId: string,
  deliverableId: string,
  service: ServiceClient
) {
  let body: { description?: unknown; keys?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (description.length < PROOF_MIN_DESCRIPTION_LENGTH) {
    return NextResponse.json(
      {
        error: `Description must be at least ${PROOF_MIN_DESCRIPTION_LENGTH} characters (you have ${description.length}).`,
      },
      { status: 400 }
    );
  }

  const keys = Array.isArray(body.keys)
    ? body.keys.filter((k): k is string => typeof k === "string" && k.length > 0)
    : [];

  if (keys.length === 0) {
    return NextResponse.json({ error: "Add at least one image." }, { status: 400 });
  }
  if (keys.length > PROOF_MAX_IMAGES) {
    return NextResponse.json(
      { error: `You can attach at most ${PROOF_MAX_IMAGES} images.` },
      { status: 400 }
    );
  }
  if (new Set(keys).size !== keys.length) {
    return NextResponse.json({ error: "Duplicate image reference." }, { status: 400 });
  }

  // (1) Shape + scope. A key is only acceptable if it looks exactly like one the presign
  //     route would have minted FOR THIS DELIVERABLE - this is what stops a caller
  //     submitting a key that belongs to another deal.
  for (const key of keys) {
    if (!isValidProofKey(key, partnershipId, deliverableId)) {
      return NextResponse.json({ error: "Invalid image reference." }, { status: 400 });
    }
  }

  // (2) Existence + real size + stored type, straight from S3 - never the declared value.
  // (3) Magic bytes via a 16-byte Range read, which must agree with the stored Content-Type.
  const verdicts = await Promise.all(
    keys.map(async (key) => {
      const head = await headProofObject(key);
      if (!head) return false;
      if (head.contentLength <= 0 || head.contentLength > PROOF_MAX_FILE_BYTES) return false;
      if (!isAllowedProofImageType(head.contentType)) return false;
      const prefix = await readObjectPrefix(key, 16);
      const sniffed = prefix ? sniffImageMime(prefix) : null;
      return sniffed !== null && sniffed === head.contentType;
    })
  );

  if (verdicts.some((ok) => !ok)) {
    // Never leave rejected uploads sitting in the bucket.
    await deleteProofObjects(keys);
    return NextResponse.json(
      {
        error:
          "One or more files could not be verified as valid images. Please re-select them and try again.",
      },
      { status: 400 }
    );
  }

  // Capture the outgoing set so a resubmit does not orphan the previous images.
  const { data: prev } = await service
    .from("deliverables")
    .select("proof_image_urls")
    .eq("id", deliverableId)
    .maybeSingle();
  const previousS3Keys = parseProofImageRefs(prev?.proof_image_urls)
    .filter((r): r is { kind: "s3"; key: string } => r.kind === "s3")
    .map((r) => r.key);

  const { error: upErr } = await service
    .from("deliverables")
    .update({
      status: "submitted",
      proof_description: description,
      proof_image_urls: keys.map((k) => `${S3_REF_PREFIX}${k}`),
      submitted_at: new Date().toISOString(),
    })
    .eq("id", deliverableId);

  if (upErr) {
    console.error("deliverable submit update:", upErr);
    // The DB write failed, so the objects we just verified are now orphans.
    await deleteProofObjects(keys);
    return NextResponse.json({ error: "Could not save submission." }, { status: 500 });
  }

  // Only after the row is committed. Best-effort - never fails the response. Each dropped
  // proof takes its generated thumbnail with it.
  //
  // proof_analysis and proof_review_flag are deliberately NOT reset here. The browser PUTs
  // to S3 before calling this route, so the pipeline Lambda may already have written an
  // entry for one of the incoming keys; clearing the column would race it away. The
  // callback route owns both columns and prunes entries for keys this deliverable no
  // longer references, under its own read-modify-write.
  const dropped = previousS3Keys.filter((k) => !keys.includes(k));
  await deleteProofObjects([...dropped, ...dropped.map(thumbKeyFor)]);

  return NextResponse.json({ success: true, status: "submitted" });
}

/* -- Legacy Supabase multipart path (rollback target) ---------------------- */

async function submitFromMultipart(
  request: NextRequest,
  partnershipId: string,
  deliverableId: string,
  service: ServiceClient
) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const descriptionRaw = formData.get("description");
  const description = typeof descriptionRaw === "string" ? descriptionRaw.trim() : "";
  if (description.length < PROOF_MIN_DESCRIPTION_LENGTH) {
    return NextResponse.json(
      {
        error: `Description must be at least ${PROOF_MIN_DESCRIPTION_LENGTH} characters (you have ${description.length}).`,
      },
      { status: 400 }
    );
  }

  const files = formData
    .getAll("images")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length === 0) {
    return NextResponse.json({ error: "Add at least one image." }, { status: 400 });
  }
  if (files.length > PROOF_MAX_IMAGES) {
    return NextResponse.json(
      { error: `You can attach at most ${PROOF_MAX_IMAGES} images.` },
      { status: 400 }
    );
  }

  for (const file of files) {
    if (file.size > PROOF_MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          error: `Each image must be at most ${Math.round(PROOF_MAX_FILE_BYTES / 1024 / 1024)} MB.`,
        },
        { status: 400 }
      );
    }
    if (!isAllowedProofImageType(file.type)) {
      return NextResponse.json(
        { error: "Only JPEG, PNG, WebP, and GIF images are allowed." },
        { status: 400 }
      );
    }
  }

  const uploadedUrls: string[] = [];

  for (const file of files) {
    const ext = extForProofMime(file.type) ?? "jpg";
    const objectPath = `${partnershipId}/${deliverableId}/${randomUUID()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());

    const { error: putErr } = await service.storage
      .from(LEGACY_BUCKET)
      .upload(objectPath, buf, { contentType: file.type, upsert: false });

    if (putErr) {
      console.error("deliverable proof upload:", putErr);
      return NextResponse.json(
        { error: "Could not upload images. Is the deliverable-proofs bucket created?" },
        { status: 500 }
      );
    }

    const { data: pub } = service.storage.from(LEGACY_BUCKET).getPublicUrl(objectPath);
    uploadedUrls.push(pub.publicUrl);
  }

  const { error: upErr } = await service
    .from("deliverables")
    .update({
      status: "submitted",
      proof_description: description,
      proof_image_urls: uploadedUrls,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", deliverableId);

  if (upErr) {
    console.error("deliverable submit update:", upErr);
    return NextResponse.json({ error: "Could not save submission." }, { status: 500 });
  }

  return NextResponse.json({ success: true, status: "submitted" });
}
