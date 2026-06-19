"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup";

type AuthFormProps = {
  message?: string;
  mode: AuthMode;
  redirectTo?: string;
};

export function AuthForm({ message, mode, redirectTo = "/dashboard" }: AuthFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const isSignup = mode === "signup";

  function handleSubmit(formData: FormData) {
    setError(null);

    startTransition(async () => {
      const email = String(formData.get("email") || "").trim();
      const password = String(formData.get("password") || "");
      const name = String(formData.get("name") || "").trim();

      if (!email || !password || (isSignup && !name)) {
        setError("Please complete all required fields.");
        return;
      }

      if (isSignup) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name,
            },
          },
        });

        if (signUpError) {
          setError(signUpError.message);
          return;
        }

        router.refresh();

        if (data.session) {
          router.replace(redirectTo);
          return;
        }

        router.replace(
          "/login?message=" +
            encodeURIComponent(
              "Account created. If email confirmation is enabled in Supabase, confirm your email before logging in.",
            ),
        );
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      router.refresh();
      router.replace(redirectTo);
    });
  }

  return (
    <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
      <div className="mb-8 space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-700">
          Credit Management
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-stone-950">
          {isSignup ? "Create your account" : "Log in"}
        </h1>
        <p className="text-sm leading-6 text-stone-600">
          {isSignup
            ? "New users start as viewers. Promote admins and collaborators from Supabase or the admin page."
            : "Use your Supabase email and password to access the app."}
        </p>
      </div>

      <form action={handleSubmit} className="space-y-4">
        {isSignup ? (
          <label className="block space-y-2 text-sm font-medium text-stone-700">
            <span>Name</span>
            <input
              required
              name="name"
              type="text"
              className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
              placeholder="Owner or staff name"
            />
          </label>
        ) : null}

        <label className="block space-y-2 text-sm font-medium text-stone-700">
          <span>Email</span>
          <input
            required
            name="email"
            type="email"
            className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
            placeholder="you@business.com"
          />
        </label>

        <label className="block space-y-2 text-sm font-medium text-stone-700">
          <span>Password</span>
          <input
            required
            minLength={6}
            name="password"
            type="password"
            className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-600"
            placeholder="At least 6 characters"
          />
        </label>

        {message ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-2xl bg-stone-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-500"
        >
          {isPending
            ? isSignup
              ? "Creating account..."
              : "Logging in..."
            : isSignup
              ? "Create account"
              : "Log in"}
        </button>
      </form>

      <p className="mt-6 text-sm text-stone-600">
        {isSignup ? "Already have an account? " : "Need an account? "}
        <Link
          href={isSignup ? "/login" : "/signup"}
          className="font-medium text-amber-700 hover:text-amber-800"
        >
          {isSignup ? "Log in" : "Sign up"}
        </Link>
      </p>
    </div>
  );
}