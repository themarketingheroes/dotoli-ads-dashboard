import { Logo } from "@/components/Icons";

const ERRORS: Record<string, string> = {
  denied: "That Google account doesn't have access. Ask the dashboard owner to add your email.",
  state: "The sign-in link expired. Please try again.",
  google: "Google sign-in failed. Please try again.",
  config: "Sign-in isn't configured yet (GOOGLE_AUTH_CLIENT_ID missing).",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="login-wrap">
      <div className="card login-card">
        <Logo className="brand-mark" />
        <h1>Ads Dashboard</h1>
        <p>Sign in with the Google account you were given access with.</p>
        {error && <p className="error-text">{ERRORS[error] ?? "Sign-in failed."}</p>}
        <a className="btn primary" href="/api/auth/login">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M21.35 11.1H12v2.95h5.35c-.23 1.45-1.7 4.25-5.35 4.25a5.9 5.9 0 0 1 0-11.8c1.84 0 3.07.78 3.78 1.46l2.58-2.49C16.71 3.93 14.57 3 12 3a9 9 0 1 0 0 18c5.2 0 8.64-3.65 8.64-8.8 0-.6-.07-1.05-.15-1.5Z" />
          </svg>
          Sign in with Google
        </a>
      </div>
    </div>
  );
}
