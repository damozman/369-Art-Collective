import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertArtistSchema, type InsertArtist } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { Palette, Loader2, Upload, X, Check, Crown, Sparkles, Zap, ChevronDown, Lightbulb, Camera, Smartphone, Info } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { z } from "zod";
import { loadStripe } from "@stripe/stripe-js";

const registrationSchema = insertArtistSchema.extend({
  confirmPassword: z.string().min(6, "Password must be at least 6 characters"),
  acceptTerms: z.boolean().refine((val) => val === true, {
    message: "You must accept the Terms of Service",
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type RegistrationForm = z.infer<typeof registrationSchema>;

export default function Register() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<"account" | "portfolio" | "subscription">("account");
  const [portfolioFiles, setPortfolioFiles] = useState<File[]>([]);
  const [portfolioPreviews, setPortfolioPreviews] = useState<string[]>([]);
  const [portfolioDimensions, setPortfolioDimensions] = useState<{ width: number; height: number; valid: boolean }[]>([]);
  const [selectedTier, setSelectedTier] = useState<"free" | "pro" | "elite">("free");
  const [accountData, setAccountData] = useState<RegistrationForm | null>(null);
  const [instagramUrl, setInstagramUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Capture UTM parameters from URL query string
  const urlParams = new URLSearchParams(window.location.search);
  const utmSource = urlParams.get('utm_source');
  const utmMedium = urlParams.get('utm_medium');
  const utmCampaign = urlParams.get('utm_campaign');
  const refCode = urlParams.get('ref');

  const form = useForm<RegistrationForm>({
    resolver: zodResolver(registrationSchema),
    mode: "onChange",
    defaultValues: { email: "", password: "", confirmPassword: "", name: "", artistShort: "", acceptTerms: false },
  });

  const acceptTerms = form.watch("acceptTerms");

  async function onSubmitAccount(data: RegistrationForm) {
    // Store account data locally (no API call yet - atomic registration)
    setAccountData(data);
    
    toast({
      title: "Account info saved!",
      description: "Now upload 2-3 portfolio samples to complete registration.",
    });

    // Move to portfolio upload step
    setStep("portfolio");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    
    // Enforce max 3 files
    if (portfolioFiles.length + files.length > 3) {
      toast({
        title: "Too many files",
        description: "Maximum 3 portfolio images allowed",
        variant: "destructive",
      });
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    // Create preview URLs and validate dimensions
    files.forEach(file => {
      const previewUrl = URL.createObjectURL(file);
      const img = new Image();
      
      img.onload = () => {
        const shortSide = Math.min(img.width, img.height);
        const longSide = Math.max(img.width, img.height);
        const isValid = shortSide >= 1024 && longSide >= 1024;
        const totalPixels = img.width * img.height;
        const requiredPixels = 1024 * 1024; // 1.05 megapixels
        
        setPortfolioDimensions(prev => [...prev, {
          width: img.width,
          height: img.height,
          valid: isValid
        }]);
        
        if (!isValid) {
          // Context-aware error messages
          let title = "Image resolution too low";
          let description = "";
          
          if (totalPixels >= requiredPixels * 0.8) {
            // Close to minimum (80%+)
            description = `Almost there! Your image is ${img.width}×${img.height}px. Most AI platforms (DALL-E, Midjourney) output 1024×1024 or larger by default. Need 1024×1024 minimum for portfolio.`;
          } else if (totalPixels >= requiredPixels * 0.5) {
            // Moderately low (50-80%)
            description = `Your image is ${img.width}×${img.height}px. Use AI-generated art (DALL-E, Midjourney), modern smartphone photos, or high-res downloads. Need 1024×1024 minimum.`;
          } else {
            // Very low (<50%)
            title = "Image too small";
            description = `This image is only ${img.width}×${img.height}px. Please use AI-generated art, modern smartphone photos (2015+), or high-resolution stock images. Minimum 1024×1024 pixels required.`;
          }
          
          toast({
            title,
            description,
            variant: "destructive",
          });
        }
      };
      
      img.src = previewUrl;
      
      setPortfolioFiles(prev => [...prev, file]);
      setPortfolioPreviews(prev => [...prev, previewUrl]);
    });
    
    // Reset file input to allow selecting same files again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function removeFile(index: number) {
    // Revoke preview URL to free memory
    URL.revokeObjectURL(portfolioPreviews[index]);
    
    // Update state
    setPortfolioFiles(prev => prev.filter((_, i) => i !== index));
    setPortfolioPreviews(prev => prev.filter((_, i) => i !== index));
    setPortfolioDimensions(prev => prev.filter((_, i) => i !== index));
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleSubscriptionContinue() {
    if (!accountData) {
      toast({
        title: "Error",
        description: "Account data missing. Please start over.",
        variant: "destructive",
      });
      setStep("account");
      return;
    }

    setIsLoading(true);
    try {
      // Prepare FormData with ALL registration data
      const formData = new FormData();
      
      // Add account fields
      formData.append("email", accountData.email);
      formData.append("password", accountData.password);
      formData.append("name", accountData.name);
      formData.append("artistShort", accountData.artistShort);
      formData.append("acceptTerms", accountData.acceptTerms.toString());
      
      // Add UTM params
      if (utmSource) formData.append("utmSource", utmSource);
      if (utmMedium) formData.append("utmMedium", utmMedium);
      if (utmCampaign) formData.append("utmCampaign", utmCampaign);
      if (refCode) formData.append("referralCode", refCode);
      
      // Add portfolio files
      portfolioFiles.forEach(file => {
        formData.append("portfolioFiles", file);
      });
      
      // Add optional portfolio links
      if (instagramUrl.trim()) formData.append("instagramUrl", instagramUrl.trim());
      if (websiteUrl.trim()) formData.append("websiteUrl", websiteUrl.trim());
      
      // Add tier selection
      formData.append("tier", selectedTier);

      // Call atomic registration endpoint
      const response = await fetch("/api/artists/register-complete", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || "Registration failed");
      }

      const artist = await response.json();
      
      // Automatically log in the user
      login({ ...artist, type: "artist" });

      // Clean up preview URLs
      portfolioPreviews.forEach(url => URL.revokeObjectURL(url));

      toast({
        title: "Welcome to 247 Print Network!",
        description: "Your account is pending admin approval.",
      });

      setTimeout(() => {
        setLocation("/artist/pending");
      }, 500);
    } catch (error: any) {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function submitPortfolio() {
    if (portfolioFiles.length < 2) {
      toast({
        title: "Not enough images",
        description: "Please upload at least 2 portfolio images",
        variant: "destructive",
      });
      return;
    }

    // Store portfolio files locally (no API call yet - atomic registration)
    toast({
      title: "Portfolio ready!",
      description: "Choose your subscription tier to complete registration.",
    });

    // Move to subscription step
    setStep("subscription");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <Palette className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-serif">Artist Portal</h1>
              <p className="text-sm text-muted-foreground">Curated marketplace registration</p>
            </div>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="mb-6 flex items-center justify-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === "account" ? "bg-primary text-primary-foreground" : (step === "portfolio" || step === "subscription") ? "bg-green-600 dark:bg-green-500 text-white" : "bg-muted text-muted-foreground"}`}>
              {(step === "portfolio" || step === "subscription") ? <Check className="w-4 h-4" /> : "1"}
            </div>
            <span className="text-sm font-medium">Account</span>
          </div>
          <div className="h-px w-12 bg-border" />
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === "portfolio" ? "bg-primary text-primary-foreground" : step === "subscription" ? "bg-green-600 dark:bg-green-500 text-white" : "bg-muted text-muted-foreground"}`}>
              {step === "subscription" ? <Check className="w-4 h-4" /> : "2"}
            </div>
            <span className="text-sm font-medium">Portfolio</span>
          </div>
          <div className="h-px w-12 bg-border" />
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === "subscription" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              3
            </div>
            <span className="text-sm font-medium">Plan</span>
          </div>
        </div>

        {step === "subscription" ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Choose Your Plan</CardTitle>
                <CardDescription>
                  Select the plan that works best for you. You can upgrade or downgrade anytime.
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Tier cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Free Tier */}
              <Card 
                className={`relative cursor-pointer transition-all ${selectedTier === "free" ? "border-primary ring-2 ring-primary" : "hover-elevate"}`}
                onClick={() => setSelectedTier("free")}
                data-testid="card-tier-free"
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Zap className="w-8 h-8 text-muted-foreground" />
                    {selectedTier === "free" && (
                      <Badge variant="default" className="bg-primary">Selected</Badge>
                    )}
                  </div>
                  <CardTitle className="text-xl">Free</CardTitle>
                  <div className="text-3xl font-bold">$0<span className="text-base font-normal text-muted-foreground">/month</span></div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-500" />
                      <span>30% royalty rate</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-500" />
                      <span>Up to 20 artworks</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <X className="w-4 h-4 mt-0.5 text-muted-foreground" />
                      <span className="text-muted-foreground">No AI Art Studio</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              {/* Pro Tier */}
              <Card 
                className={`relative cursor-pointer transition-all ${selectedTier === "pro" ? "border-primary ring-2 ring-primary" : "hover-elevate"}`}
                onClick={() => setSelectedTier("pro")}
                data-testid="card-tier-pro"
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Sparkles className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                    {selectedTier === "pro" && (
                      <Badge variant="default" className="bg-primary">Selected</Badge>
                    )}
                  </div>
                  <CardTitle className="text-xl">Pro</CardTitle>
                  <div className="text-3xl font-bold">$15<span className="text-base font-normal text-muted-foreground">/month</span></div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-500" />
                      <span><strong>35% minimum</strong> royalty</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-500" />
                      <span><strong>Unlimited</strong> artworks</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-500" />
                      <span>AI Art Studio access</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-500" />
                      <span>Priority support</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>

              {/* Elite Tier */}
              <Card 
                className={`relative cursor-pointer transition-all ${selectedTier === "elite" ? "border-primary ring-2 ring-primary" : "hover-elevate"}`}
                onClick={() => setSelectedTier("elite")}
                data-testid="card-tier-elite"
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Crown className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
                    {selectedTier === "elite" && (
                      <Badge variant="default" className="bg-primary">Selected</Badge>
                    )}
                  </div>
                  <CardTitle className="text-xl">Elite</CardTitle>
                  <div className="text-3xl font-bold">$40<span className="text-base font-normal text-muted-foreground">/month</span></div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-500" />
                      <span><strong>45% guaranteed</strong> royalty</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-500" />
                      <span><strong>Unlimited</strong> artworks</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-500" />
                      <span>Full AI Art Studio</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-500" />
                      <span>Profile customization</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 mt-0.5 text-green-600 dark:text-green-500" />
                      <span>Featured placement</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            {/* Action buttons */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep("portfolio")}
                    disabled={isLoading}
                    className="flex-1"
                    data-testid="button-back-to-portfolio"
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSubscriptionContinue}
                    disabled={isLoading}
                    className="flex-1"
                    data-testid="button-continue-subscription"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : selectedTier === "free" ? (
                      "Continue with Free"
                    ) : (
                      `Continue with ${selectedTier === "pro" ? "Pro" : "Elite"} ($${selectedTier === "pro" ? "15" : "40"}/mo)`
                    )}
                  </Button>
                </div>
                {selectedTier !== "free" && (
                  <p className="text-xs text-muted-foreground text-center mt-3">
                    You'll be redirected to Stripe to complete payment setup
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : step === "account" ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Create artist account</CardTitle>
              <CardDescription>
                Join our curated marketplace of creative artists. Your account will be reviewed by our team along with your portfolio samples.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmitAccount)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Jane Smith"
                            data-testid="input-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="artistShort"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Artist Initials</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="JS"
                            maxLength={10}
                            onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            data-testid="input-artist-short"
                          />
                        </FormControl>
                        <FormMessage />
                        <p className="text-xs text-muted-foreground">
                          2-3 uppercase letters/numbers for product SKUs (e.g., "JS" or "JH")
                        </p>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="email"
                            placeholder="you@example.com"
                            data-testid="input-email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            placeholder="••••••••"
                            data-testid="input-password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm Password</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            placeholder="••••••••"
                            data-testid="input-confirm-password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="acceptTerms"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-lg border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-accept-terms"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-sm font-medium">
                            Terms of Service & Intellectual Property Agreement
                          </FormLabel>
                          <p className="text-xs text-muted-foreground">
                            I confirm that all artwork I upload will be my original work OR work I have proper licensing rights to use. 
                            I understand that uploading artwork containing trademarks, copyrighted material, or other intellectual property 
                            I do not own will result in immediate removal of my artwork and forfeiture of any pending earnings. 
                            I agree to indemnify 247 Print Network against any claims arising from IP violations.
                          </p>
                          <FormMessage />
                        </div>
                      </FormItem>
                    )}
                  />

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={isLoading || !acceptTerms || !form.formState.isValid} 
                    data-testid="button-submit"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      "Continue to Portfolio"
                    )}
                  </Button>
                </form>
              </Form>

              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <button
                    onClick={() => setLocation("/login")}
                    className="text-primary hover:underline font-medium"
                    data-testid="link-login"
                  >
                    Sign in
                  </button>
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Upload Portfolio Samples</CardTitle>
              <CardDescription>
                Submit 2-3 examples of your best work. These samples help us ensure our marketplace maintains a high standard of quality.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Important Notice: Portfolio Images Purpose */}
              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-400 dark:border-blue-600 rounded-lg">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-blue-900 dark:text-blue-100 mb-1">
                      📋 About Portfolio Images
                    </h4>
                    <p className="text-xs text-blue-800 dark:text-blue-200">
                      These images are <strong>only for account approval</strong> and won't appear on your public profile. 
                      After approval, you'll upload artwork for sale with full quality requirements and detailed guidance. 
                      Portfolio samples just help us verify you're a real artist!
                    </p>
                  </div>
                </div>
              </div>

              {/* Simple Requirements */}
              <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-2 flex items-center gap-2">
                  <Check className="w-4 h-4" /> Simple Requirements
                </h4>
                <ul className="text-xs text-green-800 dark:text-green-200 space-y-1">
                  <li>• <strong>Minimum size:</strong> 1024×1024 pixels (any orientation)</li>
                  <li>• <strong>File types:</strong> PNG or JPG</li>
                  <li>• <strong>Quantity:</strong> Upload 2-3 examples of your work</li>
                </ul>
                <p className="text-xs text-green-700 dark:text-green-300 mt-3 italic">
                  ✅ Most AI platforms (DALL-E, Midjourney, Stable Diffusion) output 1024×1024 by default - perfect for portfolio!
                </p>
              </div>

              {/* What Happens Next */}
              <div className="p-4 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg">
                <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-2 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4" /> What Happens Next
                </h4>
                <div className="text-xs text-purple-800 dark:text-purple-200 space-y-1.5">
                  <p>1. <strong>We review your portfolio</strong> (usually within 24 hours)</p>
                  <p>2. <strong>You get approved</strong> and access the Artist Portal</p>
                  <p>3. <strong>Upload artwork for sale</strong> with AI upscaling tools, quality tips, and detailed guidance</p>
                </div>
              </div>

              {/* Optional Portfolio Links */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">Portfolio Links (Optional)</h3>
                  <Badge variant="secondary" className="text-xs">Helps us review faster</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Instagram Profile</label>
                    <Input
                      type="url"
                      placeholder="https://instagram.com/yourprofile"
                      value={instagramUrl}
                      onChange={(e) => setInstagramUrl(e.target.value)}
                      data-testid="input-instagram-url"
                    />
                    <p className="text-xs text-muted-foreground">Your Instagram art portfolio</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Website or Portfolio</label>
                    <Input
                      type="url"
                      placeholder="https://yourwebsite.com"
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      data-testid="input-website-url"
                    />
                    <p className="text-xs text-muted-foreground">Your personal website or online gallery</p>
                  </div>
                </div>
              </div>

              {/* File upload area */}
              {portfolioFiles.length < 3 && (
                <label
                  htmlFor="portfolio-upload"
                  className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer hover-elevate bg-muted/30"
                  data-testid="label-portfolio-upload"
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-10 h-10 mb-3 text-muted-foreground" />
                    <p className="mb-2 text-sm font-medium">
                      Click to upload portfolio images ({portfolioFiles.length}/3)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      High-resolution PNG or JPG (150+ DPI for prints)
                    </p>
                  </div>
                  <input
                    id="portfolio-upload"
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/png,image/jpeg,image/jpg"
                    multiple
                    onChange={handleFileChange}
                    data-testid="input-portfolio-files"
                  />
                </label>
              )}

              {/* Preview grid */}
              {portfolioFiles.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {portfolioPreviews.map((preview, index) => {
                    const dimensions = portfolioDimensions[index];
                    const isValid = dimensions?.valid ?? false;
                    const isLoading = !dimensions;
                    
                    return (
                      <div key={index} className="relative group">
                        <img
                          src={preview}
                          alt={`Portfolio ${index + 1}`}
                          className={`w-full h-48 object-cover rounded-lg border-2 ${
                            isLoading ? 'border-muted' : 
                            isValid ? 'border-green-500 dark:border-green-600' : 
                            'border-red-500 dark:border-red-600'
                          }`}
                          data-testid={`img-portfolio-preview-${index}`}
                        />
                        
                        {/* Validation badge */}
                        {!isLoading && (
                          <div className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                            isValid 
                              ? 'bg-green-600 dark:bg-green-700 text-white' 
                              : 'bg-red-600 dark:bg-red-700 text-white'
                          }`}>
                            {isValid ? (
                              <><Check className="h-3 w-3" /> Valid</>
                            ) : (
                              <><X className="h-3 w-3" /> Too Small</>
                            )}
                          </div>
                        )}
                        
                        {/* Remove button */}
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute top-2 right-2"
                          onClick={() => removeFile(index)}
                          data-testid={`button-remove-portfolio-${index}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        
                        {/* Dimensions display */}
                        <div className="absolute bottom-2 left-2 right-2">
                          <div className="bg-background/90 backdrop-blur-sm px-2 py-1.5 rounded text-xs">
                            <div className="font-medium">Image {index + 1}</div>
                            {dimensions && (
                              <div className="text-muted-foreground mt-0.5">
                                {dimensions.width}×{dimensions.height}px
                                {!isValid && (
                                  <div className="text-red-600 dark:text-red-400 font-medium mt-0.5">
                                    Need 1024×1024 min
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep("account")}
                  disabled={isLoading}
                  data-testid="button-back"
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={submitPortfolio}
                  disabled={
                    isLoading || 
                    portfolioFiles.length < 2 ||
                    portfolioDimensions.length < 2 ||
                    !portfolioDimensions.every(d => d.valid)
                  }
                  className="flex-1"
                  data-testid="button-submit-portfolio"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    "Continue to Plan Selection"
                  )}
                </Button>
              </div>

              {/* Validation feedback */}
              {portfolioFiles.length < 2 ? (
                <p className="text-sm text-muted-foreground text-center">
                  Please upload at least 2 portfolio images to continue
                </p>
              ) : portfolioDimensions.length < portfolioFiles.length ? (
                <p className="text-sm text-muted-foreground text-center">
                  Validating image dimensions...
                </p>
              ) : !portfolioDimensions.every(d => d.valid) ? (
                <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-800 dark:text-red-200 text-center font-medium">
                    Some images don't meet the minimum requirements. Please upload images at least 1024×1024 pixels.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                  <p className="text-sm text-green-800 dark:text-green-200 text-center font-medium flex items-center justify-center gap-2">
                    <Check className="h-4 w-4" /> All images meet quality requirements!
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
