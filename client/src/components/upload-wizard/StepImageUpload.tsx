import { useState, useEffect } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { UpscaleWidget } from "./UpscaleWidget";

interface StepImageUploadProps {
  selectedFile: File | null;
  previewUrl: string | null;
  onFileChange: (file: File | null) => void;
  onValidationChange?: (status: "pending" | "invalid" | "valid") => void;
}

export function StepImageUpload({ selectedFile, previewUrl, onFileChange, onValidationChange }: StepImageUploadProps) {
  const { toast } = useToast();
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState<string | null>(previewUrl);

  useEffect(() => {
    setCurrentPreviewUrl(previewUrl);
  }, [previewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid file type",
          description: "Please select an image file (PNG or JPG)",
          variant: "destructive",
        });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Maximum file size is 10MB",
          variant: "destructive",
        });
        return;
      }
      onFileChange(file);
    }
  };

  const handleUpscaledFile = (upscaledFile: File, upscaledUrl: string) => {
    setCurrentPreviewUrl(upscaledUrl);
    onFileChange(upscaledFile);
  };

  const clearFile = () => {
    setCurrentPreviewUrl(null);
    onFileChange(null);
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
        <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">Print Quality Standards</h4>
        <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
          <li>• Minimum quality: <strong>150 DPI</strong> for 8×10 inch prints</li>
          <li>• Target quality: <strong>300 DPI</strong> for professional results</li>
          <li>• Supported formats: <strong>PNG, JPG</strong> only</li>
          <li>• Maximum file size: 10MB</li>
        </ul>
        <p className="text-xs text-blue-700 dark:text-blue-300 mt-2 italic">
          Images below 150 DPI will be rejected. Use our AI upscaler to boost quality if needed!
        </p>
      </div>

      {!selectedFile ? (
        <label
          htmlFor="wizard-file-upload"
          className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer hover-elevate bg-muted/30"
          data-testid="label-file-upload"
        >
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <Upload className="w-12 h-12 mb-4 text-muted-foreground" />
            <p className="mb-2 text-sm font-medium">
              Click to upload or drag and drop
            </p>
            <p className="text-xs text-muted-foreground">
              High-resolution PNG or JPG (150+ DPI for prints)
            </p>
          </div>
          <input
            id="wizard-file-upload"
            type="file"
            className="sr-only"
            accept="image/*"
            onChange={handleFileChange}
            data-testid="input-file"
          />
        </label>
      ) : (
        <div className="space-y-4">
          {currentPreviewUrl && (
            <div className="relative">
              <img
                src={currentPreviewUrl}
                alt="Preview"
                className="w-full h-auto max-h-96 object-contain rounded-lg"
                data-testid="img-preview"
              />
              <div className="absolute top-2 right-2 flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  onClick={clearFile}
                  data-testid="button-clear-file"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          
          {selectedFile && (
            <div className="text-sm text-muted-foreground">
              <p><strong>File:</strong> {selectedFile.name}</p>
              <p><strong>Size:</strong> {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          )}
          
          <UpscaleWidget 
            selectedFile={selectedFile}
            onUpscaledFile={handleUpscaledFile}
            onValidationChange={onValidationChange}
          />
        </div>
      )}
    </div>
  );
}
