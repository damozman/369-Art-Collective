import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Sparkles, Zap, Clock, ImageIcon, Download, Loader2, ShoppingCart, Lock, Crown } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth-context";

interface AiCredits {
  freeCreditsRemaining: number;
  paidCreditsRemaining: number;
  totalCredits: number;
  totalFreeCreditsGranted: number;
}

interface AiGeneration {
  id: string;
  prompt: string;
  imageUrl: string | null;
  size: string;
  status: "pending" | "completed" | "failed";
  errorMessage: string | null;
  createdAt: string;
}

interface GenerationResult {
  id: string;
  imageUrl: string;
  prompt: string;
  size: string;
  remainingCredits: number;
  status: string;
}

interface SubscriptionData {
  tier: "free" | "pro" | "elite";
  status: "active" | "canceled" | "past_due";
  currentPeriodEnd: string | null;
}

export default function ArtistAiStudio() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<"1024x1024" | "512x512" | "256x256">("1024x1024");
  const [currentGeneration, setCurrentGeneration] = useState<GenerationResult | null>(null);

  // Fetch subscription data
  const { 
    data: subscription, 
    isLoading: subscriptionLoading,
    isError: subscriptionError,
    error: subscriptionErrorData
  } = useQuery<SubscriptionData>({
    queryKey: ["/api/artists/subscription"],
    retry: 1,
  });

  // Fetch AI credits
  const { 
    data: credits, 
    isLoading: creditsLoading, 
    isError: creditsError,
    error: creditsErrorData,
    refetch: refetchCredits 
  } = useQuery<AiCredits>({
    queryKey: ["/api/ai/credits"],
    retry: 2,
  });

  // Fetch generation history
  const { 
    data: generations, 
    isLoading: historyLoading,
    isError: historyError,
    error: historyErrorData,
    refetch: refetchHistory
  } = useQuery<AiGeneration[]>({
    queryKey: ["/api/ai/generations"],
    retry: 2,
  });

  // Generate AI image mutation
  const generateMutation = useMutation({
    mutationFn: async (data: { prompt: string; size: string }) => {
      const response = await apiRequest("POST", "/api/ai/generate", data);
      return response.json() as Promise<GenerationResult>;
    },
    onSuccess: (result) => {
      setCurrentGeneration(result);
      setPrompt("");
      queryClient.invalidateQueries({ queryKey: ["/api/ai/credits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai/generations"] });
      toast({
        title: "AI artwork generated!",
        description: "Your AI-generated image is ready to view.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation failed",
        description: error.message || "Failed to generate AI image. Your credit has been refunded.",
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast({
        title: "Prompt required",
        description: "Please enter a description of what you want to create.",
        variant: "destructive",
      });
      return;
    }

    if (prompt.length < 3) {
      toast({
        title: "Prompt too short",
        description: "Please provide a more detailed description (at least 3 characters).",
        variant: "destructive",
      });
      return;
    }

    generateMutation.mutate({ prompt, size });
  };

  // Only consider credits depleted if we successfully fetched them and they're 0
  // Don't disable generation on API errors - allow users to try
  const totalCredits = credits?.totalCredits ?? 0;
  const hasCredits = creditsError ? true : totalCredits > 0;
  // Allow generation if: (1) API error (assume credits exist), or (2) API success with credits > 0
  const canGenerate = creditsError || totalCredits > 0;
  // Show "buy credits" CTA only when API succeeds and reports 0 credits
  const showBuyCredits = !creditsError && totalCredits === 0;

  // Check subscription tier access
  const isPro = subscription?.tier === "pro";
  const isElite = subscription?.tier === "elite";
  const isFree = subscription?.tier === "free";
  // If subscription query errors, allow access (don't lock out paying users)
  // Only restrict if we successfully determined the user is on Free tier
  const hasAccess = subscriptionError || isPro || isElite;

  // Show loading state while checking subscription
  if (subscriptionLoading) {
    return (
      <div className="p-6 space-y-6" data-testid="page-ai-studio">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">AI Art Studio</h1>
          </div>
        </div>
        <Card>
          <CardContent className="py-12">
            <div className="flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show upgrade prompt ONLY for confirmed Free tier users (not for errors)
  if (!hasAccess && isFree) {
    return (
      <div className="p-6 space-y-6" data-testid="page-ai-studio">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold" data-testid="text-page-title">AI Art Studio</h1>
          </div>
          <p className="text-muted-foreground" data-testid="text-page-description">
            Generate unique artwork using AI. Perfect for creating original designs or exploring creative ideas.
          </p>
        </div>

        <Card data-testid="card-upgrade-prompt">
          <CardContent className="py-12">
            <div className="max-w-md mx-auto text-center space-y-6">
              <div className="flex justify-center">
                <div className="rounded-full bg-primary/10 p-4">
                  <Lock className="h-12 w-12 text-primary" />
                </div>
              </div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-bold" data-testid="text-upgrade-title">
                  Pro Feature: AI Art Studio
                </h2>
                <p className="text-muted-foreground" data-testid="text-upgrade-description">
                  Unlock AI-powered artwork generation with a Pro or Elite subscription. Create unlimited unique designs using DALL-E 3 technology.
                </p>
              </div>

              <div className="space-y-3 pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-left space-y-1 p-4 rounded-lg border">
                    <div className="flex items-center gap-2 text-primary">
                      <Crown className="h-4 w-4" />
                      <p className="font-semibold">Pro Tier</p>
                    </div>
                    <p className="text-2xl font-bold">$15<span className="text-sm text-muted-foreground">/mo</span></p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li>• AI Art Studio access</li>
                      <li>• 35% minimum royalty</li>
                      <li>• Unlimited uploads</li>
                    </ul>
                  </div>

                  <div className="text-left space-y-1 p-4 rounded-lg border border-primary">
                    <div className="flex items-center gap-2 text-primary">
                      <Crown className="h-4 w-4" />
                      <p className="font-semibold">Elite Tier</p>
                    </div>
                    <p className="text-2xl font-bold">$40<span className="text-sm text-muted-foreground">/mo</span></p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li>• AI Art Studio access</li>
                      <li>• 45% guaranteed royalty</li>
                      <li>• Full customization</li>
                    </ul>
                  </div>
                </div>

                <Button
                  onClick={() => setLocation("/artist/settings")}
                  size="lg"
                  className="w-full"
                  data-testid="button-upgrade-to-pro"
                >
                  <Crown className="mr-2 h-5 w-5" />
                  Upgrade to Unlock AI Studio
                </Button>
                
                <p className="text-xs text-muted-foreground">
                  You can upgrade or downgrade your subscription at any time
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Pro/Elite users see the full AI Studio
  return (
    <div className="p-6 space-y-6" data-testid="page-ai-studio">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold" data-testid="text-page-title">AI Art Studio</h1>
          {isElite && <Badge variant="default" data-testid="badge-elite">Elite Access</Badge>}
          {isPro && <Badge variant="secondary" data-testid="badge-pro">Pro Access</Badge>}
        </div>
        <p className="text-muted-foreground" data-testid="text-page-description">
          Generate unique artwork using AI. Perfect for creating original designs or exploring creative ideas.
        </p>
      </div>

      {/* Credits Display */}
      <Card data-testid="card-credits">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <CardTitle>AI Generation Credits</CardTitle>
            </div>
            {creditsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : creditsError ? (
              <Badge variant="secondary" data-testid="badge-total-credits">
                Error loading
              </Badge>
            ) : (
              <Badge variant={hasCredits ? "default" : "destructive"} data-testid="badge-total-credits">
                {totalCredits} {totalCredits === 1 ? "credit" : "credits"}
              </Badge>
            )}
          </div>
          <CardDescription>
            Each generation costs 1 credit. You started with {credits?.totalFreeCreditsGranted ?? 10} free credits.
          </CardDescription>
        </CardHeader>
        {creditsLoading ? (
          <CardContent>
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        ) : creditsError ? (
          <CardContent>
            <div className="text-center py-4 space-y-3">
              <p className="text-sm text-destructive" data-testid="text-credits-error">
                Failed to load credit balance: {(creditsErrorData as any)?.message || "Network error"}
              </p>
              <Button onClick={() => refetchCredits()} variant="outline" size="sm" data-testid="button-retry-credits">
                Retry
              </Button>
            </div>
          </CardContent>
        ) : (
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Free Credits</p>
                <p className="text-2xl font-bold" data-testid="text-free-credits">{credits?.freeCreditsRemaining ?? 0}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Paid Credits</p>
                <p className="text-2xl font-bold" data-testid="text-paid-credits">{credits?.paidCreditsRemaining ?? 0}</p>
              </div>
            </div>
            {showBuyCredits && (
              <div className="mt-4">
                <Button className="w-full" variant="default" data-testid="button-buy-credits">
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  Buy More Credits - $0.50 each
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Credits never expire and can be used anytime
                </p>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Generation Form */}
      <Card data-testid="card-generator">
        <CardHeader>
          <CardTitle>Create AI Artwork</CardTitle>
          <CardDescription>
            Describe what you want to create. Be specific about style, colors, mood, and subject.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prompt">Artwork Description</Label>
            <Textarea
              id="prompt"
              placeholder="Example: A majestic lion in watercolor style with golden mane, vibrant blue background, artistic and dreamy atmosphere"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              disabled={generateMutation.isPending}
              data-testid="input-prompt"
            />
            <p className="text-xs text-muted-foreground">
              {prompt.length}/1000 characters
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="size">Image Size</Label>
            <Select value={size} onValueChange={(value) => setSize(value as typeof size)} disabled={generateMutation.isPending}>
              <SelectTrigger id="size" data-testid="select-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1024x1024">1024 × 1024 (Recommended)</SelectItem>
                <SelectItem value="512x512">512 × 512 (Faster)</SelectItem>
                <SelectItem value="256x256">256 × 256 (Preview)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generateMutation.isPending || !canGenerate || !prompt.trim()}
            className="w-full"
            data-testid="button-generate"
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating artwork...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate AI Artwork (1 credit)
              </>
            )}
          </Button>

          {creditsError ? (
            <p className="text-sm text-muted-foreground text-center">
              Credit balance unavailable. You can still try generating - your credits will be checked on the server.
            </p>
          ) : showBuyCredits && (
            <p className="text-sm text-destructive text-center">
              You need credits to generate AI artwork. Purchase credits above to continue.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Current Generation Result */}
      {currentGeneration && (
        <Card data-testid="card-current-generation">
          <CardHeader>
            <CardTitle>Latest Generation</CardTitle>
            <CardDescription>{currentGeneration.prompt}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg overflow-hidden bg-muted">
              <img
                src={currentGeneration.imageUrl}
                alt="Generated artwork"
                className="w-full h-auto"
                data-testid="img-generated"
              />
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" className="flex-1" data-testid="button-download">
                <a href={currentGeneration.imageUrl} download>
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </a>
              </Button>
              <Button variant="outline" className="flex-1" data-testid="button-use-as-artwork">
                <ImageIcon className="mr-2 h-4 w-4" />
                Upload as Artwork
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Tip: You can upload this AI-generated image as regular artwork for POD products
            </p>
          </CardContent>
        </Card>
      )}

      {/* Generation History */}
      <Card data-testid="card-history">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            <CardTitle>Generation History</CardTitle>
          </div>
          <CardDescription>
            Your recent AI artwork generations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : historyError ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-destructive" data-testid="text-history-error">
                Failed to load generation history: {(historyErrorData as any)?.message || "Network error"}
              </p>
              <Button onClick={() => refetchHistory()} variant="outline" size="sm" data-testid="button-retry-history">
                Retry
              </Button>
            </div>
          ) : !generations || generations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>No generations yet</p>
              <p className="text-sm">Start creating AI artwork above!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {generations.map((gen) => (
                <div key={gen.id} className="flex gap-4 items-start p-4 rounded-lg border" data-testid={`history-item-${gen.id}`}>
                  {gen.imageUrl ? (
                    <img
                      src={gen.imageUrl}
                      alt={gen.prompt}
                      className="w-20 h-20 rounded object-cover"
                      data-testid="img-history-thumbnail"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded bg-muted flex items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-2" data-testid="text-history-prompt">{gen.prompt}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <Badge variant={gen.status === "completed" ? "default" : gen.status === "failed" ? "destructive" : "secondary"} className="text-xs">
                        {gen.status}
                      </Badge>
                      <span>{gen.size}</span>
                      <span>{new Date(gen.createdAt).toLocaleDateString()}</span>
                    </div>
                    {gen.status === "failed" && gen.errorMessage && (
                      <p className="text-xs text-destructive mt-1">{gen.errorMessage}</p>
                    )}
                  </div>
                  {gen.imageUrl && (
                    <Button size="sm" variant="outline" asChild data-testid="button-download-history">
                      <a href={gen.imageUrl} download>
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
