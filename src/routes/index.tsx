import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Users,
  Layers,
  Spade,
  Zap,
  ShieldCheck,
  NotebookPen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sprintzen — Estimate Sprints Together, In Real Time" },
      {
        name: "description",
        content:
          "Planning poker, live Kanban, shared notes and timeline analytics in one premium agile workspace for product teams.",
      },
      { property: "og:title", content: "Sprintzen — Estimate Sprints Together, In Real Time" },
      {
        property: "og:description",
        content:
          "Run planning poker, move Kanban cards live and forecast sprint length with Sprintzen.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: Spade,
    title: "Planning Poker",
    body: "Fibonacci voting with hidden ballots, dramatic reveals and automatic point consensus.",
  },
  {
    icon: Layers,
    title: "Live Kanban",
    body: "Drag stories across To Do, In Progress, Review and Done — synced instantly for everyone.",
  },
  {
    icon: BarChart3,
    title: "Timeline Analytics",
    body: "Complexity scoring, risk breakdown and a recommended sprint count from real votes.",
  },
  {
    icon: NotebookPen,
    title: "Shared Notes",
    body: "Every session keeps a collaborative decision log so nothing gets lost after the call.",
  },
  {
    icon: Users,
    title: "Team Workspace",
    body: "Roles for Admins, Team Leaders and Members with workload balancing suggestions.",
  },
  {
    icon: ShieldCheck,
    title: "Secure by default",
    body: "Row-level security means teams only ever see the projects they belong to.",
  },
];

function Landing() {
  const { user, loading } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Zap className="size-5" />
          </div>
          <span className="font-display text-xl font-bold">Sprintzen</span>
        </div>
        <nav className="flex items-center gap-2">
          {loading ? null : user ? (
            <Button asChild>
              <Link to="/dashboard">
                Open workspace <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost">
                <Link to="/auth">Log in</Link>
              </Button>
              <Button asChild>
                <Link to="/auth" search={{ mode: "signup" }}>
                  Get started
                </Link>
              </Button>
            </>
          )}
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-6 pt-16 pb-24 text-center">
          <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-muted-foreground">
            ✦ Agile estimation, reimagined
          </span>
          <h1 className="mt-6 font-display text-5xl leading-[1.05] font-bold md:text-7xl">
            Estimate sprints.
            <br />
            <span className="text-gradient">Together. In real time.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground md:text-lg">
            Sprintzen brings planning poker, a live Kanban board, shared session notes
            and timeline analytics into one workspace — so your team stops guessing and
            starts forecasting.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth" search={{ mode: "signup" }}>
                Start estimating <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/auth">I already have an account</Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <h2 className="sr-only">Features</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {features.map((f) => (
              <article key={f.title} className="panel p-6">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <f.icon className="size-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="panel flex flex-col items-center gap-6 p-10 text-center">
            <h2 className="font-display text-3xl font-bold md:text-4xl">
              Your next sprint starts with a better estimate
            </h2>
            <p className="max-w-xl text-sm text-muted-foreground">
              Create a project, invite your team, run a poker session and get a
              data-backed sprint forecast in minutes.
            </p>
            <Button asChild size="lg">
              <Link to="/auth" search={{ mode: "signup" }}>
                Create your workspace <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Sprintzen. Built for teams that ship.
      </footer>
    </div>
  );
}
