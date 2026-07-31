import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
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
import { Button } from "@/components/ui/button";
import {
  CheckCircle,
  Users,
  BarChart3,
  DollarSign,
  MessageSquare,
  Settings,
  LogOut,
  ChevronDown,
  Sparkles,
  Share2,
  Archive,
  Calculator,
  Wrench,
  Home,
} from "lucide-react";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  // Menu configuration grouped by workflow
  const menuItems = [
    {
      group: "Review",
      items: [
        {
          label: "Artwork Review",
          path: "/admin/dashboard",
          icon: CheckCircle,
        },
        {
          label: "Archived Artworks",
          path: "/admin/archived",
          icon: Archive,
        },
      ],
    },
    {
      group: "Artist Operations",
      items: [
        {
          label: "Manage Artists",
          path: "/admin/artists",
          icon: Users,
        },
        {
          label: "Success Stories",
          path: "/admin/testimonials",
          icon: MessageSquare,
        },
      ],
    },
    {
      group: "Influencer Marketing",
      items: [
        {
          label: "Influencers",
          path: "/admin/influencers",
          icon: Share2,
        },
      ],
    },
    {
      group: "Operations",
      items: [
        {
          label: "Empire Analytics",
          path: "/admin/empire",
          icon: BarChart3,
        },
        {
          label: "Financial Dashboard",
          path: "/admin/financial",
          icon: Calculator,
        },
        {
          label: "Payouts",
          path: "/admin/payouts",
          icon: DollarSign,
        },
      ],
    },
    {
      group: "Account",
      items: [
        {
          label: "Admin Tools",
          path: "/admin/tools",
          icon: Wrench,
        },
        {
          label: "Settings",
          path: "/admin/settings",
          icon: Settings,
        },
      ],
    },
  ];

  const handleLogout = async () => {
    await logout();
  };

  const initials = user?.email
    ? user.email
        .split("@")[0]
        .split(/[._-]/)
        .map((part) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "AD";

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <Sidebar>
          <SidebarHeader className="border-b">
            <div className="flex items-center gap-2 px-4 py-3">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-bold text-lg font-serif">Admin Portal</span>
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
                            <a href={item.path}>
                              <item.icon className="h-4 w-4" />
                              <span>{item.label}</span>
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
                <Button
                  variant="ghost"
                  onClick={handleLogout}
                  className="w-full justify-start min-h-[44px] text-base gap-2"
                  data-testid="button-logout-quick"
                >
                  <LogOut className="h-5 w-5" />
                  <span>Log Out</span>
                </Button>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuButton
                      size="lg"
                      className="w-full min-h-[44px]"
                      type="button"
                      data-testid="button-user-menu"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 text-left text-sm leading-tight">
                        <div className="font-semibold">Admin</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {user?.email}
                        </div>
                      </div>
                      <ChevronDown className="h-4 w-4 ml-auto" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="right"
                    align="end"
                    sideOffset={8}
                    className="w-56 z-[9999] mb-2"
                  >
                    <DropdownMenuLabel className="min-h-[44px] flex items-center">Admin Account</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <a href="/" className="min-h-[44px] flex items-center cursor-pointer" data-testid="menu-back-to-website">
                        <Home className="mr-2 h-4 w-4" />
                        Back to Website
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href="/admin/settings" className="min-h-[44px] flex items-center cursor-pointer" data-testid="menu-settings">
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleLogout}
                      className="min-h-[44px] flex items-center cursor-pointer"
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
          <header className="flex items-center justify-between px-4 h-14 border-b gap-2">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    data-testid="button-mobile-user-menu"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="min-h-[44px] flex items-center">Admin Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <a href="/" className="min-h-[44px] flex items-center cursor-pointer" data-testid="menu-mobile-back-to-website">
                      <Home className="mr-2 h-4 w-4" />
                      Back to Website
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href="/admin/settings" className="min-h-[44px] flex items-center cursor-pointer" data-testid="menu-mobile-settings">
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="min-h-[44px] flex items-center cursor-pointer"
                    data-testid="menu-mobile-logout"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
