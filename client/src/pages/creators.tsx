import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Palette, ExternalLink, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Artist = {
  id: string;
  name: string;
  bio: string | null;
  royaltyTier: string | null;
  totalSales: number;
  shopifyCollectionHandle: string | null;
};

export default function Creators() {
  const { data: artists, isLoading } = useQuery<Artist[]>({
    queryKey: ["/api/artists"],
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Premium Hero Section */}
      <section className="premium-gradient-bg">
        <div className="premium-hero">
          <div className="max-w-4xl mx-auto">
            <span className="premium-eyebrow" data-testid="text-eyebrow">
              Meet the Creators
            </span>
            
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6" data-testid="text-main-heading">
              <span className="premium-text-gradient">Featured Artists</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-muted-foreground mb-8 leading-relaxed" data-testid="text-subtitle">
              Discover talented creators from around the world bringing unique visions to life through premium art
            </p>
            
            {!isLoading && artists && artists.length > 0 && (
              <div className="flex items-center justify-center gap-8 text-sm text-muted-foreground">
                <div data-testid="stat-total-artists">
                  <span className="text-3xl font-bold text-foreground block">{artists.length}</span>
                  <span>Featured Artists</span>
                </div>
                <div className="w-px h-12 bg-border"></div>
                <div data-testid="stat-total-sales">
                  <span className="text-3xl font-bold text-foreground block">
                    {artists.reduce((sum, a) => sum + a.totalSales, 0)}
                  </span>
                  <span>Total Sales</span>
                </div>
                <div className="w-px h-12 bg-border"></div>
                <div data-testid="stat-premium-quality">
                  <span className="text-3xl font-bold text-foreground block">100%</span>
                  <span>Premium Quality</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Artist Grid */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="premium-card" data-testid={`skeleton-artist-${i}`}>
                <Skeleton className="w-full aspect-[4/3]" />
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Skeleton className="w-12 h-12 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-5 w-3/4 mb-2" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  </div>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              </div>
            ))}
          </div>
        ) : artists && artists.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {artists.map((artist, index) => (
              <Link
                key={artist.id}
                href={`/artists/${artist.id}`}
                className="group"
                data-testid={`card-artist-${artist.id}`}
              >
                <div className="premium-card subtle-float" style={{ animationDelay: `${index * 0.1}s` }}>
                  {/* Artist Artwork Preview */}
                  <div className="relative aspect-[4/3] bg-gradient-to-br from-primary/20 to-primary/5 overflow-hidden">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Palette className="w-16 h-16 text-primary/40" />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <div className="absolute bottom-4 left-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <Button 
                        variant="default" 
                        size="sm" 
                        className="w-full premium-pill-button"
                        data-testid={`button-view-profile-${artist.id}`}
                      >
                        View Profile
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </div>

                  {/* Artist Info */}
                  <div className="p-6">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center flex-shrink-0">
                        <span className="text-lg font-bold text-primary-foreground">
                          {artist.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 
                          className="text-xl font-bold mb-1 group-hover:text-primary transition-colors truncate"
                          data-testid={`text-artist-name-${artist.id}`}
                        >
                          {artist.name}
                        </h3>
                        {artist.royaltyTier && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 rounded-full text-xs font-semibold text-primary capitalize">
                            {artist.royaltyTier.replace('_', ' ')} Tier
                          </div>
                        )}
                      </div>
                    </div>

                    {artist.bio && (
                      <p 
                        className="text-sm text-muted-foreground line-clamp-2 mb-4"
                        data-testid={`text-bio-${artist.id}`}
                      >
                        {artist.bio}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-4 border-t border-border/50">
                      <div className="text-sm">
                        <span className="text-2xl font-bold text-foreground">{artist.totalSales}</span>
                        <span className="text-muted-foreground ml-1.5">sales</span>
                      </div>
                      {artist.shopifyCollectionHandle && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Shop Collection</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-24">
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <Palette className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-2xl font-bold mb-2">No Artists Yet</h3>
            <p className="text-lg text-muted-foreground mb-8">Check back soon for featured creators</p>
          </div>
        )}
      </section>

      {/* CTA Section */}
      {artists && artists.length > 0 && (
        <section className="border-t">
          <div className="max-w-4xl mx-auto px-6 py-16 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to Join Our Creative Community?
            </h2>
            <p className="text-xl text-muted-foreground mb-8">
              Start earning 30-45% royalties on every sale of your artwork
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                variant="default" 
                size="lg" 
                className="premium-pill-button"
                asChild
                data-testid="button-become-artist"
              >
                <Link href="/register">
                  Become an Artist
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Link>
              </Button>
              <Button 
                variant="outline" 
                size="lg" 
                className="premium-pill-button"
                asChild
                data-testid="button-learn-more"
              >
                <Link href="/join">
                  Learn More
                </Link>
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
