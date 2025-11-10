import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, ExternalLink, Share2, Copy, Check, Crown, AlertTriangle, Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { SiFacebook, SiX, SiLinkedin } from "react-icons/si";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Testimonial, TestimonialWithArtist } from "@shared/schema";

const testimonialFormSchema = z.object({
  artistId: z.string().nullable().optional(),
  artistName: z.string().min(1, "Artist name is required"),
  title: z.string().min(1, "Title is required"),
  quote: z.string().min(10, "Quote must be at least 10 characters"),
  videoProvider: z.enum(["youtube", "vimeo", "direct"]),
  videoUrl: z.string().url("Must be a valid URL").nullable().optional(),
  videoThumbnailUrl: z.string().url("Must be a valid URL").nullable().optional(),
  localVideoPath: z.string().nullable().optional(),
  earningsUsd: z.string().default("0"),
  productsCount: z.number().int().min(0).default(0),
  featured: z.boolean().default(false),
  isActive: z.boolean().default(true),
  shareSlug: z.string().min(1, "Share slug is required"),
  shareExcerpt: z.string().nullable().optional(),
  shareImageUrl: z.string().url("Must be a valid URL").nullable().optional(),
  allowEmbed: z.boolean().default(false),
  artistConsent: z.boolean().refine((val) => val === true, {
    message: "Artist must consent to public testimonial sharing for legal protection",
  }),
});

type TestimonialFormData = z.infer<typeof testimonialFormSchema>;

export default function AdminTestimonials() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTestimonial, setEditingTestimonial] = useState<Testimonial | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [shareDialogTestimonial, setShareDialogTestimonial] = useState<TestimonialWithArtist | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [addOverrideDialogOpen, setAddOverrideDialogOpen] = useState(false);
  const [selectedTestimonialId, setSelectedTestimonialId] = useState<string>("");

  const { data: testimonials = [], isLoading } = useQuery<TestimonialWithArtist[]>({
    queryKey: ["/api/admin/testimonials"],
  });

  const { data: featuredData, isLoading: featuredLoading } = useQuery<any>({
    queryKey: ["/api/admin/featured-placements"],
  });

  const addOverrideMutation = useMutation({
    mutationFn: async (testimonialId: string) => {
      return await apiRequest("POST", "/api/admin/featured-overrides", { testimonialId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/featured-placements"] });
      toast({ title: "Success", description: "Admin override added successfully" });
      setAddOverrideDialogOpen(false);
      setSelectedTestimonialId("");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to add override", variant: "destructive" });
    },
  });

  const removeOverrideMutation = useMutation({
    mutationFn: async (subscriptionId: string) => {
      return await apiRequest("DELETE", `/api/admin/featured-overrides/${subscriptionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/featured-placements"] });
      toast({ title: "Success", description: "Admin override removed successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to remove override", variant: "destructive" });
    },
  });

  const form = useForm<TestimonialFormData>({
    resolver: zodResolver(testimonialFormSchema),
    defaultValues: {
      artistId: null,
      artistName: "",
      title: "",
      quote: "",
      videoProvider: "youtube",
      videoUrl: null,
      videoThumbnailUrl: null,
      localVideoPath: null,
      earningsUsd: "0",
      productsCount: 0,
      featured: false,
      isActive: true,
      shareSlug: "",
      shareExcerpt: null,
      shareImageUrl: null,
      allowEmbed: false,
      artistConsent: false,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: TestimonialFormData) => {
      return await apiRequest("POST", "/api/admin/testimonials", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/testimonials"] });
      toast({ title: "Success", description: "Testimonial created successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create testimonial", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Testimonial> }) => {
      return await apiRequest("PATCH", `/api/admin/testimonials/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/testimonials"] });
      toast({ title: "Success", description: "Testimonial updated successfully" });
      setIsDialogOpen(false);
      setEditingTestimonial(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update testimonial", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/testimonials/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/testimonials"] });
      toast({ title: "Success", description: "Testimonial deleted successfully" });
      setDeleteConfirmId(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete testimonial", variant: "destructive" });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (reorderedItems: Array<{ id: string; displayOrder: number }>) => {
      return await apiRequest("POST", "/api/admin/testimonials/reorder", { reorderedItems });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/testimonials"] });
      toast({ title: "Success", description: "Testimonials reordered successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to reorder testimonials", variant: "destructive" });
    },
  });

  const handleSubmit = (data: TestimonialFormData) => {
    if (editingTestimonial) {
      updateMutation.mutate({ id: editingTestimonial.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (testimonial: Testimonial) => {
    setEditingTestimonial(testimonial);
    form.reset({
      artistId: testimonial.artistId,
      artistName: testimonial.artistName,
      title: testimonial.title,
      quote: testimonial.quote,
      videoProvider: (testimonial.videoProvider || "youtube") as "youtube" | "vimeo" | "direct",
      videoUrl: testimonial.videoUrl,
      videoThumbnailUrl: testimonial.videoThumbnailUrl,
      localVideoPath: testimonial.localVideoPath,
      earningsUsd: testimonial.earningsUsd,
      productsCount: testimonial.productsCount,
      featured: testimonial.featured,
      isActive: testimonial.isActive,
      shareSlug: testimonial.shareSlug,
      shareExcerpt: testimonial.shareExcerpt,
      shareImageUrl: testimonial.shareImageUrl,
      allowEmbed: testimonial.allowEmbed,
      artistConsent: testimonial.artistConsent, // Preserve consent status when editing
    });
    setIsDialogOpen(true);
  };

  const handleToggleActive = (testimonial: Testimonial) => {
    updateMutation.mutate({
      id: testimonial.id,
      data: { isActive: !testimonial.isActive },
    });
  };

  const handleMove = (index: number, direction: "up" | "down") => {
    const newTestimonials = [...testimonials];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newTestimonials.length) return;
    
    [newTestimonials[index], newTestimonials[targetIndex]] = [newTestimonials[targetIndex], newTestimonials[index]];
    
    const reorderedItems = newTestimonials.map((t, i) => ({
      id: t.id,
      displayOrder: i,
    }));
    
    reorderMutation.mutate(reorderedItems);
  };

  const generateShareUrl = (slug: string, artistReferralCode?: string | null) => {
    const baseUrl = `${window.location.origin}/success-stories/${slug}`;
    if (!artistReferralCode) return baseUrl;
    
    const params = new URLSearchParams({
      utm_source: 'artist-referral',
      utm_medium: 'testimonial',
      utm_campaign: artistReferralCode,
      ref: artistReferralCode
    });
    
    return `${baseUrl}?${params.toString()}`;
  };

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(true);
      toast({ title: "Success", description: "URL copied to clipboard" });
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (error) {
      toast({ title: "Error", description: "Failed to copy URL", variant: "destructive" });
    }
  };

  const handleSocialShare = (platform: "facebook" | "twitter" | "linkedin", testimonial: TestimonialWithArtist) => {
    const url = generateShareUrl(testimonial.shareSlug, testimonial.artistReferralCode);
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Testimonials Management</h1>
          <p className="text-muted-foreground mt-1">Manage artist success stories and video testimonials</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingTestimonial(null);
            form.reset();
          }
        }}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-testimonial">
              <Plus className="w-4 h-4 mr-2" />
              Add Testimonial
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingTestimonial ? "Edit Testimonial" : "Create New Testimonial"}</DialogTitle>
              <DialogDescription>
                {editingTestimonial ? "Update the testimonial details below" : "Add a new artist success story"}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="artistName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Artist Name</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-artist-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., From Side Hustle to Full-Time Income" data-testid="input-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="quote"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quote / Testimonial</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={4} data-testid="input-quote" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="videoProvider"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Video Provider</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-video-provider">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="youtube">YouTube</SelectItem>
                            <SelectItem value="vimeo">Vimeo</SelectItem>
                            <SelectItem value="direct">Direct Upload</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="videoUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Video URL</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} data-testid="input-video-url" />
                        </FormControl>
                        <FormDescription>Optional - leave empty for placeholder</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="earningsUsd"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Earnings (USD)</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="5,420" data-testid="input-earnings" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="productsCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Products Count</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                            data-testid="input-products-count"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={form.control}
                  name="shareSlug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Share Slug</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="artist-name-success" data-testid="input-share-slug" />
                      </FormControl>
                      <FormDescription>
                        Used in shareable URL: /success-stories/your-slug
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="flex gap-4">
                  <FormField
                    control={form.control}
                    name="featured"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormLabel>Featured</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-featured"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormLabel>Active</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-active"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="allowEmbed"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2">
                        <FormLabel>Allow Embed</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-allow-embed"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Artist Consent - Required for legal protection */}
                <FormField
                  control={form.control}
                  name="artistConsent"
                  render={({ field }) => (
                    <FormItem className="border-2 border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/30 p-4 rounded-md">
                      <div className="flex items-start gap-3">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-artist-consent"
                          />
                        </FormControl>
                        <div className="flex-1">
                          <FormLabel className="text-base font-semibold">Artist Consent Required</FormLabel>
                          <FormDescription className="mt-1">
                            ⚠️ <strong>Legal Protection:</strong> Confirm that the artist has explicitly consented to having their testimonial, name, and story publicly shared on the platform and in marketing materials. This protects 247 Print Network from any liability regarding unauthorized use of the artist's likeness, story, or intellectual property.
                          </FormDescription>
                          <FormMessage />
                        </div>
                      </div>
                    </FormItem>
                  )}
                />
                
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsDialogOpen(false);
                      setEditingTestimonial(null);
                      form.reset();
                    }}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save">
                    {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Featured Placements Panel */}
      <Card className="border-primary/20" data-testid="card-featured-placements">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              <CardTitle>Featured Placements</CardTitle>
            </div>
            {featuredData && featuredData.totalSlots >= 7 && (
              <Badge variant="destructive" data-testid="badge-slots-warning">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {featuredData.totalSlots}/7 Slots Full
              </Badge>
            )}
          </div>
          <CardDescription>
            Manage homepage featured testimonials ({featuredData?.totalSlots || 0}/7 slots used)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {featuredLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : !featuredData ? (
            <Alert variant="destructive">
              <AlertDescription>Failed to load featured placements</AlertDescription>
            </Alert>
          ) : (
            <>
              {/* Overview */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">Admin Overrides</p>
                  <p className="text-2xl font-bold">{featuredData.slotsByTier.admin_override}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Premium</p>
                  <p className="text-2xl font-bold">{featuredData.slotsByTier.premium}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Merit-Based</p>
                  <p className="text-2xl font-bold">{featuredData.slotsByTier.merit}</p>
                </div>
              </div>

              {featuredData.totalSlots >= 7 && (
                <Alert variant="destructive" data-testid="alert-slots-warning">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    All 7 featured slots are filled. Adding more overrides may impact visibility.
                  </AlertDescription>
                </Alert>
              )}

              {/* Admin Overrides Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Admin Overrides
                  </h3>
                  <Dialog open={addOverrideDialogOpen} onOpenChange={setAddOverrideDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" data-testid="button-add-override">
                        <Plus className="w-3 h-3 mr-1" />
                        Add Override
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Admin Override</DialogTitle>
                        <DialogDescription>
                          Manually feature a testimonial on the homepage
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-medium">Select Testimonial</label>
                          <Select value={selectedTestimonialId} onValueChange={setSelectedTestimonialId}>
                            <SelectTrigger data-testid="select-testimonial">
                              <SelectValue placeholder="Choose a testimonial" />
                            </SelectTrigger>
                            <SelectContent>
                              {testimonials
                                .filter(t => t.isActive && !t.featuredTier && t.artistId)
                                .map(t => (
                                  <SelectItem key={t.id} value={t.id}>
                                    {t.artistName} - {t.title}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setAddOverrideDialogOpen(false)}
                            className="flex-1"
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={() => selectedTestimonialId && addOverrideMutation.mutate(selectedTestimonialId)}
                            disabled={!selectedTestimonialId || addOverrideMutation.isPending}
                            className="flex-1"
                            data-testid="button-confirm-override"
                          >
                            {addOverrideMutation.isPending ? "Adding..." : "Add Override"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                
                {featuredData.placements.filter((p: any) => p.featuredTier === "admin_override").length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4 text-center border rounded">
                    No admin overrides. Click "Add Override" to manually feature a testimonial.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {featuredData.placements
                      .filter((p: any) => p.featuredTier === "admin_override")
                      .map((placement: any) => (
                        <div key={placement.id} className="flex items-center justify-between p-3 border rounded" data-testid={`placement-${placement.id}`}>
                          <div className="flex-1">
                            <p className="font-medium">{placement.testimonialTitle}</p>
                            <p className="text-sm text-muted-foreground">{placement.artistName}</p>
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="destructive" data-testid={`button-remove-${placement.id}`}>
                                <Trash2 className="w-3 h-3 mr-1" />
                                Remove
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Admin Override?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove "{placement.testimonialTitle}" from featured placements.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => removeOverrideMutation.mutate(placement.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  data-testid={`confirm-remove-${placement.id}`}
                                >
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Premium & Merit Sections */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">Premium Subscriptions</h3>
                  {featuredData.placements.filter((p: any) => p.featuredTier === "premium").length === 0 ? (
                    <p className="text-xs text-muted-foreground p-2 border rounded">No premium subscriptions</p>
                  ) : (
                    featuredData.placements
                      .filter((p: any) => p.featuredTier === "premium")
                      .map((p: any) => (
                        <div key={p.id} className="p-2 border rounded text-sm">
                          <p className="font-medium">{p.artistName}</p>
                          <Badge className="text-xs">{p.stripeSubscriptionStatus}</Badge>
                        </div>
                      ))
                  )}
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">Merit-Based (Auto-Rotation)</h3>
                  {featuredData.placements.filter((p: any) => p.featuredTier === "merit").length === 0 ? (
                    <p className="text-xs text-muted-foreground p-2 border rounded">No merit placements</p>
                  ) : (
                    featuredData.placements
                      .filter((p: any) => p.featuredTier === "merit")
                      .map((p: any) => (
                        <div key={p.id} className="p-2 border rounded text-sm">
                          <p className="font-medium">{p.artistName}</p>
                          <p className="text-xs text-muted-foreground">Rank #{p.rank} • ${p.monthlyEarnings}/mo</p>
                        </div>
                      ))
                  )}
                </div>
              </div>

              {featuredData.nextRotationDate && (
                <p className="text-xs text-muted-foreground text-center">
                  Next merit rotation: {new Date(featuredData.nextRotationDate).toLocaleDateString()}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Testimonials</CardTitle>
          <CardDescription>
            {testimonials.length} total testimonials
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading testimonials...</div>
          ) : testimonials.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No testimonials yet. Create your first one!</div>
          ) : (
            <div className="space-y-2">
              {testimonials.map((testimonial, index) => (
                <Card key={testimonial.id} className="hover-elevate" data-testid={`card-testimonial-${testimonial.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold">{testimonial.artistName}</h3>
                          {testimonial.featured && <Badge variant="default">Featured</Badge>}
                          <Badge variant={testimonial.isActive ? "default" : "secondary"}>
                            {testimonial.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium mb-1">{testimonial.title}</p>
                        <p className="text-sm text-muted-foreground line-clamp-2">{testimonial.quote}</p>
                        <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                          <span>${testimonial.earningsUsd} earned</span>
                          <span>{testimonial.productsCount} products</span>
                          <span className="flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" />
                            /success-stories/{testimonial.shareSlug}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleMove(index, "up")}
                          disabled={index === 0 || reorderMutation.isPending}
                          data-testid={`button-move-up-${testimonial.id}`}
                        >
                          <ChevronUp className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleMove(index, "down")}
                          disabled={index === testimonials.length - 1 || reorderMutation.isPending}
                          data-testid={`button-move-down-${testimonial.id}`}
                        >
                          <ChevronDown className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setShareDialogTestimonial(testimonial)}
                          data-testid={`button-share-${testimonial.id}`}
                        >
                          <Share2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleEdit(testimonial)}
                          data-testid={`button-edit-${testimonial.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteConfirmId(testimonial.id)}
                          data-testid={`button-delete-${testimonial.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Testimonial</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this testimonial? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!shareDialogTestimonial} onOpenChange={(open) => !open && setShareDialogTestimonial(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Testimonial</DialogTitle>
            <DialogDescription>
              Share this success story on social media or copy the shareable link
            </DialogDescription>
          </DialogHeader>
          
          {shareDialogTestimonial && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold mb-1">{shareDialogTestimonial.artistName}</h3>
                <p className="text-sm text-muted-foreground">{shareDialogTestimonial.title}</p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Shareable URL (with affiliate tracking)</label>
                <div className="flex gap-2">
                  <Input
                    value={generateShareUrl(shareDialogTestimonial.shareSlug, shareDialogTestimonial.artistReferralCode)}
                    readOnly
                    className="flex-1"
                    data-testid="input-share-url"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => handleCopyUrl(generateShareUrl(shareDialogTestimonial.shareSlug, shareDialogTestimonial.artistReferralCode))}
                    data-testid="button-copy-url"
                  >
                    {copiedUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                {shareDialogTestimonial.artistReferralCode && (
                  <p className="text-xs text-muted-foreground">
                    Includes artist referral code: {shareDialogTestimonial.artistReferralCode}
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Share on Social Media</label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleSocialShare("facebook", shareDialogTestimonial)}
                    className="flex-1"
                    data-testid="button-share-facebook"
                  >
                    <SiFacebook className="w-4 h-4 mr-2" />
                    Facebook
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleSocialShare("twitter", shareDialogTestimonial)}
                    className="flex-1"
                    data-testid="button-share-twitter"
                  >
                    <SiX className="w-4 h-4 mr-2" />
                    X / Twitter
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleSocialShare("linkedin", shareDialogTestimonial)}
                    className="flex-1"
                    data-testid="button-share-linkedin"
                  >
                    <SiLinkedin className="w-4 h-4 mr-2" />
                    LinkedIn
                  </Button>
                </div>
              </div>
              
              <div className="pt-4 border-t">
                <p className="text-xs text-muted-foreground">
                  Preview URL: <ExternalLink className="w-3 h-3 inline" /> /success-stories/{shareDialogTestimonial.shareSlug}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
