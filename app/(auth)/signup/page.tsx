import { AuthForm } from "@/components/auth-form";

type SignupPageProps = {
  searchParams: Promise<{
    email?: string;
    next?: string;
  }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const { email, next } = await searchParams;

  return <AuthForm defaultEmail={email} mode="signup" redirectTo={next} />;
}