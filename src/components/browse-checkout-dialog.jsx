import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShoppingCart, Minus, Plus, Tag, CheckCircle2 } from "lucide-react";

/**
 * Checkout modal for Browse tab — kept as JSX to avoid fragile minified _jsxs trees.
 */
export function BrowseCheckoutDialog({
    open,
    onOpenChange,
    handleSubmit,
    onCheckout,
    cart,
    changeQty,
    subtotal,
    appliedDiscount,
    discountInput,
    setDiscountInput,
    applyDiscount,
    register,
    errors,
    checkoutSubmitDisabled,
    placeOrderButtonLabel,
    setShowCheckout,
    total,
    fmt,
    watch,
}) {
    const requestPlan = watch ? watch("requestPaymentPlan") : false;
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShoppingCart className="h-5 w-5" />
                        Checkout
                    </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit(onCheckout)} className="space-y-5">
                    <div className="rounded-lg border divide-y text-sm">
                        {cart.map((item) => (
                            <div key={item.product.id} className="flex items-center justify-between gap-3 px-3 py-2">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-medium">{item.product.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {fmt(item.product.sellingPrice)} each
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="outline"
                                        className="h-6 w-6"
                                        onClick={() => changeQty(item.product.id, -1)}
                                    >
                                        <Minus className="h-3 w-3" />
                                    </Button>
                                    <span className="w-6 text-center tabular-nums">{item.quantity}</span>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="outline"
                                        className="h-6 w-6"
                                        onClick={() => changeQty(item.product.id, 1)}
                                    >
                                        <Plus className="h-3 w-3" />
                                    </Button>
                                </div>
                                <span className="w-20 shrink-0 text-right font-semibold tabular-nums">
                                    {fmt(item.product.sellingPrice * item.quantity)}
                                </span>
                            </div>
                        ))}
                        <div className="flex justify-between px-3 py-2 font-medium">
                            <span>Subtotal</span>
                            <span className="font-mono">{fmt(subtotal)}</span>
                        </div>
                        {appliedDiscount && (
                            <div className="flex justify-between px-3 py-1 text-green-700">
                                <span className="flex items-center gap-1">
                                    <Tag className="h-3.5 w-3.5" />
                                    {appliedDiscount.code}
                                </span>
                                <span>
                                    {"\u2212"}
                                    {fmt(appliedDiscount.discountAmount)}
                                </span>
                            </div>
                        )}
                        <div className="flex justify-between px-3 py-2 font-bold text-primary">
                            <span>Total</span>
                            <span className="font-mono">{fmt(total)}</span>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <Label>Discount code</Label>
                        <div className="flex gap-2">
                            <Input
                                value={discountInput}
                                onChange={(e) => setDiscountInput(e.target.value.toUpperCase())}
                                placeholder="SAVE10"
                                className="uppercase"
                            />
                            <Button type="button" variant="outline" onClick={applyDiscount} disabled={!discountInput}>
                                Apply
                            </Button>
                        </div>
                        {appliedDiscount && (
                            <p className="flex items-center gap-1 text-xs text-green-600">
                                <CheckCircle2 className="h-3 w-3" />
                                Discount applied — saving {fmt(appliedDiscount.discountAmount)}
                            </p>
                        )}
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="ship-addr">Shipping address *</Label>
                        <Textarea
                            id="ship-addr"
                            rows={3}
                            className={errors.shippingAddress ? "border-destructive" : undefined}
                            {...register("shippingAddress", {
                                required: "Shipping address is required",
                                validate: (v) =>
                                    (v ?? "").trim().length >= 5 ||
                                    "Enter at least 5 characters for the delivery address.",
                            })}
                            placeholder="123 Main St, City, Country"
                        />
                        {errors.shippingAddress && (
                            <p className="text-xs text-destructive" role="alert">
                                {errors.shippingAddress.message}
                            </p>
                        )}
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="order-notes">Order notes</Label>
                        <Input id="order-notes" {...register("notes")} placeholder="Special requirements…" />
                    </div>
                    <div className="space-y-3 rounded-lg border border-dashed border-primary/25 bg-muted/20 p-3">
                        <div className="flex items-start gap-3">
                            <input
                                type="checkbox"
                                id="req-payment-plan"
                                className="mt-1 h-4 w-4 rounded border-input"
                                {...register("requestPaymentPlan")}
                            />
                            <Label htmlFor="req-payment-plan" className="cursor-pointer text-sm font-normal leading-snug">
                                Request a payment plan from sales (advance + installments). A sales manager will propose
                                options and follow up.
                            </Label>
                        </div>
                        {requestPlan && (
                            <div className="space-y-1 pl-7">
                                <Label htmlFor="plan-notes">Notes for sales (optional)</Label>
                                <Textarea
                                    id="plan-notes"
                                    rows={2}
                                    {...register("paymentPlanNotes")}
                                    placeholder="e.g. Prefer 30% advance, balance in three monthly payments…"
                                />
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" type="button" onClick={() => setShowCheckout(false)}>
                            Back to shopping
                        </Button>
                        <Button type="submit" disabled={checkoutSubmitDisabled}>
                            {placeOrderButtonLabel}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
