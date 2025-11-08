import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { ArrowLeft, Package } from "lucide-react";
import type { Kit } from "@shared/schema";

export default function Dashboard() {
  const { data: kits, isLoading, error } = useQuery<Kit[]>({
    queryKey: ["/api/kits"],
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button 
                variant="ghost" 
                size="icon"
                data-testid="button-back-home"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Creator Kits</h1>
              <p className="text-sm text-muted-foreground">
                Browse our collection of AI automation tools
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {error && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle>Error Loading Kits</CardTitle>
              <CardDescription>
                {error instanceof Error ? error.message : "Failed to load kits"}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} data-testid={`skeleton-kit-${i}`}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
                <CardFooter>
                  <Skeleton className="h-10 w-full" />
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && !error && kits && kits.length === 0 && (
          <Card>
            <CardHeader>
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="p-4 rounded-full bg-muted">
                  <Package className="w-8 h-8 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <CardTitle>No Kits Available</CardTitle>
                  <CardDescription className="mt-2">
                    Check back soon for new automation kits
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        {!isLoading && !error && kits && kits.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {kits.map((kit) => (
              <Card 
                key={kit.id} 
                className="flex flex-col hover-elevate"
                data-testid={`card-kit-${kit.id}`}
              >
                <CardHeader>
                  <CardTitle data-testid={`text-kit-name-${kit.id}`}>
                    {kit.name}
                  </CardTitle>
                  <CardDescription>
                    <span className="text-lg font-semibold text-foreground" data-testid={`text-kit-price-${kit.id}`}>
                      ${kit.price}
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <p className="text-sm text-muted-foreground line-clamp-3" data-testid={`text-kit-prompt-${kit.id}`}>
                    {kit.promptTemplate}
                  </p>
                </CardContent>
                <CardFooter>
                  <Button 
                    className="w-full" 
                    variant="default"
                    data-testid={`button-get-kit-${kit.id}`}
                  >
                    Get Kit
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
