import { getCollections, getProductsByCollection } from "@/lib/shopify";
import CollectionSelect from "@/components/CollectionSelect";
import ProductCard from "@/components/ProductCard";

const DEFAULT_COLLECTION_HANDLE = "raquetes";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: { collection?: string };
}) {
  const selectedHandle = searchParams.collection ?? DEFAULT_COLLECTION_HANDLE;

  let collections: Awaited<ReturnType<typeof getCollections>> = [];
  let catalog: Awaited<ReturnType<typeof getProductsByCollection>> = null;
  let loadError = false;

  try {
    [collections, catalog] = await Promise.all([
      getCollections(),
      getProductsByCollection(selectedHandle),
    ]);
  } catch (err) {
    console.error(err);
    loadError = true;
  }

  if (loadError) {
    return (
      <p className="rounded-lg bg-white p-4 text-sm text-gray-500">
        We couldn&apos;t load the catalog right now. Please try again shortly.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <CollectionSelect collections={collections} selectedHandle={selectedHandle} />

      {!catalog ? (
        <p className="rounded-lg bg-white p-4 text-sm text-gray-500">
          This collection could not be found.
        </p>
      ) : catalog.products.length === 0 ? (
        <p className="rounded-lg bg-white p-4 text-sm text-gray-500">
          No products in {catalog.collectionTitle} yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {catalog.products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
