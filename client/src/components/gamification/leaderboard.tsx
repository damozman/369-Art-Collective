import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Trophy, TrendingUp, Users, DollarSign, Award } from "lucide-react";
import { useState } from "react";

interface LeaderboardEntry {
  influencerId: string;
  influencerName: string;
  currentTier: string;
  score: number;
  rank: number;
}

interface LeaderboardProps {
  className?: string;
}

const tierColors: Record<string, string> = {
  bronze: "text-amber-700 dark:text-amber-500",
  silver: "text-slate-400 dark:text-slate-300",
  gold: "text-yellow-500 dark:text-yellow-400",
  platinum: "text-cyan-400 dark:text-cyan-300",
  elite: "text-purple-500 dark:text-purple-400",
};

const getTierBadgeVariant = (tier: string): "default" | "secondary" | "outline" => {
  if (tier === "elite" || tier === "platinum") return "default";
  if (tier === "gold") return "secondary";
  return "outline";
};

const formatScore = (score: number, metric: string): string => {
  if (metric === "earnings") {
    return `$${score.toFixed(2)}`;
  }
  return score.toString();
};

export function Leaderboard({ className }: LeaderboardProps) {
  const [metric, setMetric] = useState("earnings");
  const [period, setPeriod] = useState("monthly");

  const { data: leaderboard, isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/leaderboard", metric, period],
  });

  return (
    <Card className={className} data-testid="card-leaderboard">
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <CardTitle>Leaderboard</CardTitle>
          </div>
          <CardDescription>See how you stack up against other influencers</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={metric} onValueChange={setMetric} data-testid="tabs-metric">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="earnings" data-testid="tab-earnings">
              <DollarSign className="w-4 h-4 mr-1" />
              Earnings
            </TabsTrigger>
            <TabsTrigger value="conversions" data-testid="tab-conversions">
              <TrendingUp className="w-4 h-4 mr-1" />
              Conversions
            </TabsTrigger>
            <TabsTrigger value="clicks" data-testid="tab-clicks">
              <Users className="w-4 h-4 mr-1" />
              Clicks
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Tabs value={period} onValueChange={setPeriod} data-testid="tabs-period">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all" data-testid="tab-all-time">All Time</TabsTrigger>
            <TabsTrigger value="monthly" data-testid="tab-monthly">This Month</TabsTrigger>
            <TabsTrigger value="weekly" data-testid="tab-weekly">This Week</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-2">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-loading">
              Loading leaderboard...
            </div>
          ) : leaderboard && leaderboard.length > 0 ? (
            leaderboard.slice(0, 10).map((entry) => (
              <div
                key={entry.influencerId}
                className={`flex items-center justify-between gap-3 p-3 rounded-md border ${
                  entry.rank <= 3 ? "bg-accent/20" : ""
                }`}
                data-testid={`leaderboard-entry-${entry.rank}`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${
                      entry.rank === 1
                        ? "bg-yellow-500/20 text-yellow-500"
                        : entry.rank === 2
                        ? "bg-slate-400/20 text-slate-400"
                        : entry.rank === 3
                        ? "bg-amber-700/20 text-amber-700"
                        : "bg-muted text-muted-foreground"
                    }`}
                    data-testid={`rank-${entry.rank}`}
                  >
                    {entry.rank <= 3 ? (
                      <Award className="w-5 h-5" />
                    ) : (
                      <span className="text-sm font-semibold">{entry.rank}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate" data-testid={`name-${entry.rank}`}>
                      {entry.influencerName}
                    </div>
                    <Badge
                      variant={getTierBadgeVariant(entry.currentTier)}
                      className={`capitalize ${tierColors[entry.currentTier] || ""}`}
                      data-testid={`tier-${entry.rank}`}
                    >
                      {entry.currentTier}
                    </Badge>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold" data-testid={`score-${entry.rank}`}>
                    {formatScore(entry.score, metric)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {metric === "earnings" ? "earned" : metric}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-empty">
              No leaderboard data available
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
