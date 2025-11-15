import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles,
  Lock,
  Palette,
  DollarSign,
  TrendingUp,
  Users,
  ShoppingBag,
  Zap,
  CheckCircle2,
  Mail,
  ArrowRight,
  Globe
} from "lucide-react";

const passwordSchema = z.object({
  password: z.string().min(1, "Password required"),
});

const waitlistSchema = z.object({
  email: z.string().email("Valid email required"),
  name: z.string().min(2, "Name required"),
  interest: z.enum(["customer", "artist", "both"]),
});

type WaitlistFormData = z.infer<typeof waitlistSchema>;

export default function ComingSoon() {
  const { toast } = useToast();

  // Check unlock status on mount
  const { data: unlockStatus, isLoading } = useQuery<{ unlocked: boolean }>({
    queryKey: ["/api/coming-soon/status"],
  });
  
  const isUnlocked = unlockStatus?.unlocked || false;

  const passwordForm = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "" },
  });

  const waitlistForm = useForm<WaitlistFormData>({
    resolver: zodResolver(waitlistSchema),
    defaultValues: {
      email: "",
      name: "",
      interest: "both",
    },
  });

  // Unlock mutation
  const unlockMutation = useMutation({
    mutationFn: async (password: string) => {
      return await apiRequest("POST", "/api/coming-soon/unlock", { password });
    },
    onSuccess: () => {
      toast({
        title: "Welcome!",
        description: "Get ready for something amazing...",
      });
      // Force refetch unlock status
      window.location.reload();
    },
    onError: () => {
      toast({
        title: "Access Denied",
        description: "Invalid password. Contact us for tester access.",
        variant: "destructive",
      });
    },
  });

  // Waitlist mutation
  const waitlistMutation = useMutation({
    mutationFn: async (data: WaitlistFormData) => {
      return await apiRequest("POST", "/api/waitlist", data);
    },
    onSuccess: () => {
      toast({
        title: "You're on the list!",
        description: "We'll notify you when we launch. Get ready to create!",
      });
      waitlistForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Oops!",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handlePasswordSubmit = async (data: z.infer<typeof passwordSchema>) => {
    unlockMutation.mutate(data.password);
  };

  const handleWaitlistSubmit = async (data: WaitlistFormData) => {
    waitlistMutation.mutate(data);
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center">
        <Sparkles className="h-12 w-12 text-primary animate-pulse" />
      </div>
    );
  }

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <Card className="w-full max-w-md border-primary/20 shadow-2xl">
          <CardHeader className="text-center space-y-2">
            <div className="flex justify-center mb-4">
              <div className="relative">
                <Sparkles className="h-16 w-16 text-primary animate-pulse" />
                <Lock className="h-6 w-6 absolute -bottom-1 -right-1 text-primary bg-background rounded-full p-1" />
              </div>
            </div>
            <CardTitle className="text-3xl font-bold">247 Print Network</CardTitle>
            <CardDescription className="text-base">
              We're crafting something incredible. Artists + customers + automation = magic.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...passwordForm}>
              <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)} className="space-y-4">
                <FormField
                  control={passwordForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Enter Tester Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Password for invited testers"
                          {...field}
                          data-testid="input-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button 
                  type="submit" 
                  className="w-full" 
                  data-testid="button-unlock"
                  disabled={unlockMutation.isPending}
                >
                  {unlockMutation.isPending ? "Unlocking..." : "Unlock Preview"}
                </Button>
              </form>
            </Form>
            <p className="text-center text-sm text-muted-foreground mt-6">
              Invited tester? Enter your password above.
              <br />
              <span className="text-xs">Not a tester yet? Join the waitlist inside!</span>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const customerBenefits = [
    { icon: Palette, text: "Discover exclusive artwork from talented artists" },
    { icon: ShoppingBag, text: "Premium quality prints shipped to your door" },
    { icon: CheckCircle2, text: "Support independent creators directly" },
    { icon: Globe, text: "Unique pieces you won't find anywhere else" },
  ];

  const artistBenefits = [
    { icon: DollarSign, text: "Earn 30-45% royalties on every sale" },
    { icon: Zap, text: "Zero upfront costs - we handle everything" },
    { icon: TrendingUp, text: "Turn your creativity into passive income" },
    { icon: Users, text: "Build your brand with our marketing support" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-accent/5">
        <div className="absolute inset-0 bg-grid-primary/5 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]" />
        <div className="container mx-auto px-4 py-24 md:py-32 relative">
          <div className="text-center space-y-8 max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-primary/10 rounded-full px-6 py-2 border border-primary/20">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">Coming Soon - Something Amazing</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-tight">
              Where Artists Build
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
                Profitable Empires
              </span>
            </h1>
            
            <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
              The artist-powered marketplace that turns creativity into income.
              Zero inventory. Automated fulfillment. Maximum earnings.
            </p>

            <div className="flex flex-wrap justify-center gap-4 pt-4">
              <Badge value="30-45%" label="Artist Royalties" />
              <Badge value="$0" label="Upfront Costs" />
              <Badge value="24/7" label="Automated Sales" />
              <Badge value="∞" label="Income Potential" />
            </div>
          </div>
        </div>
      </section>

      {/* Dual Value Props */}
      <section className="container mx-auto px-4 py-20">
        <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {/* For Customers */}
          <Card className="hover-elevate transition-all duration-300 border-primary/20">
            <CardHeader>
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <ShoppingBag className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-2xl">For Art Lovers</CardTitle>
              <CardDescription>Discover unique pieces that tell a story</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {customerBenefits.map((benefit, index) => (
                <div key={index} className="flex items-start gap-3">
                  <benefit.icon className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">{benefit.text}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* For Artists */}
          <Card className="hover-elevate transition-all duration-300 border-accent/20 bg-accent/5">
            <CardHeader>
              <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
                <Palette className="h-6 w-6 text-accent" />
              </div>
              <CardTitle className="text-2xl">For Artists</CardTitle>
              <CardDescription>Your creativity, our automation, your profit</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {artistBenefits.map((benefit, index) => (
                <div key={index} className="flex items-start gap-3">
                  <benefit.icon className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">{benefit.text}</p>
                </div>
              ))}
              <div className="pt-4 border-t">
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Zap className="h-4 w-4 text-accent" />
                  Perfect for your creative side hustle
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Platform Highlights */}
      <section className="bg-muted/30 py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Simple for you. Automated for us. Profitable for everyone.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6 max-w-6xl mx-auto">
            <StepCard number="1" title="Apply" description="Artists submit portfolio for quality review" />
            <StepCard number="2" title="Upload" description="Share your art meeting our print standards" />
            <StepCard number="3" title="We Create" description="Auto-generated products via Printify" />
            <StepCard number="4" title="Get Paid" description="Automated royalties via Stripe Connect" />
          </div>
        </div>
      </section>

      {/* Waitlist CTA */}
      <section className="container mx-auto px-4 py-20">
        <Card className="max-w-2xl mx-auto border-primary/20 shadow-xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="h-8 w-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-3xl">Join the Waitlist</CardTitle>
            <CardDescription className="text-base">
              Be the first to know when we launch. Limited spots available.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...waitlistForm}>
              <form onSubmit={waitlistForm.handleSubmit(handleWaitlistSubmit)} className="space-y-4">
                <FormField
                  control={waitlistForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Jane Doe" {...field} data-testid="input-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={waitlistForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="jane@example.com" {...field} data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={waitlistForm.control}
                  name="interest"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>I'm interested as a...</FormLabel>
                      <FormControl>
                        <div className="flex gap-3">
                          <Button
                            type="button"
                            variant={field.value === "customer" ? "default" : "outline"}
                            onClick={() => field.onChange("customer")}
                            className="flex-1"
                            data-testid="button-customer"
                          >
                            Customer
                          </Button>
                          <Button
                            type="button"
                            variant={field.value === "artist" ? "default" : "outline"}
                            onClick={() => field.onChange("artist")}
                            className="flex-1"
                            data-testid="button-artist"
                          >
                            Artist
                          </Button>
                          <Button
                            type="button"
                            variant={field.value === "both" ? "default" : "outline"}
                            onClick={() => field.onChange("both")}
                            className="flex-1"
                            data-testid="button-both"
                          >
                            Both
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={waitlistMutation.isPending}
                  data-testid="button-join-waitlist"
                >
                  {waitlistMutation.isPending ? "Joining..." : "Join the Waitlist"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t py-12 bg-muted/30">
        <div className="container mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl">247 Print Network</span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Empowering artists to build profitable empires through automated print-on-demand
          </p>
          <p className="text-xs text-muted-foreground">
            © 2025 3six9 Media Masters LLC. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

function Badge({ value, label }: { value: string; label: string }) {
  return (
    <div className="inline-flex flex-col items-center px-6 py-3 bg-card rounded-lg border">
      <div className="text-2xl font-bold text-primary">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function StepCard({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <Card className="text-center hover-elevate transition-all duration-300">
      <CardHeader>
        <div className="h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold mx-auto mb-4">
          {number}
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
