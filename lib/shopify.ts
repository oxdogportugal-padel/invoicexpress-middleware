const API_VERSION = "2025-01";

function getEndpoint() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  if (!domain) throw new Error("SHOPIFY_STORE_DOMAIN env var is not set");
  return `https://${domain}/admin/api/${API_VERSION}/graphql.json`;
}

function getToken() {
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!token) throw new Error("SHOPIFY_ADMIN_ACCESS_TOKEN env var is not set");
  return token;
}

async function shopifyGraphql<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(getEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": getToken(),
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Shopify API error: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data as T;
}

export type ShopifyCollection = {
  id: string;
  title: string;
  handle: string;
};

const COLLECTIONS_QUERY = /* GraphQL */ `
  query Collections($first: Int!) {
    collections(first: $first, sortKey: TITLE) {
      edges {
        node {
          id
          title
          handle
        }
      }
    }
  }
`;

export async function getCollections(): Promise<ShopifyCollection[]> {
  const data = await shopifyGraphql<{
    collections: { edges: { node: ShopifyCollection }[] };
  }>(COLLECTIONS_QUERY, { first: 100 });
  return data.collections.edges.map((e) => e.node);
}

export type ShopifyProduct = {
  id: string;
  variantId: string;
  title: string;
  handle: string;
  imageUrl: string | null;
  price: string;
  inventoryQuantity: number;
};

const COLLECTION_PRODUCTS_QUERY = /* GraphQL */ `
  query CollectionProducts($handle: String!, $first: Int!) {
    collectionByIdentifier(identifier: { handle: $handle }) {
      id
      title
      products(first: $first) {
        edges {
          node {
            id
            title
            handle
            featuredMedia {
              preview {
                image {
                  url
                  altText
                }
              }
            }
            variants(first: 1) {
              edges {
                node {
                  id
                  price
                  inventoryQuantity
                }
              }
            }
          }
        }
      }
    }
  }
`;

type CollectionProductsResponse = {
  collectionByIdentifier: {
    id: string;
    title: string;
    products: {
      edges: {
        node: {
          id: string;
          title: string;
          handle: string;
          featuredMedia: {
            preview: { image: { url: string; altText: string | null } | null } | null;
          } | null;
          variants: {
            edges: { node: { id: string; price: string; inventoryQuantity: number | null } }[];
          };
        };
      }[];
    };
  } | null;
};

export async function getProductsByCollection(
  handle: string
): Promise<{ collectionTitle: string; products: ShopifyProduct[] } | null> {
  const data = await shopifyGraphql<CollectionProductsResponse>(COLLECTION_PRODUCTS_QUERY, {
    handle,
    first: 100,
  });

  if (!data.collectionByIdentifier) return null;

  const products = data.collectionByIdentifier.products.edges
    .map((edge) => {
      const variant = edge.node.variants.edges[0]?.node;
      if (!variant) return null;
      return {
        id: edge.node.id,
        variantId: variant.id,
        title: edge.node.title,
        handle: edge.node.handle,
        imageUrl: edge.node.featuredMedia?.preview?.image?.url ?? null,
        price: variant.price,
        inventoryQuantity: variant.inventoryQuantity ?? 0,
      };
    })
    .filter((p): p is ShopifyProduct => p !== null);

  return { collectionTitle: data.collectionByIdentifier.title, products };
}

const VARIANTS_BY_IDS_QUERY = /* GraphQL */ `
  query VariantsByIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        price
        inventoryQuantity
        title
        product {
          id
          title
        }
      }
    }
  }
`;

export type ShopifyVariant = {
  id: string;
  price: number;
  inventoryQuantity: number;
  title: string;
};

export async function getVariantsByIds(ids: string[]): Promise<Map<string, ShopifyVariant>> {
  if (ids.length === 0) return new Map();
  const data = await shopifyGraphql<{
    nodes: ({ id: string; price: string; inventoryQuantity: number | null; title: string; product: { title: string } } | null)[];
  }>(VARIANTS_BY_IDS_QUERY, { ids });

  const map = new Map<string, ShopifyVariant>();
  for (const node of data.nodes) {
    if (!node) continue;
    map.set(node.id, {
      id: node.id,
      price: parseFloat(node.price),
      inventoryQuantity: node.inventoryQuantity ?? 0,
      title: node.product?.title ?? node.title,
    });
  }
  return map;
}

export type CheckoutLineItem = {
  variantId: string;
  title: string;
  qty: number;
  price: number;
};

const ORDER_CREATE_MUTATION = /* GraphQL */ `
  mutation CreateB2BOrder($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
    orderCreate(order: $order, options: $options) {
      order {
        id
        name
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function createShopifyOrder(params: {
  lineItems: CheckoutLineItem[];
  discountPercent: number;
  customerPhone: string;
  note?: string;
}): Promise<{ id: string; name: string }> {
  const data = await shopifyGraphql<{
    orderCreate: {
      order: { id: string; name: string } | null;
      userErrors: { field: string[] | null; message: string }[];
    };
  }>(ORDER_CREATE_MUTATION, {
    order: {
      lineItems: params.lineItems.map((item) => ({
        variantId: item.variantId,
        quantity: item.qty,
      })),
      discountCode:
        params.discountPercent > 0
          ? {
              itemPercentageDiscountCode: {
                code: "B2B10",
                percentage: params.discountPercent,
              },
            }
          : undefined,
      financialStatus: "PAID",
      phone: params.customerPhone,
      note: params.note,
      tags: ["b2b-portal"],
    },
    options: {
      inventoryBehaviour: "DECREMENT_OBEYING_POLICY",
      sendReceipt: false,
      sendFulfillmentReceipt: false,
    },
  });

  const { order, userErrors } = data.orderCreate;
  if (userErrors.length > 0 || !order) {
    throw new Error(`Shopify orderCreate failed: ${JSON.stringify(userErrors)}`);
  }
  return order;
}
