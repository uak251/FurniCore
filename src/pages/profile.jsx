import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { useGetCurrentUser, usePatchCurrentUserProfile, usePostCurrentUserAvatar, useDeleteCurrentUserAvatar, getGetCurrentUserQueryKey, } from "@workspace/api-client-react";
import { ArrowLeft, UserCircle, Loader2, Phone, Upload, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { preferencesPathForRole } from "@/lib/profile-path";
import { resolvePublicAssetUrl } from "@/lib/image-url";
import { useCustomerProfile, usePatchCustomerProfile } from "@/hooks/use-customer-profile";
import { CURRENCIES } from "@/lib/currency";

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
    const [localPreview, setLocalPreview] = useState(null);
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
        </div>
    );
}
