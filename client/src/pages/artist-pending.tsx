import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export default function ArtistPending() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <ThemeToggle />
        <Button variant="ghost" size="icon" onClick={logout} data-testid="button-logout">
          <LogOut className="h-5 w-5" />
        </Button>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-yellow-100 dark:bg-yellow-900/20 flex items-center justify-center">
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
          </div>
          <CardTitle className="text-2xl">Account Pending Approval</CardTitle>
          <CardDescription className="text-base">
            Hi {user?.name}, your artist account is currently under review
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            An admin will review your application shortly. You'll receive an email notification once your account is approved.
            After approval, you'll be able to log in and start uploading your artwork.
          </p>
          <div className="pt-4">
            <Button variant="outline" className="w-full" onClick={logout} data-testid="button-logout-main">
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
