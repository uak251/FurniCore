/** Profile editor route for the current portal (internal ERP vs isolated portals). */
export function profilePathForRole(role) {
    switch (role) {
        case "customer":
            return "/customer-portal/profile";
        case "worker":
            return "/worker-portal/profile";
        case "supplier":
            return "/supplier-portal/profile";
        default:
            return "/profile";
    }
}
/** Appearance / theme page for the current portal. */
export function preferencesPathForRole(role) {
    switch (role) {
        case "customer":
            return "/customer-portal/preferences";
        case "worker":
            return "/worker-portal/preferences";
        case "supplier":
            return "/supplier-portal/preferences";
        default:
            return "/preferences";
    }
}
