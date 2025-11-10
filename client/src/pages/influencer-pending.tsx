import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Clock, Sparkles, CheckCircle } from "lucide-react";

export default function InfluencerPending() {
  const [, navigate] = useLocation();

  const handleLogout = () => {
    fetch("/api/logout", {
      method: "POST",
      credentials: "include",
    }).then(() => {
      navigate("/influencer/login");
    });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Clock className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Application Under Review</CardTitle>
          <CardDescription>
            Your influencer application is being reviewed by our team
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted rounded-lg p-6 space-y-4">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Thank You for Applying!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  We've received your application to join our influencer program.
                  Our team is reviewing your submission.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">What Happens Next?</p>
                <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                  <li>• We'll review your audience size and engagement</li>
                  <li>• Check your content niche alignment with our products</li>
                  <li>• Verify your social media presence</li>
                  <li>• Respond within 24-48 hours</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              You'll receive an email notification once your application has been reviewed.
              Check back here or your email for updates.
            </p>
            <Button
              data-testid="button-logout"
              variant="outline"
              onClick={handleLogout}
            >
              Logout
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
