import type { Order, OrderItem, Product } from '@b2b/shared';

export type PosterProductInput = Omit<Product, 'id'>;
export type PosterOrderItem = OrderItem & { posterProductId: string };
export type PosterOrder = Omit<Order, 'items'> & { items: PosterOrderItem[] };

export type IncomingOrderPayload = {
  spot_id: number;
  phone: string;
  first_name: string;
  comment?: string;
  products: Array<{
    product_id: string;
    count: number;
    price: number;
  }>;
};

export interface PosterClient {
  getProducts(): Promise<PosterProductInput[]>;
  createIncomingOrder(order: PosterOrder): Promise<string>;
  voidIncomingOrder(posterOrderId: string): Promise<void>;
}

export class FakePosterClient implements PosterClient {
  products: PosterProductInput[] = [];
  createdOrders: PosterOrder[] = [];
  voidedOrderIds: string[] = [];

  async getProducts(): Promise<PosterProductInput[]> {
    return structuredClone(this.products);
  }

  async createIncomingOrder(order: PosterOrder): Promise<string> {
    this.createdOrders.push(structuredClone(order));
    return `poster-${order.id}`;
  }

  async voidIncomingOrder(posterOrderId: string): Promise<void> {
    this.voidedOrderIds.push(posterOrderId);
  }
}

export class HttpPosterClient implements PosterClient {
  private readonly baseUrl = 'https://joinposter.com/api';

  constructor(
    private readonly token: string,
    private readonly spotId: number,
  ) {}

  async getProducts(): Promise<PosterProductInput[]> {
    const [products, batchtickets] = await Promise.all([
      this.posterGet<{ response?: Array<Record<string, unknown>> }>('/menu.getProducts', { type: 'products' }),
      this.posterGet<{ response?: Array<Record<string, unknown>> }>('/menu.getProducts', { type: 'batchtickets' }),
    ]);
    return [...(products.response ?? []), ...(batchtickets.response ?? [])].map((row) => mapPosterProduct(row, this.spotId));
  }

  async createIncomingOrder(order: PosterOrder): Promise<string> {
    const payload = buildIncomingOrderPayload(order, this.spotId);
    const data = await this.posterPost<{ response?: { incoming_order_id?: string | number } }>('/incomingOrders.createIncomingOrder', payload);
    return String(data.response?.incoming_order_id ?? '');
  }

  async voidIncomingOrder(posterOrderId: string): Promise<void> {
    // VERIFY: Poster v3 removal can fail after local cancellation; keep reversal best-effort until account behavior is confirmed.
    try {
      await this.posterPost('/incomingOrders.removeIncomingOrder', { incoming_order_id: posterOrderId });
    } catch (error) {
      console.warn('Poster incoming order removal failed', { posterOrderId, error });
    }
  }

  private async posterGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set('token', this.token);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Poster GET ${path} failed: ${response.status}`);
    return readPosterResponse<T>(response, `Poster GET ${path}`);
  }

  private async posterPost<T = unknown>(path: string, body: unknown): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set('token', this.token);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Poster POST ${path} failed: ${response.status}`);
    return readPosterResponse<T>(response, `Poster POST ${path}`);
  }
}

export function mapPosterProduct(row: Record<string, unknown>, spotId: number): PosterProductInput {
  return {
    posterId: String(row.product_id),
    name: String(row.product_name ?? ''),
    category: String(row.category_name ?? ''),
    basePrice: kopecksToBase(readPosterSpotPrice(row.price, spotId)),
    cost: kopecksToBase(row.cost),
    unit: String(row.unit ?? 'pcs'),
    isStopped: Number(row.hidden ?? 0) === 1,
  };
}

export function buildIncomingOrderPayload(order: PosterOrder, spotId: number): IncomingOrderPayload {
  return {
    spot_id: spotId,
    phone: order.contactPhone,
    first_name: order.clientName,
    comment: order.notes,
    products: order.items.map((item) => ({
      product_id: item.posterProductId,
      count: item.qty,
      price: Math.round(item.unitPrice * 100),
    })),
  };
}

async function readPosterResponse<T>(response: Response, label: string): Promise<T> {
  const data = (await response.json()) as T & { error?: unknown; message?: unknown };
  if (data && typeof data === 'object' && data.error !== undefined) {
    throw new Error(String(data.message ?? `${label} failed with Poster error ${data.error}`));
  }
  return data;
}

function readPosterSpotPrice(value: unknown, spotId: number): unknown {
  if (!value || typeof value !== 'object') return value ?? 0;
  const prices = value as Record<string, unknown>;
  return prices[String(spotId)] ?? Object.values(prices)[0] ?? 0;
}

function kopecksToBase(value: unknown): number {
  return Number(value ?? 0) / 100;
}
