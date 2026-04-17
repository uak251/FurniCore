"use client";

import { Download, FileDown, Plus, Sprout, Upload } from "lucide-react";
import { ModuleActionsMenu } from "@/components/module/ModuleActionsMenu";

/**
 * Consolidated header actions for Chart of Accounts (RBAC-aware).
 */
export function ChartOfAccountsHeaderActions({
  canWrite,
  isAdmin,
  seedPending,
  onSampleDownload,
  onExport,
  onImport,
  onSeed,
  onNewAccount,
}) {
  const items = [
    {
      label: "Sample CSV",
      icon: FileDown,
      onSelect: onSampleDownload,
    },
    {
      label: "Export CSV",
      icon: Download,
      onSelect: onExport,
    },
  ];
  if (canWrite) {
    items.push({
      label: "Import CSV",
      icon: Upload,
      onSelect: onImport,
    });
  }
  if (isAdmin) {
    items.push({
      label: "Seed standard accounts",
      icon: Sprout,
      disabled: seedPending,
      separatorBefore: true,
      onSelect: onSeed,
    });
  }
  if (canWrite) {
    items.push({
      label: "New account",
      icon: Plus,
      separatorBefore: true,
      onSelect: onNewAccount,
    });
  }
  return <ModuleActionsMenu label="Actions" items={items} />;
}
