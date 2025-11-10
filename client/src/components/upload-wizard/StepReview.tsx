import { UseFormReturn } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, ImageIcon, FileText, Palette, ShieldCheck } from "lucide-react";
import type { WizardFormData } from "./ArtworkUploadWizard";

interface StepReviewProps {
  form: UseFormReturn<WizardFormData>;
  selectedFile: File | null;
  previewUrl: string | null;
}

export function StepReview({ form, selectedFile, previewUrl }: StepReviewProps) {
  const data = form.getValues();

  return (
    <div className="space-y-4">
      <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
        <div className="flex items-center gap-2">
          <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
          <h4 className="text-sm font-semibold text-green-900 dark:text-green-100">
            Ready to Submit
          </h4>
        </div>
        <p className="text-xs text-green-800 dark:text-green-200 mt-2">
          Review your artwork details below. Once submitted, your artwork will be reviewed by our admin team.
        </p>
      </div>

      <div className="grid gap-4">
        {previewUrl && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ImageIcon className="w-4 h-4" />
                Artwork Image
              </CardTitle>
            </CardHeader>
            <CardContent>
              <img
                src={previewUrl}
                alt="Artwork preview"
                className="w-full h-auto max-h-64 object-contain rounded-lg"
                data-testid="img-review-preview"
              />
              {selectedFile && (
                <div className="mt-3 text-sm text-muted-foreground">
                  <p><strong>File:</strong> {selectedFile.name}</p>
                  <p><strong>Size:</strong> {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4" />
              Basic Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <p className="font-medium">Title</p>
              <p className="text-muted-foreground" data-testid="text-review-title">{data.title || "(Not provided)"}</p>
            </div>
            {data.description && (
              <div>
                <p className="font-medium">Description</p>
                <p className="text-muted-foreground" data-testid="text-review-description">{data.description}</p>
              </div>
            )}
            {data.tags && (
              <div>
                <p className="font-medium">Tags</p>
                <p className="text-muted-foreground" data-testid="text-review-tags">{data.tags}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Palette className="w-4 h-4" />
              Marketing Content
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.artworkStory && (
              <div>
                <p className="font-medium">Artwork Story</p>
                <p className="text-muted-foreground" data-testid="text-review-story">{data.artworkStory}</p>
              </div>
            )}
            {data.styleTags && data.styleTags.length > 0 && (
              <div>
                <p className="font-medium mb-2">Style Tags</p>
                <div className="flex flex-wrap gap-2" data-testid="container-review-styles">
                  {data.styleTags.map(tag => (
                    <Badge key={tag} variant="secondary">{tag}</Badge>
                  ))}
                </div>
              </div>
            )}
            {data.suggestedUse && (
              <div>
                <p className="font-medium">Suggested Use</p>
                <p className="text-muted-foreground" data-testid="text-review-use">{data.suggestedUse}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="w-4 h-4" />
              IP Declaration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {data.ipDeclarationAccepted ? (
                <>
                  <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <p className="text-sm text-muted-foreground">
                    IP rights declaration accepted
                  </p>
                </>
              ) : (
                <p className="text-sm text-destructive">
                  IP declaration not accepted (required)
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
