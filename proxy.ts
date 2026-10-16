import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - PWA metadata and service worker files
     * - favicons and image assets
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|manifest\\.webmanifest|manifest\\.json|sw\\.js|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
