import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { ArrowLeft, Copy, Users, DollarSign, TrendingUp, CheckCircle } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface ReferralData {
  referralCode: string;
  referralLink: string;
  stats: {
    totalReferralSales: number;
    totalReferralEarnings: number;
    totalArtistsRecruited: number;
    totalRecruitmentEarnings: number;
  };
  recruitedArtists: Array<{
    id: string;
    name: string;
    email: string;
    joinedAt: string;
    totalSales: number;
    totalEarnings: number;
  }>;
}

export default function ArtistReferrals() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: referrals, isLoading } = useQuery<ReferralData>({
    queryKey: [`/api/artists/${user?.id}/referrals`],
    enabled: Boolean(user?.id),
  });

  const copyReferralLink = () => {
    if (referrals?.referralLink) {
      navigator.clipboard.writeText(referrals.referralLink);
      setCopied(true);
      toast({
        title: "Link Copied!",
        description: "Your referral link has been copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const totalEarnings = (referrals?.stats.totalReferralEarnings || 0) + (referrals?.stats.totalRecruitmentEarnings || 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLocation("/artist/dashboard")}
                data-testid="button-back"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold font-serif">Referral Dashboard</h1>
                <p className="text-sm text-muted-foreground">Grow your network, earn more rewards</p>
              </div>
            </div>

            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Referral Link Generator */}
        <Card className="mb-8 bg-gradient-to-br from-primary/10 to-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Your Referral Link
            </CardTitle>
            <CardDescription>
              Share this link to earn +5% on sales you drive and 5% of recruited artists' royalties forever!
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <input
                type="text"
                value={referrals?.referralLink || ''}
                readOnly
                className="flex-1 px-4 py-2 border rounded-md bg-background text-sm"
                data-testid="input-referral-link"
              />
              <Button onClick={copyReferralLink} data-testid="button-copy-link">
                {copied ? (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Link
                  </>
                )}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Code: <span className="font-mono font-bold text-foreground">{referrals?.referralCode}</span>
            </p>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="p-4">
              <CardDescription className="flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                Total Earnings
              </CardDescription>
              <CardTitle className="text-3xl" data-testid="text-total-earnings">
                ${totalEarnings.toFixed(2)}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="p-4">
              <CardDescription className="flex items-center gap-1">
                <TrendingUp className="h-4 w-4" />
                Referral Bonuses
              </CardDescription>
              <CardTitle className="text-3xl text-green-600" data-testid="text-referral-earnings">
                ${(referrals?.stats.totalReferralEarnings || 0).toFixed(2)}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="p-4">
              <CardDescription className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                Artists Recruited
              </CardDescription>
              <CardTitle className="text-3xl text-blue-600" data-testid="text-artists-recruited">
                {referrals?.stats.totalArtistsRecruited || 0}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="p-4">
              <CardDescription className="flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                Recruitment Bonuses
              </CardDescription>
              <CardTitle className="text-3xl text-purple-600" data-testid="text-recruitment-earnings">
                ${(referrals?.stats.totalRecruitmentEarnings || 0).toFixed(2)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Recruited Artists Table */}
        <Card>
          <CardHeader>
            <CardTitle>Your Network</CardTitle>
            <CardDescription>
              Artists you've recruited earn you 5% of their base royalties on every sale
            </CardDescription>
          </CardHeader>
          <CardContent>
            {referrals?.recruitedArtists && referrals.recruitedArtists.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-semibold">Artist</th>
                      <th className="text-left p-3 font-semibold">Joined</th>
                      <th className="text-right p-3 font-semibold">Sales</th>
                      <th className="text-right p-3 font-semibold">Their Earnings</th>
                      <th className="text-right p-3 font-semibold">Your 5% Bonus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrals.recruitedArtists.map((artist) => (
                      <tr key={artist.id} className="border-b hover-elevate" data-testid={`row-artist-${artist.id}`}>
                        <td className="p-3">
                          <div>
                            <p className="font-semibold">{artist.name}</p>
                            <p className="text-sm text-muted-foreground">{artist.email}</p>
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {new Date(artist.joinedAt).toLocaleDateString()}
                        </td>
                        <td className="p-3 text-right">{artist.totalSales}</td>
                        <td className="p-3 text-right font-semibold">
                          ${artist.totalEarnings.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-semibold text-purple-600">
                          ${(artist.totalEarnings * 0.05).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-semibold mb-2">No artists recruited yet</p>
                <p className="text-muted-foreground mb-4">
                  Start sharing your referral link to build your network!
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* How It Works Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>How Referrals Work</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="font-bold text-primary">1</span>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Share Your Link</h3>
                <p className="text-sm text-muted-foreground">
                  Share your referral link on social media, with friends, or in your marketing
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="font-bold text-primary">2</span>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Earn +5% Traffic Bonus</h3>
                <p className="text-sm text-muted-foreground">
                  When someone buys through your link, you earn an extra +5% on top of your normal royalty
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="font-bold text-primary">3</span>
              </div>
              <div>
                <h3 className="font-semibold mb-1">Recruit Artists, Earn Forever</h3>
                <p className="text-sm text-muted-foreground">
                  When another artist signs up with your code, you earn 5% of their base royalties on every sale they make—forever!
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
