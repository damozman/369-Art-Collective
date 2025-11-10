import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChevronRight, ChevronLeft, Check } from "lucide-react";
import { StepImageUpload } from "./StepImageUpload";
import { StepBasicDetails } from "./StepBasicDetails";
import { StepMarketingContent } from "./StepMarketingContent";
import { StepIPDeclaration } from "./StepIPDeclaration";
import { StepReview } from "./StepReview";

const wizardSchema = z.object({
  // Step 1 & 2: Basic info
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  tags: z.string().optional(),
  
  // Step 3: Marketing content
  artworkStory: z.string().optional(),
  styleTags: z.array(z.string()).optional(),
  suggestedUse: z.string().optional(),
  
  // Step 4: IP Declaration
  ipDeclarationAccepted: z.boolean().refine((val) => val === true, {
    message: "You must confirm you have rights to this artwork",
  }),
});

export type WizardFormData = z.infer<typeof wizardSchema>;

interface Step {
  id: number;
  title: string;
  description: string;
}

const STEPS: Step[] = [
  { id: 1, title: "Upload Image", description: "Select your artwork file" },
  { id: 2, title: "Basic Details", description: "Title and description" },
  { id: 3, title: "Marketing Content", description: "Story and style" },
  { id: 4, title: "IP Declaration", description: "Confirm ownership" },
  { id: 5, title: "Review", description: "Verify and submit" },
];

interface ArtworkUploadWizardProps {
  onSubmit: (data: WizardFormData, imageFile: File) => Promise<void>;
  isSubmitting: boolean;
}

export function ArtworkUploadWizard({ onSubmit, isSubmitting }: ArtworkUploadWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const form = useForm<WizardFormData>({
    resolver: zodResolver(wizardSchema),
    defaultValues: {
      title: "",
      description: "",
      tags: "",
      artworkStory: "",
      styleTags: [],
      suggestedUse: "",
      ipDeclarationAccepted: false,
    },
  });

  const progress = (currentStep / STEPS.length) * 100;

  const handleNext = async () => {
    let isValid = true;

    // Validate current step fields
    if (currentStep === 1) {
      if (!selectedFile) {
        return; // Can't proceed without file
      }
    } else if (currentStep === 2) {
      isValid = await form.trigger(["title", "description", "tags"]);
    } else if (currentStep === 3) {
      isValid = await form.trigger(["artworkStory", "styleTags", "suggestedUse"]);
    } else if (currentStep === 4) {
      isValid = await form.trigger(["ipDeclarationAccepted"]);
    }

    if (isValid && currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleFileChange = (file: File | null) => {
    setSelectedFile(file);
    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
  };

  const handleFormSubmit = async (data: WizardFormData) => {
    if (!selectedFile) return;
    await onSubmit(data, selectedFile);
  };

  return (
    <div className="space-y-6">
      {/* Progress Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Step {currentStep} of {STEPS.length}</span>
              <span className="text-muted-foreground">{Math.round(progress)}% Complete</span>
            </div>
            <Progress value={progress} className="h-2" data-testid="progress-wizard" />
            <div className="flex justify-between">
              {STEPS.map((step) => (
                <div
                  key={step.id}
                  className={`flex-1 text-center ${
                    step.id === currentStep
                      ? "text-primary font-semibold"
                      : step.id < currentStep
                      ? "text-muted-foreground"
                      : "text-muted-foreground/50"
                  }`}
                >
                  <div className="flex items-center justify-center mb-1">
                    {step.id < currentStep ? (
                      <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-4 h-4 text-primary-foreground" />
                      </div>
                    ) : (
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          step.id === currentStep
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {step.id}
                      </div>
                    )}
                  </div>
                  <p className="text-xs hidden sm:block">{step.title}</p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>{STEPS[currentStep - 1].title}</CardTitle>
          <CardDescription>{STEPS[currentStep - 1].description}</CardDescription>
        </CardHeader>
        <CardContent>
          {currentStep === 1 && (
            <StepImageUpload
              selectedFile={selectedFile}
              previewUrl={previewUrl}
              onFileChange={handleFileChange}
            />
          )}
          {currentStep === 2 && <StepBasicDetails form={form} />}
          {currentStep === 3 && <StepMarketingContent form={form} />}
          {currentStep === 4 && <StepIPDeclaration form={form} />}
          {currentStep === 5 && (
            <StepReview
              form={form}
              selectedFile={selectedFile}
              previewUrl={previewUrl}
            />
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={handleBack}
          disabled={currentStep === 1 || isSubmitting}
          data-testid="button-back"
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        {currentStep < STEPS.length ? (
          <Button
            type="button"
            onClick={handleNext}
            disabled={currentStep === 1 && !selectedFile}
            data-testid="button-next"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={form.handleSubmit(handleFormSubmit)}
            disabled={isSubmitting || !selectedFile}
            data-testid="button-submit"
          >
            {isSubmitting ? "Uploading..." : "Submit Artwork"}
          </Button>
        )}
      </div>
    </div>
  );
}
