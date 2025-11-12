import { UseFormReturn } from "react-hook-form";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { AIAssistButton } from "@/components/AIAssistButton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { X } from "lucide-react";
import type { WizardFormData } from "./ArtworkUploadWizard";

interface StepMarketingContentProps {
  form: UseFormReturn<WizardFormData>;
}

const PREDEFINED_STYLES = [
  "Modern",
  "Abstract",
  "Minimalist",
  "Vintage",
  "Bohemian",
  "Geometric",
  "Floral",
  "Nature",
  "Urban",
  "Tropical",
  "Monochrome",
  "Colorful",
];

export function StepMarketingContent({ form }: StepMarketingContentProps) {
  const { toast } = useToast();
  const selectedStyles = form.watch("styleTags") || [];

  const toggleStyle = (style: string) => {
    const current = form.getValues("styleTags") || [];
    if (current.includes(style)) {
      form.setValue("styleTags", current.filter(s => s !== style));
    } else {
      form.setValue("styleTags", [...current, style]);
    }
  };

  const generateContent = async (contentType: string) => {
    try {
      const formValues = form.getValues();
      const response = await apiRequest('POST', '/api/ai/generate-content', {
        contentType,
        artworkTitle: formValues.title,
        existingDescription: formValues.description,
        style: formValues.styleTags?.join(', '),
      });

      const data = await response.json();

      // Update the form field with generated content
      if (contentType === 'artworkStory') {
        form.setValue('artworkStory', data.content);
      } else if (contentType === 'suggestedUse') {
        form.setValue('suggestedUse', data.content);
      }

      toast({
        title: "✨ Content generated!",
        description: `AI has created ${contentType === 'artworkStory' ? 'a story' : 'suggested uses'} for your artwork.`,
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
    <div className="space-y-6">
      <FormField
        control={form.control}
        name="artworkStory"
        render={({ field }) => (
          <FormItem>
            <div className="flex items-center justify-between">
              <FormLabel>Artwork Story (Optional)</FormLabel>
              <AIAssistButton
                onGenerate={() => generateContent('artworkStory')}
                tooltip="Generate an engaging story with AI"
              />
            </div>
            <FormControl>
              <Textarea
                {...field}
                placeholder="Share the story behind your creation - what inspired you, your creative process, or the meaning behind the artwork..."
                className="min-h-32"
                data-testid="input-artwork-story"
              />
            </FormControl>
            <FormDescription>
              This story will appear on product pages to help customers connect with your art
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="styleTags"
        render={() => (
          <FormItem>
            <FormLabel>Style Tags (Optional)</FormLabel>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {PREDEFINED_STYLES.map(style => (
                  <Badge
                    key={style}
                    variant={selectedStyles.includes(style) ? "default" : "outline"}
                    className="cursor-pointer hover-elevate active-elevate-2"
                    onClick={() => toggleStyle(style)}
                    data-testid={`badge-style-${style.toLowerCase()}`}
                  >
                    {style}
                    {selectedStyles.includes(style) && (
                      <X className="ml-1 h-3 w-3" />
                    )}
                  </Badge>
                ))}
              </div>
              {selectedStyles.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Selected: {selectedStyles.join(", ")}
                </p>
              )}
            </div>
            <FormDescription>
              Select styles that best describe your artwork for better discoverability
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="suggestedUse"
        render={({ field }) => (
          <FormItem>
            <div className="flex items-center justify-between">
              <FormLabel>Suggested Use (Optional)</FormLabel>
              <AIAssistButton
                onGenerate={() => generateContent('suggestedUse')}
                tooltip="Generate suggested placements with AI"
              />
            </div>
            <FormControl>
              <Textarea
                {...field}
                placeholder="Where does this artwork shine? Examples: living room, bedroom, office, nursery, meditation space..."
                className="min-h-24"
                data-testid="input-suggested-use"
              />
            </FormControl>
            <FormDescription>
              Help customers envision where this art would fit in their space
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="p-3 bg-muted rounded-lg">
        <p className="text-xs text-muted-foreground">
          <strong>SEO Optimization:</strong> A URL-friendly slug will be automatically generated from your 
          artwork title for better search engine visibility.
        </p>
      </div>
    </div>
  );
}
