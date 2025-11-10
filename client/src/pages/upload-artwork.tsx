import { useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ArtworkUploadWizard, type WizardFormData } from "@/components/upload-wizard/ArtworkUploadWizard";
import { queryClient, apiRequest } from "@/lib/queryClient";

export default function UploadArtwork() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);

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
        <ArtworkUploadWizard onSubmit={handleWizardSubmit} isSubmitting={isUploading} />
      </main>
    </div>
  );
}
