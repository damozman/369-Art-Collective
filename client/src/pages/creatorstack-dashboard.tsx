import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { 
  Sparkles, 
  Package, 
  Download, 
  Calendar,
  LogOut,
  Loader2,
  ExternalLink,
  Wand2,
  Copy,
  Check
} from "lucide-react";
import type { CreatorstackPurchase, CreatorstackKit, CreatorstackBuyer } from "@shared/schema";

type PurchaseWithKit = CreatorstackPurchase & {
  kit: CreatorstackKit;
};

type BuyerWithPurchases = CreatorstackBuyer & {
  purchases: PurchaseWithKit[];
};

export default function CreatorStackDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // AI Generator state
  const [aiTemplate, setAiTemplate] = useState("");
  const [aiContext, setAiContext] = useState({
    businessType: "",
    targetAudience: "",
    tone: "",
    platform: "",
  });
  const [generatedContent, setGeneratedContent] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: buyer, isLoading } = useQuery<BuyerWithPurchases>({
    queryKey: ["/api/creatorstack/buyer/me"],
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/creatorstack/auth/logout", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/creatorstack/buyer/me"] });
      toast({
        title: "Logged out",
        description: "You've been successfully logged out.",
      });
      setLocation("/creatorstack");
    },
  });

  const trackAccessMutation = useMutation({
    mutationFn: async (purchaseId: string) => {
      return apiRequest("POST", `/api/creatorstack/purchases/${purchaseId}/track-access`, {});
    },
  });

  const generateContentMutation = useMutation({
    mutationFn: async (data: { template: string; context: any }) => {
      const response = await apiRequest("POST", "/api/creatorstack/ai/generate", data);
      return response.json();
    },
    onSuccess: (result: any) => {
      if (result.success && result.content) {
        setGeneratedContent(result.content);
        toast({
          title: "Content generated!",
          description: `Used ${result.tokensUsed} tokens`,
        });
      } else {
        toast({
          title: "Generation failed",
          description: "No content was generated",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Generation failed",
        description: error.message || "Failed to generate content",
        variant: "destructive",
      });
    },
  });

  const handleAccessKit = (purchase: PurchaseWithKit) => {
    trackAccessMutation.mutate(purchase.id);
  };

  const handleGenerateContent = () => {
    if (!aiTemplate.trim()) {
      toast({
        title: "Template required",
        description: "Please enter a content template",
        variant: "destructive",
      });
      return;
    }

    generateContentMutation.mutate({
      template: aiTemplate,
      context: aiContext,
    });
  };

  const handleCopyContent = () => {
    navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    toast({
      title: "Copied!",
      description: "Content copied to clipboard",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!buyer) {
    setLocation("/creatorstack/login");
    return null;
  }

  const activePurchases = buyer.purchases?.filter(p => p.accessGranted) || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setLocation("/creatorstack")}>
            <Sparkles className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl font-serif">247 CreatorStack</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button 
              variant="ghost" 
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 mr-2" />
              {logoutMutation.isPending ? "Logging out..." : "Logout"}
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold font-serif mb-2">
            Welcome back, {buyer.name}!
          </h1>
          <p className="text-lg text-muted-foreground">
            Access your kits and generate AI content below
          </p>
        </div>

        {/* Account Info Card */}
        <Card className="mb-8" data-testid="card-account-info">
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Email:</span>
              <span className="font-medium" data-testid="text-email">{buyer.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status:</span>
              <Badge variant={buyer.isPro ? "default" : "secondary"} data-testid="badge-status">
                {buyer.isPro ? "Pro Member" : "Free"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Active Kits:</span>
              <span className="font-medium" data-testid="text-kit-count">{activePurchases.length}</span>
            </div>
          </CardContent>
        </Card>

        {/* Purchases Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold font-serif mb-4">Your Kits</h2>
          
          {activePurchases.length === 0 ? (
            <Card data-testid="card-no-kits">
              <CardContent className="py-12 text-center">
                <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No kits purchased yet</h3>
                <p className="text-muted-foreground mb-6">
                  Get started with your first AI-powered kit to automate content creation
                </p>
                <Button onClick={() => setLocation("/creatorstack")} data-testid="button-browse-kits">
                  Browse Available Kits
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {activePurchases.map((purchase) => (
                <Card key={purchase.id} className="hover-elevate active-elevate-2 transition-all" data-testid={`kit-${purchase.kitId}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle>{purchase.kit.name}</CardTitle>
                        <CardDescription>{purchase.kit.description}</CardDescription>
                      </div>
                      <Badge variant="secondary">
                        {purchase.kit.category.replace("_", " ")}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Kit Details */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Templates</div>
                        <div className="font-semibold">{purchase.kit.canvaTemplateCount}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Purchased</div>
                        <div className="font-semibold">
                          {new Date(purchase.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Downloads</div>
                        <div className="font-semibold">{purchase.downloadCount}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Last Accessed</div>
                        <div className="font-semibold">
                          {purchase.lastAccessedAt 
                            ? new Date(purchase.lastAccessedAt).toLocaleDateString()
                            : "Never"}
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Action Buttons */}
                    <div className="space-y-2">
                      {purchase.kit.canvaTemplateUrl && (
                        <Button
                          variant="default"
                          className="w-full"
                          onClick={() => {
                            handleAccessKit(purchase);
                            window.open(purchase.kit.canvaTemplateUrl!, '_blank');
                          }}
                          data-testid={`button-access-canva-${purchase.kitId}`}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Access Canva Templates
                        </Button>
                      )}
                      
                      {purchase.kit.promptLibraryUrl && (
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            handleAccessKit(purchase);
                            window.open(purchase.kit.promptLibraryUrl!, '_blank');
                          }}
                          data-testid={`button-access-prompts-${purchase.kitId}`}
                        >
                          <Wand2 className="h-4 w-4 mr-2" />
                          Access AI Prompt Library
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* AI Content Generator */}
        <Card className="border-primary/50" data-testid="card-ai-generator">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              AI Content Generator
            </CardTitle>
            <CardDescription>
              Generate custom content on-demand with GPT-4o
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Template Input */}
            <div className="space-y-2">
              <Label htmlFor="ai-template">Content Template</Label>
              <Textarea
                id="ai-template"
                placeholder="Example: Generate 5 engaging Instagram captions for my new product launch"
                value={aiTemplate}
                onChange={(e) => setAiTemplate(e.target.value)}
                rows={4}
                data-testid="textarea-ai-template"
              />
            </div>

            {/* Context Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="business-type">Business Type (optional)</Label>
                <Input
                  id="business-type"
                  placeholder="e.g., Etsy shop, coaching"
                  value={aiContext.businessType}
                  onChange={(e) => setAiContext({ ...aiContext, businessType: e.target.value })}
                  data-testid="input-business-type"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="target-audience">Target Audience (optional)</Label>
                <Input
                  id="target-audience"
                  placeholder="e.g., busy moms, solopreneurs"
                  value={aiContext.targetAudience}
                  onChange={(e) => setAiContext({ ...aiContext, targetAudience: e.target.value })}
                  data-testid="input-target-audience"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tone">Tone (optional)</Label>
                <Input
                  id="tone"
                  placeholder="e.g., professional, casual, fun"
                  value={aiContext.tone}
                  onChange={(e) => setAiContext({ ...aiContext, tone: e.target.value })}
                  data-testid="input-tone"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="platform">Platform (optional)</Label>
                <Input
                  id="platform"
                  placeholder="e.g., Instagram, LinkedIn, Email"
                  value={aiContext.platform}
                  onChange={(e) => setAiContext({ ...aiContext, platform: e.target.value })}
                  data-testid="input-platform"
                />
              </div>
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleGenerateContent}
              disabled={generateContentMutation.isPending || !aiTemplate.trim()}
              className="w-full"
              data-testid="button-generate-content"
            >
              {generateContentMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Content
                </>
              )}
            </Button>

            {/* Generated Content */}
            {generatedContent && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Generated Content</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyContent}
                      data-testid="button-copy-content"
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="p-4 bg-muted rounded-lg border">
                    <p className="whitespace-pre-wrap text-sm" data-testid="text-generated-content">
                      {generatedContent}
                    </p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
