// How many of each product color are on the shelf, and when the next shipment
// lands (Product Bible Section 10). Stock changes, so check_availability reads
// it fresh every time instead of remembering it.
// This is the only file that knows where stock is kept: the Supabase
// `inventory` table. Change a row there and the next answer changes with it.
import { createStatelessClient } from "@/lib/supabase/server";

/** One row of stock, named like the database columns it comes from. */
export type InventoryRow = {
  sku: string;
  product: string;
  color: string;
  units_in_stock: number;
  next_shipment: string;
};

/** Every stock row, or `null` when stock can't be read right now. */
export async function readInventory(): Promise<InventoryRow[] | null> {
  const supabase = createStatelessClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("inventory")
    .select("sku, product, color, units_in_stock, next_shipment")
    .order("sku");

  return error || !data ? null : (data as InventoryRow[]);
}
