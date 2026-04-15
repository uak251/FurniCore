import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { getAuthToken } from "@/lib/auth";
export function ProtectedRoute({ children }) {
    const [, setLocation] = useLocation();
    const [isChecking, setIsChecking] = useState(true);
    useEffect(() => {
        const token = getAuthToken();
        if (!token) {
            setLocation("/login");
        }
        else {
            setIsChecking(false);
        }
    }, [setLocation]);
    if (isChecking) {
        return (_jsx("div", { className: "min-h-screen flex items-center justify-center bg-background", "aria-live": "polite", children: _jsx("div", { className: "animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full", "aria-label": "Checking authentication" }) }));
    }
    return _jsx(_Fragment, { children: children });
}
