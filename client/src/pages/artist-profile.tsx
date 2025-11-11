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
      {/* Artist Header */}
      <div className="bg-gradient-to-br from-primary/10 via-background to-background border-b">
        <div className="container mx-auto px-4 py-12">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <Avatar className="w-32 h-32 border-4 border-background shadow-xl">
              <AvatarFallback className="bg-primary text-primary-foreground text-4xl font-bold">
                {artist.name?.charAt(0) || "A"}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1">
              <h1 className="text-4xl font-bold mb-2">{artist.name}</h1>
              <p className="text-xl text-muted-foreground mb-4">{artist.tagline || "Independent Artist"}</p>

              <div className="flex flex-wrap gap-3 mb-6">
                {artist.royaltyTier && (
                  <Badge className={getTierBadgeColor(artist.royaltyTier)} data-testid="badge-tier">
                    {artist.royaltyTier} Tier
                  </Badge>
                )}
                <Badge variant="secondary" data-testid="badge-artwork-count">
                  <Package className="w-3 h-3 mr-1" />
                  {artworks?.filter(a => a.status === "approved").length || 0} Artworks
                </Badge>
                {artist.totalSales !== undefined && artist.totalSales > 0 && (
                  <Badge variant="secondary" data-testid="badge-sales">
                    {artist.totalSales} Sales
                  </Badge>
                )}
              </div>

              {artist.bio && (
                <p className="text-muted-foreground max-w-2xl">{artist.bio}</p>
              )}

              {artist.shopifyCollectionHandle && (
                <Button asChild className="mt-6" data-testid="button-view-collection">
                  <a href={`https://247printnetwork.myshopify.com/collections/${artist.shopifyCollectionHandle}`} target="_blank" rel="noopener noreferrer">
                    View Collection on Shopify
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Artworks Grid */}
      <div className="container mx-auto px-4 py-12">
        <h2 className="text-3xl font-bold mb-8">Featured Artworks</h2>

        {artworksLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="aspect-square" />
            ))}
          </div>
        ) : artworks && artworks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
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
