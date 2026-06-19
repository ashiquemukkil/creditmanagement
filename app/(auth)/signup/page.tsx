import { AuthForm } from "@/components/auth-form";

type SignupPageProps = {
  searchParams: Promise<{
    next?: string;
  }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const { next } = await searchParams;

  return <AuthForm mode="signup" redirectTo={next} />;
}