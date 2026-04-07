import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Skip all `/_next/*` (CSS, JS, chunks, devtools, etc.). If middleware runs on those
     * requests and returns HTML (e.g. 503 from Supabase), the page loads with no styles.
     */
    "/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
