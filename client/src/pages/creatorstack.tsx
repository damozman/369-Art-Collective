import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { 
  Sparkles, 
  Zap, 
  Clock, 
  TrendingUp, 
  Users, 
  ArrowRight,
  CheckCircle2,
  Rocket,
  Mail,
  Image as ImageIcon,
  FileText,
  Star,
  Wand2
} from "lucide-react";

export default function CreatorStack() {
  const [, setLocation] = useLocation();

  const kits = [
    {
      id: "social-media-blitz",
      name: "Social Media Blitz",
      price: "$47",
      tagline: "30 Days of Content in 5 Minutes",
      description: "Stop staring at blank screens. Get 50 Canva templates + AI-powered caption generator. Create a month of scroll-stopping posts in one sitting.",
      icon: ImageIcon,
      color: "from-blue-500 to-purple-600",
      features: [
        "50 Professional Canva Templates",
        "AI Caption Generator (GPT-4o)",
        "Hashtag Research Guide",
        "Posting Schedule Template",
        "Platform-Specific Sizing"
      ],
      results: "Save 10 hours/week, 2x your engagement",
      shopifyUrl: "#" // TODO: Add actual Shopify product URL
    },
    {
      id: "email-launch-rocket",
      name: "Email Launch Rocket",
      price: "$47",
      tagline: "Launch Your Email List in Hours",
      description: "Build an email funnel that converts. Pre-written Beehiiv sequences + AI copywriting prompts. From welcome to sale in under 48 hours.",
      icon: Mail,
      color: "from-purple-500 to-pink-600",
      features: [
        "7 Pre-Written Email Sequences",
        "AI Subject Line Generator",
        "Conversion-Tested Templates",
        "Beehiiv Setup Guide",
        "Segmentation Strategy"
      ],
      results: "Launch in 2 days, 25% open rates",
      shopifyUrl: "#" // TODO: Add actual Shopify product URL
    }
  ];

  const benefits = [
    {
      icon: Clock,
      title: "Save 10+ Hours Weekly",
      description: "Automate the busywork. Spend time creating, not copy-pasting."
    },
    {
      icon: Zap,
      title: "Instant Implementation",
      description: "Download, customize, deploy. No learning curve, no setup hell."
    },
    {
      icon: TrendingUp,
      title: "Proven to Convert",
      description: "Tested templates and frameworks that actually drive results."
    },
    {
      icon: Wand2,
      title: "AI-Powered Tools",
      description: "GPT-4o generates captions, headlines, and copy on demand."
    }
  ];

  const testimonials = [
    {
      name: "Sarah M.",
      role: "Etsy Shop Owner",
      quote: "I went from posting once a week to daily. Sales up 40% in a month.",
      rating: 5
    },
    {
      name: "Marcus T.",
      role: "Fitness Coach",
      quote: "The email kit built my list from 0 to 500 in 3 weeks. Game changer.",
      rating: 5
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setLocation("/")}>
            <Sparkles className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl font-serif">247 CreatorStack</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" onClick={() => setLocation("/creatorstack/login")} data-testid="button-login">
              Sign In
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 md:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-purple-500/10 to-background" />
        <div className="container mx-auto px-4 relative">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <Badge className="mb-4" variant="secondary" data-testid="badge-new">
              <Rocket className="h-3 w-3 mr-1" />
              AI-Powered Kits for Busy Creators
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold font-serif leading-tight">
              Automate. Create.
              <br />
              <span className="text-primary">Grow.</span>
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto">
              Stop drowning in content creation. Our AI-powered kits give you templates, prompts, and automation 
              to build your audience faster—without burning out.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
              <Button 
                size="lg" 
                onClick={() => document.getElementById('kits')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-lg px-8"
                data-testid="button-browse-kits"
              >
                Browse Kits
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={() => setLocation("/creatorstack/login")}
                data-testid="button-access-dashboard"
              >
                Access Your Kits
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold font-serif mb-4">
              Why Solopreneurs Love CreatorStack
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Built for bloggers, coaches, and Etsy sellers who need results—fast
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {benefits.map((benefit, index) => {
              const Icon = benefit.icon;
              return (
                <Card key={index} className="hover-elevate active-elevate-2 transition-all" data-testid={`benefit-${index}`}>
                  <CardContent className="pt-6 text-center">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-bold text-lg mb-2">{benefit.title}</h3>
                    <p className="text-sm text-muted-foreground">{benefit.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Kits Section */}
      <section id="kits" className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold font-serif mb-4">
              Ready-to-Use AI Kits
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              One-time purchase. Lifetime access. Instant download.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
            {kits.map((kit, index) => {
              const Icon = kit.icon;
              return (
                <Card key={index} className="relative overflow-hidden hover-elevate active-elevate-2 transition-all" data-testid={`kit-${kit.id}`}>
                  <div className={`absolute top-0 left-0 right-0 h-2 bg-gradient-to-r ${kit.color}`} />
                  <CardContent className="pt-8 pb-6">
                    <div className="flex items-start gap-4 mb-6">
                      <div className={`flex-shrink-0 w-16 h-16 rounded-lg bg-gradient-to-br ${kit.color} flex items-center justify-center`}>
                        <Icon className="h-8 w-8 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-2xl mb-1">{kit.name}</h3>
                        <p className="text-sm text-muted-foreground">{kit.tagline}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-primary">{kit.price}</div>
                        <div className="text-xs text-muted-foreground">one-time</div>
                      </div>
                    </div>

                    <p className="text-muted-foreground mb-6">{kit.description}</p>

                    <div className="space-y-3 mb-6">
                      {kit.features.map((feature, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                          <span className="text-sm">{feature}</span>
                        </div>
                      ))}
                    </div>

                    <div className="bg-primary/5 rounded-lg p-4 mb-6">
                      <p className="text-sm font-medium">
                        <TrendingUp className="h-4 w-4 inline mr-2 text-primary" />
                        {kit.results}
                      </p>
                    </div>

                    <Button 
                      size="lg" 
                      className="w-full"
                      onClick={() => window.open(kit.shopifyUrl, '_blank')}
                      data-testid={`button-buy-${kit.id}`}
                    >
                      Get Instant Access
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold font-serif mb-4">
              Real Results from Real Creators
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="hover-elevate active-elevate-2" data-testid={`testimonial-${index}`}>
                <CardContent className="pt-6">
                  <div className="flex gap-1 mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="h-5 w-5 fill-primary text-primary" />
                    ))}
                  </div>
                  <p className="text-lg mb-4 italic">"{testimonial.quote}"</p>
                  <div>
                    <div className="font-bold">{testimonial.name}</div>
                    <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-primary/10 via-purple-500/5 to-background">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h2 className="text-3xl md:text-5xl font-bold font-serif">
              Ready to Stop Drowning in Content?
            </h2>
            <p className="text-xl text-muted-foreground">
              Join hundreds of creators who automated their way to growth. 
              One purchase, lifetime access, instant results.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
              <Button 
                size="lg" 
                onClick={() => document.getElementById('kits')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-lg px-8"
                data-testid="button-get-started"
              >
                Get Your First Kit
                <ArrowRight className="ml-2 h-5 w-5" />
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
              <span className="font-bold font-serif">247 CreatorStack</span>
              <span className="text-sm text-muted-foreground">by 369 Media Masters</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <button onClick={() => setLocation("/")} className="hover:text-foreground transition-colors">
                Print Network
              </button>
              <button onClick={() => setLocation("/creatorstack/login")} className="hover:text-foreground transition-colors">
                Sign In
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
