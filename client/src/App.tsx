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
import Login from "@/pages/login";
import AdminLogin from "@/pages/admin-login";
import Register from "@/pages/register";
import ForgotPassword from "@/pages/forgot-password";
import AdminForgotPassword from "@/pages/admin-forgot-password";
import ResetPassword from "@/pages/reset-password";
import ArtistDashboard from "@/pages/artist-dashboard";
import UploadArtwork from "@/pages/upload-artwork";
import ArtistEarnings from "@/pages/artist-earnings";
import ArtistReferrals from "@/pages/artist-referrals";
import ArtistPayouts from "@/pages/artist-payouts";
import ArtistPending from "@/pages/artist-pending";
import ArtistSettings from "@/pages/artist-settings";
import ArtistAnalytics from "@/pages/artist-analytics";
import AdminDashboard from "@/pages/admin-dashboard";
import AdminArtists from "@/pages/admin-artists";
import AdminArtistDetail from "@/pages/admin-artist-detail";
import AdminPayouts from "@/pages/admin-payouts";
import AdminTestimonials from "@/pages/admin-testimonials";
import AdminEmpire from "@/pages/admin-empire";
import AdminSettings from "@/pages/admin-settings";
import SuccessStory from "@/pages/success-story";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/success-stories/:slug" component={SuccessStory} />
      <Route path="/login" component={Login} />
      <Route path="/admin" component={AdminLogin} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/admin/forgot-password" component={AdminForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      
      <Route path="/artist/pending">
        <ProtectedRoute requiredType="artist">
          <ArtistLayout>
            <ArtistPending />
          </ArtistLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/artist/dashboard">
        <ProtectedRoute requiredType="artist">
          <ArtistLayout>
            <ArtistDashboard />
          </ArtistLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/artist/upload">
        <ProtectedRoute requiredType="artist">
          <ArtistLayout>
            <UploadArtwork />
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
      
      <Route path="/artist/analytics">
        <ProtectedRoute requiredType="artist">
          <ArtistLayout>
            <ArtistAnalytics />
          </ArtistLayout>
        </ProtectedRoute>
      </Route>
      
      <Route path="/admin/dashboard">
        <ProtectedRoute requiredType="admin">
          <AdminLayout>
            <AdminDashboard />
          </AdminLayout>
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
