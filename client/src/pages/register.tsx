import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertArtistSchema, type InsertArtist } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { Palette, Loader2, Upload, X, Check } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { z } from "zod";

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
  const [step, setStep] = useState<"account" | "portfolio">("account");
  const [portfolioFiles, setPortfolioFiles] = useState<File[]>([]);
  const [portfolioPreviews, setPortfolioPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<RegistrationForm>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { email: "", password: "", confirmPassword: "", name: "", artistShort: "", acceptTerms: false },
  });

  async function onSubmitAccount(data: RegistrationForm) {
    const { confirmPassword, acceptTerms, ...artistData } = data;
    setIsLoading(true);
    try {
      const response = await fetch("/api/artists/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(artistData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Registration failed");
      }

      const artist = await response.json();
      
      // Automatically log in the user
      login({ ...artist, type: "artist" });

      toast({
        title: "Account created!",
        description: "Now upload 2-3 portfolio samples to complete registration.",
      });

      // Move to portfolio upload step
      setStep("portfolio");
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

    // Create preview URLs
    const newPreviews = files.map(file => URL.createObjectURL(file));
    setPortfolioFiles(prev => [...prev, ...files]);
    setPortfolioPreviews(prev => [...prev, ...newPreviews]);
    
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
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
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

    setIsLoading(true);
    try {
      const formData = new FormData();
      portfolioFiles.forEach(file => {
        formData.append("files", file);
      });

      const response = await fetch("/api/artists/portfolio", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Portfolio upload failed");
      }

      toast({
        title: "Portfolio uploaded!",
        description: "Your account is pending admin approval.",
      });

      // Clean up preview URLs
      portfolioPreviews.forEach(url => URL.revokeObjectURL(url));

      setTimeout(() => {
        setLocation("/artist/pending");
      }, 0);
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
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
        <div className="mb-6 flex items-center justify-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === "account" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {step === "portfolio" ? <Check className="w-4 h-4" /> : "1"}
            </div>
            <span className="text-sm font-medium">Account Details</span>
          </div>
          <div className="h-px w-16 bg-border" />
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === "portfolio" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              2
            </div>
            <span className="text-sm font-medium">Portfolio Samples</span>
          </div>
        </div>

        {step === "account" ? (
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

                  <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-submit">
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
              {/* Image quality requirements */}
              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">Image Quality Requirements</h4>
                <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                  <li>• Minimum resolution: <strong>2400×3000 pixels</strong> (or 3000×2400 for landscape)</li>
                  <li>• Recommended: <strong>300 DPI</strong> for professional quality prints</li>
                  <li>• Supported formats: <strong>PNG, JPG</strong> only</li>
                  <li>• Maximum file size: 10MB per image</li>
                  <li>• Required: <strong>2-3 portfolio images</strong></li>
                </ul>
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
                      High-resolution PNG or JPG (min. 2400×3000 px)
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
                  {portfolioPreviews.map((preview, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={preview}
                        alt={`Portfolio ${index + 1}`}
                        className="w-full h-48 object-cover rounded-lg border"
                        data-testid={`img-portfolio-preview-${index}`}
                      />
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
                      <div className="absolute bottom-2 left-2 text-xs bg-background/80 px-2 py-1 rounded">
                        Image {index + 1}
                      </div>
                    </div>
                  ))}
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
                  disabled={isLoading || portfolioFiles.length < 2}
                  className="flex-1"
                  data-testid="button-submit-portfolio"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    "Complete Registration"
                  )}
                </Button>
              </div>

              {portfolioFiles.length < 2 && (
                <p className="text-sm text-muted-foreground text-center">
                  Please upload at least 2 portfolio images to continue
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
