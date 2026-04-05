import { ReactNode, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { getAuthToken } from "@/lib/auth";

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [location, setLocation] = useLocation();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setLocation("/login");
    } else {
      setIsChecking(false);
    }
  }, [location, setLocation]);

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return <>{children}</>;
}
