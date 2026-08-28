import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useActiveProject } from "@/hooks/use-active-project";
import { computeAnalytics, type StoryLike, type MemberLike } from "@/lib/sprint-analytics";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Sprint Analytics — Sprintzen" },
      {
        name: "description",
        content:
          "Complexity scores, risk mix, recommended sprint length and per-person workload for your project.",
      },
      { property: "og:title", content: "Sprint Analytics — Sprintzen" },
      { property: "og:description", content: "Know your sprint before you commit to it." },
    ],
  }),
  component: AnalyticsPage,
});

const RISK_COLORS = ["oklch(0.72 0.17 150)", "oklch(0.8 0.16 85)", "oklch(0.65 0.22 20)"];

function AnalyticsPage() {
  const { project, projectId, isLoading } = useActiveProject();

  const dataQuery = useQuery({
    queryKey: ["analytics", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data: sessions, error: sessionsError } = await supabase
        .from("poker_sessions")
        .select("id")
        .eq("project_id", projectId!);
      if (sessionsError) throw sessionsError;

      const sessionIds = (sessions ?? []).map((s) => s.id);
      let stories: StoryLike[] = [];
      if (sessionIds.length) {
        const { data, error } = await supabase
          .from("stories")
          .select("risk, complexity, final_points")
          .in("session_id", sessionIds);
        if (error) throw error;
        stories = (data ?? []) as StoryLike[];
      }

      const { data: memberRows, error: membersError } = await supabase
        .from("project_members")
        .select("user_id, role, profiles:profiles!inner(id, name)")
        .eq("project_id", projectId!);
      if (membersError) throw membersError;

      const members: MemberLike[] = (memberRows ?? []).map((m) => ({
        id: m.user_id,
        name: (m.profiles as { name: string }).name,
        role: (m.role as MemberLike["role"]) ?? "TeamMember",
      }));

      const { data: cards, error: cardsError } = await supabase
        .from("kanban_cards")
        .select("status, points")
        .eq("project_id", projectId!);
      if (cardsError) throw cardsError;

      return { stories, members, cards: cards ?? [] };
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading analytics…</p>;

  if (!project) {
    return (
      <div className="panel p-10 text-center">
        <h1 className="font-display text-xl font-semibold">No project selected</h1>
        <Button asChild className="mt-5">
          <Link to="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    );
  }

  if (dataQuery.isLoading || !dataQuery.data) {
    return <p className="text-sm text-muted-foreground">Crunching your sprint data…</p>;
  }

  const { stories, members, cards } = dataQuery.data;
  const analytics = computeAnalytics(stories, members, project.sprint_length_days ?? 14);

  const riskData = [
    { name: "Low", value: analytics.riskBreakdown.low },
    { name: "Medium", value: analytics.riskBreakdown.medium },
    { name: "High", value: analytics.riskBreakdown.high },
  ].filter((d) => d.value > 0);

  const boardData = [
    { name: "To Do", points: sumPoints(cards, "todo") },
    { name: "In Progress", points: sumPoints(cards, "inprogress") },
    { name: "Review", points: sumPoints(cards, "review") },
    { name: "Done", points: sumPoints(cards, "done") },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {project.name} · {project.sprint_length_days ?? 14}-day sprints
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total points" value={String(analytics.totalPoints)} />
        <Stat label="Stories estimated" value={String(analytics.storyCount)} />
        <Stat label="Complexity score" value={analytics.complexityScore.toFixed(1)} />
        <Stat
          label="Risk level"
          value={analytics.riskLevel}
          badge={
            analytics.riskLevel === "High"
              ? "destructive"
              : analytics.riskLevel === "Medium"
                ? "default"
                : "secondary"
          }
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel p-5">
          <h2 className="font-display text-lg font-semibold">Points by board column</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={boardData}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.35 0.03 265)" />
                <XAxis dataKey="name" stroke="oklch(0.7 0.02 265)" fontSize={12} />
                <YAxis stroke="oklch(0.7 0.02 265)" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.21 0.04 265)",
                    border: "1px solid oklch(0.35 0.03 265)",
                    borderRadius: 12,
                    color: "white",
                  }}
                />
                <Bar dataKey="points" fill="oklch(0.62 0.22 293)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="font-display text-lg font-semibold">Risk mix</h2>
          {riskData.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">
              Add stories to a planning session to see the risk mix.
            </p>
          ) : (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={riskData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}>
                    {riskData.map((entry, index) => (
                      <Cell key={entry.name} fill={RISK_COLORS[index % RISK_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.21 0.04 265)",
                      border: "1px solid oklch(0.35 0.03 265)",
                      borderRadius: 12,
                      color: "white",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="panel p-5">
          <h2 className="font-display text-lg font-semibold">Sprint recommendation</h2>
          <div className="mt-4 space-y-3 text-sm">
            <Row label="Recommended sprints" value={`${analytics.recommendedSprints}`} />
            <Row label="Estimated duration" value={`${analytics.recommendedDays} days`} />
            <Row
              label="Suggested core team"
              value={analytics.bestTeam.length ? analytics.bestTeam.join(", ") : "Add teammates"}
            />
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="font-display text-lg font-semibold">Workload split</h2>
          <div className="mt-4 space-y-3">
            {analytics.workload.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Add teammates to the project to distribute work.
              </p>
            )}
            {analytics.workload.map((w) => (
              <div key={w.name} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>
                    {w.name} <span className="text-muted-foreground">· {w.role}</span>
                  </span>
                  <span className="font-medium">{w.estimatedPoints} pts</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.min(
                        100,
                        analytics.totalPoints
                          ? (w.estimatedPoints / analytics.totalPoints) * 100
                          : 0,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function sumPoints(cards: { status: string; points: number }[], status: string) {
  return cards.filter((c) => c.status === status).reduce((s, c) => s + (c.points ?? 0), 0);
}

function Stat({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: "default" | "secondary" | "destructive";
}) {
  return (
    <div className="panel p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      {badge ? (
        <Badge className="mt-2" variant={badge}>
          {value}
        </Badge>
      ) : (
        <p className="mt-2 font-display text-3xl font-bold">{value}</p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
