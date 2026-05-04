import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ExternalLink, Package } from "lucide-react";

// Public artist profile response from API
type PublicArtistProfile = {
  id: string;
  name: string;
  bio?: string | null;
  tagline?: string | null;
  royaltyTier?: string | null;
  totalSales?: number;
  shopifyCollectionHandle?: string | null;
};

// Public artwork response from API
type PublicArtwork = {
  id: string;
  title: string;
  description?: string | null;
  imageUrl: string;
  status: string;
};

export default function ArtistProfile() {
  const params = useParams();
  const artistId = params.id;

  const { data: artist, isLoading } = useQuery<PublicArtistProfile>({
    queryKey: [`/api/artists/${artistId}`],
  });

  const { data: artworks, isLoading: artworksLoading } = useQuery<PublicArtwork[]>({
    queryKey: [`/api/artists/${artistId}/artworks`],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-12">
          <Skeleton className="h-48 w-full mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <h2 className="text-2xl font-bold mb-2">Artist Not Found</h2>
            <p className="text-muted-foreground">This artist profile doesn't exist.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getTierBadgeColor = (tier?: string | null) => {
    if (!tier) return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    
    const tierColors: Record<string, string> = {
      Bronze: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      Silver: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
      Gold: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      Platinum: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    };
    
    return tierColors[tier] || tierColors.Bronze;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Premium Artist Header */}
      <section className="premium-gradient-bg border-b">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="relative">
              <Avatar className="w-32 h-32 md:w-40 md:h-40 border-4 border-background shadow-2xl">
                <AvatarFallback className="bg-gradient-to-br from-primary to-primary/60 text-primary-foreground text-5xl font-bold">
                  {artist.name?.charAt(0) || "A"}
                </AvatarFallback>
              </Avatar>
              {artist.royaltyTier && (
                <div className="absolute -bottom-2 -right-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-full text-xs font-bold shadow-lg">
                  {artist.royaltyTier}
                </div>
              )}
            </div>

            <div className="flex-1">
              <h1 className="text-4xl md:text-5xl font-bold mb-3">
                <span className="premium-text-gradient">{artist.name}</span>
              </h1>
              
              {artist.tagline && (
                <p className="text-xl md:text-2xl text-muted-foreground mb-6">
                  {artist.tagline}
                </p>
              )}

              {artist.bio && (
                <p className="text-lg text-muted-foreground max-w-3xl mb-8 leading-relaxed">
                  {artist.bio}
                </p>
              )}

              <div className="flex flex-wrap gap-4 mb-8">
                <div className="premium-card flex items-center gap-3 px-5 py-4" data-testid="stat-artworks">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Package className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <div className="text-3xl font-bold">
                      {artworks?.filter(a => a.status === "approved").length || 0}
                    </div>
                    <div className="text-sm text-muted-foreground font-medium">Artworks</div>
                  </div>
                </div>
                
                {artist.totalSales !== undefined && (
                  <div className="premium-card flex items-center gap-3 px-5 py-4" data-testid="stat-sales">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-3xl font-bold">
                        {artist.totalSales}
                      </div>
                      <div className="text-sm text-muted-foreground font-medium">Sales</div>
                    </div>
                  </div>
                )}
              </div>

              {artist.shopifyCollectionHandle && (
                <Button 
                  asChild 
                  size="lg" 
                  className="premium-pill-button" 
                  data-testid="button-view-collection"
                >
                  <a href={`https://369artcollective.com/collections/${artist.shopifyCollectionHandle}`} target="_blank" rel="noopener noreferrer">
                    Shop Collection
                    <ExternalLink className="w-5 h-5 ml-2" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Artworks Grid */}
      <div className="container mx-auto px-4 py-12">
        <h2 className="text-3xl font-bold mb-8">Featured Artworks</h2>

        {artworksLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="aspect-square" />
            ))}
          </div>
        ) : artworks && artworks.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {artworks
              .filter(artwork => artwork.status === "approved")
              .map(artwork => (
                <Card key={artwork.id} className="overflow-hidden hover-elevate" data-testid={`card-artwork-${artwork.id}`}>
                  <div className="aspect-square bg-muted relative overflow-hidden">
                    <img
                      src={artwork.imageUrl}
                      alt={artwork.title}
                      className="w-full h-full object-cover transition-transform hover:scale-105"
                    />
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-lg mb-1 line-clamp-1">{artwork.title}</h3>
                    {artwork.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{artwork.description}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">No Artworks Yet</h3>
              <p className="text-muted-foreground">This artist hasn't published any artworks yet.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
