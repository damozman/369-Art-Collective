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
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number | null>(null);
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);
  
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCompletedRef = useRef(false);
  const uploadStartTimeRef = useRef<number>(0);
  const currentFileTokenRef = useRef<string | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  };

  // Countdown timer for rate limiting
  useEffect(() => {
    if (rateLimitSeconds !== null && rateLimitSeconds > 0) {
      countdownIntervalRef.current = setInterval(() => {
        setRateLimitSeconds((prev) => {
          if (prev === null || prev <= 1) {
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }
            setRateLimitMessage(null);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [rateLimitSeconds]);

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
          // Images must qualify for at least 1 variant to proceed (meetsMinimum = true)
          // If 0 variants qualify, user must upscale first before proceeding to next step
          if (analysisResult.meetsMinimum) {
            onValidationChange?.("valid"); // At least 1 variant qualified - can proceed
          } else {
            onValidationChange?.("invalid"); // 0 variants - must upscale or crop first
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
        // Parse error to provide specific, actionable guidance
        let errorTitle = "Upload failed";
        let errorMessage = "Could not upload image for analysis";
        
        if (error instanceof Error) {
          errorMessage = error.message;
          
          // Customize title based on error type for better clarity
          if (errorMessage.includes('PNG and JPG') || errorMessage.includes('WEBP') || errorMessage.includes('GIF') || errorMessage.includes('HEIC')) {
            errorTitle = "Unsupported file format";
          } else if (errorMessage.includes('too large') || errorMessage.includes('50MB')) {
            errorTitle = "File too large";
          } else if (errorMessage.includes('too small') || errorMessage.includes('1200px')) {
            errorTitle = "Image resolution too low";
          }
        }
        
        setUploadError(errorMessage);
        toast({
          title: errorTitle,
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
    onError: async (error: any, variables, context) => {
      // Check if this is a 429 rate limit error by inspecting the response
      // The mutationFn throws an error after getting a response, so we need to check the original response
      try {
        // Try to get the waitSeconds from the error or make another request to check
        const fileHash = await hashFile(selectedFile!);
        const response = await fetch('/api/upscale/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl,
            fileHash,
            width: analysis?.width,
            height: analysis?.height,
            fileSize: selectedFile?.size,
          }),
          credentials: 'include'
        });
        
        if (response.status === 429) {
          const data = await response.json();
          const waitSeconds = data.waitSeconds || 0;
          const message = data.message || "Please wait before trying again";
          
          setRateLimitSeconds(waitSeconds);
          setRateLimitMessage(message);
          setProgress(0);
          return; // Don't show error toast, we'll show the countdown instead
        }
      } catch (checkError) {
        console.error('Error checking rate limit:', checkError);
      }
      
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
          
          // Notify parent component AFTER analysis is complete
          onUpscaledFile(upscaledFile, upscaledUrl);
          onUpscaledImageUrl?.(upscaledUrl);
          
          // Show success with variant unlock info
          const unlockedCount = analyzeData.current.variantQualification?.totalQualified || 0;
          const totalCount = analyzeData.current.variantQualification?.totalVariants || 12;
          
          toast({
            title: "Image upscaled successfully!",
            description: `Now qualifies for ${unlockedCount} of ${totalCount} product variants.`,
          });
          
          // Reset progress after successful completion
          setTimeout(() => {
            setProgress(0);
            setJobId(null);
          }, 2000);
        } catch (error) {
          console.error('Failed to re-analyze upscaled image:', error);
          // Still proceed even if re-analysis fails
          onUpscaledFile(upscaledFile, upscaledUrl);
          onUpscaledImageUrl?.(upscaledUrl);
          
          toast({
            title: "Image upscaled!",
            description: "Your image has been enhanced for professional print quality.",
          });
          
          setTimeout(() => {
            setProgress(0);
            setJobId(null);
          }, 2000);
        }
      };
      
      img.onerror = () => {
        console.error('Failed to load upscaled image for dimension analysis');
        
        // Still notify parent even on error
        onUpscaledFile(upscaledFile, upscaledUrl);
        onUpscaledImageUrl?.(upscaledUrl);
        
        toast({
          title: "Image upscaled!",
          description: "Your image has been enhanced for professional print quality.",
        });
        
        setTimeout(() => {
          setProgress(0);
          setJobId(null);
        }, 2000);
      };
      
      img.src = upscaledUrl;
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
  
  // Determine what action to recommend
  const isLandscape = analysis?.orientation === 'landscape';
  const qualifiedCount = analysis?.variantQualification?.totalQualified || 0;
  const totalVariants = analysis?.variantQualification?.totalVariants || 12;
  const isPerfect = qualifiedCount === totalVariants;
  const needsCrop = isLandscape && qualifiedCount < 8;
  const needsBoost = analysis?.needsUpscale && !isPerfect;

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
            {/* CRYSTAL CLEAR SUCCESS STATE */}
            {isPerfect && !isUpscaling && (
              <div className="p-4 bg-green-50 dark:bg-green-950/30 border-2 border-green-500 rounded-lg" data-testid="alert-perfect-quality">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-green-900 dark:text-green-100 mb-1">
                      ✅ Perfect! Ready for All Products
                    </h4>
                    <p className="text-sm text-green-800 dark:text-green-200 mb-2">
                      This image qualifies for all {totalVariants} product sizes at professional print quality.
                    </p>
                    <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-300">
                      <span className="font-medium">{analysis.width} × {analysis.height}px</span>
                      <Badge variant="outline" className="border-green-500 text-green-700 dark:text-green-300">
                        {analysis.orientation}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* ACTION REQUIRED: LANDSCAPE IMAGE - NEEDS CROP */}
            {needsCrop && !isUpscaling && !isPerfect && (
              <div className="p-4 bg-orange-50 dark:bg-orange-950/30 border-2 border-orange-500 rounded-lg" data-testid="alert-needs-crop">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-6 w-6 text-orange-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-3">
                    <div>
                      <h4 className="text-sm font-bold text-orange-900 dark:text-orange-100 mb-1">
                        📐 Landscape images qualify for fewer products
                      </h4>
                      <p className="text-sm text-orange-800 dark:text-orange-200">
                        Current: <strong>{qualifiedCount} of {totalVariants} variants</strong>
                      </p>
                    </div>
                    <Button
                      onClick={() => setIsCropDialogOpen(true)}
                      size="lg"
                      className="w-full gap-2 bg-orange-600 hover:bg-orange-700"
                      data-testid="button-crop-to-portrait"
                    >
                      <Crop className="h-5 w-5" />
                      Crop to Portrait → Unlock All {totalVariants} Variants
                    </Button>
                    <p className="text-xs text-orange-700 dark:text-orange-300">
                      Most wall art products are portrait-oriented. Crop your image to vertical orientation to unlock all sizes.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {/* RATE LIMIT COUNTDOWN */}
            {rateLimitSeconds !== null && rateLimitSeconds > 0 && !isUpscaling && (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-950/30 border-2 border-yellow-500 rounded-lg" data-testid="alert-rate-limited">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-6 w-6 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <h4 className="text-sm font-bold text-yellow-900 dark:text-yellow-100">
                      ⏱️ Please Wait Before Upscaling
                    </h4>
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      {rateLimitMessage || "New accounts must wait before using AI upscaling"}
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-yellow-200 dark:bg-yellow-900 rounded-full h-2">
                        <div 
                          className="bg-yellow-500 h-2 rounded-full transition-all duration-1000"
                          style={{ width: `${Math.max(0, 100 - (rateLimitSeconds / 5) * 100)}%` }}
                        />
                      </div>
                      <span className="text-lg font-bold text-yellow-900 dark:text-yellow-100 tabular-nums min-w-[4rem] text-right">
                        {Math.floor(rateLimitSeconds / 60)}:{String(rateLimitSeconds % 60).padStart(2, '0')}
                      </span>
                    </div>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">
                      This cooldown helps prevent abuse. The button will be available once the timer reaches zero.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            {/* ACTION REQUIRED: NEEDS UPSCALING */}
            {needsBoost && !needsCrop && !isUpscaling && !isPerfect && !rateLimitSeconds && (
              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-500 rounded-lg" data-testid="alert-needs-boost">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-6 w-6 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-3">
                    <div>
                      <h4 className="text-sm font-bold text-blue-900 dark:text-blue-100 mb-1">
                        🔍 Resolution needs boost for more products
                      </h4>
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        Current: <strong>{qualifiedCount} of {totalVariants} variants</strong>
                      </p>
                    </div>
                    {showUpscaleButton ? (
                      <Button
                        onClick={() => upscaleMutation.mutate()}
                        size="lg"
                        className="w-full gap-2"
                        data-testid="button-boost-quality"
                        disabled={rateLimitSeconds !== null && rateLimitSeconds > 0}
                      >
                        <Zap className="h-5 w-5" />
                        Boost Quality → Unlock All {totalVariants} Variants
                      </Button>
                    ) : !quota?.hasQuota ? (
                      <div className="p-3 bg-yellow-50 dark:bg-yellow-950/50 border border-yellow-300 rounded-md">
                        <p className="text-xs text-yellow-800 dark:text-yellow-200">
                          You've used all your AI upscales. Upgrade to <strong>Pro</strong> (25/month) or <strong>Elite</strong> (unlimited) for more.
                        </p>
                      </div>
                    ) : null}
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      AI upscaling enhances your image to professional print quality in ~30 seconds.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* UPSCALING IN PROGRESS */}
            {isUpscaling && (
              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-500 rounded-lg">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                    <h4 className="text-sm font-bold text-blue-900 dark:text-blue-100">
                      Enhancing with AI... {progress}%
                    </h4>
                  </div>
                  <Progress value={progress} className="h-2" data-testid="progress-upscale" />
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    This usually takes 30-60 seconds. Please don't close this page.
                  </p>
                </div>
              </div>
            )}

            {/* DETAILS SECTION (always show) */}
            <div className="pt-3 border-t space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Resolution</span>
                <span className="text-xs text-muted-foreground">{analysis.width} × {analysis.height}px</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Product Variants</span>
                <Badge 
                  variant={isPerfect ? "default" : "outline"}
                  className="h-6"
                  data-testid="badge-variant-count"
                >
                  {qualifiedCount} of {totalVariants} qualified
                </Badge>
              </div>
              {quota && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-primary" />
                    AI Upscales
                  </span>
                  {quota.quotaType === 'elite_unlimited' ? (
                    <Badge variant="default" className="h-6">Unlimited</Badge>
                  ) : (
                    <Badge variant="outline" className="h-6">
                      {quota.remaining} / {quota.total} left
                    </Badge>
                  )}
                </div>
              )}
            </div>
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
