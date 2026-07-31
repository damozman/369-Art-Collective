import { useLocation, Link } from "wouter";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  Menu,
  X
} from "lucide-react";
import type { Testimonial } from "@shared/schema";

type FeaturedTestimonial = Testimonial & {
  artistName: string;
};

export default function Home() {
  const [, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const { data: featuredTestimonials = [], isLoading: featuredLoading } = useQuery<FeaturedTestimonial[]>({
    queryKey: ["/api/featured-testimonials"],
  });
  
  const testimonials = featuredTestimonials.slice(0, 7);

  const navLinks: Array<{ name: string; href: string; isRoute?: boolean }> = [
    { name: "How It Works", href: "#how-it-works" },
    { name: "Apply as Artist", href: "/join", isRoute: true },
    { name: "Success Stories", href: "#testimonials" },
    { name: "Shop Art", href: "https://bvhpq0-hy.myshopify.com" },
  ];

  const features = [
    {
      icon: Palette,
      title: "Your Art, Your Empire",
      description: "Upload your designs and we handle everything else. No inventory, no shipping, no hassle."
    },
    {
      icon: TrendingUp,
      title: "Tiered Royalties Up to 45%",
      description: "Earn 30-45% on every sale. The more you sell, the more you earn. Your success is our success."
    },
    {
      icon: Globe,
      title: "Global Print Network",
      description: "Automatic product creation on premium POD platforms. Your art reaches customers worldwide."
    },
    {
      icon: Zap,
      title: "Automated Everything",
      description: "From product creation to fulfillment to payouts. Focus on creating, we handle the business."
    },
    {
      icon: Users,
      title: "Referral Bonuses",
      description: "Earn +5% on referred sales and 5% of recruited artists' royalties. Build your creative empire."
    },
    {
      icon: ShoppingBag,
      title: "Zero Inventory Risk",
      description: "Print-on-demand model means no upfront costs, no storage fees, no unsold inventory."
    }
  ];

  const stats = [
    { value: "30-45%", label: "Artist Royalties" },
    { value: "100+", label: "Product Types" },
    { value: "24/7", label: "Automated Sales" },
    { value: "$0", label: "Upfront Costs" }
  ];

  const howItWorks = [
    {
      step: "1",
      title: "Apply & Get Approved",
      description: "Submit your portfolio. We're building a network of quality artists who share our vision."
    },
    {
      step: "2",
      title: "Upload Your Art",
      description: "Submit your designs meeting our print quality standards (150+ DPI for professional results)."
    },
    {
      step: "3",
      title: "We Create Products",
      description: "Your approved art automatically becomes products on our marketplace via Printify integration."
    },
    {
      step: "4",
      title: "Earn Automatically",
      description: "Get paid via Stripe Connect. Track earnings, manage payouts, and watch your empire grow."
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation - Modern Clean Design */}
      <header className="border-b sticky top-0 bg-background backdrop-blur-sm z-50 shadow-sm">
        <div className="container mx-auto px-4 md:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="h-7 w-7 text-primary" data-testid="icon-logo" />
            <span className="font-bold text-2xl md:text-3xl tracking-tight">369 Art Collective</span>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => 
              link.isRoute ? (
                <Link
                  key={link.name}
                  href={link.href}
                  className="text-base font-medium text-foreground hover:text-primary transition-colors"
                  data-testid={`link-nav-${link.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {link.name}
                </Link>
              ) : (
                <a
                  key={link.name}
                  href={link.href}
                  className="text-base font-medium text-foreground hover:text-primary transition-colors"
                  data-testid={`link-nav-${link.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {link.name}
                </a>
              )
            )}
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button 
              variant="ghost" 
              onClick={() => setLocation("/login")} 
              data-testid="button-login"
              className="hidden sm:flex"
              size="lg"
            >
              Sign In
            </Button>
            <Button 
              onClick={() => setLocation("/register")} 
              data-testid="button-get-started"
              size="lg"
              className="hidden sm:flex"
            >
              Get Started
            </Button>

            {/* Mobile Menu Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="button-mobile-menu"
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t bg-background">
            <nav className="container mx-auto px-4 py-4 flex flex-col gap-2">
              {navLinks.map((link) => 
                link.isRoute ? (
                  <Link
                    key={link.name}
                    href={link.href}
                    className="text-lg font-medium text-foreground hover:text-primary transition-colors py-3 px-4 rounded-md hover:bg-accent"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid={`link-mobile-${link.name.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {link.name}
                  </Link>
                ) : (
                  <a
                    key={link.name}
                    href={link.href}
                    className="text-lg font-medium text-foreground hover:text-primary transition-colors py-3 px-4 rounded-md hover:bg-accent"
                    onClick={() => setMobileMenuOpen(false)}
                    data-testid={`link-mobile-${link.name.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {link.name}
                  </a>
                )
              )}
              <div className="flex flex-col gap-2 pt-4 border-t mt-2">
                <Button 
                  variant="ghost" 
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setLocation("/login");
                  }} 
                  data-testid="button-mobile-login"
                  size="lg"
                  className="w-full justify-start"
                >
                  Sign In
                </Button>
                <Button 
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setLocation("/register");
                  }} 
                  data-testid="button-mobile-get-started"
                  size="lg"
                  className="w-full"
                >
                  Get Started
                </Button>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Hero Section - More Visual Impact */}
      <section className="relative py-24 md:py-40 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background" />
        <div className="container mx-auto px-4 md:px-6 relative">
          <div className="max-w-5xl mx-auto text-center space-y-8">
            <Badge className="mb-4 text-sm px-4 py-2" variant="secondary" data-testid="badge-status">
              <Rocket className="h-4 w-4 mr-2" />
              Now Accepting Artist Applications
            </Badge>
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold leading-tight tracking-tight">
              Turn Your Art Into
              <br />
              <span className="text-primary bg-clip-text">Passive Income</span>
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Join the artist-powered marketplace where your creativity becomes a sustainable business. 
              Upload once, earn forever. Zero inventory, infinite possibilities.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
              <Button 
                size="lg" 
                onClick={() => setLocation("/register")}
                className="text-lg h-14 px-8"
                data-testid="button-join-network"
              >
                Join the Network
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={() => setLocation("/login")}
                className="text-lg h-14 px-8"
                data-testid="button-artist-login"
              >
                Artist Login
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-12 border-y bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center" data-testid={`stat-${index}`}>
                <div className="text-3xl md:text-4xl font-bold text-primary">{stat.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="for-artists" className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold font-serif mb-4">
              Why Artists Choose 369 Art Collective
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Built by creators, for creators. We've removed every barrier between your art and your income.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {features.map((feature, index) => (
              <Card key={index} className="hover-elevate" data-testid={`feature-card-${index}`}>
                <CardContent className="p-6 space-y-3">
                  <div className="h-12 w-12 rounded-md bg-primary/10 flex items-center justify-center">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold font-serif mb-4">
              From Artist to Empire Builder
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Four simple steps to start earning from your creativity
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 max-w-6xl mx-auto">
            {howItWorks.map((item, index) => (
              <div key={index} className="text-center space-y-3" data-testid={`step-${index}`}>
                <div className="mx-auto h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold">
                  {item.step}
                </div>
                <h3 className="font-semibold text-lg">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Success Stories / Testimonials */}
      <section id="testimonials" className="py-20 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold font-serif mb-4">
              Artist Success Stories
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Real artists building real empires with 369 Art Collective
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {testimonials.length > 0 ? (
              testimonials.map((testimonial, index) => (
                <Card 
                  key={testimonial.id} 
                  className="overflow-hidden hover-elevate cursor-pointer" 
                  onClick={() => setLocation(`/success-stories/${testimonial.shareSlug}`)}
                  data-testid={`testimonial-card-${index}`}
                >
                  <CardContent className="p-0">
                    <div className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center relative overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="h-16 w-16 text-primary/30" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" />
                        </svg>
                      </div>
                      {testimonial.featured ? (
                        <Badge variant="default" className="absolute top-3 right-3" data-testid="badge-featured">
                          Featured
                        </Badge>
                      ) : null}
                    </div>
                    <div className="p-6 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <Award className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <div className="font-semibold">{testimonial.artistName}</div>
                          <div className="text-sm text-muted-foreground">{testimonial.title}</div>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground italic leading-relaxed line-clamp-3">
                        "{testimonial.quote}"
                      </p>
                      <div className="flex gap-4 pt-2 text-sm">
                        <div>
                          <div className="font-semibold text-primary">${testimonial.earningsUsd}</div>
                          <div className="text-muted-foreground text-xs">Earnings</div>
                        </div>
                        <div>
                          <div className="font-semibold text-primary">{testimonial.productsCount}</div>
                          <div className="text-muted-foreground text-xs">Products</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <>
                <Card className="overflow-hidden hover-elevate" data-testid="testimonial-card-0">
                  <CardContent className="p-0">
                    <div className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center relative overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="h-16 w-16 text-primary/30" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" />
                        </svg>
                      </div>
                      <Badge variant="secondary" className="absolute top-3 right-3">
                        Coming Soon
                      </Badge>
                    </div>
                    <div className="p-6 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <div className="font-semibold">Featured Artist</div>
                          <div className="text-sm text-muted-foreground">Artist Profile</div>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground italic leading-relaxed">
                        "Artist video testimonials coming soon. Share your success story and inspire the next generation of creators."
                      </p>
                      <div className="flex gap-4 pt-2 text-sm">
                        <div>
                          <div className="font-semibold text-primary">$0</div>
                          <div className="text-muted-foreground text-xs">Monthly Earnings</div>
                        </div>
                        <div>
                          <div className="font-semibold text-primary">0</div>
                          <div className="text-muted-foreground text-xs">Products</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="overflow-hidden hover-elevate" data-testid="testimonial-card-1">
                  <CardContent className="p-0">
                    <div className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center relative overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="h-16 w-16 text-primary/30" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" />
                        </svg>
                      </div>
                      <Badge variant="secondary" className="absolute top-3 right-3">
                        Coming Soon
                      </Badge>
                    </div>
                    <div className="p-6 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <div className="font-semibold">Featured Artist</div>
                          <div className="text-sm text-muted-foreground">Artist Profile</div>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground italic leading-relaxed">
                        "Your story could be featured here. Join the network and share your journey from artist to entrepreneur."
                      </p>
                      <div className="flex gap-4 pt-2 text-sm">
                        <div>
                          <div className="font-semibold text-primary">$0</div>
                          <div className="text-muted-foreground text-xs">Monthly Earnings</div>
                        </div>
                        <div>
                          <div className="font-semibold text-primary">0</div>
                          <div className="text-muted-foreground text-xs">Products</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="overflow-hidden hover-elevate" data-testid="testimonial-card-2">
                  <CardContent className="p-0">
                    <div className="aspect-video bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center relative overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="h-16 w-16 text-primary/30" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" />
                        </svg>
                      </div>
                      <Badge variant="secondary" className="absolute top-3 right-3">
                        Coming Soon
                      </Badge>
                    </div>
                    <div className="p-6 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <div className="font-semibold">Featured Artist</div>
                          <div className="text-sm text-muted-foreground">Artist Profile</div>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground italic leading-relaxed">
                        "Be part of the movement. Upload your art, earn royalties, and inspire others with your creative empire."
                      </p>
                      <div className="flex gap-4 pt-2 text-sm">
                        <div>
                          <div className="font-semibold text-primary">$0</div>
                          <div className="text-muted-foreground text-xs">Monthly Earnings</div>
                        </div>
                        <div>
                          <div className="font-semibold text-primary">0</div>
                          <div className="text-muted-foreground text-xs">Products</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Earnings Potential */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <Card className="overflow-hidden">
              <div className="p-8 md:p-12 space-y-6">
                <div className="flex items-center gap-3">
                  <DollarSign className="h-8 w-8 text-primary" />
                  <h2 className="text-3xl font-bold font-serif">Maximize Your Earnings</h2>
                </div>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-semibold">Tiered Royalty System</div>
                      <div className="text-sm text-muted-foreground">
                        30% base royalty, scaling up to 45% as your monthly sales grow
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-semibold">Referral Bonuses</div>
                      <div className="text-sm text-muted-foreground">
                        +5% on every sale from your referral links
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-semibold">Recruitment Rewards</div>
                      <div className="text-sm text-muted-foreground">
                        Earn 5% of royalties from artists you recruit to the network
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-semibold">Automated Payouts</div>
                      <div className="text-sm text-muted-foreground">
                        Direct deposits via Stripe Connect. Your money, your control.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h2 className="text-3xl md:text-4xl font-bold font-serif">
              Ready to Build Your Creative Empire?
            </h2>
            <p className="text-lg opacity-90">
              Join the network of artists turning their passion into sustainable income. 
              The future of creative commerce starts now.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button 
                size="lg" 
                variant="secondary"
                onClick={() => setLocation("/join")}
                className="text-lg"
                data-testid="button-apply-now"
              >
                <Award className="mr-2 h-5 w-5" />
                Apply as an Artist
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={() => setLocation("/login")}
                className="border-primary-foreground/20 hover:bg-primary-foreground/10"
                data-testid="button-login-footer"
              >
                Already a Member?
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-semibold font-serif">369 Art Collective</span>
            </div>
            <p className="text-sm text-muted-foreground text-center md:text-left">
              Empowering artists with automated print-on-demand commerce
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

