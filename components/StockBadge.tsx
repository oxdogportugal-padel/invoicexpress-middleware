const LOW_STOCK_THRESHOLD = 10;

export function stockLevel(inventoryQuantity: number): "green" | "yellow" | "red" {
  if (inventoryQuantity <= 0) return "red";
  if (inventoryQuantity <= LOW_STOCK_THRESHOLD) return "yellow";
  return "green";
}

const STYLES: Record<string, { dot: string; text: string; label: string }> = {
  green: { dot: "bg-green-500", text: "text-green-700", label: "In stock" },
  yellow: { dot: "bg-yellow-500", text: "text-yellow-700", label: "Low stock" },
  red: { dot: "bg-red-500", text: "text-red-700", label: "Out of stock" },
};

export default function StockBadge({ inventoryQuantity }: { inventoryQuantity: number }) {
  const level = stockLevel(inventoryQuantity);
  const style = STYLES[level];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}>
      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  );
}
