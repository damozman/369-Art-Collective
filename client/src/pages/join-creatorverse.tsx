import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { 
  Palette, 
  TrendingUp, 
  Globe, 
  Zap, 
  DollarSign, 
  Users, 
  Rocket,
  ShoppingBag,
  Award,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Target,
  BarChart3,
  Shield
} from "lucide-react";

export default function JoinCreatorverse() {
  const [, setLocation] = useLocation();

  const royaltyTiers = [
    {
      name: "Starter",
      rate: "30%",
      sales: "$0 - $999",
      description: "Perfect for getting started",
      color: "from-slate-500 to-slate-600"
    },
    {
      name: "Rising Star",
      rate: "35%",
      sales: "$1K - $4.9K",
      description: "Building momentum",
      color: "from-blue-500 to-blue-600"
    },
    {
      name: "Established",
      rate: "40%",
      sales: "$5K - $9.9K",
      description: "Consistent performer",
      color: "from-purple-500 to-purple-600"
    },
    {
      name: "Elite",
      rate: "45%",
      sales: "$10K+",
      description: "Top of the network",
      color: "from-primary to-purple-600"
    }
  ];

  const benefits = [
    {
      icon: DollarSign,
      title: "Tiered Royalties Up to 45%",
      description: "Start at 30% and earn more as you sell. The more successful you are, the more you keep."
    },
    {
      icon: Zap,
      title: "Automated Product Creation",
      description: "Upload your art and we automatically create products. No manual work, no technical skills needed."
    },
    {
      icon: Globe,
      title: "Global Distribution",
      description: "Your art reaches customers worldwide through our print-on-demand network."
    },
    {
      icon: Users,
      title: "Referral & Recruitment Bonuses",
      description: "Earn +5% on referred sales and 5% of recruited artists' royalties. Build your empire."
    },
    {
      icon: Shield,
      title: "Zero Risk, Zero Inventory",
      description: "No upfront costs, no storage fees, no unsold inventory. Pure passive income."
    },
    {
      icon: BarChart3,
      title: "Real-Time Analytics",
      description: "Track sales, earnings, and performance with detailed dashboards and insights."
    }
  ];

  const howItWorks = [
    {
      step: "1",
      title: "Apply & Get Approved",
      description: "Create your artist account and submit your portfolio. We review applications to maintain network quality.",
      icon: Award
    },
    {
      step: "2",
      title: "Upload Your Artwork",
      description: "Submit high-quality designs (150+ DPI for prints). Our admin team reviews and approves your work.",
      icon: Palette
    },
    {
      step: "3",
      title: "We Handle Everything",
      description: "Approved art becomes products automatically. We manage printing, shipping, and customer service.",
      icon: Rocket
    },
    {
      step: "4",
      title: "Get Paid Automatically",
      description: "Earn royalties on every sale. Request payouts via Stripe Connect whenever you're ready.",
      icon: TrendingUp
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setLocation("/")}>
            <Sparkles className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl font-serif">247 Print Network</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" onClick={() => setLocation("/login")} data-testid="button-login">
              Sign In
            </Button>
            <Button onClick={() => setLocation("/register")} data-testid="button-register">
              Get Started
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 md:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-purple-500/10 to-background" />
        <div className="container mx-auto px-4 relative">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <Badge className="mb-4" variant="secondary" data-testid="badge-status">
              <Rocket className="h-3 w-3 mr-1" />
              Applications Open Now
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold font-serif leading-tight">
              Join the
              <br />
              <span className="text-primary">Creatorverse</span>
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto">
              Turn your art into a sustainable income stream. No inventory, no shipping, no hassle. 
              Just upload your designs and earn royalties on every sale—forever.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
              <Button 
                size="lg" 
                onClick={() => setLocation("/register")}
                className="text-lg px-8"
                data-testid="button-start-application"
              >
                Start Your Application
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={() => setLocation("/login")}
                data-testid="button-artist-login"
              >
                Already a Member?
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Royalty Tiers */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold font-serif mb-4">
              Royalty Tiers That Reward Success
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Start at 30% and unlock higher rates as your monthly sales grow. Your success drives your earnings.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {royaltyTiers.map((tier, index) => (
              <Card 
                key={index} 
                className="relative overflow-hidden hover-elevate active-elevate-2 transition-all"
                data-testid={`tier-${tier.name.toLowerCase().replace(' ', '-')}`}
              >
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${tier.color}`} />
                <CardContent className="pt-8 pb-6">
                  <div className="text-center space-y-3">
                    <h3 className="font-bold text-xl">{tier.name}</h3>
                    <div className="text-4xl font-bold text-primary">{tier.rate}</div>
                    <div className="text-sm text-muted-foreground">{tier.sales}</div>
                    <p className="text-sm text-muted-foreground pt-2">{tier.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold font-serif mb-4">
              Why Artists Love 247
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Everything you need to turn your creativity into a thriving business
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {benefits.map((benefit, index) => {
              const Icon = benefit.icon;
              return (
                <Card key={index} className="hover-elevate active-elevate-2 transition-all" data-testid={`benefit-${index}`}>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-bold text-lg mb-2">{benefit.title}</h3>
                        <p className="text-sm text-muted-foreground">{benefit.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold font-serif mb-4">
              How It Works
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From application to earning, we've made the process simple and transparent
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
            {howItWorks.map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={index} className="text-center space-y-4" data-testid={`step-${index + 1}`}>
                  <div className="relative inline-flex items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <Icon className="h-8 w-8 text-primary" />
                    </div>
                    <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                      {item.step}
                    </div>
                  </div>
                  <h3 className="font-bold text-xl">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-primary/10 via-purple-500/5 to-background">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h2 className="text-3xl md:text-5xl font-bold font-serif">
              Ready to Build Your Creative Empire?
            </h2>
            <p className="text-xl text-muted-foreground">
              Join hundreds of artists already earning passive income through the 247 Print Network. 
              Your art deserves to be seen—and paid for.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
              <Button 
                size="lg" 
                onClick={() => setLocation("/register")}
                className="text-lg px-8"
                data-testid="button-join-now"
              >
                Join Now
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={() => setLocation("/creators")}
                data-testid="button-meet-artists"
              >
                Meet Our Artists
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-bold font-serif">247 Print Network</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <button onClick={() => setLocation("/")} className="hover:text-foreground transition-colors">
                Home
              </button>
              <button onClick={() => setLocation("/creators")} className="hover:text-foreground transition-colors">
                Creators
              </button>
              <button onClick={() => setLocation("/login")} className="hover:text-foreground transition-colors">
                Sign In
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
