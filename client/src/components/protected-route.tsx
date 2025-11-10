import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { useEffect } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredType?: "artist" | "admin" | "influencer";
}

export function ProtectedRoute({ children, requiredType }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      // Redirect to appropriate login based on current path
      if (window.location.pathname.startsWith("/influencer")) {
        setLocation("/influencer/login");
      } else {
        setLocation("/login");
      }
    } else if (!isLoading && user && requiredType && user.type !== requiredType) {
      setLocation("/login");
    } else if (!isLoading && user?.type === "artist" && !user.approved) {
      // Artist not approved yet
      if (window.location.pathname !== "/artist/pending") {
        setLocation("/artist/pending");
      }
    } else if (!isLoading && user?.type === "influencer" && user.status !== "active") {
      // Influencer not active yet
      if (window.location.pathname !== "/influencer/pending") {
        setLocation("/influencer/pending");
      }
    }
  }, [user, isLoading, requiredType, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user || (requiredType && user.type !== requiredType)) {
    return null;
  }

  if (user.type === "artist" && !user.approved && window.location.pathname !== "/artist/pending") {
    return null;
  }

  if (user.type === "influencer" && user.status !== "active" && window.location.pathname !== "/influencer/pending") {
    return null;
  }

  return <>{children}</>;
}
