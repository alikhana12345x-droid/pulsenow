"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { profiles } from "@/lib/supabase/schema";

type UpdateProfileInput = {
  username: string;
  displayName: string;
  phone: string;
  avatarUrl: string;
};

export async function updateProfileDetails(input: UpdateProfileInput) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;

  if (!userId) {
    throw new Error("You must be logged in to update your profile.");
  }

  const username = input.username.trim().toLowerCase();
  const displayName = input.displayName.trim();
  const phone = input.phone.trim();
  const avatarUrl = input.avatarUrl.trim();

  if (username && !/^[a-z0-9_]{3,20}$/.test(username)) {
    throw new Error("Username must be 3-20 characters and use only letters, numbers, or underscores.");
  }

  if (displayName && displayName.length > 40) {
    throw new Error("Display name must be 40 characters or fewer.");
  }

  if (phone && !/^[0-9+\-\s]{7,20}$/.test(phone)) {
    throw new Error("Phone number format looks invalid.");
  }

  if (avatarUrl) {
    const isDataUrl = avatarUrl.startsWith("data:image/");
    if (isDataUrl) {
      // base64 encoded upload — cap at ~150 KB of base64 text (~112 KB image)
      if (avatarUrl.length > 153_600) {
        throw new Error("Avatar image is too large. Please use a smaller image.");
      }
    } else {
      try {
        const parsed = new URL(avatarUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          throw new Error("Avatar URL must start with http or https.");
        }
      } catch {
        throw new Error("Avatar URL must be a valid link.");
      }
    }
  }

  if (username) {
    const [existing] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(and(eq(profiles.username, username), ne(profiles.id, userId)))
      .limit(1);

    if (existing) {
      throw new Error("That username is already taken.");
    }
  }

  await db
    .update(profiles)
    .set({
      username: username || null,
      display_name: displayName || null,
      phone: phone || null,
      avatar_url: avatarUrl || null,
      updated_at: new Date(),
    })
    .where(eq(profiles.id, userId));

  revalidatePath("/protected/profile");
  revalidatePath("/protected/invite");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
