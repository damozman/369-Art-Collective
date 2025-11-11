import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Target, Calendar, Trophy, Users, Clock } from "lucide-react";
import { formatDistanceToNow, format, differenceInDays } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Challenge {
  id: string;
  name: string;
  description: string;
  challengeType: string;
  metric: string;
  goal?: string;
  startDate: Date;
  endDate: Date;
  firstPlacePrize: string;
  secondPlacePrize?: string;
  thirdPlacePrize?: string;
  prizeDescription?: string;
  status: string;
  participantCount: number;
}

interface ChallengeLeaderboardEntry {
  influencerId: string;
  influencerName: string;
  currentScore: string;
  rank?: number;
}

interface ChallengesProps {
  influencerId?: string;
  className?: string;
}

const statusColors: Record<string, string> = {
  upcoming: "text-blue-500 dark:text-blue-400",
  active: "text-green-500 dark:text-green-400",
  completed: "text-slate-500 dark:text-slate-400",
};

export function Challenges({ influencerId, className }: ChallengesProps) {
  const { toast } = useToast();

  const { data: challenges, isLoading } = useQuery<Challenge[]>({
    queryKey: ["/api/challenges"],
  });

  const joinMutation = useMutation({
    mutationFn: async (challengeId: string) => {
      await apiRequest("POST", `/api/challenges/${challengeId}/join`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/challenges"] });
      toast({
        title: "Success!",
        description: "You've joined the challenge. Good luck!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to join challenge",
        variant: "destructive",
      });
    },
  });

  const getDaysRemaining = (endDate: Date): number => {
    return differenceInDays(new Date(endDate), new Date());
  };

  return (
    <Card className={className} data-testid="card-challenges">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          <CardTitle>Active Challenges</CardTitle>
        </div>
        <CardDescription>
          Compete in time-limited challenges for exclusive prizes
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="text-loading">
            Loading challenges...
          </div>
        ) : challenges && challenges.length > 0 ? (
          <div className="space-y-4">
            {challenges.map((challenge) => {
              const daysRemaining = getDaysRemaining(challenge.endDate);
              const isActive = challenge.status === "active";
              const isUpcoming = challenge.status === "upcoming";

              return (
                <Card key={challenge.id} className="overflow-hidden" data-testid={`challenge-${challenge.id}`}>
                  <CardHeader className="flex flex-row items-start justify-between gap-2 flex-wrap space-y-0 pb-3">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg" data-testid={`challenge-name-${challenge.id}`}>
                        {challenge.name}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {challenge.description}
                      </CardDescription>
                    </div>
                    <Badge
                      variant={isActive ? "default" : "secondary"}
                      className={statusColors[challenge.status]}
                      data-testid={`challenge-status-${challenge.id}`}
                    >
                      {challenge.status}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <div className="text-muted-foreground">Start</div>
                          <div className="font-medium">
                            {format(new Date(challenge.startDate), "MMM d, yyyy")}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <div className="text-muted-foreground">
                            {daysRemaining > 0 ? "Ends in" : "Ended"}
                          </div>
                          <div className="font-medium">
                            {daysRemaining > 0
                              ? `${daysRemaining} days`
                              : formatDistanceToNow(new Date(challenge.endDate), {
                                  addSuffix: true,
                                })}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {challenge.participantCount} participants
                      </span>
                    </div>

                    {challenge.goal && (
                      <div className="text-sm">
                        <div className="text-muted-foreground mb-1">Goal</div>
                        <div className="font-medium">
                          {challenge.metric === "earnings" ? "$" : ""}
                          {challenge.goal} {challenge.metric}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-yellow-500" />
                        <span className="text-sm font-medium">Prizes</span>
                      </div>
                      <div className="space-y-1 text-sm pl-6">
                        <div className="flex items-center gap-2">
                          <span className="text-yellow-500">🥇</span>
                          <span className="font-medium">${challenge.firstPlacePrize}</span>
                        </div>
                        {challenge.secondPlacePrize && (
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400">🥈</span>
                            <span className="font-medium">${challenge.secondPlacePrize}</span>
                          </div>
                        )}
                        {challenge.thirdPlacePrize && (
                          <div className="flex items-center gap-2">
                            <span className="text-amber-700">🥉</span>
                            <span className="font-medium">${challenge.thirdPlacePrize}</span>
                          </div>
                        )}
                      </div>
                      {challenge.prizeDescription && (
                        <p className="text-xs text-muted-foreground pl-6">
                          {challenge.prizeDescription}
                        </p>
                      )}
                    </div>
                  </CardContent>
                  <CardFooter>
                    {isActive || isUpcoming ? (
                      <Button
                        className="w-full"
                        onClick={() => joinMutation.mutate(challenge.id)}
                        disabled={joinMutation.isPending}
                        data-testid={`button-join-${challenge.id}`}
                      >
                        {joinMutation.isPending ? "Joining..." : "Join Challenge"}
                      </Button>
                    ) : (
                      <Button variant="outline" className="w-full" disabled>
                        Challenge Ended
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground" data-testid="text-empty">
            No active challenges at the moment
          </div>
        )}
      </CardContent>
    </Card>
  );
}
