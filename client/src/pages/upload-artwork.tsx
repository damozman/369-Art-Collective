import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArtworkUploadWizard, type WizardFormData } from "@/components/upload-wizard/ArtworkUploadWizard";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface ArtworkStats {
  totalArtworks: number;
  approvedArtworks: number;
  pendingArtworks: number;
}

const ARTWORK_UPLOAD_LIMIT = 20;

export default function UploadArtwork() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);

  // Fetch artwork stats
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<ArtworkStats>({
    queryKey: ["/api/artists/stats"],
    retry: 1,
  });

  // Redirect to login if not authenticated (check error message for "401")
  useEffect(() => {
    if (statsError && statsError.message && statsError.message.includes('401')) {
      setLocation("/artist/login");
    }
  }, [statsError, setLocation]);

  // Check if user has reached upload limit
  const artworkCount = stats?.totalArtworks ?? 0;
  const hasReachedLimit = artworkCount >= ARTWORK_UPLOAD_LIMIT;
  const canUpload = !hasReachedLimit;

  async function handleWizardSubmit(data: WizardFormData, uploadedImageUrl?: string, imageFile?: File) {
    setIsUploading(true);

    try {
      // Use pre-uploaded URL if available, otherwise upload the file
      let imageUrl = uploadedImageUrl;
      
      if (!imageUrl && imageFile) {
        // Fallback: Upload image if URL not provided
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

        const uploadData = await uploadResponse.json();
        imageUrl = uploadData.imageUrl;
      } else if (!imageUrl) {
        throw new Error("No image URL or file provided");
      }

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
        {statsLoading && (
          <Card>
            <CardContent className="py-12">
              <div className="flex justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Show upgrade prompt if user has reached limit */}
        {!statsLoading && hasReachedLimit && (
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
                    You've reached the maximum of {ARTWORK_UPLOAD_LIMIT} artworks. Archive
                    or remove an existing piece to make room for a new one.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Current artworks: <span className="font-semibold">{artworkCount} / {ARTWORK_UPLOAD_LIMIT}</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Show upload wizard if user can upload */}
        {!statsLoading && canUpload && (
          <>
            <div className="mb-4 p-4 rounded-lg border bg-muted/50">
              <p className="text-sm">
                {artworkCount} / {ARTWORK_UPLOAD_LIMIT} artworks uploaded.{" "}
                {ARTWORK_UPLOAD_LIMIT - artworkCount === 1 ? (
                  <span className="text-amber-600 dark:text-amber-500 font-semibold">Last upload remaining!</span>
                ) : (
                  <span className="text-muted-foreground">{ARTWORK_UPLOAD_LIMIT - artworkCount} uploads remaining.</span>
                )}
              </p>
            </div>
            <ArtworkUploadWizard onSubmit={handleWizardSubmit} isSubmitting={isUploading} />
          </>
        )}
      </main>
    </div>
  );
}
