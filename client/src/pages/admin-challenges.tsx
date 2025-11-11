import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Trophy, 
  Plus, 
  Users, 
  Target, 
  Calendar, 
  DollarSign,
  TrendingUp
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

interface Challenge {
  id: string;
  name: string;
  description: string;
  challengeType: string;
  metric: string;
  goal?: string;
  startDate: string;
  endDate: string;
  firstPlacePrize: string;
  secondPlacePrize?: string;
  thirdPlacePrize?: string;
  prizeDescription?: string;
  status: string;
  participantCount: number;
}

const challengeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  challengeType: z.enum(["sales", "recruitment", "engagement"]),
  metric: z.enum(["earnings", "conversions", "artist_signups"]),
  goal: z.string().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  firstPlacePrize: z.string().min(1, "First place prize is required"),
  secondPlacePrize: z.string().optional(),
  thirdPlacePrize: z.string().optional(),
  prizeDescription: z.string().optional(),
});

type ChallengeFormData = z.infer<typeof challengeSchema>;

export default function AdminChallenges() {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const { toast } = useToast();

  const { data: challenges, isLoading } = useQuery<Challenge[]>({
    queryKey: ["/api/admin/challenges"],
  });

  const form = useForm<ChallengeFormData>({
    resolver: zodResolver(challengeSchema),
    defaultValues: {
      name: "",
      description: "",
      challengeType: "sales",
      metric: "earnings",
      goal: "",
      startDate: "",
      endDate: "",
      firstPlacePrize: "",
      secondPlacePrize: "",
      thirdPlacePrize: "",
      prizeDescription: "",
    },
  });

  const createChallengeMutation = useMutation({
    mutationFn: async (data: ChallengeFormData) => {
      return await apiRequest("/api/admin/challenges", {
        method: "POST",
        body: JSON.stringify(data),
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/challenges"] });
      toast({
        title: "Challenge created",
        description: "The new challenge has been created successfully",
      });
      form.reset();
      setShowCreateForm(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create challenge",
        variant: "destructive",
      });
    },
  });

  const updateChallengeStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return await apiRequest(`/api/admin/challenges/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/challenges"] });
      toast({
        title: "Challenge updated",
        description: "Challenge status has been updated",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update challenge",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ChallengeFormData) => {
    createChallengeMutation.mutate(data);
  };

  const statusColors: Record<string, string> = {
    upcoming: "bg-blue-500/10 text-blue-500",
    active: "bg-green-500/10 text-green-500",
    ended: "bg-gray-500/10 text-gray-500",
  };

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-bold flex items-center gap-3" data-testid="text-title">
            <Trophy className="h-10 w-10 text-primary" />
            Challenge Management
          </h1>
          <p className="text-muted-foreground mt-2">
            Create and manage influencer competitions
          </p>
        </div>
        <Button 
          onClick={() => setShowCreateForm(!showCreateForm)}
          data-testid="button-create-challenge"
        >
          <Plus className="w-4 h-4 mr-2" />
          {showCreateForm ? "Cancel" : "Create Challenge"}
        </Button>
      </div>

      {showCreateForm && (
        <Card className="mb-8" data-testid="card-create-form">
          <CardHeader>
            <CardTitle>Create New Challenge</CardTitle>
            <CardDescription>
              Set up a time-bound competition for your influencers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Challenge Name</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Q1 Sales Sprint" 
                            {...field} 
                            data-testid="input-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="challengeType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="sales">Sales Challenge</SelectItem>
                            <SelectItem value="recruitment">Recruitment Challenge</SelectItem>
                            <SelectItem value="engagement">Engagement Challenge</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Describe the challenge goals and rules..."
                          {...field}
                          data-testid="textarea-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid md:grid-cols-3 gap-6">
                  <FormField
                    control={form.control}
                    name="metric"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Metric</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-metric">
                              <SelectValue placeholder="Select metric" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="earnings">Total Earnings</SelectItem>
                            <SelectItem value="conversions">Total Conversions</SelectItem>
                            <SelectItem value="artist_signups">Artist Signups</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-start-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-end-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid md:grid-cols-3 gap-6">
                  <FormField
                    control={form.control}
                    name="firstPlacePrize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>1st Place Prize</FormLabel>
                        <FormControl>
                          <Input placeholder="$500" {...field} data-testid="input-first-prize" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="secondPlacePrize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>2nd Place Prize</FormLabel>
                        <FormControl>
                          <Input placeholder="$300" {...field} data-testid="input-second-prize" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="thirdPlacePrize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>3rd Place Prize</FormLabel>
                        <FormControl>
                          <Input placeholder="$100" {...field} data-testid="input-third-prize" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button 
                  type="submit" 
                  disabled={createChallengeMutation.isPending}
                  data-testid="button-submit"
                >
                  {createChallengeMutation.isPending ? "Creating..." : "Create Challenge"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6">
        {isLoading ? (
          <Card>
            <CardContent className="p-12 text-center">
              <TrendingUp className="w-12 h-12 mx-auto mb-4 opacity-20 animate-pulse" />
              <p className="text-muted-foreground">Loading challenges...</p>
            </CardContent>
          </Card>
        ) : challenges && challenges.length > 0 ? (
          challenges.map((challenge) => (
            <Card key={challenge.id} data-testid={`card-challenge-${challenge.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <CardTitle>{challenge.name}</CardTitle>
                      <Badge className={statusColors[challenge.status]} data-testid={`badge-status-${challenge.id}`}>
                        {challenge.status}
                      </Badge>
                    </div>
                    <CardDescription>{challenge.description}</CardDescription>
                  </div>
                  {challenge.status === "active" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateChallengeStatus.mutate({ id: challenge.id, status: "ended" })}
                      data-testid={`button-end-${challenge.id}`}
                    >
                      End Challenge
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-3">
                    <Target className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Metric</div>
                      <div className="font-medium capitalize">{challenge.metric.replace('_', ' ')}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Participants</div>
                      <div className="font-medium">{challenge.participantCount}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Dates</div>
                      <div className="font-medium text-sm">
                        {format(new Date(challenge.startDate), 'MMM d')} - {format(new Date(challenge.endDate), 'MMM d')}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <DollarSign className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Top Prize</div>
                      <div className="font-medium">{challenge.firstPlacePrize}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="p-12 text-center" data-testid="card-empty">
              <Trophy className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg text-muted-foreground mb-2">No challenges yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first challenge to drive influencer competition
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
