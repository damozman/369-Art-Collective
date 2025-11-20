import { useState, useEffect } from "react";
import { Upload, X, Info, Lightbulb, Sparkles, Target, Check, AlertTriangle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { UpscaleWidget } from "./UpscaleWidget";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface StepImageUploadProps {
  selectedFile: File | null;
  previewUrl: string | null;
  onFileChange: (file: File | null) => void;
  onValidationChange?: (status: "pending" | "invalid" | "valid") => void;
  onOriginalImageUrl?: (url: string | null) => void;
  onUpscaledImageUrl?: (url: string | null) => void;
  onCroppedFile?: (file: File) => void;
}

export function StepImageUpload({ selectedFile, previewUrl, onFileChange, onValidationChange, onOriginalImageUrl, onUpscaledImageUrl, onCroppedFile }: StepImageUploadProps) {
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
      if (file.size > 50 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Maximum file size is 50MB",
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
    onUpscaledImageUrl?.(upscaledUrl);
  };

  const clearFile = () => {
    setCurrentPreviewUrl(null);
    onFileChange(null);
    onOriginalImageUrl?.(null);
    onUpscaledImageUrl?.(null);
  };

  return (
    <div className="space-y-4">
      {/* Portrait vs Landscape - Critical Decision */}
      <div className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 border-2 border-purple-300 dark:border-purple-700 rounded-lg">
        <div className="flex items-start gap-3">
          <Target className="w-6 h-6 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-purple-900 dark:text-purple-100 mb-2">
              Portrait Orientation = More Products!
            </h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2 bg-green-100 dark:bg-green-950/50 rounded border border-green-400 dark:border-green-600">
                <p className="font-bold text-green-900 dark:text-green-100 mb-1 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Portrait (Tall)
                </p>
                <p className="text-green-800 dark:text-green-200">Qualifies for <strong>all 12 product sizes</strong></p>
                <p className="text-green-700 dark:text-green-300 mt-1">8×10, 12×16, 16×20, 18×24, 24×36</p>
              </div>
              <div className="p-2 bg-amber-100 dark:bg-amber-950/50 rounded border border-amber-400 dark:border-amber-600">
                <p className="font-bold text-amber-900 dark:text-amber-100 mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Landscape (Wide)
                </p>
                <p className="text-amber-800 dark:text-amber-200">Qualifies for <strong>only ~4 sizes</strong></p>
                <p className="text-amber-700 dark:text-amber-300 mt-1">Limits your sales potential</p>
              </div>
            </div>
            <div className="flex items-start gap-1 text-xs text-purple-700 dark:text-purple-300 mt-2 italic">
              <Lightbulb className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <p>Tip: Create your artwork in portrait orientation (taller than wide) for maximum product options!</p>
            </div>
          </div>
        </div>
      </div>

      {/* Collapsible Detailed Guidance */}
      <Accordion type="single" collapsible className="border rounded-lg">
        {/* AI Art Creation Guide */}
        <AccordionItem value="ai-guide" className="border-0">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover-elevate">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>Creating AI Art? Portrait Prompt Examples (Click to Expand)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4 text-xs">
              {/* DALL-E 3 Prompts */}
              <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
                <p className="font-bold text-purple-900 dark:text-purple-100 mb-2">
                  DALL-E 3 (ChatGPT, Bing) - Request Portrait Format
                </p>
                <div className="space-y-2">
                  <div className="bg-white/50 dark:bg-black/20 p-2 rounded">
                    <code className="block text-purple-900 dark:text-purple-100 font-mono">
                      "A mystical forest with glowing mushrooms and ethereal lighting, portrait orientation, highly detailed"
                    </code>
                    <p className="text-purple-700 dark:text-purple-300 mt-1 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Outputs 1024×1792 (portrait) - perfect for all 12 products!
                    </p>
                  </div>
                  <div className="bg-white/50 dark:bg-black/20 p-2 rounded">
                    <code className="block text-purple-900 dark:text-purple-100 font-mono">
                      "Cosmic nebula with vibrant purples and blues, portrait format, 8k quality"
                    </code>
                  </div>
                </div>
              </div>

              {/* Midjourney Prompts */}
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="font-bold text-blue-900 dark:text-blue-100 mb-2">
                  Midjourney - Add <code className="bg-blue-200 dark:bg-blue-900 px-1 rounded">--ar 3:4</code> for Portrait
                </p>
                <div className="space-y-2">
                  <div className="bg-white/50 dark:bg-black/20 p-2 rounded">
                    <code className="block text-blue-900 dark:text-blue-100 font-mono">
                      ethereal mountain sunset, vibrant colors, detailed --ar 3:4
                    </code>
                    <p className="text-blue-700 dark:text-blue-300 mt-1 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Creates portrait orientation (3:4 aspect ratio)
                    </p>
                  </div>
                  <div className="bg-white/50 dark:bg-black/20 p-2 rounded">
                    <code className="block text-blue-900 dark:text-blue-100 font-mono">
                      abstract geometric art, bold colors, modern --ar 3:4
                    </code>
                  </div>
                </div>
              </div>

              {/* Other Platforms */}
              <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                <p className="font-bold text-green-900 dark:text-green-100 mb-2">
                  Stable Diffusion / Leonardo.ai / Other Platforms
                </p>
                <p className="text-green-800 dark:text-green-200">
                  Look for <strong>"aspect ratio"</strong> or <strong>"dimension"</strong> settings and select portrait or 3:4 ratio. 
                  Target 1080×1440 or larger for best results.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* DPI Requirements Explained */}
        <AccordionItem value="dpi-guide" className="border-0 border-t">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover-elevate">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Lightbulb className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Understanding DPI & Print Quality (Click to Expand)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                <h5 className="font-bold text-blue-900 dark:text-blue-100 mb-2">What is DPI?</h5>
                <p className="text-blue-800 dark:text-blue-200 mb-2">
                  DPI (Dots Per Inch) measures print quality. Higher DPI = sharper, more detailed prints.
                </p>
                <ul className="space-y-1 text-blue-800 dark:text-blue-200">
                  <li>• <strong>150 DPI:</strong> Minimum acceptable quality (viewable from 3+ feet)</li>
                  <li>• <strong>300 DPI:</strong> Professional quality (viewable up close)</li>
                </ul>
              </div>

              <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
                <h5 className="font-bold text-green-900 dark:text-green-100 mb-2">Example Calculations:</h5>
                <div className="space-y-2 text-green-800 dark:text-green-200">
                  <div className="p-2 bg-white/50 dark:bg-black/20 rounded">
                    <p className="font-semibold">24×36 inch print at 150 DPI:</p>
                    <p className="mt-1">Needs: 3600×5400 pixels (19.44M pixels)</p>
                  </div>
                  <div className="p-2 bg-white/50 dark:bg-black/20 rounded">
                    <p className="font-semibold">24×36 inch print at 300 DPI:</p>
                    <p className="mt-1">Needs: 7200×10800 pixels (77.76M pixels)</p>
                  </div>
                </div>
                <div className="flex items-start gap-1 text-green-700 dark:text-green-300 mt-2 italic">
                  <Zap className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  <p>Our AI upscaler can boost your image quality to meet these requirements!</p>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Basic Print Quality Standards */}
      <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
        <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">Print Quality Standards</h4>
        <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
          <li>• Minimum quality: <strong>150 DPI</strong> for 8×10 inch prints</li>
          <li>• Target quality: <strong>300 DPI</strong> for professional results</li>
          <li>• Supported formats: <strong>PNG, JPG</strong> only</li>
          <li>• Maximum file size: 50MB</li>
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
            onOriginalImageUrl={onOriginalImageUrl}
            onUpscaledImageUrl={onUpscaledImageUrl}
            onCroppedFile={onCroppedFile}
          />
        </div>
      )}
    </div>
  );
}
