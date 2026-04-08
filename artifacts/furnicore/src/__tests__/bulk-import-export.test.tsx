/**
 * BulkImportExport — clears CSV preview after successful import; incremental results from API.
 */

import { vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getAuthToken: () => "test-jwt",
}));

import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BulkImportExport } from "@/components/BulkImportExport";

const csv =
  "name,type,unit,quantity,reorderlevel,unitcost\n" +
  "Item A,raw_material,kg,1,0,0\n";

describe("BulkImportExport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("clears the preview table after a successful import and shows the result summary", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ imported: 0, updated: 1, skipped: 0, errors: [] }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(
      <BulkImportExport
        module="Inventory"
        importEndpoint="/api/bulk/inventory/import"
        exportEndpoint="/api/bulk/inventory/export"
        exportFilename="inv.csv"
        templateHeaders={["name", "type", "unit", "quantity", "reorderlevel", "unitcost"]}
        templateSample={[["Sample", "raw_material", "kg", "0", "0", "0"]]}
      />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([csv], "stock.csv", { type: "text/csv" });
    await user.upload(input, file);

    await screen.findByText(/stock\.csv/i);
    expect(screen.getByRole("columnheader", { name: /name/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /import 1 row/i }));

    await waitFor(() => {
      expect(screen.getByText(/0 rows imported/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/, 1 updated/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/drag & drop a csv file here/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("columnheader", { name: /name/i })).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/bulk/inventory/import"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "text/csv",
          Authorization: "Bearer test-jwt",
        }),
        body: csv,
      }),
    );
  });
});
