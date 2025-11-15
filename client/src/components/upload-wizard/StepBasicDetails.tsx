import { UseFormReturn } from "react-hook-form";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { AIAssistButton } from "@/components/AIAssistButton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WizardFormData } from "./ArtworkUploadWizard";

interface StepBasicDetailsProps {
  form: UseFormReturn<WizardFormData>;
  originalImageUrl?: string | null;
}

export function StepBasicDetails({ form, originalImageUrl }: StepBasicDetailsProps) {
  const { toast } = useToast();
  const [showAITip, setShowAITip] = useState(false);

  useEffect(() => {
    const hasSeenTip = localStorage.getItem('hasSeenAIAssistTip');
    if (!hasSeenTip) {
      setShowAITip(true);
    }
  }, []);

  const dismissTip = () => {
    setShowAITip(false);
    localStorage.setItem('hasSeenAIAssistTip', 'true');
  };

  const generateContent = async (contentType: string) => {
    try {
      if (!originalImageUrl) {
        toast({
          title: "Image Required",
          description: "Please upload an image first before generating AI content.",
          variant: "destructive",
        });
        return;
      }

      const formValues = form.getValues();
      const response = await apiRequest('POST', '/api/ai/generate-content', {
        contentType,
        imageUrl: originalImageUrl,
        artworkTitle: formValues.title,
        existingDescription: formValues.description,
        tags: formValues.tags,
      });

      const data = await response.json();

      // Update the form field with generated content
      if (contentType === 'title') {
        form.setValue('title', data.content);
      } else if (contentType === 'description') {
        form.setValue('description', data.content);
      } else if (contentType === 'tags') {
        form.setValue('tags', data.content);
      }

      toast({
        title: "✨ Content generated!",
        description: `AI has created a ${contentType} for your artwork.`,
      });
    } catch (error: any) {
      const isAuthError = error.message?.includes('401') || error.message?.includes('Artist access required');
      toast({
        variant: "destructive",
        title: isAuthError ? "Login required" : "Generation failed",
        description: isAuthError 
          ? "Please log in as an artist to use AI content assistance."
          : error.message || "Failed to generate content. Please try again.",
      });
    }
  };

  return (
    <div className="space-y-4">
      {showAITip && (
        <Alert className="border-primary/50 bg-primary/5" data-testid="alert-ai-tip">
          <div className="flex items-start justify-between gap-3">
            <div className="flex gap-3">
              <Sparkles className="h-5 w-5 text-primary mt-0.5" />
              <div className="space-y-1">
                <AlertTitle className="text-base">AI Content Assistant Available!</AlertTitle>
                <AlertDescription className="text-sm">
                  Look for the <Sparkles className="h-3 w-3 inline mx-1 text-primary" /> sparkle icons next to each field. 
                  Click them to automatically generate compelling titles, descriptions, and tags using AI - even when fields are empty! 
                  The AI analyzes your artwork to create professional, SEO-optimized content.
                </AlertDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={dismissTip}
              className="h-6 w-6 shrink-0"
              data-testid="button-dismiss-ai-tip"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Alert>
      )}

      <FormField
        control={form.control}
        name="title"
        render={({ field }) => (
          <FormItem>
            <div className="flex items-center justify-between">
              <FormLabel>Artwork Title</FormLabel>
              <AIAssistButton
                onGenerate={() => generateContent('title')}
                tooltip="Generate a compelling title with AI"
              />
            </div>
            <FormControl>
              <Input
                {...field}
                placeholder="Enter a descriptive title for your artwork"
                data-testid="input-title"
              />
            </FormControl>
            <FormDescription>
              This title will be displayed on product pages
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <div className="flex items-center justify-between">
              <FormLabel>Description (Optional)</FormLabel>
              <AIAssistButton
                onGenerate={() => generateContent('description')}
                tooltip="Generate a compelling description with AI"
              />
            </div>
            <FormControl>
              <Textarea
                {...field}
                placeholder="Describe your artwork..."
                className="min-h-24"
                data-testid="input-description"
              />
            </FormControl>
            <FormDescription>
              Tell customers about the inspiration, medium, or story behind this piece
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="tags"
        render={({ field }) => (
          <FormItem>
            <div className="flex items-center justify-between">
              <FormLabel>Tags (Optional)</FormLabel>
              <AIAssistButton
                onGenerate={() => generateContent('tags')}
                tooltip="Generate relevant tags with AI"
              />
            </div>
            <FormControl>
              <Input
                {...field}
                placeholder="abstract, digital, colorful"
                data-testid="input-tags"
              />
            </FormControl>
            <FormDescription>
              Separate tags with commas to help categorize your work
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
