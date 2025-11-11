import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { influencerApplicationSchema } from "@shared/schema";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Sparkles, TrendingUp, Users, Award } from "lucide-react";

// Form schema extends influencerApplicationSchema with confirmPassword and UI-only niche field
const formSchema = influencerApplicationSchema.extend({
  confirmPassword: z.string(),
  niche: z.string().optional(), // UI-only field
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type FormData = z.infer<typeof formSchema>;

export default function InfluencerApply() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      socialLinks: {},
      audienceSize: undefined,
      applicationNotes: "",
      niche: "",
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      setIsSubmitting(true);
      const { confirmPassword, niche, ...submitData} = data;
      
      // Combine niche into applicationNotes if provided
      const applicationNotes = niche 
        ? `${submitData.applicationNotes}\n\nContent Niche: ${niche}`.trim()
        : submitData.applicationNotes;

      await apiRequest("POST", "/api/influencers/apply", {
        ...submitData,
        applicationNotes,
      });

      toast({
        title: "Application Submitted!",
        description: "We'll review your application and get back to you within 24-48 hours.",
      });

      // Redirect to login page
      setTimeout(() => navigate("/influencer/login"), 2000);
    } catch (error: any) {
      toast({
        title: "Application Failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-primary/10 via-accent/5 to-background border-b">
        <div className="container mx-auto px-4 py-16 text-center">
          <div className="flex justify-center mb-6">
            <Sparkles className="h-16 w-16 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Join Our Influencer Program
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Earn up to 40% commission promoting artist-designed print-on-demand products.
            Grow with our tiered rewards system and unlock exclusive achievements.
          </p>
        </div>
      </div>

      {/* Benefits Grid */}
      <div className="container mx-auto px-4 py-12">
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <Card data-testid="card-benefit-1">
            <CardHeader>
              <TrendingUp className="h-8 w-8 text-primary mb-2" />
              <CardTitle>Tiered Commissions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Start at 20% (Bronze) and earn up to 40% (Elite) as you grow your sales.
                Progress automatically based on monthly performance.
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-benefit-2">
            <CardHeader>
              <Award className="h-8 w-8 text-primary mb-2" />
              <CardTitle>Achievements & Leaderboards</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Unlock exclusive achievements, compete on leaderboards, and participate
                in monthly challenges with bonus rewards.
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-benefit-3">
            <CardHeader>
              <Users className="h-8 w-8 text-primary mb-2" />
              <CardTitle>Recruit & Earn</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Invite artists and earn additional commissions from their sales.
                Build your network while they build theirs.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Application Form */}
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Application Form</CardTitle>
            <CardDescription>
              Tell us about your audience and why you'd be a great fit for our program.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Personal Info */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input
                          data-testid="input-name"
                          placeholder="John Doe"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          data-testid="input-email"
                          type="email"
                          placeholder="john@example.com"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input
                            data-testid="input-password"
                            type="password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm Password</FormLabel>
                        <FormControl>
                          <Input
                            data-testid="input-confirm-password"
                            type="password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Social Media */}
                <div className="space-y-4">
                  <h3 className="font-semibold">Social Media</h3>
                  
                  <FormField
                    control={form.control}
                    name="socialLinks.instagram"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Instagram</FormLabel>
                        <FormControl>
                          <Input
                            data-testid="input-instagram"
                            placeholder="@yourusername"
                            {...field}
                            value={(field.value as string) || ""}
                            onChange={(e) => field.onChange(e.target.value)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="socialLinks.tiktok"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>TikTok</FormLabel>
                        <FormControl>
                          <Input
                            data-testid="input-tiktok"
                            placeholder="@yourusername"
                            {...field}
                            value={(field.value as string) || ""}
                            onChange={(e) => field.onChange(e.target.value)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="socialLinks.youtube"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>YouTube</FormLabel>
                        <FormControl>
                          <Input
                            data-testid="input-youtube"
                            placeholder="Channel URL or handle"
                            {...field}
                            value={(field.value as string) || ""}
                            onChange={(e) => field.onChange(e.target.value)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Audience & Details */}
                <FormField
                  control={form.control}
                  name="audienceSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Audience Size</FormLabel>
                      <FormControl>
                        <Input
                          data-testid="input-audience"
                          type="number"
                          placeholder="15000"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormDescription>
                        Total followers across all platforms
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="niche"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Content Niche</FormLabel>
                      <FormControl>
                        <Input
                          data-testid="input-niche"
                          placeholder="e.g., Art & Design, Fashion, Home Decor"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="applicationNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Why Join?</FormLabel>
                      <FormControl>
                        <Textarea
                          data-testid="input-motivation"
                          placeholder="Tell us why you're interested in promoting artist-designed products..."
                          rows={4}
                          {...field}
                          value={field.value || ""}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  data-testid="button-submit"
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting..." : "Submit Application"}
                </Button>
              </form>
            </Form>

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <Button
                  data-testid="link-login"
                  variant="ghost"
                  className="p-0 h-auto"
                  onClick={() => navigate("/influencer/login")}
                >
                  Login here
                </Button>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
