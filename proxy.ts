import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

const publicRoutes = new Set(["/login", "/signup"]);

function isMissingAuthSession(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AuthSessionMissingError" || error.message === "Auth session missing!")
  );
}

export async function proxy(request: NextRequest) {
  const { response, supabase } = updateSession(request);
  let user = null;
  let isActive = false;
  let hasAuthRefreshRace = false;

  try {
    const {
      data: { user: resolvedUser },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      if (isMissingAuthSession(error)) {
        user = null;
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
    } else if ((error as { status?: number }).status !== 409) {
      throw error;
    } else {
      hasAuthRefreshRace = true;
    }
  }

  if (hasAuthRefreshRace) {
    return response;
  }

  const { pathname, search } = request.nextUrl;
  const isPublicRoute = publicRoutes.has(pathname);

  if (user) {
    const { data, error } = await supabase
      .from("users")
      .select("is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    isActive = data?.is_active ?? false;
  }

  if (!user && !isPublicRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";

    if (pathname !== "/") {
      loginUrl.searchParams.set("next", `${pathname}${search}`);
    }

    return NextResponse.redirect(loginUrl);
  }

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};