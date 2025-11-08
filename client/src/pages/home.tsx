import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Zap, TrendingUp, Sparkles, CheckCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

export default function Home() {
  const { data: unlockedData } = useQuery<{ count: number }>({
    queryKey: ["/api/kits/unlocked-count"],
  });

  useEffect(() => {
    document.title = "247 CreatorStack - AI Kits for Creators";
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-accent/10 -z-10" />
        
        <div className="container mx-auto px-4 py-20 sm:py-32">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            {/* Status Badges */}
            <div className="flex flex-wrap gap-3 justify-center">
              <Badge 
                variant="outline" 
                className="gap-2 px-4 py-2"
                data-testid="badge-api-status"
              >
                <CheckCircle className="w-4 h-4 text-green-500" />
                API LIVE
              </Badge>
              <Badge 
                variant="outline" 
                className="px-4 py-2"
                data-testid="badge-unlocked-count"
              >
                Unlocked Kits: {unlockedData?.count ?? 0}
              </Badge>
            </div>
            
            {/* Main headline */}
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight">
              Automate. Create. Grow.
            </h1>
            
            {/* Subheadline */}
            <h2 className="text-xl sm:text-2xl text-muted-foreground">
              with <span className="text-primary font-semibold">247 CreatorStack</span>
            </h2>
            
            {/* Description */}
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
              Unlock $47 AI-powered kits to generate viral social content in seconds.
            </p>
            
            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
              <Link href="/dashboard">
                <Button 
                  size="lg" 
                  className="gap-2 min-w-[200px]"
                  data-testid="button-browse-kits"
                >
                  Browse Kits
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              
              <Link href="/login">
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="min-w-[200px]"
                  data-testid="button-artist-login"
                >
                  Artist Login
                </Button>
              </Link>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-16">
              <div className="p-6 rounded-lg bg-card border">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-md bg-primary/10">
                    <Zap className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg">Automate</h3>
                </div>
                <p className="text-muted-foreground text-sm">
                  Powerful automation tools that work while you focus on creating
                </p>
              </div>

              <div className="p-6 rounded-lg bg-card border">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-md bg-primary/10">
                    <Sparkles className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg">Create</h3>
                </div>
                <p className="text-muted-foreground text-sm">
                  AI-powered kits to supercharge your creative workflow
                </p>
              </div>

              <div className="p-6 rounded-lg bg-card border">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-md bg-primary/10">
                    <TrendingUp className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg">Grow</h3>
                </div>
                <p className="text-muted-foreground text-sm">
                  Scale your business with intelligent automation solutions
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
