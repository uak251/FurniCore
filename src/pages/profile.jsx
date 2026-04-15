import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { useGetCurrentUser, usePatchCurrentUserProfile, usePostCurrentUserAvatar, useDeleteCurrentUserAvatar, getGetCurrentUserQueryKey, } from "@workspace/api-client-react";
import { ArrowLeft, UserCircle, Loader2, Phone, Upload, Trash2, ShieldCheck, KeyRound, Copy, Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { preferencesPathForRole } from "@/lib/profile-path";
import { resolvePublicAssetUrl } from "@/lib/image-url";
import { useCustomerProfile, usePatchCustomerProfile } from "@/hooks/use-customer-profile";
import { CURRENCIES } from "@/lib/currency";
import { apiOriginPrefix } from "@/lib/api-base";
import { getAuthToken, applyAuthSession, setTrustedDeviceToken } from "@/lib/auth";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

/** Form value: no explicit override — use API `localityCurrency` / `effectiveDisplayCurrency`. */
const REGIONAL_CURRENCY_DEFAULT = "__regional__";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
/**
 * Self-service profile: display name, phone, uploaded avatar. Email is read-only.
 */
export default function ProfilePage() {
    const { data: me, isLoading: userLoading } = useGetCurrentUser();
    const isCustomer = me?.role === "customer";
    const { data: custProf } = useCustomerProfile(isCustomer);
    const patchCust = usePatchCustomerProfile();
    const qc = useQueryClient();
    const { toast } = useToast();
    const fileRef = useRef(null);
    const API = apiOriginPrefix();
    const [localPreview, setLocalPreview] = useState(null);
    const [twoFactorLoading, setTwoFactorLoading] = useState(true);
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
    const [twoFactorBusy, setTwoFactorBusy] = useState(false);
    const [twoFactorError, setTwoFactorError] = useState("");
    const [twoFactorSuccess, setTwoFactorSuccess] = useState("");
    const [setupToken, setSetupToken] = useState("");
    const [setupQr, setSetupQr] = useState("");
    const [setupManualKey, setSetupManualKey] = useState("");
    const [otpCode, setOtpCode] = useState("");
    const [backupCodes, setBackupCodes] = useState([]);
    const [backupRemaining, setBackupRemaining] = useState(0);
    const [backupBusy, setBackupBusy] = useState(false);
    const [sessions, setSessions] = useState([]);
    const [sessionsBusy, setSessionsBusy] = useState(false);
    const authHeaders = () => ({ Authorization: `Bearer ${getAuthToken() ?? ""}` });
    const invalidateMe = () => qc.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
    const patch = usePatchCurrentUserProfile({
        mutation: {
            onSuccess: async () => {
                await invalidateMe();
                toast({ title: "Profile saved" });
            },
            onError: (e) => {
                toast({ variant: "destructive", title: "Could not save", description: e?.message ?? "Unknown error" });
            },
        },
    });
    const postAvatar = usePostCurrentUserAvatar({
        mutation: {
            onSuccess: async () => {
                setLocalPreview(null);
                await invalidateMe();
                toast({ title: "Photo updated" });
            },
            onError: (e) => {
                toast({ variant: "destructive", title: "Upload failed", description: e?.message ?? "Unknown error" });
            },
        },
    });
    const deleteAvatar = useDeleteCurrentUserAvatar({
        mutation: {
            onSuccess: async () => {
                setLocalPreview(null);
                await invalidateMe();
                toast({ title: "Photo removed" });
            },
            onError: (e) => {
                toast({ variant: "destructive", title: "Could not remove photo", description: e?.message ?? "Unknown error" });
            },
        },
    });
    const { register, handleSubmit, reset, formState: { isDirty }, setValue, watch } = useForm({
        defaultValues: { name: "", phone: "", country: "", cityRegion: "", preferredCurrency: REGIONAL_CURRENCY_DEFAULT, timezone: "" },
    });
    useEffect(() => {
        if (!me)
            return;
        reset({
            name: me.name ?? "",
            phone: me.phone ?? "",
            country: custProf?.country ?? "",
            cityRegion: custProf?.cityRegion ?? "",
            preferredCurrency: custProf?.preferredCurrency ?? REGIONAL_CURRENCY_DEFAULT,
            timezone: custProf?.timezone ?? "",
        });
    }, [me, custProf, reset]);
    useEffect(() => {
        return () => {
            if (localPreview?.startsWith("blob:")) {
                URL.revokeObjectURL(localPreview);
            }
        };
    }, [localPreview]);
    useEffect(() => {
        if (!me?.id) {
            setTwoFactorLoading(false);
            return;
        }
        let cancelled = false;
        const load = async () => {
            setTwoFactorLoading(true);
            setTwoFactorError("");
            try {
                const res = await fetch(`${API}/api/auth/2fa/status`, {
                    headers: authHeaders(),
                });
                const json = await res.json();
                if (!res.ok) {
                    throw new Error(json?.message || "Could not load two-factor status.");
                }
                if (!cancelled) {
                    setTwoFactorEnabled(Boolean(json?.enabled));
                }
                const backupRes = await fetch(`${API}/api/auth/2fa/backup-codes/status`, { headers: authHeaders() });
                const backupJson = await backupRes.json();
                if (!backupRes.ok) {
                    throw new Error(backupJson?.message || "Could not load backup code status.");
                }
                if (!cancelled) {
                    setBackupRemaining(Number(backupJson?.remaining || 0));
                }
                const sessionsRes = await fetch(`${API}/api/auth/sessions`, { headers: authHeaders() });
                const sessionsJson = await sessionsRes.json();
                if (!sessionsRes.ok) {
                    throw new Error(sessionsJson?.message || "Could not load sessions.");
                }
                if (!cancelled) {
                    setSessions(Array.isArray(sessionsJson?.sessions) ? sessionsJson.sessions : []);
                }
            }
            catch (e) {
                if (!cancelled) {
                    setTwoFactorError(e instanceof Error ? e.message : "Could not load two-factor status.");
                }
            }
            finally {
                if (!cancelled) {
                    setTwoFactorLoading(false);
                }
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [me?.id, API]);
    const backHref = me?.role === "supplier"
        ? "/supplier-portal"
        : me?.role === "worker"
            ? "/worker-portal"
            : me?.role === "customer"
                ? "/customer-portal"
                : "/";
    const backLabel = me?.role === "supplier" || me?.role === "worker" || me?.role === "customer"
        ? "Back to portal"
        : "Back to dashboard";
    const onSubmit = async (data) => {
        const phoneTrim = data.phone?.trim() ?? "";
        await patch.mutateAsync({
            data: {
                name: data.name.trim(),
                phone: phoneTrim === "" ? null : phoneTrim,
            },
        });
        if (isCustomer) {
            await patchCust.mutateAsync({
                fullName: data.name.trim(),
                country: data.country?.trim() || "",
                cityRegion: data.cityRegion?.trim() || "",
                preferredCurrency: data.preferredCurrency === REGIONAL_CURRENCY_DEFAULT ? null : data.preferredCurrency,
                timezone: data.timezone?.trim() || "",
            });
        }
    };
    const savedAvatarSrc = me?.profileImageUrl ? resolvePublicAssetUrl(me.profileImageUrl) : "";
    const previewSrc = localPreview || savedAvatarSrc || undefined;
    const hasAvatar = Boolean(me?.profileImageUrl || localPreview);
    const onFileChange = (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f)
            return;
        if (!f.type.startsWith("image/")) {
            toast({ variant: "destructive", title: "Not an image", description: "Choose a JPEG, PNG, WebP, or GIF file." });
            return;
        }
        if (localPreview?.startsWith("blob:")) {
            URL.revokeObjectURL(localPreview);
        }
        setLocalPreview(URL.createObjectURL(f));
        postAvatar.mutate({ data: { image: f } });
    };
    const resetTwoFactorSetupState = () => {
        setSetupToken("");
        setSetupQr("");
        setSetupManualKey("");
        setOtpCode("");
    };
    const startTwoFactorSetup = async () => {
        setTwoFactorBusy(true);
        setTwoFactorError("");
        setTwoFactorSuccess("");
        try {
            const res = await fetch(`${API}/api/auth/2fa/setup-authenticated`, {
                method: "POST",
                headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` },
            });
            const json = await res.json();
            if (!res.ok) {
                throw new Error(json?.message || "Unable to start setup.");
            }
            setSetupToken(json?.data?.setupToken || "");
            setSetupQr(json?.data?.qrDataUrl || "");
            setSetupManualKey(json?.data?.manualKey || "");
        }
        catch (e) {
            setTwoFactorError(e instanceof Error ? e.message : "Unable to start setup.");
        }
        finally {
            setTwoFactorBusy(false);
        }
    };
    const verifyTwoFactorSetup = async () => {
        setTwoFactorError("");
        setTwoFactorSuccess("");
        if (!/^\d{6}$/.test(otpCode)) {
            setTwoFactorError("Invalid OTP");
            return;
        }
        setTwoFactorBusy(true);
        try {
            const res = await fetch(`${API}/api/auth/2fa/verify-setup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ setupToken, otp: otpCode }),
            });
            const json = await res.json();
            if (!res.ok) {
                const msg = String(json?.message || "");
                throw new Error(/expired/i.test(msg) ? "OTP expired" : (msg || "Invalid OTP"));
            }
            applyAuthSession(json);
            if (json?.trustedDeviceToken) {
                setTrustedDeviceToken(json.trustedDeviceToken);
            }
            setTwoFactorEnabled(true);
            resetTwoFactorSetupState();
            setTwoFactorSuccess("Two-factor authentication has been enabled.");
        }
        catch (e) {
            setTwoFactorError(e instanceof Error ? e.message : "Invalid OTP");
        }
        finally {
            setTwoFactorBusy(false);
        }
    };
    const disableTwoFactor = async () => {
        setTwoFactorError("");
        setTwoFactorSuccess("");
        if (!/^\d{6}$/.test(otpCode)) {
            setTwoFactorError("Enter your current 6-digit OTP to disable two-factor authentication.");
            return;
        }
        setTwoFactorBusy(true);
        try {
            const res = await fetch(`${API}/api/auth/2fa/disable`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${getAuthToken() ?? ""}`,
                },
                body: JSON.stringify({ otp: otpCode }),
            });
            const json = await res.json();
            if (!res.ok) {
                const msg = String(json?.message || "");
                throw new Error(/expired/i.test(msg) ? "OTP expired" : (msg || "Invalid OTP"));
            }
            setTwoFactorEnabled(false);
            resetTwoFactorSetupState();
            setTwoFactorSuccess("Two-factor authentication has been disabled.");
        }
        catch (e) {
            setTwoFactorError(e instanceof Error ? e.message : "Invalid OTP");
        }
        finally {
            setTwoFactorBusy(false);
        }
    };
    const regenerateBackupCodes = async () => {
        setBackupBusy(true);
        setTwoFactorError("");
        setTwoFactorSuccess("");
        try {
            const res = await fetch(`${API}/api/auth/2fa/backup-codes/regenerate`, {
                method: "POST",
                headers: authHeaders(),
            });
            const json = await res.json();
            if (!res.ok) {
                throw new Error(json?.message || "Could not generate backup codes.");
            }
            const codes = Array.isArray(json?.codes) ? json.codes : [];
            setBackupCodes(codes);
            setBackupRemaining(codes.length);
            setTwoFactorSuccess("Backup recovery codes generated. Store them safely; they are shown only once.");
        }
        catch (e) {
            setTwoFactorError(e instanceof Error ? e.message : "Could not generate backup codes.");
        }
        finally {
            setBackupBusy(false);
        }
    };
    const copyBackupCodes = async () => {
        if (backupCodes.length === 0)
            return;
        await navigator.clipboard.writeText(backupCodes.join("\n"));
        setTwoFactorSuccess("Backup codes copied to clipboard.");
    };
    const downloadBackupCodes = () => {
        if (backupCodes.length === 0)
            return;
        const blob = new Blob([`FurniCore backup codes\n\n${backupCodes.join("\n")}\n`], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "furnicore-backup-codes.txt";
        a.click();
        URL.revokeObjectURL(url);
    };
    const refreshSessions = async () => {
        setSessionsBusy(true);
        try {
            const res = await fetch(`${API}/api/auth/sessions`, { headers: authHeaders() });
            const json = await res.json();
            if (!res.ok) {
                throw new Error(json?.message || "Could not load sessions.");
            }
            setSessions(Array.isArray(json?.sessions) ? json.sessions : []);
        }
        catch (e) {
            setTwoFactorError(e instanceof Error ? e.message : "Could not load sessions.");
        }
        finally {
            setSessionsBusy(false);
        }
    };
    const revokeSession = async (sessionId) => {
        setSessionsBusy(true);
        setTwoFactorError("");
        try {
            const res = await fetch(`${API}/api/auth/sessions/revoke`, {
                method: "POST",
                headers: {
                    ...authHeaders(),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ sessionId }),
            });
            const json = await res.json();
            if (!res.ok) {
                throw new Error(json?.message || "Could not revoke session.");
            }
            await refreshSessions();
            setTwoFactorSuccess("Session revoked.");
        }
        catch (e) {
            setTwoFactorError(e instanceof Error ? e.message : "Could not revoke session.");
        }
        finally {
            setSessionsBusy(false);
        }
    };
    const revokeAllSessions = async () => {
        setSessionsBusy(true);
        setTwoFactorError("");
        try {
            const res = await fetch(`${API}/api/auth/sessions/revoke-all`, {
                method: "POST",
                headers: authHeaders(),
            });
            const json = await res.json();
            if (!res.ok) {
                throw new Error(json?.message || "Could not revoke sessions.");
            }
            await refreshSessions();
            setTwoFactorSuccess("All sessions revoked.");
        }
        catch (e) {
            setTwoFactorError(e instanceof Error ? e.message : "Could not revoke sessions.");
        }
        finally {
            setSessionsBusy(false);
        }
    };
    return (
        <div className="space-y-8">
            <div className="flex flex-wrap items-start gap-4">
                <Button variant="ghost" size="sm" className="-ml-2 gap-1" asChild>
                    <Link href={backHref}>
                        <ArrowLeft className="h-4 w-4" aria-hidden />
                        {backLabel}
                    </Link>
                </Button>
            </div>
            <div>
                <div className="flex items-center gap-2">
                    <UserCircle className="h-8 w-8 text-primary" aria-hidden />
                    <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
                </div>
                <p className="mt-1 max-w-2xl text-muted-foreground">
                    Update how you appear in FurniCore. Your email is tied to login and can only be changed by an administrator.
                </p>
            </div>
            {userLoading && !me ? (
                <div className="flex justify-center py-16 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Contact & avatar</CardTitle>
                        <CardDescription>
                            Upload a profile photo (JPEG, PNG, WebP, or GIF, up to 2 MB). It is stored on the server and shown across FurniCore.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                            <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted">
                                {previewSrc ? (
                                    <img src={previewSrc} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <UserCircle className="h-16 w-16 text-muted-foreground" aria-hidden />
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={onFileChange} />
                                <Button type="button" variant="secondary" disabled={postAvatar.isPending} onClick={() => fileRef.current?.click()}>
                                    {postAvatar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                                    {hasAvatar ? "Change photo" : "Upload photo"}
                                </Button>
                                {hasAvatar && me?.profileImageUrl && (
                                    <Button type="button" variant="outline" disabled={deleteAvatar.isPending || postAvatar.isPending} onClick={() => deleteAvatar.mutate()}>
                                        {deleteAvatar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                        Remove photo
                                    </Button>
                                )}
                            </div>
                        </div>
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5 sm:col-span-2">
                                    <Label htmlFor="profile-name">Display name</Label>
                                    <Input id="profile-name" {...register("name", { required: true, minLength: 2 })} autoComplete="name" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="profile-email" className="flex items-center gap-1.5">
                                        Email
                                        <span className="text-xs font-normal text-muted-foreground">(read-only)</span>
                                    </Label>
                                    <Input id="profile-email" value={me?.email ?? ""} disabled className="bg-muted/60" readOnly />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="profile-phone" className="flex items-center gap-1.5">
                                        <Phone className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                                        Mobile / phone
                                    </Label>
                                    <Input id="profile-phone" type="tel" placeholder="+1 …" {...register("phone")} autoComplete="tel" />
                                </div>
                                {isCustomer && (
                                    <>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="profile-country">Country</Label>
                                            <Input id="profile-country" {...register("country")} autoComplete="country-name" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label htmlFor="profile-city">City / region</Label>
                                            <Input id="profile-city" {...register("cityRegion")} />
                                        </div>
                                        <div className="space-y-1.5 sm:col-span-2">
                                            <p className="text-sm text-muted-foreground">
                                                <span className="font-medium text-foreground">Regional default currency</span>
                                                {": "}
                                                {custProf?.localityCurrency ?? "—"}
                                                {" "}
                                                (from your country when we can map it, otherwise from your browser language).
                                                {" "}
                                                {custProf?.effectiveDisplayCurrency != null && (
                                                    <span className="text-foreground/80">
                                                        Amounts use{" "}
                                                        <span className="font-medium text-foreground">{custProf.effectiveDisplayCurrency}</span>
                                                        {custProf.preferredCurrency ? " (override)." : "."}
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>Optional currency override</Label>
                                            <Select value={watch("preferredCurrency")} onValueChange={(v) => setValue("preferredCurrency", v, { shouldDirty: true })}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Regional default" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={REGIONAL_CURRENCY_DEFAULT}>
                                                        Use regional default ({custProf?.localityCurrency ?? "…"})
                                                    </SelectItem>
                                                    {CURRENCIES.map((c) => (
                                                        <SelectItem key={c.code} value={c.code}>
                                                            {c.code} — {c.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5 sm:col-span-2">
                                            <Label htmlFor="profile-tz">Timezone (optional)</Label>
                                            <Input id="profile-tz" placeholder="e.g. America/New_York" {...register("timezone")} />
                                        </div>
                                    </>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button type="submit" disabled={patch.isPending || patchCust.isPending || !isDirty}>
                                    {patch.isPending || patchCust.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
                                </Button>
                                {me && (
                                    <Button type="button" variant="outline" asChild>
                                        <Link href={preferencesPathForRole(me.role)}>Appearance settings</Link>
                                    </Button>
                                )}
                            </div>
                        </form>
                        {me?.role && (
                            <p className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">Role: {me.role}</span>
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}
            {!userLoading && me ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <ShieldCheck className="h-5 w-5 text-primary" />
                            Security: Google Authenticator (2FA)
                        </CardTitle>
                        <CardDescription>
                            Add a second verification step during sign-in with a 6-digit authenticator code.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {twoFactorLoading ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading two-factor status...
                            </div>
                        ) : null}
                        {twoFactorError ? (
                            <Alert variant="destructive">
                                <AlertDescription>{twoFactorError}</AlertDescription>
                            </Alert>
                        ) : null}
                        {twoFactorSuccess ? (
                            <Alert className="border-green-200 bg-green-50 text-green-800">
                                <AlertDescription>{twoFactorSuccess}</AlertDescription>
                            </Alert>
                        ) : null}
                        {!twoFactorLoading && !twoFactorEnabled && !setupToken ? (
                            <Button type="button" onClick={startTwoFactorSetup} disabled={twoFactorBusy}>
                                {twoFactorBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                                Enable two-factor authentication
                            </Button>
                        ) : null}
                        {!twoFactorLoading && !twoFactorEnabled && setupToken ? (
                            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                                <p className="text-sm font-medium">1) Scan this QR code in Google Authenticator</p>
                                {setupQr ? (
                                    <img src={setupQr} alt="Google Authenticator setup QR code" className="mx-auto h-40 w-40 rounded-md border bg-white p-2" />
                                ) : null}
                                <p className="text-xs text-muted-foreground">
                                    Manual key: <span className="font-mono text-foreground">{setupManualKey}</span>
                                </p>
                                <div className="space-y-1">
                                    <Label htmlFor="enable-2fa-otp">2) Enter 6-digit OTP to confirm</Label>
                                    <div className="flex justify-center py-1">
                                        <InputOTP
                                            id="enable-2fa-otp"
                                            maxLength={6}
                                            value={otpCode}
                                            onChange={(val) => {
                                                setOtpCode(val.replace(/\D/g, "").slice(0, 6));
                                                setTwoFactorError("");
                                            }}
                                        >
                                            <InputOTPGroup>
                                                <InputOTPSlot index={0} />
                                                <InputOTPSlot index={1} />
                                                <InputOTPSlot index={2} />
                                                <InputOTPSlot index={3} />
                                                <InputOTPSlot index={4} />
                                                <InputOTPSlot index={5} />
                                            </InputOTPGroup>
                                        </InputOTP>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button type="button" onClick={verifyTwoFactorSetup} disabled={twoFactorBusy}>
                                        {twoFactorBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                        Verify and enable
                                    </Button>
                                    <Button type="button" variant="outline" onClick={resetTwoFactorSetupState} disabled={twoFactorBusy}>
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        ) : null}
                        {!twoFactorLoading && twoFactorEnabled ? (
                            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                                <p className="text-sm font-medium text-green-700">Two-factor authentication is currently enabled.</p>
                                <div className="space-y-1">
                                    <Label htmlFor="disable-2fa-otp">Enter current 6-digit OTP to disable</Label>
                                    <div className="flex justify-center py-1">
                                        <InputOTP
                                            id="disable-2fa-otp"
                                            maxLength={6}
                                            value={otpCode}
                                            onChange={(val) => {
                                                setOtpCode(val.replace(/\D/g, "").slice(0, 6));
                                                setTwoFactorError("");
                                            }}
                                        >
                                            <InputOTPGroup>
                                                <InputOTPSlot index={0} />
                                                <InputOTPSlot index={1} />
                                                <InputOTPSlot index={2} />
                                                <InputOTPSlot index={3} />
                                                <InputOTPSlot index={4} />
                                                <InputOTPSlot index={5} />
                                            </InputOTPGroup>
                                        </InputOTP>
                                    </div>
                                </div>
                                <Button type="button" variant="outline" onClick={disableTwoFactor} disabled={twoFactorBusy}>
                                    {twoFactorBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Disable two-factor authentication
                                </Button>
                            </div>
                        ) : null}
                        {!twoFactorLoading && twoFactorEnabled ? (
                            <div className="space-y-3 rounded-lg border p-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-medium">Backup recovery codes</p>
                                    <p className="text-xs text-muted-foreground">{backupRemaining} unused code(s)</p>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Use a backup code when your authenticator app is unavailable. Each code works once.
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    <Button type="button" variant="outline" onClick={regenerateBackupCodes} disabled={backupBusy}>
                                        {backupBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                        Regenerate backup codes
                                    </Button>
                                    <Button type="button" variant="outline" onClick={copyBackupCodes} disabled={backupCodes.length === 0}>
                                        <Copy className="mr-2 h-4 w-4" />
                                        Copy
                                    </Button>
                                    <Button type="button" variant="outline" onClick={downloadBackupCodes} disabled={backupCodes.length === 0}>
                                        <Download className="mr-2 h-4 w-4" />
                                        Download
                                    </Button>
                                </div>
                                {backupCodes.length > 0 ? (
                                    <div className="grid gap-1 rounded-md border bg-muted/30 p-3 font-mono text-sm">
                                        {backupCodes.map((code) => (
                                            <p key={code}>{code}</p>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        Codes are only displayed immediately after generation.
                                    </p>
                                )}
                            </div>
                        ) : null}
                        <div className="space-y-3 rounded-lg border p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-medium">Active sessions and devices</p>
                                <div className="flex flex-wrap gap-2">
                                    <Button type="button" variant="outline" size="sm" onClick={refreshSessions} disabled={sessionsBusy}>
                                        {sessionsBusy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                                        Refresh
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" onClick={revokeAllSessions} disabled={sessionsBusy || sessions.length === 0}>
                                        Logout all devices
                                    </Button>
                                </div>
                            </div>
                            {sessions.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No active sessions found.</p>
                            ) : (
                                <div className="space-y-2">
                                    {sessions.map((session) => (
                                        <div key={session.sessionId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 p-2.5">
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium">
                                                    {session.deviceName}
                                                    {session.current ? " (current)" : ""}
                                                </p>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {session.userAgent || "Unknown browser"} · {session.ipAddress || "Unknown IP"}
                                                </p>
                                                <p className="text-[11px] text-muted-foreground">
                                                    Last active: {session.lastActiveAt ? new Date(session.lastActiveAt).toLocaleString() : "—"}
                                                </p>
                                            </div>
                                            {!session.current ? (
                                                <Button type="button" variant="outline" size="sm" onClick={() => revokeSession(session.sessionId)} disabled={sessionsBusy}>
                                                    Revoke
                                                </Button>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            ) : null}
        </div>
    );
}
