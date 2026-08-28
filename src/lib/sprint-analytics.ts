export type StoryLike = {
  risk: "low" | "medium" | "high";
  complexity: number;
  final_points: number | null;
};

export type MemberLike = {
  id: string;
  name: string;
  role: "Admin" | "TeamLeader" | "TeamMember";
};

export type Analytics = {
  complexityScore: number;
  totalPoints: number;
  storyCount: number;
  riskLevel: "Low" | "Medium" | "High";
  riskBreakdown: { low: number; medium: number; high: number };
  recommendedSprints: number;
  recommendedDays: number;
  workload: { name: string; role: string; estimatedPoints: number }[];
  bestTeam: string[];
};

const POINTS_PER_DEV_PER_SPRINT = 8;

export function computeAnalytics(
  stories: StoryLike[],
  members: MemberLike[],
  sprintLengthDays: number,
): Analytics {
  const totalPoints = stories.reduce(
    (sum, s) => sum + (s.final_points ?? s.complexity ?? 0),
    0,
  );

  const avgComplexity = stories.length
    ? stories.reduce((sum, s) => sum + (s.complexity ?? 0), 0) / stories.length
    : 0;

  const riskBreakdown = { low: 0, medium: 0, high: 0 };
  for (const s of stories) riskBreakdown[s.risk ?? "low"] += 1;

  const riskLevel =
    riskBreakdown.high > 2 ? "High" : riskBreakdown.medium > 3 ? "Medium" : "Low";

  const teamSize = Math.max(members.length, 1);
  const recommendedSprints = Math.max(
    1,
    Math.ceil(totalPoints / (teamSize * POINTS_PER_DEV_PER_SPRINT)),
  );

  return {
    complexityScore: Math.round((avgComplexity + totalPoints / 10) * 10) / 10,
    totalPoints,
    storyCount: stories.length,
    riskLevel,
    riskBreakdown,
    recommendedSprints,
    recommendedDays: recommendedSprints * (sprintLengthDays || 14),
    workload: members.map((m) => ({
      name: m.name,
      role: m.role,
      estimatedPoints: Math.round(totalPoints / teamSize),
    })),
    bestTeam: pickBestTeam(members, totalPoints),
  };
}

function pickBestTeam(members: MemberLike[], totalPoints: number): string[] {
  if (!members.length) return [];
  const ideal = Math.min(members.length, Math.max(3, Math.ceil(totalPoints / 20)));
  const leaders = members.filter((m) => m.role === "TeamLeader" || m.role === "Admin");
  const others = members.filter((m) => m.role === "TeamMember");
  return [...leaders, ...others].slice(0, ideal).map((m) => m.name);
}

export const FIBONACCI = [1, 2, 3, 5, 8, 13, 21] as const;

export function nearestFibonacci(avg: number): number {
  return FIBONACCI.reduce((prev, cur) =>
    Math.abs(cur - avg) < Math.abs(prev - avg) ? cur : prev,
  );
}
