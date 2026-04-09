import { jsx as _jsx } from "react/jsx-runtime";
import { Link } from "wouter";
import { UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
export function ProfileNavButton({ href }) {
    return (_jsx(Button, { variant: "outline", size: "icon", className: "shrink-0", asChild: true, title: "Profile", children: _jsx(Link, { href: href, "aria-label": "Profile", children: _jsx(UserCircle, { className: "h-4 w-4", "aria-hidden": true }) }) }));
}
