import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Lock, Crown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArtworkUploadWizard, type WizardFormData } from "@/components/upload-wizard/ArtworkUploadWizard";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface SubscriptionData {
  tier: "free" | "pro" | "elite";
  status: "active" | "canceled" | "past_due";
  currentPeriodEnd: string | null;
}

interface ArtworkStats {
  totalArtworks: number;
  approvedArtworks: number;
  pendingArtworks: number;
}

const FREE_TIER_LIMIT = 20;

export default function UploadArtwork() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);

  // Fetch subscription data
  const { data: subscription, isLoading: subscriptionLoading, error: subscriptionError } = useQuery<SubscriptionData>({
    queryKey: ["/api/artists/subscription"],
    retry: 1,
  });

  // Fetch artwork stats
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<ArtworkStats>({
    queryKey: ["/api/artists/stats"],
    retry: 1,
  });

  // Redirect to login if not authenticated (check error message for "401")
  useEffect(() => {
    if (subscriptionError || statsError) {
      const error = subscriptionError || statsError;
      if (error && error.message && error.message.includes('401')) {
        setLocation("/artist/login");
      }
    }
  }, [subscriptionError, statsError, setLocation]);

  // Check if user has reached upload limit
  const isFree = subscription?.tier === "free";
  const isPro = subscription?.tier === "pro";
  const isElite = subscription?.tier === "elite";
  const artworkCount = stats?.totalArtworks ?? 0;
  const hasReachedLimit = isFree && artworkCount >= FREE_TIER_LIMIT;
  const canUpload = !hasReachedLimit;

  async function handleWizardSubmit(data: WizardFormData, imageFile: File) {
    setIsUploading(true);

    try {
      // Upload image first
      const formData = new FormData();
      formData.append("file", imageFile);

      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.error || "File upload failed");
      }

      const { imageUrl } = await uploadResponse.json();

      // Parse tags from comma-separated string
      const tags = data.tags
        ? data.tags.split(",").map(t => t.trim()).filter(Boolean)
        : [];

      // Create artwork with all fields
      await apiRequest("POST", "/api/artworks", {
        title: data.title,
        description: data.description,
        tags,
        imageUrl,
        ipDeclarationAccepted: data.ipDeclarationAccepted,
        artworkStory: data.artworkStory,
        styleTags: data.styleTags || [],
        suggestedUse: data.suggestedUse,
      });

      // Invalidate cache and navigate
      queryClient.invalidateQueries({ queryKey: ["/api/artworks/my-artworks"] });
      
      toast({
        title: "Artwork uploaded!",
        description: "Your submission is now pending admin review.",
      });
      
      setLocation("/artist/dashboard");
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setLocation("/artist/dashboard")} 
                data-testid="button-back"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold font-serif">Upload Artwork</h1>
                <p className="text-sm text-muted-foreground">Submit your artwork for review</p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Show loading state while checking limits */}
        {(subscriptionLoading || statsLoading) && (
          <Card>
            <CardContent className="py-12">
              <div className="flex justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Show upgrade prompt if user has reached limit */}
        {!subscriptionLoading && !statsLoading && hasReachedLimit && (
          <Card data-testid="card-upload-limit-reached">
            <CardContent className="py-12">
              <div className="max-w-md mx-auto text-center space-y-6">
                <div className="flex justify-center">
                  <div className="rounded-full bg-primary/10 p-4">
                    <Lock className="h-12 w-12 text-primary" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold" data-testid="text-limit-title">
                    Upload Limit Reached
                  </h2>
                  <p className="text-muted-foreground" data-testid="text-limit-description">
                    You've reached the maximum of {FREE_TIER_LIMIT} artworks for the Free tier. Upgrade to Pro or Elite for unlimited uploads.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Current artworks: <span className="font-semibold">{artworkCount} / {FREE_TIER_LIMIT}</span>
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
                        <li>• Unlimited artwork uploads</li>
                        <li>• 35% minimum royalty</li>
                        <li>• AI Art Studio access</li>
                      </ul>
                    </div>

                    <div className="text-left space-y-1 p-4 rounded-lg border border-primary">
                      <div className="flex items-center gap-2 text-primary">
                        <Crown className="h-4 w-4" />
                        <p className="font-semibold">Elite Tier</p>
                      </div>
                      <p className="text-2xl font-bold">$40<span className="text-sm text-muted-foreground">/mo</span></p>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        <li>• Unlimited artwork uploads</li>
                        <li>• 45% guaranteed royalty</li>
                        <li>• Full AI tools & customization</li>
                      </ul>
                    </div>
                  </div>

                  <Button
                    onClick={() => setLocation("/artist/settings")}
                    size="lg"
                    className="w-full"
                    data-testid="button-upgrade-for-unlimited"
                  >
                    <Crown className="mr-2 h-5 w-5" />
                    Upgrade for Unlimited Uploads
                  </Button>
                  
                  <p className="text-xs text-muted-foreground">
                    You can upgrade or downgrade your subscription at any time
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Show upload wizard if user can upload */}
        {!subscriptionLoading && !statsLoading && canUpload && (
          <>
            {/* Show upload count for free tier users */}
            {isFree && (
              <div className="mb-4 p-4 rounded-lg border bg-muted/50">
                <p className="text-sm">
                  <span className="font-semibold">Free Tier:</span> {artworkCount} / {FREE_TIER_LIMIT} artworks uploaded.{" "}
                  {FREE_TIER_LIMIT - artworkCount === 1 ? (
                    <span className="text-amber-600 dark:text-amber-500 font-semibold">Last upload remaining!</span>
                  ) : FREE_TIER_LIMIT - artworkCount <= 5 ? (
                    <span className="text-muted-foreground">{FREE_TIER_LIMIT - artworkCount} uploads remaining.</span>
                  ) : (
                    <span className="text-muted-foreground">{FREE_TIER_LIMIT - artworkCount} uploads remaining.</span>
                  )}
                </p>
              </div>
            )}
            <ArtworkUploadWizard onSubmit={handleWizardSubmit} isSubmitting={isUploading} />
          </>
        )}
      </main>
    </div>
  );
}
