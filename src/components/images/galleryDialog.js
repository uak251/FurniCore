/**
 * Shared layout for ERP module image gallery dialogs (inventory, products, suppliers, HR, payroll).
 * Keeps mobile width safe, scrolls body only, fixed header.
 */
export const MODULE_GALLERY_DIALOG_CONTENT_CLASS = "flex max-h-[min(92vh,920px)] w-[calc(100vw-1rem)] max-w-4xl flex-col gap-0 overflow-hidden border bg-background p-0 shadow-xl sm:mx-auto sm:w-full";
export const MODULE_GALLERY_DIALOG_HEADER_CLASS = "shrink-0 border-b border-border/60 px-4 py-3 text-left sm:px-6 sm:py-4";
export const MODULE_GALLERY_DIALOG_BODY_CLASS = "min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-4 pt-1 sm:px-6 sm:pb-6 sm:pt-2";
export const MODULE_GALLERY_DIALOG_TITLE_CLASS = "text-base font-semibold leading-snug sm:text-lg";
