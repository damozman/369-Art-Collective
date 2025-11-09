import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth-context";
import { ProtectedRoute } from "@/components/protected-route";

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
import AdminDashboard from "@/pages/admin-dashboard";
import AdminArtists from "@/pages/admin-artists";
import AdminArtistDetail from "@/pages/admin-artist-detail";
import AdminEmpire from "@/pages/admin-empire";
import AdminSettings from "@/pages/admin-settings";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <Redirect to="/login" />} />
      <Route path="/login" component={Login} />
      <Route path="/admin" component={AdminLogin} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/admin/forgot-password" component={AdminForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      
      <Route path="/artist/pending">
        <ProtectedRoute requiredType="artist">
          <ArtistPending />
        </ProtectedRoute>
      </Route>
      
      <Route path="/artist/dashboard">
        <ProtectedRoute requiredType="artist">
          <ArtistDashboard />
        </ProtectedRoute>
      </Route>
      
      <Route path="/artist/upload">
        <ProtectedRoute requiredType="artist">
          <UploadArtwork />
        </ProtectedRoute>
      </Route>
      
      <Route path="/artist/earnings">
        <ProtectedRoute requiredType="artist">
          <ArtistEarnings />
        </ProtectedRoute>
      </Route>
      
      <Route path="/artist/referrals">
        <ProtectedRoute requiredType="artist">
          <ArtistReferrals />
        </ProtectedRoute>
      </Route>
      
      <Route path="/artist/payouts">
        <ProtectedRoute requiredType="artist">
          <ArtistPayouts />
        </ProtectedRoute>
      </Route>
      
      <Route path="/artist/settings">
        <ProtectedRoute requiredType="artist">
          <ArtistSettings />
        </ProtectedRoute>
      </Route>
      
      <Route path="/admin/dashboard">
        <ProtectedRoute requiredType="admin">
          <AdminDashboard />
        </ProtectedRoute>
      </Route>
      
      <Route path="/admin/artists">
        <ProtectedRoute requiredType="admin">
          <AdminArtists />
        </ProtectedRoute>
      </Route>
      
      <Route path="/admin/artists/:id">
        <ProtectedRoute requiredType="admin">
          <AdminArtistDetail />
        </ProtectedRoute>
      </Route>
      
      <Route path="/admin/empire">
        <ProtectedRoute requiredType="admin">
          <AdminEmpire />
        </ProtectedRoute>
      </Route>
      
      <Route path="/admin/settings">
        <ProtectedRoute requiredType="admin">
          <AdminSettings />
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
