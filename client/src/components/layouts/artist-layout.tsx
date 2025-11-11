import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  Users,
  DollarSign,
  Wallet,
  BarChart3,
  Settings,
  LogOut,
  ChevronDown,
  Sparkles,
  Image as ImageIcon,
} from "lucide-react";
import type { Artwork } from "@shared/schema";

interface ArtistLayoutProps {
  children: React.ReactNode;
}

export function ArtistLayout({ children }: ArtistLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  // Get pending artworks count for badge
  const { data: artworks } = useQuery<Artwork[]>({
    queryKey: ["/api/artists/me/artworks"],
  });

  const pendingCount = artworks?.filter(a => a.status === "pending").length || 0;

  // Menu configuration grouped by workflow
  const menuItems = [
    {
      group: "Create",
      items: [
        {
          label: "My Artworks",
          path: "/artist/dashboard",
          icon: ImageIcon,
          badge: pendingCount > 0 ? pendingCount : undefined,
        },
        {
          label: "Upload New",
          path: "/artist/upload",
          icon: Upload,
        },
        {
          label: "AI Studio",
          path: "/artist/ai-studio",
          icon: Sparkles,
        },
      ],
    },
    {
      group: "Grow",
      items: [
        {
          label: "Referrals",
          path: "/artist/referrals",
          icon: Users,
        },
        {
          label: "Analytics",
          path: "/artist/analytics",
          icon: BarChart3,
        },
      ],
    },
    {
      group: "Earn",
      items: [
        {
          label: "Earnings",
          path: "/artist/earnings",
          icon: DollarSign,
        },
        {
          label: "Payouts",
          path: "/artist/payouts",
          icon: Wallet,
        },
      ],
    },
    {
      group: "Account",
      items: [
        {
          label: "Settings",
          path: "/artist/settings",
          icon: Settings,
        },
      ],
    },
  ];

  const handleLogout = async () => {
    await logout();
  };

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email
    ? user.email
        .split("@")[0]
        .split(/[._-]/)
        .map((part) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "AR";

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <Sidebar>
          <SidebarHeader className="border-b">
            <div className="flex items-center gap-2 px-4 py-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-bold text-lg font-serif">Artist Portal</span>
            </div>
          </SidebarHeader>

          <SidebarContent>
            {menuItems.map((section) => (
              <SidebarGroup key={section.group}>
                <SidebarGroupLabel>{section.group}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {section.items.map((item) => {
                      // Improved active route detection with query param support
                      const isActive = location.split("?")[0] === item.path || 
                                     location.split("?")[0].startsWith(item.path + "/");
                      
                      return (
                        <SidebarMenuItem key={item.path}>
                          <SidebarMenuButton
                            asChild
                            isActive={isActive}
                            data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                          >
                            <a href={item.path} className="flex items-center justify-between w-full">
                              <div className="flex items-center gap-2">
                                <item.icon className="h-4 w-4" />
                                <span>{item.label}</span>
                              </div>
                              {item.badge && item.badge > 0 && (
                                <Badge 
                                  variant="secondary" 
                                  className="ml-auto h-5 min-w-5 px-1 text-xs"
                                  data-testid={`badge-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                                >
                                  {item.badge}
                                </Badge>
                              )}
                            </a>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>

          <SidebarFooter className="border-t">
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton
                      size="lg"
                      className="w-full"
                      data-testid="button-user-menu"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 text-left text-sm leading-tight">
                        <div className="font-semibold truncate">{user?.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {user?.email}
                        </div>
                      </div>
                      <ChevronDown className="h-4 w-4 ml-auto" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="top"
                    align="end"
                    className="w-56"
                  >
                    <DropdownMenuLabel>My Account</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <a href="/artist/settings" data-testid="menu-settings">
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleLogout}
                      data-testid="menu-logout"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Log Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between px-4 h-14 border-b">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
