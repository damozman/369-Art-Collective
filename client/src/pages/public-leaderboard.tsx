import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, TrendingUp, Users, DollarSign, Award, Sparkles, Target, Link as LinkIcon, Activity } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";

interface LeaderboardEntry {
  influencerId: string;
  influencerName: string;
  currentTier: string;
  score: number;
  rank: number;
}

interface ActivityFeedEvent {
  id: string;
  influencerId: string;
  influencerName: string;
  eventType: string;
  eventData: any;
  message: string;
  createdAt: string;
}

const tierColors: Record<string, string> = {
  bronze: "text-amber-700 dark:text-amber-500 bg-amber-700/10",
  silver: "text-slate-400 dark:text-slate-300 bg-slate-400/10",
  gold: "text-yellow-500 dark:text-yellow-400 bg-yellow-500/10",
  platinum: "text-cyan-400 dark:text-cyan-300 bg-cyan-400/10",
  elite: "text-purple-500 dark:text-purple-400 bg-purple-500/10",
};

const formatScore = (score: number, metric: string): string => {
  if (metric === "earnings") {
    return `$${score.toFixed(2)}`;
  }
  return score.toLocaleString();
};

export default function PublicLeaderboard() {
  const [metric, setMetric] = useState("earnings");
  const [period, setPeriod] = useState("monthly");

  const { data: leaderboard, isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/leaderboard", metric, period],
  });

  const { data: activityFeed } = useQuery<ActivityFeedEvent[]>({
    queryKey: ["/api/activity-feed"],
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-4xl font-bold flex items-center gap-3" data-testid="text-title">
                <Trophy className="h-10 w-10 text-yellow-500" />
                Influencer Leaderboard
              </h1>
              <p className="text-muted-foreground mt-2">
                See our top-performing influencers driving the 369 Art Collective
              </p>
            </div>
            <div className="flex gap-3">
              <Link href="/" data-testid="link-home">
                <Button variant="outline">
                  Back to Home
                </Button>
              </Link>
              <Link href="/influencer/apply" data-testid="link-apply">
                <Button>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Become an Influencer
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-3 gap-6 mb-8" data-testid="stats-grid">
          <Card className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-yellow-500/20">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Top Earner</CardTitle>
              <DollarSign className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {leaderboard?.[0]?.influencerName || "Loading..."}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {leaderboard?.[0]
                  ? formatScore(leaderboard[0].score, "earnings")
                  : "---"}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Influencers</CardTitle>
              <Users className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {leaderboard?.length || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Competing this {period === "monthly" ? "month" : period === "weekly" ? "week" : "year"}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rewards Program</CardTitle>
              <Target className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Up to 18%</div>
              <p className="text-xs text-muted-foreground mt-1">
                Commission on sales
              </p>
            </CardContent>
          </Card>
        </div>

        <Card data-testid="card-leaderboard">
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-2xl">Rankings</CardTitle>
                <CardDescription className="mt-1">
                  Updated in real-time based on performance
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-3">Metric</h3>
                <Tabs value={metric} onValueChange={setMetric} data-testid="tabs-metric">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="earnings" data-testid="tab-earnings">
                      <DollarSign className="w-4 h-4 mr-2" />
                      Earnings
                    </TabsTrigger>
                    <TabsTrigger value="conversions" data-testid="tab-conversions">
                      <TrendingUp className="w-4 h-4 mr-2" />
                      Conversions
                    </TabsTrigger>
                    <TabsTrigger value="clicks" data-testid="tab-clicks">
                      <Users className="w-4 h-4 mr-2" />
                      Clicks
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-3">Time Period</h3>
                <Tabs value={period} onValueChange={setPeriod} data-testid="tabs-period">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="all" data-testid="tab-all-time">All Time</TabsTrigger>
                    <TabsTrigger value="monthly" data-testid="tab-monthly">This Month</TabsTrigger>
                    <TabsTrigger value="weekly" data-testid="tab-weekly">This Week</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>

            <div className="space-y-3">
              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground" data-testid="text-loading">
                  Loading leaderboard...
                </div>
              ) : leaderboard && leaderboard.length > 0 ? (
                <>
                  {leaderboard.slice(0, 50).map((entry) => (
                    <div
                      key={entry.influencerId}
                      className={`flex items-center justify-between gap-4 p-4 rounded-lg border transition-all ${
                        entry.rank <= 3
                          ? "bg-accent/30 border-accent hover-elevate active-elevate-2"
                          : "hover-elevate active-elevate-2"
                      }`}
                      data-testid={`leaderboard-entry-${entry.rank}`}
                    >
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div
                          className={`flex items-center justify-center w-12 h-12 rounded-full shrink-0 font-bold ${
                            entry.rank === 1
                              ? "bg-yellow-500 text-white text-lg"
                              : entry.rank === 2
                              ? "bg-slate-400 text-white text-lg"
                              : entry.rank === 3
                              ? "bg-amber-700 text-white text-lg"
                              : "bg-muted text-muted-foreground"
                          }`}
                          data-testid={`rank-${entry.rank}`}
                        >
                          {entry.rank <= 3 ? (
                            <Trophy className="w-6 h-6" />
                          ) : (
                            <span className="text-base font-bold">#{entry.rank}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-lg truncate" data-testid={`name-${entry.rank}`}>
                            {entry.influencerName}
                          </div>
                          <Badge
                            className={`capitalize ${tierColors[entry.currentTier] || ""}`}
                            data-testid={`tier-${entry.rank}`}
                          >
                            {entry.currentTier} Tier
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-2xl font-bold" data-testid={`score-${entry.rank}`}>
                          {formatScore(entry.score, metric)}
                        </div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {metric === "earnings" ? "earned" : metric}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div className="text-center py-12 text-muted-foreground" data-testid="text-empty">
                  <Trophy className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p className="text-lg">No leaderboard data available</p>
                  <p className="text-sm mt-2">Be the first to join and compete!</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Activity Feed */}
        {activityFeed && activityFeed.length > 0 && (
          <Card className="mt-8" data-testid="card-activity-feed">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                <CardTitle>Recent Activity</CardTitle>
              </div>
              <CardDescription>
                Live updates from our influencer community
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activityFeed.slice(0, 10).map((event) => (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 p-3 rounded-lg hover-elevate"
                    data-testid={`activity-${event.id}`}
                  >
                    <div className="text-2xl" data-testid={`activity-icon-${event.id}`}>
                      {event.eventType === "achievement_unlocked" && "🏆"}
                      {event.eventType === "tier_upgrade" && "⬆️"}
                      {event.eventType === "challenge_win" && "🥇"}
                      {event.eventType === "big_sale" && "💰"}
                      {event.eventType === "new_rank" && "📈"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" data-testid={`activity-message-${event.id}`}>
                        {event.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1" data-testid={`activity-time-${event.id}`}>
                        {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* CTA Section */}
        <Card className="mt-8 bg-gradient-to-br from-primary/10 to-purple-500/10 border-primary/20">
          <CardContent className="p-8">
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center">
                <Sparkles className="w-12 h-12 text-primary" />
              </div>
              <h2 className="text-3xl font-bold">Ready to Compete?</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Join the 369 Art Collective influencer program and start earning commissions
                on every sale you drive. Climb the leaderboard, unlock achievements, and win
                exclusive prizes!
              </p>
              <div className="flex gap-4 justify-center pt-4">
                <Link href="/influencer/apply">
                  <Button size="lg" data-testid="button-join-now">
                    <LinkIcon className="w-5 h-5 mr-2" />
                    Join Now
                  </Button>
                </Link>
                <Link href="/influencer/login">
                  <Button size="lg" variant="outline" data-testid="button-login">
                    Influencer Login
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
