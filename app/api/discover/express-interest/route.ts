import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type DiscoveryResponse = "committed" | "exploring" | "declined";

export async function POST(request: NextRequest) {
  let body: {
    subjectType?: string;
    subjectId?: string;
    response?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const subjectType = body.subjectType;
  const subjectId = body.subjectId?.trim();
  const response = body.response as DiscoveryResponse | undefined;

  if (subjectType !== "brand" && subjectType !== "team") {
    return NextResponse.json({ error: "Invalid subject type." }, { status: 400 });
  }
  if (!subjectId) {
    return NextResponse.json({ error: "Missing subject." }, { status: 400 });
  }
  if (response !== "committed" && response !== "exploring" && response !== "declined") {
    return NextResponse.json({ error: "Invalid response." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = user.user_metadata?.role as string | undefined;
  if (subjectType === "brand" && role !== "team-manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (subjectType === "team" && role !== "brand-manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (subjectType === "brand" && subjectId === user.id) {
    return NextResponse.json({ error: "Invalid subject." }, { status: 400 });
  }
  if (subjectType === "team" && subjectId === user.id) {
    return NextResponse.json({ error: "Invalid subject." }, { status: 400 });
  }

  const viewerRole = role === "team-manager" ? "team-manager" : "brand-manager";

  const { error: upsertError } = await supabase.from("discovery_interests").upsert(
    {
      viewer_id: user.id,
      viewer_role: viewerRole,
      subject_id: subjectId,
      subject_type: subjectType,
      response,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "viewer_id,subject_id" }
  );

  if (upsertError) {
    console.error("discovery_interests upsert:", upsertError);
    return NextResponse.json({ error: "Could not save your response." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
