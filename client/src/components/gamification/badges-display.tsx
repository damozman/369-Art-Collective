import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Award, Lock, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface BadgeEntry {
  achievementId: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  rarity: string;
  points: number;
  unlockedAt: Date;
}

interface AllAchievement {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  rarity: string;
  points: number;
  criteria: any;
}

interface BadgesDisplayProps {
  influencerId?: string;
  className?: string;
  compact?: boolean;
}

const rarityColors: Record<string, string> = {
  common: "text-slate-500 dark:text-slate-400",
  uncommon: "text-green-500 dark:text-green-400",
  rare: "text-blue-500 dark:text-blue-400",
  epic: "text-purple-500 dark:text-purple-400",
  legendary: "text-yellow-500 dark:text-yellow-400",
};

const rarityBgColors: Record<string, string> = {
  common: "bg-slate-500/10",
  uncommon: "bg-green-500/10",
  rare: "bg-blue-500/10",
  epic: "bg-purple-500/10",
  legendary: "bg-yellow-500/10",
};

export function BadgesDisplay({ influencerId, className, compact = false }: BadgesDisplayProps) {
  const { data: unlockedBadges, isLoading: isLoadingUnlocked } = useQuery<BadgeEntry[]>({
    queryKey: ["/api/influencers/badges"],
    enabled: !!influencerId,
  });

  const { data: allAchievements, isLoading: isLoadingAll } = useQuery<AllAchievement[]>({
    queryKey: ["/api/achievements"],
  });

  const isLoading = isLoadingUnlocked || isLoadingAll;

  const unlockedCodes = new Set(unlockedBadges?.map((b) => b.code) || []);
  const totalPoints = unlockedBadges?.reduce((sum, b) => sum + b.points, 0) || 0;

  if (compact) {
    return (
      <Card className={className} data-testid="card-badges-compact">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Achievement Points</CardTitle>
          <Sparkles className="w-4 h-4 text-yellow-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold" data-testid="text-total-points">
            {totalPoints}
          </div>
          <p className="text-xs text-muted-foreground mt-1" data-testid="text-badges-count">
            {unlockedBadges?.length || 0} / {allAchievements?.length || 0} badges unlocked
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className} data-testid="card-badges-full">
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-yellow-500" />
            <CardTitle>Achievements</CardTitle>
          </div>
          <Badge variant="secondary" data-testid="badge-total-points">
            {totalPoints} points
          </Badge>
        </div>
        <CardDescription>
          {unlockedBadges?.length || 0} of {allAchievements?.length || 0} badges unlocked
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="text-loading">
            Loading achievements...
          </div>
        ) : allAchievements && allAchievements.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {allAchievements.map((achievement) => {
              const isUnlocked = unlockedCodes.has(achievement.code);
              const unlockedBadge = unlockedBadges?.find((b) => b.code === achievement.code);
              
              return (
                <Tooltip key={achievement.id}>
                  <TooltipTrigger asChild>
                    <div
                      className={`flex flex-col items-center gap-2 p-3 rounded-md border cursor-pointer transition-all ${
                        isUnlocked
                          ? `${rarityBgColors[achievement.rarity]} hover-elevate active-elevate-2`
                          : "opacity-40 grayscale"
                      }`}
                      data-testid={`achievement-${achievement.code}`}
                    >
                      <div className="relative">
                        <div
                          className={`text-4xl ${
                            isUnlocked ? rarityColors[achievement.rarity] : ""
                          }`}
                        >
                          {achievement.icon}
                        </div>
                        {!isUnlocked && (
                          <Lock className="absolute -top-1 -right-1 w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-medium truncate w-full">
                          {achievement.name}
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-xs mt-1 ${rarityColors[achievement.rarity]}`}
                        >
                          {achievement.points}
                        </Badge>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <div className="space-y-1">
                      <div className="font-semibold">{achievement.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {achievement.description}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="outline" className={rarityColors[achievement.rarity]}>
                          {achievement.rarity}
                        </Badge>
                        <span>{achievement.points} points</span>
                      </div>
                      {isUnlocked && unlockedBadge && (
                        <div className="text-xs text-muted-foreground mt-2">
                          Unlocked{" "}
                          {formatDistanceToNow(new Date(unlockedBadge.unlockedAt), {
                            addSuffix: true,
                          })}
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground" data-testid="text-empty">
            No achievements available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
