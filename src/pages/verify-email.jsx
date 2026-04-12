import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * /verify-email?token=<JWT>
 *
 * This page is reached when the user clicks the link in the verification email.
 * It calls GET /api/auth/verify-email?token=… and renders one of three states:
 *   • verifying  — spinner while the request is in flight
 *   • success    — green confirmation with a "Go to login" button
 *   • error      — red error card with a "Resend" option
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Hammer, Loader2, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiOriginPrefix } from "@/lib/api-base";
/* ─── API helpers ─────────────────────────────────────────────────────────── */
const API = apiOriginPrefix();
async function verifyEmail(token) {
    const res = await fetch(`${API}/api/auth/verify-email?token=${encodeURIComponent(token)}`);
    const json = await res.json();
    if (!res.ok)
        throw { status: res.status, data: json };
    return json;
}
async function resendVerification(email) {
    const res = await fetch(`${API}/api/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
    });
    const json = await res.json();
    if (!res.ok)
        throw { status: res.status, data: json };
    return json;
}
/* ─── Sub-states ─────────────────────────────────────────────────────────── */
function Verifying() {
    return (_jsxs("div", { className: "flex flex-col items-center gap-4 py-12 text-center", children: [_jsx(Loader2, { className: "h-12 w-12 animate-spin text-primary" }), _jsx("p", { className: "text-lg font-medium", children: "Verifying your email\u2026" }), _jsx("p", { className: "text-sm text-muted-foreground", children: "This should only take a moment." })] }));
}
function VerifySuccess({ message }) {
    return (_jsxs("div", { className: "flex flex-col items-center gap-5 py-12 text-center", children: [_jsx("div", { className: "rounded-full bg-green-100 p-4", children: _jsx(CheckCircle2, { className: "h-12 w-12 text-green-600" }) }), _jsxs("div", { children: [_jsx("h2", { className: "text-xl font-semibold", children: "Email verified!" }), _jsx("p", { className: "mt-2 text-sm text-muted-foreground leading-relaxed max-w-xs", children: message })] }), _jsx(Button, { asChild: true, className: "mt-2", children: _jsx(Link, { href: "/login", children: "Continue to Sign In" }) })] }));
}
function VerifyError({ message, onResent, }) {
    const { toast } = useToast();
    const [email, setEmail] = useState("");
    const [resending, setResending] = useState(false);
    const handleResend = async () => {
        if (!email.includes("@")) {
            toast({ variant: "destructive", title: "Enter your email first" });
            return;
        }
        setResending(true);
        try {
            await resendVerification(email);
            toast({ title: "New link sent", description: "Check your inbox." });
            onResent();
        }
        catch (err) {
            const msg = err?.data?.message ?? "Could not resend. Please try again shortly.";
            toast({ variant: "destructive", title: "Failed to resend", description: msg });
        }
        finally {
            setResending(false);
        }
    };
    return (_jsxs("div", { className: "flex flex-col items-center gap-5 py-10 text-center", children: [_jsx("div", { className: "rounded-full bg-destructive/10 p-4", children: _jsx(XCircle, { className: "h-12 w-12 text-destructive" }) }), _jsxs("div", { children: [_jsx("h2", { className: "text-xl font-semibold", children: "Verification failed" }), _jsx("p", { className: "mt-2 text-sm text-muted-foreground leading-relaxed max-w-xs", children: message })] }), _jsxs("div", { className: "w-full space-y-2 mt-2", children: [_jsx("p", { className: "text-sm text-muted-foreground", children: "Enter your email to get a new verification link:" }), _jsx("input", { type: "email", placeholder: "you@example.com", value: email, onChange: (e) => setEmail(e.target.value), className: "w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" }), _jsx(Button, { className: "w-full", variant: "outline", onClick: handleResend, disabled: resending, children: resending ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "mr-2 h-4 w-4 animate-spin" }), " Sending\u2026"] })) : (_jsxs(_Fragment, { children: [_jsx(RefreshCw, { className: "mr-2 h-4 w-4" }), " Resend verification email"] })) })] }), _jsx(Button, { variant: "ghost", asChild: true, children: _jsx(Link, { href: "/login", children: "Back to Sign In" }) })] }));
}
export default function VerifyEmailPage() {
    const [location] = useLocation();
    const [state, setState] = useState({ status: "verifying" });
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const token = params.get("token");
        if (!token) {
            setState({ status: "error", message: "No verification token found in the URL. Please use the link from your email." });
            return;
        }
        verifyEmail(token)
            .then((res) => setState({ status: "success", message: res.message }))
            .catch((err) => {
            const msg = err?.data?.message ??
                "This verification link is invalid or has expired. Please request a new one.";
            setState({ status: "error", message: msg });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location]);
    return (_jsx("div", { className: "min-h-screen bg-background flex flex-col justify-center items-center p-4", children: _jsxs("div", { className: "w-full max-w-[420px]", children: [_jsxs("div", { className: "flex flex-col items-center mb-8", children: [_jsx("div", { className: "w-12 h-12 bg-primary rounded-xl flex items-center justify-center mb-4 shadow-md", children: _jsx(Hammer, { className: "h-6 w-6 text-primary-foreground" }) }), _jsx("h1", { className: "text-3xl font-bold tracking-tight", children: "FurniCore" }), _jsx("p", { className: "text-muted-foreground mt-2", children: "Precision ERP for Manufacturing" })] }), _jsx(Card, { className: "border-border/40 shadow-xl", children: _jsxs(CardContent, { className: "px-8", children: [state.status === "verifying" && _jsx(Verifying, {}), state.status === "success" && _jsx(VerifySuccess, { message: state.message }), state.status === "error" && (_jsx(VerifyError, { message: state.message, onResent: () => setState({ status: "resent" }) })), state.status === "resent" && (_jsx(VerifySuccess, { message: "A new verification link has been sent to your inbox. Click the link in that email to activate your account." }))] }) })] }) }));
}
