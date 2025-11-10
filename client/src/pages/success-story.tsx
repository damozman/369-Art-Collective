import { useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { SiFacebook, SiX, SiLinkedin } from "react-icons/si";
import type { Testimonial } from "@shared/schema";

export default function SuccessStory() {
  const [, params] = useRoute("/success-stories/:slug");
  const [, setLocation] = useLocation();
  const slug = params?.slug;

  const { data: testimonial, isLoading, error } = useQuery<Testimonial>({
    queryKey: [`/api/testimonials/${slug}`],
    enabled: !!slug,
  });

  useEffect(() => {
    if (testimonial) {
      document.title = `${testimonial.title} - ${testimonial.artistName} | 247 Print Network`;
      
      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription) {
        metaDescription.setAttribute("content", testimonial.shareExcerpt || testimonial.quote.substring(0, 155));
      }
      
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) {
        ogTitle.setAttribute("content", `${testimonial.title} - ${testimonial.artistName}`);
      }
      
      const ogDescription = document.querySelector('meta[property="og:description"]');
      if (ogDescription) {
        ogDescription.setAttribute("content", testimonial.shareExcerpt || testimonial.quote.substring(0, 155));
      }
      
      const ogUrl = document.querySelector('meta[property="og:url"]');
      if (ogUrl) {
        ogUrl.setAttribute("content", window.location.href);
      }
      
      if (testimonial.shareImageUrl) {
        const ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage) {
          ogImage.setAttribute("content", testimonial.shareImageUrl);
        }
      }
    }
  }, [testimonial]);

  const handleSocialShare = (platform: "facebook" | "twitter" | "linkedin") => {
    if (!testimonial) return;
    
    const url = window.location.href;
    const text = `${testimonial.title} - ${testimonial.artistName} | 247 Print Network`;
    
    let shareUrl = "";
    switch (platform) {
      case "facebook":
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
        break;
      case "twitter":
        shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
        break;
      case "linkedin":
        shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
        break;
    }
    
    window.open(shareUrl, "_blank", "width=600,height=400");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <Button variant="ghost" onClick={() => setLocation("/")} data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <Skeleton className="h-8 w-3/4 mb-4" />
          <Skeleton className="h-6 w-1/2 mb-8" />
          <Skeleton className="h-64 w-full mb-8" />
          <Skeleton className="h-32 w-full" />
        </main>
      </div>
    );
  }

  if (error || !testimonial) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md mx-4">
          <CardContent className="p-8 text-center">
            <h1 className="text-2xl font-bold mb-4">Success Story Not Found</h1>
            <p className="text-muted-foreground mb-6">
              The success story you're looking for doesn't exist or has been removed.
            </p>
            <Button onClick={() => setLocation("/")} data-testid="button-home">
              Return to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Button variant="ghost" onClick={() => setLocation("/")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {testimonial.featured && <Badge variant="default">Featured Story</Badge>}
            <Badge variant="outline">{testimonial.artistName}</Badge>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold" data-testid="text-title">
            {testimonial.title}
          </h1>
          
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span data-testid="text-earnings">${testimonial.earningsUsd} earned</span>
            <span>•</span>
            <span data-testid="text-products">{testimonial.productsCount} products</span>
          </div>
        </div>

        {testimonial.videoUrl ? (
          <Card>
            <CardContent className="p-0">
              {testimonial.videoProvider === "youtube" && (
                <div className="aspect-video w-full">
                  <iframe
                    src={testimonial.videoUrl.replace("watch?v=", "embed/")}
                    className="w-full h-full rounded-lg"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    data-testid="video-player"
                  />
                </div>
              )}
              {testimonial.videoProvider === "vimeo" && (
                <div className="aspect-video w-full">
                  <iframe
                    src={testimonial.videoUrl}
                    className="w-full h-full rounded-lg"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                    data-testid="video-player"
                  />
                </div>
              )}
              {testimonial.videoProvider === "direct" && testimonial.localVideoPath && (
                <video
                  src={testimonial.localVideoPath}
                  controls
                  className="w-full rounded-lg"
                  data-testid="video-player"
                />
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-muted/50">
            <CardContent className="p-16 text-center">
              <div className="aspect-video flex items-center justify-center">
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                    <ExternalLink className="w-8 h-8 text-primary" />
                  </div>
                  <p className="text-muted-foreground">Video testimonial coming soon</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-8">
            <blockquote className="text-lg leading-relaxed border-l-4 border-primary pl-6 italic" data-testid="text-quote">
              "{testimonial.quote}"
            </blockquote>
            <p className="text-right mt-4 font-semibold">— {testimonial.artistName}</p>
          </CardContent>
        </Card>

        <div className="pt-8 border-t">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold mb-1">Share this success story</h2>
              <p className="text-sm text-muted-foreground">Inspire others with {testimonial.artistName}'s journey</p>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleSocialShare("facebook")}
                data-testid="button-share-facebook"
              >
                <SiFacebook className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleSocialShare("twitter")}
                data-testid="button-share-twitter"
              >
                <SiX className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleSocialShare("linkedin")}
                data-testid="button-share-linkedin"
              >
                <SiLinkedin className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <Card className="bg-gradient-to-r from-primary/10 via-primary/5 to-background border-primary/20">
          <CardContent className="p-8 text-center space-y-4">
            <h2 className="text-2xl font-bold">Ready to Start Your Success Story?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Join {testimonial.artistName} and hundreds of other artists earning passive income through our print-on-demand marketplace.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => setLocation("/register")} data-testid="button-join-now">
                Join as Artist
              </Button>
              <Button variant="outline" onClick={() => setLocation("/")} data-testid="button-learn-more">
                Learn More
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
