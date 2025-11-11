import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { User, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";

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
      <div className="bg-gradient-to-br from-primary/10 via-background to-background border-b">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-block px-4 py-2 bg-primary/10 rounded-full mb-4">
              <span className="text-sm font-bold text-primary uppercase tracking-wider">
                Meet the Creators
              </span>
            </div>
            <h1 className="text-5xl font-bold mb-4">Featured Artists</h1>
            <p className="text-xl text-muted-foreground">
              Discover talented creators from around the world bringing unique visions to life
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="p-6 animate-pulse" data-testid={`skeleton-artist-${i}`}>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 bg-muted rounded-full" />
                  <div className="flex-1">
                    <div className="h-5 bg-muted rounded mb-2 w-3/4" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                  </div>
                </div>
                <div className="h-4 bg-muted rounded mb-2" />
                <div className="h-4 bg-muted rounded w-5/6" />
              </Card>
            ))}
          </div>
        ) : artists && artists.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {artists.map((artist) => (
              <Card
                key={artist.id}
                className="hover-elevate active-elevate-2 overflow-hidden group"
                data-testid={`card-artist-${artist.id}`}
              >
                <div className="p-6">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-primary to-primary/60 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-8 h-8 text-primary-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold mb-1 truncate" data-testid={`text-artist-name-${artist.id}`}>
                        {artist.name}
                      </h3>
                      {artist.royaltyTier && (
                        <div className="text-sm text-muted-foreground capitalize">
                          {artist.royaltyTier.replace('_', ' ')} Tier
                        </div>
                      )}
                    </div>
                  </div>

                  {artist.bio && (
                    <p className="text-sm text-muted-foreground line-clamp-3 mb-4" data-testid={`text-bio-${artist.id}`}>
                      {artist.bio}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="text-sm">
                      <span className="font-semibold text-foreground">{artist.totalSales}</span>
                      <span className="text-muted-foreground ml-1">sales</span>
                    </div>
                    <Link
                      href={`/artists/${artist.id}`}
                      className="text-sm font-semibold text-primary hover:text-primary/80 flex items-center gap-1"
                      data-testid={`link-view-profile-${artist.id}`}
                    >
                      View Profile
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <User className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Artists Yet</h3>
            <p className="text-muted-foreground">Check back soon for featured creators</p>
          </div>
        )}
      </div>
    </div>
  );
}
