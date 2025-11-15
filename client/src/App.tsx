import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth-context";
import { ProtectedRoute } from "@/components/protected-route";
import { AdminLayout } from "@/components/layouts/admin-layout";
import { ArtistLayout } from "@/components/layouts/artist-layout";

import Home from "@/pages/home";
import ComingSoon from "@/pages/coming-soon";
import Login from "@/pages/login";
import AdminLogin from "@/pages/admin-login";
import Register from "@/pages/register";
import ForgotPassword from "@/pages/forgot-password";
import AdminForgotPassword from "@/pages/admin-forgot-password";
import ResetPassword from "@/pages/reset-password";
import ArtistDashboard from "@/pages/artist-dashboard";
import UploadArtwork from "@/pages/upload-artwork";
import ArtistAiStudio from "@/pages/artist-ai-studio";
import ArtistEarnings from "@/pages/artist-earnings";
import ArtistReferrals from "@/pages/artist-referrals";
import ArtistPayouts from "@/pages/artist-payouts";
import ArtistPending from "@/pages/artist-pending";
import ArtistSettings from "@/pages/artist-settings";
import ArtistAnalytics from "@/pages/artist-analytics";
import SubscriptionConfirm from "@/pages/subscription-confirm";
import AdminDashboard from "@/pages/admin-dashboard";
import AdminArtists from "@/pages/admin-artists";
import AdminArtistDetail from "@/pages/admin-artist-detail";
import AdminPayouts from "@/pages/admin-payouts";
import AdminTestimonials from "@/pages/admin-testimonials";
import AdminEmpire from "@/pages/admin-empire";
import AdminSettings from "@/pages/admin-settings";
import AdminInfluencers from "@/pages/admin-influencers";
import AdminChallenges from "@/pages/admin-challenges";
import AdminArchivedArtworks from "@/pages/admin-archived-artworks";
import AdminFinancialDashboard from "@/pages/AdminFinancialDashboard";
import InfluencerApply from "@/pages/influencer-apply";
import InfluencerLogin from "@/pages/influencer-login";
import InfluencerPending from "@/pages/influencer-pending";
import InfluencerDashboard from "@/pages/influencer-dashboard";
import PublicLeaderboard from "@/pages/public-leaderboard";
import SuccessStory from "@/pages/success-story";
import ArtistProfile from "@/pages/artist-profile";
import Creators from "@/pages/creators";
import JoinCreatorverse from "@/pages/join-creatorverse";
import CreatorStack from "@/pages/creatorstack";
import CreatorStackLogin from "@/pages/creatorstack-login";
import CreatorStackDashboard from "@/pages/creatorstack-dashboard";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/coming-soon" component={ComingSoon} />
      <Route path="/join" component={JoinCreatorverse} />
      <Route path="/creatorstack" component={CreatorStack} />
      <Route path="/creatorstack/login" component={CreatorStackLogin} />
      <Route path="/creatorstack/dashboard" component={CreatorStackDashboard} />
      <Route path="/creators" component={Creators} />
      <Route path="/leaderboard" component={PublicLeaderboard} />
      <Route path="/success-stories/:slug" component={SuccessStory} />
      <Route path="/login" component={Login} />
      <Route path="/admin" component={AdminLogin} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/admin/forgot-password" component={AdminForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      
      <Route path="/artist/login" component={Login} />
      <Route path="/artist" component={Login} />
      
      <Route path="/artist/pending">
        <ProtectedRoute requiredType="artist">
          <ArtistLayout>
            <ArtistPending />
          </ArtistLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/artist/dashboard">
        <ProtectedRoute requiredType="artist">
          <ArtistDashboard />
        </ProtectedRoute>
      </Route>
      
      <Route path="/artist/upload">
        <ProtectedRoute requiredType="artist">
          <ArtistLayout>
            <UploadArtwork />
          </ArtistLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/artist/ai-studio">
        <ProtectedRoute requiredType="artist">
          <ArtistLayout>
            <ArtistAiStudio />
          </ArtistLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/artist/earnings">
        <ProtectedRoute requiredType="artist">
          <ArtistLayout>
            <ArtistEarnings />
          </ArtistLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/artist/referrals">
        <ProtectedRoute requiredType="artist">
          <ArtistLayout>
            <ArtistReferrals />
          </ArtistLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/artist/payouts">
        <ProtectedRoute requiredType="artist">
          <ArtistLayout>
            <ArtistPayouts />
          </ArtistLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/artist/settings">
        <ProtectedRoute requiredType="artist">
          <ArtistLayout>
            <ArtistSettings />
          </ArtistLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/artist/subscription/confirm">
        <ProtectedRoute requiredType="artist">
          <SubscriptionConfirm />
        </ProtectedRoute>
      </Route>
      
      <Route path="/artist/analytics">
        <ProtectedRoute requiredType="artist">
          <ArtistLayout>
            <ArtistAnalytics />
          </ArtistLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/admin/dashboard">
        <ProtectedRoute requiredType="admin">
          <AdminDashboard />
        </ProtectedRoute>
      </Route>
      
      <Route path="/admin/artists">
        <ProtectedRoute requiredType="admin">
          <AdminLayout>
            <AdminArtists />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/admin/artists/:id">
        <ProtectedRoute requiredType="admin">
          <AdminLayout>
            <AdminArtistDetail />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/admin/archived">
        <ProtectedRoute requiredType="admin">
          <AdminLayout>
            <AdminArchivedArtworks />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/admin/payouts">
        <ProtectedRoute requiredType="admin">
          <AdminLayout>
            <AdminPayouts />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/admin/testimonials">
        <ProtectedRoute requiredType="admin">
          <AdminLayout>
            <AdminTestimonials />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/admin/empire">
        <ProtectedRoute requiredType="admin">
          <AdminLayout>
            <AdminEmpire />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/admin/settings">
        <ProtectedRoute requiredType="admin">
          <AdminLayout>
            <AdminSettings />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/admin/influencers">
        <ProtectedRoute requiredType="admin">
          <AdminLayout>
            <AdminInfluencers />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/admin/challenges">
        <ProtectedRoute requiredType="admin">
          <AdminLayout>
            <AdminChallenges />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/admin/financial">
        <ProtectedRoute requiredType="admin">
          <AdminLayout>
            <AdminFinancialDashboard />
          </AdminLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/influencer/apply" component={InfluencerApply} />
      <Route path="/influencer/login" component={InfluencerLogin} />
      
      <Route path="/influencer/pending">
        <ProtectedRoute requiredType="influencer">
          <InfluencerPending />
        </ProtectedRoute>
      </Route>
      
      <Route path="/influencer/dashboard">
        <ProtectedRoute requiredType="influencer">
          <InfluencerDashboard />
        </ProtectedRoute>
      </Route>
      
      {/* Parameterized routes must come last to avoid catching specific routes */}
      <Route path="/artists/:id" component={ArtistProfile} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
