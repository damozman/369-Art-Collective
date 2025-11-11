import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Archive, 
  RefreshCw, 
  Search, 
  Calendar,
  AlertCircle,
  PlayCircle
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface ArtworkWithArtist {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string;
  artistId: string;
  status: string;
  archivedAt: string | null;
  lastSaleDate: string | null;
  archiveWarningEmailSentAt: string | null;
  createdAt: string;
  artist: {
    id: string;
    name: string;
    email: string;
  };
}

export default function AdminArchivedArtworks() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isRunningCheck, setIsRunningCheck] = useState(false);

  const { data: archivedArtworks, isLoading } = useQuery<ArtworkWithArtist[]>({
    queryKey: ["/api/artworks/archived"],
  });

  const reactivateMutation = useMutation({
    mutationFn: async (artworkId: string) => {
      return apiRequest(`/api/artworks/${artworkId}/reactivate`, {
        method: "POST",
      });
    },
    onSuccess: (_, artworkId) => {
      toast({
        title: "Artwork reactivated",
        description: "The artwork has been returned to the marketplace",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/artworks/archived"] });
      queryClient.invalidateQueries({ queryKey: ["/api/artworks/all"] });
    },
    onError: (error: any) => {
      toast({
        title: "Reactivation failed",
        description: error.message || "Failed to reactivate artwork",
        variant: "destructive",
      });
    },
  });

  const runArchiveCheck = async () => {
    setIsRunningCheck(true);
    try {
      const result = await apiRequest("/api/archive/check", {
        method: "POST",
      });

      toast({
        title: "Archive check completed",
        description: `Warnings sent: ${result.warningsSent}, Artworks archived: ${result.artworksArchived}`,
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/artworks/archived"] });
      queryClient.invalidateQueries({ queryKey: ["/api/artworks/all"] });
    } catch (error: any) {
      toast({
        title: "Archive check failed",
        description: error.message || "Failed to run archive check",
        variant: "destructive",
      });
    } finally {
      setIsRunningCheck(false);
    }
  };

  const filteredArtworks = archivedArtworks?.filter(artwork => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      artwork.title.toLowerCase().includes(query) ||
      artwork.artist.name.toLowerCase().includes(query) ||
      artwork.artist.email.toLowerCase().includes(query)
    );
  }) || [];

  const getDaysSinceArchive = (archivedAt: string | null) => {
    if (!archivedAt) return null;
    const days = Math.floor(
      (Date.now() - new Date(archivedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    return days;
  };

  const getDaysSinceLastSale = (lastSaleDate: string | null) => {
    if (!lastSaleDate) return "Never";
    const days = Math.floor(
      (Date.now() - new Date(lastSaleDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    return `${days} days ago`;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">Archived Artworks</h1>
            <p className="text-muted-foreground">
              Manage artworks that have been archived due to inactivity
            </p>
          </div>
          <Button
            onClick={runArchiveCheck}
            disabled={isRunningCheck}
            data-testid="button-run-check"
          >
            {isRunningCheck ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <PlayCircle className="w-4 h-4 mr-2" />
                Run Archive Check
              </>
            )}
          </Button>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold" data-testid="text-total-archived">
                  {archivedArtworks?.length || 0}
                </div>
                <div className="text-sm text-muted-foreground">Total Archived</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold" data-testid="text-warned-count">
                  {archivedArtworks?.filter(a => a.archiveWarningEmailSentAt).length || 0}
                </div>
                <div className="text-sm text-muted-foreground">Warnings Sent</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold" data-testid="text-no-sales-count">
                  {archivedArtworks?.filter(a => !a.lastSaleDate).length || 0}
                </div>
                <div className="text-sm text-muted-foreground">Never Sold</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by artwork title, artist name, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="input-search"
          />
        </div>
      </div>

      {filteredArtworks.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Archive className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No archived artworks</h3>
            <p className="text-muted-foreground">
              {searchQuery ? "No artworks match your search" : "There are no archived artworks at this time"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredArtworks.map((artwork) => (
            <Card key={artwork.id} className="overflow-hidden" data-testid={`card-artwork-${artwork.id}`}>
              <div className="aspect-square relative bg-muted">
                <img
                  src={artwork.imageUrl}
                  alt={artwork.title}
                  className="w-full h-full object-cover"
                  data-testid={`img-artwork-${artwork.id}`}
                />
                <div className="absolute top-2 right-2">
                  <Badge variant="secondary" className="bg-red-600 text-white">
                    <Archive className="w-3 h-3 mr-1" />
                    Archived
                  </Badge>
                </div>
              </div>
              <CardContent className="p-6 space-y-4">
                <div>
                  <h3 className="font-semibold text-lg mb-1" data-testid={`text-title-${artwork.id}`}>
                    {artwork.title}
                  </h3>
                  <p className="text-sm text-muted-foreground" data-testid={`text-artist-${artwork.id}`}>
                    by {artwork.artist.name}
                  </p>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Archived:</span>
                    <span data-testid={`text-archived-${artwork.id}`}>
                      {artwork.archivedAt 
                        ? formatDistanceToNow(new Date(artwork.archivedAt), { addSuffix: true })
                        : "Unknown"}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Last sale:</span>
                    <span data-testid={`text-last-sale-${artwork.id}`}>
                      {getDaysSinceLastSale(artwork.lastSaleDate)}
                    </span>
                  </div>

                  {artwork.archiveWarningEmailSentAt && (
                    <div className="text-xs text-muted-foreground">
                      Warning sent {formatDistanceToNow(new Date(artwork.archiveWarningEmailSentAt), { addSuffix: true })}
                    </div>
                  )}
                </div>

                <Button
                  variant="default"
                  size="sm"
                  className="w-full"
                  onClick={() => reactivateMutation.mutate(artwork.id)}
                  disabled={reactivateMutation.isPending}
                  data-testid={`button-reactivate-${artwork.id}`}
                >
                  {reactivateMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Reactivating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Reactivate
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
