import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth-context";
import { ProtectedRoute } from "@/components/protected-route";

import Login from "@/pages/login";
import Register from "@/pages/register";
import ArtistDashboard from "@/pages/artist-dashboard";
import UploadArtwork from "@/pages/upload-artwork";
import ArtistEarnings from "@/pages/artist-earnings";
import ArtistPending from "@/pages/artist-pending";
import AdminDashboard from "@/pages/admin-dashboard";
import AdminArtists from "@/pages/admin-artists";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <Redirect to="/login" />} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      
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
