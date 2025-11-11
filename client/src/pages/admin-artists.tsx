import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { ArrowLeft, CheckCircle, XCircle, Clock, Eye, Settings, LogOut, Search, Download, Mail, ArrowUpDown } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Artist } from "@shared/schema";
import { useAuth } from "@/lib/auth-context";

export default function AdminArtists() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { logout } = useAuth();

  // Enhanced state management
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "pending">("all");
  const [sortBy, setSortBy] = useState<"name-az" | "name-za" | "newest" | "oldest">("newest");
  const [selectedArtistIds, setSelectedArtistIds] = useState<Set<string>>(new Set());
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");

  const { data: artists, isLoading} = useQuery<Artist[]>({
    queryKey: ["/api/admin/artists"],
  });

  const approveMutation = useMutation({
    mutationFn: async (artistId: string) => {
      return apiRequest("POST", `/api/artists/${artistId}/approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/artists"] });
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

  // Bulk operations mutations
  const bulkApproveMutation = useMutation({
    mutationFn: async (artistIds: string[]) => {
      const res = await apiRequest("POST", "/api/artists/bulk", { artistIds, action: "approve" });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/artists"] });
      toast({
        title: "Bulk approval complete",
        description: `${data.successCount} artists approved, ${data.failureCount} failed`,
      });
      setSelectedArtistIds(new Set());
    },
    onError: (error: any) => {
      toast({
        title: "Bulk approval failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bulkRejectMutation = useMutation({
    mutationFn: async (artistIds: string[]) => {
      const res = await apiRequest("POST", "/api/artists/bulk", { artistIds, action: "reject" });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/artists"] });
      toast({
        title: "Bulk rejection complete",
        description: `${data.successCount} artists rejected, ${data.failureCount} failed`,
      });
      setSelectedArtistIds(new Set());
    },
    onError: (error: any) => {
      toast({
        title: "Bulk rejection failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const batchEmailMutation = useMutation({
    mutationFn: async ({ artistIds, subject, message }: { artistIds: string[]; subject: string; message: string }) => {
      const res = await apiRequest("POST", "/api/artists/batch-email", { artistIds, subject, message });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Batch email sent",
        description: `${data.successCount} emails sent, ${data.failureCount} failed`,
      });
      setSelectedArtistIds(new Set());
      setShowEmailDialog(false);
      setEmailSubject("");
      setEmailMessage("");
    },
    onError: (error: any) => {
      toast({
        title: "Batch email failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Enhanced filtering with search and sorting
  const filteredArtists = useMemo(() => {
    if (!artists) return [];
    
    let filtered = artists.filter(a => {
      if (statusFilter === "approved") return a.approved;
      if (statusFilter === "pending") return !a.approved;
      return true; // "all"
    });

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(a => 
        a.name.toLowerCase().includes(query) ||
        a.email.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "name-az":
          return a.name.localeCompare(b.name);
        case "name-za":
          return b.name.localeCompare(a.name);
        case "newest":
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        case "oldest":
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        default:
          return 0;
      }
    });

    return filtered;
  }, [artists, statusFilter, searchQuery, sortBy]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedArtistIds(new Set());
  }, [searchQuery, sortBy, statusFilter]);

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

  // Selection handlers
  const toggleArtistSelection = (artistId: string) => {
    setSelectedArtistIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(artistId)) {
        newSet.delete(artistId);
      } else {
        newSet.add(artistId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedArtistIds.size === filteredArtists.length) {
      setSelectedArtistIds(new Set());
    } else {
      setSelectedArtistIds(new Set(filteredArtists.map(a => a.id)));
    }
  };

  const handleBulkApprove = () => {
    const selectedPending = Array.from(selectedArtistIds).filter(id => {
      const artist = artists?.find(a => a.id === id);
      return artist && !artist.approved;
    });
    
    if (selectedPending.length === 0) {
      toast({
        title: "No pending artists selected",
        description: "Please select artists that are pending approval",
        variant: "destructive",
      });
      return;
    }

    bulkApproveMutation.mutate(selectedPending);
  };

  const handleBulkReject = () => {
    if (selectedArtistIds.size === 0) {
      toast({
        title: "No artists selected",
        description: "Please select artists to reject",
        variant: "destructive",
      });
      return;
    }

    bulkRejectMutation.mutate(Array.from(selectedArtistIds));
  };

  const handleSendBatchEmail = () => {
    if (!emailSubject.trim() || !emailMessage.trim()) {
      toast({
        title: "Incomplete form",
        description: "Please provide both subject and message",
        variant: "destructive",
      });
      return;
    }

    batchEmailMutation.mutate({
      artistIds: Array.from(selectedArtistIds),
      subject: emailSubject,
      message: emailMessage,
    });
  };

  const exportToCSV = () => {
    if (!filteredArtists.length) return;

    const escapeCSV = (value: string) => {
      // Escape double quotes by doubling them and wrap in quotes
      return `"${value.replace(/"/g, '""')}"`;
    };

    const headers = ["Name", "Email", "Status", "Joined Date", "Referral Code"];
    const rows = filteredArtists.map(a => [
      escapeCSV(a.name),
      escapeCSV(a.email),
      escapeCSV(a.approved ? "Approved" : "Pending"),
      escapeCSV(new Date(a.createdAt || "").toLocaleDateString()),
      escapeCSV(a.referralCode || "N/A"),
    ]);

    const csvContent = [headers.map(escapeCSV), ...rows]
      .map(row => row.join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `artists-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Export successful",
      description: `Exported ${filteredArtists.length} artists to CSV`,
    });
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
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <CardTitle>Artists ({filteredArtists.length})</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportToCSV}
                  disabled={filteredArtists.length === 0}
                  data-testid="button-export-csv"
                >
                  <Download className="w-4 h-4 mr-1" />
                  Export CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                <SelectTrigger className="w-[180px]" data-testid="select-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                <SelectTrigger className="w-[180px]" data-testid="select-sort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="name-az">Name (A-Z)</SelectItem>
                  <SelectItem value="name-za">Name (Z-A)</SelectItem>
                </SelectContent>
              </Select>
            </div>

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
            ) : filteredArtists.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedArtistIds.size === filteredArtists.length && filteredArtists.length > 0}
                          onCheckedChange={toggleSelectAll}
                          data-testid="checkbox-select-all"
                        />
                      </TableHead>
                      <TableHead>Artist</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredArtists.map((artist) => (
                      <TableRow key={artist.id} data-testid={`row-artist-${artist.id}`}>
                        <TableCell>
                          <Checkbox
                            checked={selectedArtistIds.has(artist.id)}
                            onCheckedChange={() => toggleArtistSelection(artist.id)}
                            data-testid={`checkbox-artist-${artist.id}`}
                          />
                        </TableCell>
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
                          {new Date(artist.createdAt || "").toLocaleDateString()}
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
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                {artists && artists.length > 0 ? "No artists match your filters" : "No artists registered yet"}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bulk action bar */}
        {selectedArtistIds.size > 0 && (
          <div className="fixed bottom-0 left-0 right-0 border-t bg-card shadow-lg z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="text-sm font-medium" data-testid="text-selected-count">
                  {selectedArtistIds.size} artist{selectedArtistIds.size !== 1 ? "s" : ""} selected
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedArtistIds(new Set())}
                    data-testid="button-clear-selection"
                  >
                    Clear Selection
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleBulkApprove}
                    disabled={bulkApproveMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                    data-testid="button-bulk-approve"
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Approve Selected
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleBulkReject}
                    disabled={bulkRejectMutation.isPending}
                    data-testid="button-bulk-reject"
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Reject Selected
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowEmailDialog(true)}
                    data-testid="button-send-email"
                  >
                    <Mail className="w-4 h-4 mr-1" />
                    Send Email
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Batch email dialog */}
        <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Send Batch Email</DialogTitle>
              <DialogDescription>
                Send an email to {selectedArtistIds.size} selected artist{selectedArtistIds.size !== 1 ? "s" : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="email-subject">Subject</Label>
                <Input
                  id="email-subject"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Enter email subject..."
                  data-testid="input-email-subject"
                />
              </div>
              <div>
                <Label htmlFor="email-message">Message</Label>
                <Textarea
                  id="email-message"
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  placeholder="Enter your message..."
                  rows={8}
                  data-testid="textarea-email-message"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEmailDialog(false)} data-testid="button-cancel-email">
                Cancel
              </Button>
              <Button
                onClick={handleSendBatchEmail}
                disabled={batchEmailMutation.isPending || !emailSubject.trim() || !emailMessage.trim()}
                data-testid="button-confirm-send-email"
              >
                <Mail className="w-4 h-4 mr-1" />
                {batchEmailMutation.isPending ? "Sending..." : "Send Email"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
