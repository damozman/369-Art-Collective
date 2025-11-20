import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Zap, Sparkles, Loader2, CheckCircle, AlertCircle, Crop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ImageCropDialog } from "./ImageCropDialog";

interface UpscaleWidgetProps {
  selectedFile: File | null;
  onUpscaledFile: (file: File, upscaledUrl: string) => void;
  onValidationChange?: (status: "pending" | "invalid" | "valid") => void;
  onOriginalImageUrl?: (url: string | null) => void;
  onUpscaledImageUrl?: (url: string | null) => void;
  onCroppedFile?: (file: File) => void;
}

interface ProductVariantQualification{
  variantKey: string;
  productName: string;
  widthInches: number;
  heightInches: number;
  qualified: boolean;
  requiredPixels: { width: number; height: number };
}

interface DpiAnalysis {
  width: number;
  height: number;
  estimatedDpi: number;
  targetDpi: number;
  meetsMinimum: boolean;
  meetsTarget: boolean;
  needsUpscale: boolean;
  recommendedScale: number;
  message: string;
  variantQualification?: {
    qualified: ProductVariantQualification[];
    locked: ProductVariantQualification[];
    totalQualified: number;
    totalVariants: number;
  };
  orientation?: 'portrait' | 'landscape' | 'square';
  qualityLevel?: 'excellent' | 'good' | 'needs-boost' | 'rejected';
  customerGuidance?: string;
}

interface QuotaStatus {
  hasQuota: boolean;
  quotaType: 'registration_bonus' | 'monthly' | 'elite_unlimited';
  remaining: number;
  total: number;
  tier: string;
  message: string;
}

export function UpscaleWidget({ selectedFile, onUpscaledFile, onValidationChange, onOriginalImageUrl, onUpscaledImageUrl, onCroppedFile }: UpscaleWidgetProps) {
  const { toast } = useToast();
  const [analysis, setAnalysis] = useState<DpiAnalysis | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isCropDialogOpen, setIsCropDialogOpen] = useState(false);
  
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCompletedRef = useRef(false);
  const uploadStartTimeRef = useRef<number>(0);
  const currentFileTokenRef = useRef<string | null>(null);

  const { data: quota } = useQuery<QuotaStatus>({
    queryKey: ['/api/upscale/quota'],
    enabled: !!selectedFile,
  });

  useEffect(() => {
    if (selectedFile) {
      // Generate unique token for this file to prevent race conditions
      const fileToken = `${selectedFile.name}-${selectedFile.size}-${selectedFile.lastModified}`;
      currentFileTokenRef.current = fileToken;
      
      onValidationChange?.("pending");
      setAnalysis(null); // Clear stale analysis from previous file
      setUploadError(null); // Clear previous errors
      uploadAndAnalyzeImage(fileToken);
    } else {
      cleanup();
      setAnalysis(null);
      setJobId(null);
      setProgress(0);
      setImageUrl(null);
      setUploadError(null);
      onOriginalImageUrl?.(null);
      onUpscaledImageUrl?.(null);
      currentFileTokenRef.current = null;
      onValidationChange?.("invalid");
    }
    
    return () => cleanup();
  }, [selectedFile]);

  const cleanup = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const uploadAndAnalyzeImage = async (fileToken: string) => {
    if (!selectedFile) return;

    uploadStartTimeRef.current = Date.now();
    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('image', selectedFile);

      const uploadResponse = await fetch('/api/upload/design', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!uploadResponse.ok) {
        // Extract actual error message from backend response
        const errorData = await uploadResponse.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.message || 'Failed to upload image';
        throw new Error(errorMessage);
      }

      const uploadData = await uploadResponse.json();
      const uploadedUrl = uploadData.url;
      
      // Only update if this is still the current file
      if (currentFileTokenRef.current !== fileToken) return;
      setImageUrl(uploadedUrl);
      onOriginalImageUrl?.(uploadedUrl);

      const img = new Image();
      img.onload = async () => {
        try {
          const analyzeResponse = await apiRequest('POST', '/api/upscale/analyze', {
            imageUrl: uploadedUrl,
            width: img.width,
            height: img.height,
          });
          const analyzeData = await analyzeResponse.json();

          // Only process results if this is still the current file
          if (currentFileTokenRef.current !== fileToken) return;

          const analysisResult = {
            width: img.width,
            height: img.height,
            estimatedDpi: analyzeData.current.estimatedDpi,
            targetDpi: analyzeData.current.targetDpi,
            meetsMinimum: analyzeData.current.meetsMinimum,
            meetsTarget: analyzeData.current.meetsTarget,
            needsUpscale: analyzeData.shouldRecommend,
            recommendedScale: analyzeData.recommendedScale,
            message: analyzeData.current.message,
            variantQualification: analyzeData.current.variantQualification,
            orientation: analyzeData.current.orientation,
            qualityLevel: analyzeData.current.qualityLevel,
            customerGuidance: analyzeData.current.customerGuidance,
          };
          setAnalysis(analysisResult);
          
          // Report validation status only for current file
          // Images that need upscaling are still "valid" - they can be improved
          // Only truly reject images that can't be fixed
          if (analysisResult.meetsMinimum || analysisResult.needsUpscale) {
            onValidationChange?.("valid");
          } else {
            onValidationChange?.("invalid");
          }
        } catch (error) {
          console.error('Failed to analyze image:', error);
          // Only report error if this is still the current file
          if (currentFileTokenRef.current === fileToken) {
            onValidationChange?.("invalid");
          }
        } finally {
          // Ensure minimum loading state display time of 250ms for visual consistency
          const MIN_LOADING_TIME = 250;
          const elapsedTime = Date.now() - uploadStartTimeRef.current;
          const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsedTime);
          
          timeoutRef.current = setTimeout(() => {
            setIsUploading(false);
            timeoutRef.current = null;
          }, remainingTime);
        }
      };
      img.src = uploadedUrl;
    } catch (error) {
      console.error('Failed to upload and analyze image:', error);
      // Only show error and update validation if this is still the current file
      if (currentFileTokenRef.current === fileToken) {
        const errorMessage = error instanceof Error ? error.message : "Could not upload image for analysis";
        setUploadError(errorMessage);
        toast({
          title: "Upload failed",
          description: errorMessage,
          variant: "destructive",
        });
        setIsUploading(false);
        onValidationChange?.("invalid");
      }
    }
  };

  const upscaleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !analysis || !imageUrl) throw new Error('No file or analysis available');

      const fileHash = await hashFile(selectedFile);

      const response = await apiRequest('POST', '/api/upscale/request', {
        imageUrl,
        fileHash,
        width: analysis.width,
        height: analysis.height,
        fileSize: selectedFile.size,
      });

      const data = await response.json();
      
      // If backend returned an error status, throw it so onError handler processes it
      if (data.status === 'error') {
        const error = new Error(data.userMessage || data.message || 'Upscale failed');
        (error as any).code = data.code;
        (error as any).userMessage = data.userMessage;
        throw error;
      }
      
      return data;
    },
    onSuccess: (data) => {
      if (data.cached || data.status === 'completed') {
        handleUpscaleComplete(data.upscaledUrl);
      } else if (data.jobId) {
        setJobId(data.jobId);
        startPolling(data.jobId);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/upscale/quota'] });
    },
    onError: (error: any) => {
      // Use user-friendly message from backend if available
      const errorMessage = error.userMessage || error.message || "The AI upscaling service encountered an error. Please try again.";
      
      toast({
        title: "Upscale failed",
        description: errorMessage,
        variant: "destructive",
      });
      setProgress(0);
    },
  });

  const startPolling = (jobId: string) => {
    isCompletedRef.current = false;
    setProgress(10);
    
    pollingIntervalRef.current = setInterval(async () => {
      if (isCompletedRef.current) return;
      
      try {
        const result = await fetch(`/api/upscale/status/${jobId}`);
        if (!result.ok) {
          throw new Error(`Status check failed: ${result.statusText}`);
        }
        const data = await result.json();

        if (data.status === 'completed' && data.upscaledUrl) {
          if (isCompletedRef.current) return;
          isCompletedRef.current = true;
          cleanup();
          handleUpscaleComplete(data.upscaledUrl);
        } else if (data.status === 'failed') {
          if (isCompletedRef.current) return;
          isCompletedRef.current = true;
          cleanup();
          
          // Use user-friendly error message from backend (userMessage field)
          const errorMessage = data.userMessage || data.error || "The AI upscaling service encountered an error. Please try again.";
          
          toast({
            title: "Upscale failed",
            description: errorMessage,
            variant: "destructive",
          });
          setProgress(0);
          setJobId(null);
        } else {
          setProgress((prev) => Math.min(prev + 5, 90));
        }
      } catch (error) {
        console.error('Polling error:', error);
        setProgress((prev) => Math.min(prev + 2, 90));
      }
    }, 3000);

    timeoutRef.current = setTimeout(() => {
      if (isCompletedRef.current) return;
      isCompletedRef.current = true;
      cleanup();
      toast({
        title: "Upscale timeout",
        description: "The upscale is taking longer than expected. Please try again.",
        variant: "destructive",
      });
      setProgress(0);
      setJobId(null);
    }, 120000);
  };

  const handleUpscaleComplete = async (upscaledUrl: string) => {
    try {
      setProgress(100);
      
      const response = await fetch(upscaledUrl);
      if (!response.ok) {
        // Check if it's a network/URL issue
        if (response.status === 404) {
          throw new Error('Image URL expired - please try upscaling again');
        } else if (response.status >= 500) {
          throw new Error('Storage server error - please try again');
        } else {
          throw new Error(`Failed to load image (HTTP ${response.status})`);
        }
      }
      const blob = await response.blob();
      const upscaledFile = new File([blob], selectedFile!.name, { type: selectedFile!.type });
      
      // Load the upscaled image to get its new dimensions
      const img = new Image();
      img.onload = async () => {
        try {
          // Re-analyze with the NEW upscaled dimensions to update variant qualification
          const analyzeResponse = await apiRequest('POST', '/api/upscale/analyze', {
            imageUrl: upscaledUrl,
            width: img.width,
            height: img.height,
          });
          const analyzeData = await analyzeResponse.json();

          // Update analysis with the new dimensions and qualifications
          const updatedAnalysis = {
            width: img.width,
            height: img.height,
            estimatedDpi: analyzeData.current.estimatedDpi,
            targetDpi: analyzeData.current.targetDpi,
            meetsMinimum: analyzeData.current.meetsMinimum,
            meetsTarget: analyzeData.current.meetsTarget,
            needsUpscale: analyzeData.shouldRecommend,
            recommendedScale: analyzeData.recommendedScale,
            message: analyzeData.current.message,
            variantQualification: analyzeData.current.variantQualification,
            orientation: analyzeData.current.orientation,
            qualityLevel: analyzeData.current.qualityLevel,
            customerGuidance: analyzeData.current.customerGuidance,
          };
          
          setAnalysis(updatedAnalysis);
          
          // Update validation status based on new analysis
          if (updatedAnalysis.meetsMinimum || updatedAnalysis.needsUpscale) {
            onValidationChange?.("valid");
          } else {
            onValidationChange?.("invalid");
          }
          
          // Show success with variant unlock info
          const unlockedCount = analyzeData.current.variantQualification?.totalQualified || 0;
          const totalCount = analyzeData.current.variantQualification?.totalVariants || 12;
          
          toast({
            title: "Image upscaled successfully!",
            description: `Now qualifies for ${unlockedCount} of ${totalCount} product variants.`,
          });
        } catch (error) {
          console.error('Failed to re-analyze upscaled image:', error);
          // Still proceed even if re-analysis fails
          toast({
            title: "Image upscaled!",
            description: "Your image has been enhanced for professional print quality.",
          });
        }
      };
      
      img.onerror = () => {
        console.error('Failed to load upscaled image for dimension analysis');
        toast({
          title: "Image upscaled!",
          description: "Your image has been enhanced for professional print quality.",
        });
      };
      
      img.src = upscaledUrl;
      
      onUpscaledFile(upscaledFile, upscaledUrl);
      onUpscaledImageUrl?.(upscaledUrl);

      setTimeout(() => {
        setProgress(0);
        setJobId(null);
      }, 2000);
    } catch (error: any) {
      console.error('Failed to process upscaled image:', error);
      
      // More specific error message based on the issue
      const errorMessage = error.message?.includes('expired') 
        ? "The upscaled image URL expired. Please try upscaling again."
        : error.message?.includes('Storage server')
        ? "Temporary storage issue. Please try again in a moment."
        : "Could not load the upscaled image. Please try again.";
      
      toast({
        title: "Image loading failed",
        description: errorMessage,
        variant: "destructive",
      });
      setProgress(0);
      setJobId(null);
    }
  };

  const hashFile = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  if (!selectedFile) return null;

  const showUpscaleButton = analysis?.needsUpscale && quota?.hasQuota;
  const isUpscaling = upscaleMutation.isPending || jobId !== null;
  const isAnalyzing = isUploading || (!analysis && !uploadError && selectedFile);

  return (
    <Card className="mt-4" data-testid="card-upscale-widget">
      <CardContent className="p-4 space-y-4">
        {isAnalyzing ? (
          <div className="flex items-center gap-3" data-testid="loading-analysis">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <h4 className="text-sm font-semibold">Analyzing Print Quality...</h4>
              <p className="text-xs text-muted-foreground">Checking image resolution for print products</p>
            </div>
          </div>
        ) : analysis ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  {analysis.qualityLevel === 'excellent' ? (
                    <CheckCircle className="h-5 w-5 text-green-500" data-testid="icon-quality-excellent" />
                  ) : analysis.qualityLevel === 'good' ? (
                    <CheckCircle className="h-5 w-5 text-yellow-500" data-testid="icon-quality-good" />
                  ) : analysis.qualityLevel === 'needs-boost' ? (
                    <AlertCircle className="h-5 w-5 text-orange-500" data-testid="icon-quality-needs-boost" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-500" data-testid="icon-quality-rejected" />
                  )}
                  <h4 className="text-sm font-semibold">Print Quality Analysis</h4>
                  {analysis.orientation && (
                    <Badge variant="outline" className="h-5 text-xs capitalize">
                      {analysis.orientation}
                    </Badge>
                  )}
                </div>
                
                <div className="text-xs">
                  <span className="text-muted-foreground">Resolution:</span>
                  <p className="font-medium">{analysis.width} × {analysis.height}px</p>
                </div>

                <p className="text-xs leading-relaxed" data-testid="text-customer-guidance">
                  {analysis.customerGuidance || analysis.message}
                </p>

                {analysis.variantQualification && (
                  <div className="pt-2 border-t space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">Product Variants</span>
                      <Badge 
                        variant={analysis.variantQualification.totalQualified === analysis.variantQualification.totalVariants ? "default" : "outline"}
                        className="h-6"
                        data-testid="badge-variant-count"
                      >
                        {analysis.variantQualification.totalQualified} of {analysis.variantQualification.totalVariants} qualified
                      </Badge>
                    </div>
                    
                    {analysis.variantQualification.locked.length > 0 && (
                      <div className="p-2 bg-muted/50 rounded-md">
                        <p className="text-xs text-muted-foreground mb-1">
                          <strong>{analysis.variantQualification.locked.length} locked variants</strong> need higher resolution:
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {analysis.variantQualification.locked.slice(0, 3).map((variant) => (
                            <Badge key={variant.variantKey} variant="outline" className="h-5 text-xs opacity-50">
                              {variant.productName}
                            </Badge>
                          ))}
                          {analysis.variantQualification.locked.length > 3 && (
                            <Badge variant="outline" className="h-5 text-xs opacity-50">
                              +{analysis.variantQualification.locked.length - 3} more
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Need {Math.max(...analysis.variantQualification.locked.map(v => v.requiredPixels.width))} × {Math.max(...analysis.variantQualification.locked.map(v => v.requiredPixels.height))} pixels minimum
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {quota && (
                  <div className="flex items-center gap-2 text-xs">
                    <Sparkles className="h-3 w-3 text-primary" />
                    <span className="text-muted-foreground">AI Upscales:</span>
                    {quota.quotaType === 'elite_unlimited' ? (
                      <Badge variant="default" className="h-6">Unlimited</Badge>
                    ) : (
                      <Badge variant="outline" className="h-6">
                        {quota.remaining} / {quota.total} remaining
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                {analysis.variantQualification && analysis.variantQualification.totalQualified < 8 && !isUpscaling && (
                  <Button
                    onClick={() => setIsCropDialogOpen(true)}
                    size="default"
                    variant="outline"
                    className="gap-2"
                    data-testid="button-crop-image"
                  >
                    <Crop className="h-4 w-4" />
                    Crop Image
                  </Button>
                )}

                {showUpscaleButton && !isUpscaling && (
                  <Button
                    onClick={() => upscaleMutation.mutate()}
                    size="default"
                    className="gap-2"
                    data-testid="button-boost-quality"
                  >
                    <Zap className="h-4 w-4" />
                    Boost Quality
                  </Button>
                )}
              </div>
            </div>

            {isUpscaling && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Enhancing image with AI...</span>
                  <span className="font-medium">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" data-testid="progress-upscale" />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>This usually takes 30-60 seconds</span>
                </div>
              </div>
            )}

            {!quota?.hasQuota && analysis.needsUpscale && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-md">
                <p className="text-xs text-yellow-800 dark:text-yellow-200">
                  You've used all your AI upscales. Upgrade to <strong>Pro</strong> (25/month) or <strong>Elite</strong> (unlimited) for more.
                </p>
              </div>
            )}
          </>
        ) : null}
      </CardContent>

      {imageUrl && selectedFile && (
        <ImageCropDialog
          open={isCropDialogOpen}
          onOpenChange={setIsCropDialogOpen}
          imageUrl={imageUrl}
          originalFileName={selectedFile.name}
          onCropComplete={(croppedFile) => {
            if (onCroppedFile) {
              onCroppedFile(croppedFile);
            }
            toast({
              title: "Image cropped",
              description: "Analyzing cropped image quality...",
            });
          }}
        />
      )}
    </Card>
  );
}
