import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Spade, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useActiveProject } from "@/hooks/use-active-project";

export const Route = createFileRoute("/_authenticated/board")({
  head: () => ({
    meta: [
      { title: "Scrum Board — Sprintzen" },
      {
        name: "description",
        content:
          "Live Kanban board and planning poker sessions for your current Sprintzen project.",
      },
      { property: "og:title", content: "Scrum Board — Sprintzen" },
      { property: "og:description", content: "Move cards and run estimation live." },
    ],
  }),
  component: BoardPage,
});

type Card = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  points: number;
  status: ColumnKey;
  position: number;
};

type ColumnKey = "todo" | "inprogress" | "review" | "done";

const COLUMNS: { key: ColumnKey; label: string; accent: string }[] = [
  { key: "todo", label: "To Do", accent: "bg-muted-foreground" },
  { key: "inprogress", label: "In Progress", accent: "bg-primary" },
  { key: "review", label: "Review", accent: "bg-warning" },
  { key: "done", label: "Done", accent: "bg-success" },
];

function BoardPage() {
  const { canLead, user } = useAuth();
  const { project, projectId, isLoading: projectsLoading } = useActiveProject();
  const queryClient = useQueryClient();

  const [cardTitle, setCardTitle] = useState("");
  const [cardDesc, setCardDesc] = useState("");
  const [cardPoints, setCardPoints] = useState(0);
  const [cardStatus, setCardStatus] = useState<ColumnKey>("todo");
  const [cardOpen, setCardOpen] = useState(false);

  const [sessionTitle, setSessionTitle] = useState("");
  const [sessionOpen, setSessionOpen] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);

  const cardsQuery = useQuery({
    queryKey: ["cards", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<Card[]> => {
      const { data, error } = await supabase
        .from("kanban_cards")
        .select("id, project_id, title, description, points, status, position")
        .eq("project_id", projectId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Card[];
    },
  });

  const sessionsQuery = useQuery({
    queryKey: ["sessions", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("poker_sessions")
        .select("id, title, status, created_at")
        .eq("project_id", projectId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`board-${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kanban_cards" },
        () => queryClient.invalidateQueries({ queryKey: ["cards", projectId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "poker_sessions" },
        () => queryClient.invalidateQueries({ queryKey: ["sessions", projectId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [projectId, queryClient]);

  const addCard = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Select a project first");
      if (cardTitle.trim().length < 2) throw new Error("Card needs a title");
      const { error } = await supabase.from("kanban_cards").insert({
        project_id: projectId,
        title: cardTitle.trim(),
        description: cardDesc.trim(),
        points: cardPoints,
        status: cardStatus,
        position: (cardsQuery.data?.length ?? 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Card added");
      setCardOpen(false);
      setCardTitle("");
      setCardDesc("");
      setCardPoints(0);
      void queryClient.invalidateQueries({ queryKey: ["cards", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add card"),
  });

  const moveCard = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ColumnKey }) => {
      const { error } = await supabase.from("kanban_cards").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cards", projectId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not move card"),
  });

  const deleteCard = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("kanban_cards").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cards", projectId] }),
  });

  const createSession = useMutation({
    mutationFn: async () => {
      if (!projectId || !user) throw new Error("Select a project first");
      if (sessionTitle.trim().length < 2) throw new Error("Session needs a title");
      const { data, error } = await supabase
        .from("poker_sessions")
        .insert({ project_id: projectId, title: sessionTitle.trim(), created_by: user.id })
        .select("id")
        .single();
      if (error) throw error;

      const { data: members } = await supabase
        .from("project_members")
        .select("user_id")
        .eq("project_id", projectId);
      const rows = (members ?? [])
        .filter((m) => m.user_id !== user.id)
        .map((m) => ({
          user_id: m.user_id,
          message: `New planning session "${sessionTitle.trim()}" started`,
          type: "session",
        }));
      if (rows.length) await supabase.from("notifications").insert(rows);
      return data;
    },
    onSuccess: () => {
      toast.success("Session created");
      setSessionOpen(false);
      setSessionTitle("");
      void queryClient.invalidateQueries({ queryKey: ["sessions", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create session"),
  });

  if (projectsLoading) {
    return <p className="text-sm text-muted-foreground">Loading board…</p>;
  }

  if (!project) {
    return (
      <div className="panel p-10 text-center">
        <h1 className="font-display text-xl font-semibold">No project selected</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create or join a project from the dashboard to use the board.
        </p>
        <Button asChild className="mt-5">
          <Link to="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    );
  }

  const cards = cardsQuery.data ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">{project.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live board · {cards.length} cards ·{" "}
            {cards.reduce((s, c) => s + c.points, 0)} points
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={cardOpen} onOpenChange={setCardOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="size-4" /> Add card
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New card</DialogTitle>
                <DialogDescription>Cards sync live to everyone on the project.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="c-title">Title</Label>
                  <Input
                    id="c-title"
                    value={cardTitle}
                    onChange={(e) => setCardTitle(e.target.value)}
                    placeholder="Add Apple Pay to checkout"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="c-desc">Description</Label>
                  <Textarea
                    id="c-desc"
                    value={cardDesc}
                    onChange={(e) => setCardDesc(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="c-points">Points</Label>
                    <Input
                      id="c-points"
                      type="number"
                      min={0}
                      value={cardPoints}
                      onChange={(e) => setCardPoints(Number(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="c-status">Column</Label>
                    <Select
                      value={cardStatus}
                      onValueChange={(v) => setCardStatus(v as ColumnKey)}
                    >
                      <SelectTrigger id="c-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COLUMNS.map((c) => (
                          <SelectItem key={c.key} value={c.key}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => addCard.mutate()} disabled={addCard.isPending}>
                  {addCard.isPending && <Loader2 className="size-4 animate-spin" />}
                  Add card
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {canLead && (
            <Dialog open={sessionOpen} onOpenChange={setSessionOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Spade className="size-4" /> New poker session
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Start a planning poker session</DialogTitle>
                  <DialogDescription>
                    Add stories inside the session, then vote as a team.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="s-title">Session title</Label>
                  <Input
                    id="s-title"
                    value={sessionTitle}
                    onChange={(e) => setSessionTitle(e.target.value)}
                    placeholder="Sprint 12 estimation"
                  />
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => createSession.mutate()}
                    disabled={createSession.isPending}
                  >
                    {createSession.isPending && <Loader2 className="size-4 animate-spin" />}
                    Create session
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {COLUMNS.map((col) => {
          const colCards = cards.filter((c) => c.status === col.key);
          return (
            <section
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragging) moveCard.mutate({ id: dragging, status: col.key });
                setDragging(null);
              }}
              className="panel flex min-h-52 flex-col gap-3 p-4"
            >
              <header className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full", col.accent)} />
                <h2 className="text-sm font-semibold">{col.label}</h2>
                <span className="ml-auto text-xs text-muted-foreground">
                  {colCards.length}
                </span>
              </header>

              {colCards.length === 0 && (
                <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  Drop cards here
                </p>
              )}

              {colCards.map((c) => (
                <article
                  key={c.id}
                  draggable
                  onDragStart={() => setDragging(c.id)}
                  className="group cursor-grab rounded-xl bg-secondary/70 p-3 transition-colors hover:bg-secondary active:cursor-grabbing"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-medium">{c.title}</h3>
                    <button
                      aria-label={`Delete ${c.title}`}
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => deleteCard.mutate(c.id)}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </button>
                  </div>
                  {c.description && (
                    <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                      {c.description}
                    </p>
                  )}
                  <div className="mt-3 flex items-center justify-between">
                    <Badge variant="secondary">{c.points} pts</Badge>
                    <Select
                      value={c.status}
                      onValueChange={(v) =>
                        moveCard.mutate({ id: c.id, status: v as ColumnKey })
                      }
                    >
                      <SelectTrigger className="h-7 w-[120px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COLUMNS.map((o) => (
                          <SelectItem key={o.key} value={o.key}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </article>
              ))}
            </section>
          );
        })}
      </div>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Planning poker sessions</h2>
        {!sessionsQuery.data?.length ? (
          <div className="panel p-8 text-center text-sm text-muted-foreground">
            {canLead
              ? "No sessions yet — start one above."
              : "No sessions yet. Your team leader can start one."}
          </div>
        ) : (
          <div className="panel divide-y divide-border">
            {sessionsQuery.data.map((s) => (
              <Link
                key={s.id}
                to="/board/$sessionId"
                params={{ sessionId: s.id }}
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-secondary/50"
              >
                <div>
                  <div className="font-medium">{s.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(s.created_at).toLocaleString()}
                  </div>
                </div>
                <Badge variant={s.status === "open" ? "default" : "secondary"}>
                  {s.status}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
