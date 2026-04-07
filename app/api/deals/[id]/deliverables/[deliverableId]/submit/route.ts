import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  PROOF_MAX_FILE_BYTES,
  PROOF_MAX_IMAGES,
  PROOF_MIN_DESCRIPTION_LENGTH,
  isAllowedProofImageType,
} from "@/lib/deals/deliverableProof";
import { randomUUID } from "crypto";

const BUCKET = "deliverable-proofs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; deliverableId: string }> }
) {
  const { id: partnershipId, deliverableId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = user.user_metadata?.role as string | undefined;
  if (role !== "athlete" && role !== "team-manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  const service = createServiceClient();

  let hasAccess = false;
  if (role === "team-manager") {
    const { data } = await supabase
      .from("partnerships")
      .select("id, status")
      .eq("id", partnershipId)
      .eq("team_id", user.id)
      .maybeSingle();
    hasAccess = !!data && data.status === "active";
  } else {
    const { data: directDeal } = await supabase
      .from("partnerships")
      .select("id, status")
      .eq("id", partnershipId)
      .eq("athlete_id", user.id)
      .maybeSingle();
    if (directDeal?.status === "active") {
      hasAccess = true;
    } else {
      const { data: pp } = await supabase
        .from("partnership_participants")
        .select("id")
        .eq("partnership_id", partnershipId)
        .eq("athlete_id", user.id)
        .eq("status", "accepted")
        .maybeSingle();
      if (pp) {
        const { data: dealData } = await supabase
          .from("partnerships")
          .select("status")
          .eq("id", partnershipId)
          .maybeSingle();
        hasAccess = dealData?.status === "active";
      }
    }
  }

  if (!hasAccess) {
    return NextResponse.json(
      { error: "You don't have access to this deal or it is not active." },
      { status: 403 }
    );
  }

  const { data: deliverable } = await service
    .from("deliverables")
    .select("id, status, partnership_id")
    .eq("id", deliverableId)
    .eq("partnership_id", partnershipId)
    .maybeSingle();

  if (!deliverable) return NextResponse.json({ error: "Deliverable not found." }, { status: 404 });
  if (deliverable.status !== "pending" && deliverable.status !== "rejected") {
    return NextResponse.json(
      { error: "This deliverable cannot be submitted in its current state." },
      { status: 409 }
    );
  }

  for (const file of files) {
    if (file.size > PROOF_MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `Each image must be at most ${Math.round(PROOF_MAX_FILE_BYTES / 1024 / 1024)} MB.` },
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
    const ext =
      file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : file.type === "image/gif"
            ? "gif"
            : "jpg";
    const objectPath = `${partnershipId}/${deliverableId}/${randomUUID()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await service.storage.from(BUCKET).upload(objectPath, buf, {
      contentType: file.type,
      upsert: false,
    });

    if (upErr) {
      console.error("deliverable proof upload:", upErr);
      return NextResponse.json({ error: "Could not upload images. Is the deliverable-proofs bucket created?" }, { status: 500 });
    }

    const { data: pub } = service.storage.from(BUCKET).getPublicUrl(objectPath);
    uploadedUrls.push(pub.publicUrl);
  }

  const now = new Date().toISOString();
  const { error: upErr } = await service
    .from("deliverables")
    .update({
      status: "submitted",
      proof_description: description,
      proof_image_urls: uploadedUrls,
      submitted_at: now,
    })
    .eq("id", deliverableId);

  if (upErr) {
    console.error("deliverable submit update:", upErr);
    return NextResponse.json({ error: "Could not save submission." }, { status: 500 });
  }

  return NextResponse.json({ success: true, status: "submitted" });
}
