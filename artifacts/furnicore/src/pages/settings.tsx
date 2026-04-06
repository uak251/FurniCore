import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Workspace preferences and integrations will appear here.
        </p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-muted-foreground" aria-hidden />
            <CardTitle>Coming soon</CardTitle>
          </div>
          <CardDescription>
            FurniCore settings (notifications, locale, API keys) are planned for a future release.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Use the sidebar to manage users, inventory, and business modules. Contact your administrator
            for role changes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
