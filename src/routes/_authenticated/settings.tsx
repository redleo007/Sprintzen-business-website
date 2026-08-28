import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, LogOut, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Account Settings — Sprintzen" },
      {
        name: "description",
        content:
          "Update your Sprintzen display name, review your role and manage your password and session.",
      },
      { property: "og:title", content: "Account Settings — Sprintzen" },
      { property: "og:description", content: "Manage your Sprintzen account." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, profile, role, refresh, signOut } = useAuth();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    if (profile?.name) setName(profile.name);
  }, [profile?.name]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      if (name.trim().length < 2) throw new Error("Name must be at least 2 characters");
      const { error } = await supabase
        .from("profiles")
        .update({ name: name.trim() })
        .eq("id", user.id);
      if (error) throw error;
      await refresh();
    },
    onSuccess: () => toast.success("Profile updated"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save profile"),
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      if (password.length < 6) throw new Error("Password must be at least 6 characters");
      if (password !== confirm) throw new Error("Passwords do not match");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
    onSuccess: () => {
      setPassword("");
      setConfirm("");
      toast.success("Password updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update password"),
  });

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your profile and account security.
        </p>
      </div>

      <section className="panel space-y-4 p-6">
        <div className="flex items-center gap-4">
          <span
            className="flex size-12 items-center justify-center rounded-full text-sm font-bold text-primary-foreground"
            style={{ backgroundColor: profile?.avatar_color ?? undefined }}
          >
            {(profile?.name || user?.email || "?").slice(0, 2).toUpperCase()}
          </span>
          <div>
            <div className="font-medium">{profile?.name ?? "Your account"}</div>
            <div className="text-xs text-muted-foreground">{user?.email}</div>
          </div>
          <Badge className="ml-auto" variant="secondary">
            {role ?? "TeamMember"}
          </Badge>
        </div>

        <div className="space-y-2">
          <Label htmlFor="s-name">Display name</Label>
          <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>
          {saveProfile.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save profile
        </Button>
      </section>

      <section className="panel space-y-4 p-6">
        <h2 className="font-display text-lg font-semibold">Change password</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="s-pw">New password</Label>
            <Input
              id="s-pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-pw2">Confirm password</Label>
            <Input
              id="s-pw2"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => changePassword.mutate()}
          disabled={changePassword.isPending}
        >
          {changePassword.isPending && <Loader2 className="size-4 animate-spin" />}
          Update password
        </Button>
      </section>

      <section className="panel space-y-3 p-6">
        <h2 className="font-display text-lg font-semibold">Session</h2>
        <p className="text-sm text-muted-foreground">
          Signing out clears this device's session only.
        </p>
        <Button variant="destructive" onClick={() => void signOut()}>
          <LogOut className="size-4" /> Sign out
        </Button>
      </section>
    </div>
  );
}
