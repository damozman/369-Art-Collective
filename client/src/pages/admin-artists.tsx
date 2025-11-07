import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { ArrowLeft, CheckCircle, XCircle, Clock, Eye, Settings, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Artist } from "@shared/schema";
import { useAuth } from "@/lib/auth-context";

export default function AdminArtists() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { logout } = useAuth();

  const { data: artists, isLoading } = useQuery<Artist[]>({
    queryKey: ["/api/artists"],
  });

  const approveMutation = useMutation({
    mutationFn: async (artistId: string) => {
      return apiRequest("POST", `/api/artists/${artistId}/approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artists"] });
      toast({
        title: "Artist approved",
        description: "The artist can now log in and upload artwork",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Approval failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const stats = {
    total: artists?.length || 0,
    approved: artists?.filter(a => a.approved).length || 0,
    pending: artists?.filter(a => !a.approved).length || 0,
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/dashboard")} data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold font-serif">Artist Management</h1>
                <p className="text-sm text-muted-foreground">Approve and manage artist accounts</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/settings")} data-testid="button-settings">
                <Settings className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={logout} data-testid="button-logout">
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardHeader className="p-4">
              <p className="text-sm text-muted-foreground">Total Artists</p>
              <CardTitle className="text-3xl" data-testid="text-total">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="p-4">
              <p className="text-sm text-muted-foreground">Approved</p>
              <CardTitle className="text-3xl text-green-600" data-testid="text-approved">{stats.approved}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="p-4">
              <p className="text-sm text-muted-foreground">Pending Approval</p>
              <CardTitle className="text-3xl text-yellow-600" data-testid="text-pending">{stats.pending}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Artists</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-9 w-24" />
                  </div>
                ))}
              </div>
            ) : artists && artists.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Artist</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {artists.map((artist) => (
                    <TableRow key={artist.id} data-testid={`row-artist-${artist.id}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>{getInitials(artist.name)}</AvatarFallback>
                          </Avatar>
                          <span data-testid={`text-name-${artist.id}`}>{artist.name}</span>
                        </div>
                      </TableCell>
                      <TableCell data-testid={`text-email-${artist.id}`}>{artist.email}</TableCell>
                      <TableCell>
                        {artist.approved ? (
                          <Badge variant="default" className="bg-green-600 hover:bg-green-700" data-testid={`badge-approved-${artist.id}`}>
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Approved
                          </Badge>
                        ) : (
                          <Badge variant="secondary" data-testid={`badge-pending-${artist.id}`}>
                            <Clock className="w-3 h-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell data-testid={`text-date-${artist.id}`}>
                        {new Date(artist.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setLocation(`/admin/artists/${artist.id}`)}
                            data-testid={`button-view-${artist.id}`}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            View
                          </Button>
                          {!artist.approved && (
                            <Button
                              size="sm"
                              onClick={() => approveMutation.mutate(artist.id)}
                              disabled={approveMutation.isPending}
                              className="bg-green-600 hover:bg-green-700"
                              data-testid={`button-approve-${artist.id}`}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Approve
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No artists registered yet
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
