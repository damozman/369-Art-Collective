import { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import type { WizardFormData } from "./ArtworkUploadWizard";

interface StepBasicDetailsProps {
  form: UseFormReturn<WizardFormData>;
}

export function StepBasicDetails({ form }: StepBasicDetailsProps) {
  return (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="title"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Artwork Title</FormLabel>
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
            <FormLabel>Description (Optional)</FormLabel>
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
            <FormLabel>Tags (Optional)</FormLabel>
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
