import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";

type UserType = "artist" | "admin" | null;

interface AuthUser {
  id: string;
  email: string;
  name: string;
  type: UserType;
  approved?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  login: (user: AuthUser) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const stored = localStorage.getItem("auth_user");
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch (e) {
        localStorage.removeItem("auth_user");
      }
    }
    setIsLoading(false);
  }, []);

  const login = (newUser: AuthUser) => {
    setUser(newUser);
    localStorage.setItem("auth_user", JSON.stringify(newUser));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("auth_user");
    setLocation("/login");
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
