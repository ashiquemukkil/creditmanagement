import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

const publicRoutes = new Set(["/login", "/signup"]);
const SUPABASE_PROXY_TIMEOUT_MS = 2500;

function isMissingAuthSession(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AuthSessionMissingError" || error.message === "Auth session missing!")
  );
}

function isInvalidRefreshTokenError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? error.code : undefined;
  if (code === "refresh_token_not_found" || code === "invalid_refresh_token") {
    return true;
  }

  const message = "message" in error && typeof error.message === "string" ? error.message : "";

  return (
    message.includes("Invalid Refresh Token") ||
    message.includes("Refresh Token Not Found") ||
    message.includes("refresh token")
  );
}

function isAuthRetryableFetchError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const name = "name" in error ? error.name : undefined;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";

  return name === "AuthRetryableFetchError" || message.includes("fetch failed");
}

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function clearSupabaseAuthCookies(request: NextRequest, response: NextResponse) {
  request.cookies
    .getAll()
    .filter(
      (cookie) =>
        cookie.name.startsWith("sb-") &&
        (cookie.name.includes("auth-token") || cookie.name.includes("refresh-token")),
    )
    .forEach((cookie) => {
      response.cookies.delete(cookie.name);
    });
}

export async function proxy(request: NextRequest) {
  const { response, supabase } = updateSession(request);
  let user = null;
  let hasAuthRefreshRace = false;
  let hasRecoverableAuthError = false;
  let hasAuthConnectivityIssue = false;

  try {
    const {
      data: { user: resolvedUser },
      error,
    } = await withTimeout(supabase.auth.getUser(), SUPABASE_PROXY_TIMEOUT_MS, "supabase.auth.getUser");

    if (error) {
      if (isMissingAuthSession(error)) {
        user = null;
      } else if (isInvalidRefreshTokenError(error)) {
        user = null;
        hasRecoverableAuthError = true;
      } else if (isAuthRetryableFetchError(error)) {
        user = null;
        hasAuthConnectivityIssue = true;
      } else if ((error as { status?: number }).status !== 409) {
        throw error;
      } else {
        hasAuthRefreshRace = true;
      }
    } else {
      user = resolvedUser;
    }
  } catch (error) {
    if (isMissingAuthSession(error)) {
      user = null;
    } else if (isInvalidRefreshTokenError(error)) {
      user = null;
      hasRecoverableAuthError = true;
    } else if (isAuthRetryableFetchError(error) || (error instanceof Error && error.message.includes("timed out"))) {
      user = null;
      hasAuthConnectivityIssue = true;
    } else if ((error as { status?: number }).status !== 409) {
      throw error;
    } else {
      hasAuthRefreshRace = true;
    }
  }

  if (hasRecoverableAuthError) {
    clearSupabaseAuthCookies(request, response);
  }

  if (hasAuthRefreshRace) {
    return response;
  }

  const { pathname, search } = request.nextUrl;
  const isPublicRoute = publicRoutes.has(pathname);

  if (!user && !isPublicRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";

    if (pathname !== "/") {
      loginUrl.searchParams.set("next", `${pathname}${search}`);
    }

    return NextResponse.redirect(loginUrl);
  }

  if (!user) {
    return response;
  }

  if (hasAuthConnectivityIssue) {
    return response;
  }

  const { data, error } = (await withTimeout(
    supabase.from("users").select("is_active").eq("id", user.id).maybeSingle(),
    SUPABASE_PROXY_TIMEOUT_MS,
    "supabase.users.is_active",
  )) as { data: { is_active: boolean } | null; error: any };

  if (error) {
    if (isAuthRetryableFetchError(error)) {
      return response;
    }

    throw error;
  }

  const isActive = data?.is_active ?? false;

  if (user && !isActive) {
    await supabase.auth.signOut();

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set(
      "message",
      "Your account request was received. Wait for an admin to activate it.",
    );

    const redirectResponse = NextResponse.redirect(loginUrl);

    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });

    return redirectResponse;
  }

  if (user && isPublicRoute) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/signup",
    "/dashboard/:path*",
    "/customers/:path*",
    "/bills/:path*",
    "/payments/:path*",
    "/reports/:path*",
    "/bulk-upload/:path*",
    "/manage-users/:path*",
  ],
};
