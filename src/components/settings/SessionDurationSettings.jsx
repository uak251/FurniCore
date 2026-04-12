import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getAuthToken } from "@/lib/auth";
import { apiOriginPrefix } from "@/lib/api-base";
import { useGetCurrentUser } from "@workspace/api-client-react";

/** Must match `SESSION_DURATION_PRESETS` / validation on the API. */
export const SESSION_DURATION_OPTIONS = [
    { value: "30m", label: "30 minutes" },
    { value: "1h", label: "1 hour" },
    { value: "1d", label: "1 day" },
    { value: "persistent", label: "Always signed in (long session)" },
];

const API_BASE = apiOriginPrefix();

function resolveFetchUrl(path) {
    const p = path.startsWith("/") ? path : `/${path}`;
    if (API_BASE)
        return `${API_BASE}${p}`;
    return p;
}

async function fetchSessionPolicy() {
    const res = await fetch(resolveFetchUrl("/api/auth/session-policy"));
    if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
    }
    return res.json();
}

async function apiFetchSettings(path, init) {
    const res = await fetch(resolveFetchUrl(path), {
        ...init,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAuthToken() ?? ""}`,
            ...(init?.headers ?? {}),
        },
    });
    if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
    }
    return res.json();
}

/**
 * Master admin: org-wide JWT access + refresh lifetimes (stored in app_settings.SESSION_DURATION).
 * Uses public GET /api/auth/session-policy to read the active preset (no admin-only GET /settings/:key).
 */
export function SessionDurationSettings() {
    const { data: me } = useGetCurrentUser();
    const { toast } = useToast();
    const [value, setValue] = useState("1h");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const isAdmin = me?.role === "admin";

    useEffect(() => {
        if (!isAdmin)
            return;
        setLoading(true);
        fetchSessionPolicy()
            .then((data) => {
                const preset = data?.sessionDuration;
                if (preset && SESSION_DURATION_OPTIONS.some((o) => o.value === preset)) {
                    setValue(preset);
                }
            })
            .catch(() => {
                /* keep default */
            })
            .finally(() => setLoading(false));
    }, [isAdmin]);

    const save = async (next) => {
        setSaving(true);
        try {
            await apiFetchSettings("/api/settings/SESSION_DURATION", {
                method: "PUT",
                body: JSON.stringify({ value: next }),
            });
            setValue(next);
            toast({
                title: "Session policy saved",
                description:
                    "New sign-ins and token refreshes use this duration. Current users keep their existing tokens until they expire or refresh.",
            });
        }
        catch (err) {
            toast({
                variant: "destructive",
                title: "Failed to save",
                description: err instanceof Error ? err.message : "Unknown error",
            });
        }
        finally {
            setSaving(false);
        }
    };

    if (!isAdmin)
        return null;

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <CardTitle className="text-base">Session duration</CardTitle>
                </div>
                <CardDescription>
                    How long access tokens stay valid before refresh. Applies to all ERP modules and portals for new
                    tokens. Admin only.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="space-y-1.5 min-w-64">
                    <Label htmlFor="session-duration-select">Idle session &amp; token lifetime</Label>
                    <Select
                        value={value}
                        onValueChange={(v) => save(v)}
                        disabled={loading || saving}
                    >
                        <SelectTrigger id="session-duration-select" className="w-72">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {SESSION_DURATION_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                    <p>
                        <strong>30m–1d</strong> — access JWT matches the window; refresh tokens stay valid longer so
                        users are not logged out while working.
                    </p>
                    <p>
                        <strong>Always signed in</strong> — access tokens rotate every 24 hours; refresh tokens last
                        up to 10 years until logout.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
