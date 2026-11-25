import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, UserRole } from "@/types/database";

export interface AuthSession {
  userId: string;
  email: string;
  role: UserRole;
  profile: Profile;
}

/**
 * Fetches the current authenticated user and their profile from Supabase.
 * Returns null if unauthenticated or if Supabase env vars are not yet configured.
 */
export async function getCurrentSession(): Promise<AuthSession | null> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  let { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  // Auto-provision missing profile if user was created before SQL trigger ran
  if (!profile && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const admin = createAdminClient();
      const { data: existingAdminCheck } = await admin
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle<Profile>();

      if (existingAdminCheck) {
        profile = existingAdminCheck;
      } else {
        const fullName =
          (user.user_metadata?.full_name as string | undefined) ??
          user.email?.split("@")[0] ??
          "Customer";
        const { data: acct } = await admin
          .from("accounts")
          .insert({ name: fullName, type: "individual" })
          .select("id")
          .single();

        const { data: created } = await admin
          .from("profiles")
          .insert({
            id: user.id,
            email: user.email ?? "",
            full_name: fullName,
            role: "customer",
            account_id: acct?.id ?? null,
          })
          .select("*")
          .single<Profile>();

        if (created) profile = created;
      }
    } catch {
      // Fall through to safe in-memory fallback below
    }
  }

  if (!profile) {
    const now = new Date().toISOString();
    profile = {
      id: user.id,
      email: user.email ?? "",
      full_name:
        (user.user_metadata?.full_name as string | undefined) ?? null,
      phone: null,
      company: null,
      role: "customer",
      account_id: null,
      created_at: now,
      updated_at: now,
    };
  }

  return {
    userId: user.id,
    email: user.email ?? profile.email,
    role: profile.role,
    profile,
  };
}

/**
 * Server Component / Server Action guard requiring an authenticated session.
 */
export async function requireAuth(): Promise<AuthSession> {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

/**
 * Server Component / Server Action guard requiring an administrator role.
 * Customers attempting to access admin resources are redirected to /dashboard.
 */
export async function requireAdmin(): Promise<AuthSession> {
  const session = await requireAuth();
  if (session.role !== "admin") {
    redirect("/dashboard");
  }
  return session;
}

/**
 * API Route Helper: returns AuthSession or null + standard HTTP status (401/403).
 */
export async function authorizeApiRequest(
  requiredRole?: UserRole
): Promise<
  | { ok: true; session: AuthSession }
  | { ok: false; status: 401 | 403; error: string }
> {
  const session = await getCurrentSession();
  if (!session) {
    return { ok: false, status: 401, error: "Authentication required." };
  }
  if (requiredRole && session.role !== requiredRole) {
    return {
      ok: false,
      status: 403,
      error: "Insufficient permissions for this resource.",
    };
  }
  return { ok: true, session };
}
