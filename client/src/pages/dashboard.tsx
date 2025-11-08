import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Link } from "wouter";
import { ArrowLeft, Package, Lock, Unlock, Sparkles } from "lucide-react";
import type { Kit } from "@shared/schema";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function Dashboard() {
  const { data: kits, isLoading, error } = useQuery<Kit[]>({
    queryKey: ["/api/kits"],
  });

  const [selectedKit, setSelectedKit] = useState<Kit | null>(null);
  const [userInput, setUserInput] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    document.title = "Creator Kits - 247 CreatorStack";
  }, []);

  const generatePromptMutation = useMutation({
    mutationFn: async (data: { kitId: string; userInput: string }) => {
      const res = await apiRequest("POST", "/api/grok-prompt", data);
      return await res.json() as { prompt: string };
    },
    onSuccess: (data) => {
      setGeneratedPrompt(data.prompt);
      toast({
        title: "Prompt Generated!",
        description: "Your AI-powered prompt is ready.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate prompt",
        variant: "destructive",
      });
    },
  });

  const handleGeneratePrompt = () => {
    if (!selectedKit || !userInput.trim()) {
      toast({
        title: "Input Required",
        description: "Please enter your topic or content details",
        variant: "destructive",
      });
      return;
    }

    generatePromptMutation.mutate({
      kitId: selectedKit.id,
      userInput: userInput.trim(),
    });
  };

  const handleCloseDialog = () => {
    setSelectedKit(null);
    setUserInput("");
    setGeneratedPrompt("");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button 
                variant="ghost" 
                size="icon"
                data-testid="button-back-home"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Creator Kits</h1>
              <p className="text-sm text-muted-foreground">
                Browse our collection of AI automation tools
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {error && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle>Error Loading Kits</CardTitle>
              <CardDescription>
                {error instanceof Error ? error.message : "Failed to load kits"}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} data-testid={`skeleton-kit-${i}`}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
                <CardFooter>
                  <Skeleton className="h-10 w-full" />
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && !error && kits && kits.length === 0 && (
          <Card>
            <CardHeader>
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="p-4 rounded-full bg-muted">
                  <Package className="w-8 h-8 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <CardTitle>No Kits Available</CardTitle>
                  <CardDescription className="mt-2">
                    Check back soon for new automation kits
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        {!isLoading && !error && kits && kits.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {kits.map((kit) => {
              const isUnlocked = kit.unlockedAt !== null;
              
              return (
                <Card 
                  key={kit.id} 
                  className="flex flex-col hover-elevate"
                  data-testid={`card-kit-${kit.id}`}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle data-testid={`text-kit-name-${kit.id}`} className="flex-1">
                        {kit.name}
                      </CardTitle>
                      <Badge 
                        variant={isUnlocked ? "default" : "secondary"}
                        className="gap-1"
                        data-testid={`badge-kit-status-${kit.id}`}
                      >
                        {isUnlocked ? (
                          <>
                            <Unlock className="w-3 h-3" />
                            Unlocked
                          </>
                        ) : (
                          <>
                            <Lock className="w-3 h-3" />
                            Locked
                          </>
                        )}
                      </Badge>
                    </div>
                    <CardDescription>
                      <span className="text-lg font-semibold text-foreground" data-testid={`text-kit-price-${kit.id}`}>
                        ${kit.price}
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <p className="text-sm text-muted-foreground line-clamp-3" data-testid={`text-kit-prompt-${kit.id}`}>
                      {kit.promptTemplate}
                    </p>
                  </CardContent>
                  <CardFooter>
                    {isUnlocked ? (
                      <Button 
                        className="w-full gap-2" 
                        variant="default"
                        onClick={() => setSelectedKit(kit)}
                        data-testid={`button-generate-prompt-${kit.id}`}
                      >
                        <Sparkles className="w-4 h-4" />
                        Generate Prompt
                      </Button>
                    ) : (
                      <Link href={`/checkout?kitId=${kit.id}`} className="w-full">
                        <Button 
                          className="w-full" 
                          variant="default"
                          data-testid={`button-buy-kit-${kit.id}`}
                        >
                          Buy Now - ${kit.price}
                        </Button>
                      </Link>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {/* Generate Prompt Dialog */}
      <Dialog open={selectedKit !== null} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="sm:max-w-[600px]" data-testid="dialog-generate-prompt">
          <DialogHeader>
            <DialogTitle>Generate Prompt: {selectedKit?.name}</DialogTitle>
            <DialogDescription>
              Enter your topic or content details to generate an AI-powered prompt
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="user-input">Your Topic/Content</Label>
              <Textarea
                id="user-input"
                placeholder="e.g., AI prints, sustainable fashion, productivity hacks..."
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                rows={3}
                data-testid="input-user-topic"
              />
            </div>

            {generatedPrompt && (
              <div className="space-y-2">
                <Label>Generated Content</Label>
                <div className="p-4 rounded-md bg-muted max-h-[300px] overflow-y-auto">
                  <p className="text-sm whitespace-pre-wrap" data-testid="text-generated-prompt">
                    {generatedPrompt}
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={handleCloseDialog}
              data-testid="button-close-dialog"
            >
              Close
            </Button>
            <Button 
              onClick={handleGeneratePrompt}
              disabled={generatePromptMutation.isPending || !userInput.trim()}
              data-testid="button-submit-generate"
            >
              {generatePromptMutation.isPending ? "Generating..." : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
