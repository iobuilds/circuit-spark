import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MailCheck, MailWarning } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({ component: AuthPage });

type Notice =
  | { kind: "sent"; email: string }
  | { kind: "unverified"; email: string }
  | null;

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  // If user is already signed in & verified, bounce to app.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      const confirmed = (u as { email_confirmed_at?: string; confirmed_at?: string }).email_confirmed_at
        || (u as { email_confirmed_at?: string; confirmed_at?: string }).confirmed_at;
      if (u.email && !confirmed) {
        setNotice({ kind: "unverified", email: u.email });
      } else {
        nav({ to: "/" });
      }
    });
  }, [nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        setNotice({ kind: "sent", email });
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          // Supabase returns "Email not confirmed" when verification is pending.
          if (/not confirmed|confirm/i.test(error.message)) {
            setNotice({ kind: "unverified", email });
            return;
          }
          throw error;
        }
        const u = data.user;
        const confirmed = u && ((u as { email_confirmed_at?: string; confirmed_at?: string }).email_confirmed_at
          || (u as { email_confirmed_at?: string; confirmed_at?: string }).confirmed_at);
        if (u?.email && !confirmed) {
          await supabase.auth.signOut();
          setNotice({ kind: "unverified", email });
          return;
        }
        nav({ to: "/" });
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const { lovable } = await import("@/integrations/lovable/index");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) { toast.error(String(result.error)); return; }
    if (result.redirected) return;
    nav({ to: "/" });
  }

  async function resend() {
    if (!notice) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: notice.email,
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (error) throw error;
      setNotice({ kind: "sent", email: notice.email });
      toast.success("Verification email sent");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function checkVerified() {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      const u = data.user;
      const confirmed = u && ((u as { email_confirmed_at?: string; confirmed_at?: string }).email_confirmed_at
        || (u as { email_confirmed_at?: string; confirmed_at?: string }).confirmed_at);
      if (u && confirmed) {
        toast.success("Email verified");
        nav({ to: "/" });
      } else {
        toast.message("Still pending — please click the link in your email.");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <h1 className="text-2xl font-semibold">{mode === "signin" ? "Sign in" : "Create account"}</h1>

        {notice?.kind === "sent" && (
          <Alert>
            <MailCheck className="h-4 w-4" />
            <AlertTitle>Check your inbox</AlertTitle>
            <AlertDescription>
              We sent a verification link to <strong>{notice.email}</strong>. Click it to activate your account, then come back and sign in.
            </AlertDescription>
          </Alert>
        )}
        {notice?.kind === "unverified" && (
          <Alert variant="destructive">
            <MailWarning className="h-4 w-4" />
            <AlertTitle>Email not verified</AlertTitle>
            <AlertDescription>
              <strong>{notice.email}</strong> hasn't been verified yet. Open the link we emailed you to continue.
            </AlertDescription>
          </Alert>
        )}
        {notice && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={resend} disabled={busy}>Resend email</Button>
            <Button size="sm" className="flex-1" onClick={checkVerified} disabled={busy}>I've verified</Button>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Password</Label>
            <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "signin" ? "Sign in" : "Sign up"}
          </Button>
        </form>
        <Button variant="outline" className="w-full" onClick={google}>Continue with Google</Button>
        <button type="button" className="text-sm text-muted-foreground hover:underline w-full text-center"
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setNotice(null); }}>
          {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </Card>
    </div>
  );
}
