import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCounterpartyContactForViewer } from "@/lib/discover/opportunities";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = user.user_metadata?.role as string | undefined;
  const { searchParams } = new URL(request.url);
  const subjectType = searchParams.get("subjectType");
  const subjectId = searchParams.get("subjectId")?.trim();

  if (subjectType !== "brand" && subjectType !== "team") {
    return NextResponse.json({ error: "Invalid subject type." }, { status: 400 });
  }
  if (!subjectId) {
    return NextResponse.json({ error: "Missing subject." }, { status: 400 });
  }

  if (subjectType === "brand" && role !== "team-manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (subjectType === "team" && role !== "brand-manager") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = createServiceClient();
  const result = await getCounterpartyContactForViewer(service, user.id, subjectType, subjectId);
  if (!result) {
    return NextResponse.json({ error: "No matching interest found." }, { status: 404 });
  }

  return NextResponse.json(result);
}
