import { createServerFn } from "@tanstack/react-start";

export const DEMO_EMAIL = "demo@sprintzen.app";
export const DEMO_PASSWORD = "sprintzen-demo-2026";

/**
 * Idempotently provisions the shared demo account and a seeded demo project.
 * Safe to call before every demo sign-in.
 */
export const ensureDemoAccount = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1. Find or create the demo auth user (email pre-confirmed).
  const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  let userId = list?.users.find((u) => u.email === DEMO_EMAIL)?.id;

  if (!userId) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { name: "Demo Lead", role: "TeamLeader" },
    });
    if (error || !data.user) throw new Error(error?.message ?? "Could not create demo account");
    userId = data.user.id;
  } else {
    // Keep the password stable even if it was rotated.
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
  }

  await supabaseAdmin
    .from("profiles")
    .upsert({ id: userId, name: "Demo Lead", email: DEMO_EMAIL }, { onConflict: "id" });
  await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: userId, role: "TeamLeader" }, { onConflict: "user_id,role" });

  // 2. Seed a demo project once.
  const { data: existing } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("owner_id", userId)
    .limit(1);

  if (existing && existing.length > 0) {
    return { email: DEMO_EMAIL, password: DEMO_PASSWORD };
  }

  const { data: project, error: projectError } = await supabaseAdmin
    .from("projects")
    .insert({
      owner_id: userId,
      name: "Checkout Revamp",
      description: "Demo project with a live board and a planning poker session.",
      sprint_length_days: 14,
    })
    .select("id")
    .single();
  if (projectError || !project) throw new Error(projectError?.message ?? "Seeding failed");

  await supabaseAdmin
    .from("project_members")
    .upsert({ project_id: project.id, user_id: userId }, { onConflict: "project_id,user_id" });

  await supabaseAdmin.from("kanban_cards").insert([
    {
      project_id: project.id,
      title: "Apple Pay in checkout",
      description: "Add wallet payment option to the payment step.",
      points: 8,
      status: "inprogress",
      position: 1,
    },
    {
      project_id: project.id,
      title: "Address autocomplete",
      description: "Reduce failed deliveries with validated addresses.",
      points: 5,
      status: "todo",
      position: 2,
    },
    {
      project_id: project.id,
      title: "Order summary redesign",
      description: "Clearer totals, taxes and shipping breakdown.",
      points: 3,
      status: "review",
      position: 3,
    },
    {
      project_id: project.id,
      title: "Guest checkout",
      description: "Buy without creating an account.",
      points: 13,
      status: "done",
      position: 4,
    },
  ]);

  const { data: session } = await supabaseAdmin
    .from("poker_sessions")
    .insert({
      project_id: project.id,
      title: "Sprint 12 estimation",
      created_by: userId,
      notes: "Focus: payments and address quality. Revisit guest checkout risk next sprint.",
    })
    .select("id")
    .single();

  if (session) {
    await supabaseAdmin.from("stories").insert([
      {
        session_id: session.id,
        title: "Wallet payments (Apple / Google Pay)",
        description: "Integrate wallet SDKs and handle failure states.",
        risk: "high",
        complexity: 8,
        position: 1,
      },
      {
        session_id: session.id,
        title: "Validated address autocomplete",
        description: "Third-party address lookup with fallback to manual entry.",
        risk: "medium",
        complexity: 5,
        position: 2,
      },
      {
        session_id: session.id,
        title: "Order summary polish",
        description: "Visual pass on totals and taxes.",
        risk: "low",
        complexity: 2,
        position: 3,
      },
    ]);
  }

  return { email: DEMO_EMAIL, password: DEMO_PASSWORD };
});
