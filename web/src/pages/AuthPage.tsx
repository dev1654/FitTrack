import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { Wordmark } from "../components/Layout";
import { PlateLoadout } from "../components/PlateLoadout";
import { Button, Field } from "../components/ui";
import { useAuth } from "../lib/auth";

export function AuthPage({ mode }: { mode: "login" | "signup" }) {
  const { token, logIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (token) return <Navigate to={from} replace />;

  const isSignup = mode === "signup";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (isSignup && password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    setBusy(true);
    try {
      await (isSignup ? signUp : logIn)(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign in. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh md:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between border-r border-rule px-12 py-10 md:flex">
        <Wordmark />
        <div>
          <p className="font-display text-[64px] leading-[0.95] font-bold tracking-tight">
            100 kg,
            <br />
            loaded right.
          </p>
          <p className="mt-5 max-w-sm text-lg text-ink-2">
            Log every set, see what you lifted last time, and know exactly what goes on the bar
            next.
          </p>
          <div className="mt-10">
            <PlateLoadout weight={100} unit="kg" />
          </div>
        </div>
        <p className="text-sm text-ink-3">Exercise data from wger, CC-BY-SA 4.0.</p>
      </section>

      <section className="flex flex-col justify-center px-6 py-10 md:px-16">
        <div className="mb-10 md:hidden">
          <Wordmark />
        </div>
        <div className="w-full max-w-sm">
          <h1 className="font-display text-4xl font-bold">
            {isSignup ? "Create your account" : "Log in"}
          </h1>
          <p className="mt-2 text-ink-2">
            {isSignup ? "Already have one? " : "New to FitTrack? "}
            <Link to={isSignup ? "/login" : "/signup"} state={location.state} className="font-semibold text-accent underline-offset-2 hover:underline">
              {isSignup ? "Log in" : "Create an account"}
            </Link>
          </p>

          <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
            <Field
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Field
              label="Password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
              hint={isSignup ? "At least 8 characters." : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <Button type="submit" variant="primary" busy={busy} className="w-full">
              {isSignup ? "Create account" : "Log in"}
            </Button>
            {busy ? (
              <p className="text-sm text-ink-3">
                The server sleeps when idle, so the first request can take up to a minute.
              </p>
            ) : null}
          </form>
        </div>
      </section>
    </div>
  );
}
