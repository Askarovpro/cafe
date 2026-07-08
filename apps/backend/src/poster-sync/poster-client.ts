import type { Order, Product } from '@b2b/shared';

export type PosterProductInput = Omit<Product, 'id'>;

export interface PosterClient {
  getProducts(): Promise<PosterProductInput[]>;
  createIncomingOrder(order: Order): Promise<string>;
  voidIncomingOrder(posterOrderId: string): Promise<void>;
}

export class FakePosterClient implements PosterClient {
  products: PosterProductInput[] = [];
  createdOrders: Order[] = [];
  voidedOrderIds: string[] = [];

  async getProducts(): Promise<PosterProductInput[]> {
    return structuredClone(this.products);
  }

  async createIncomingOrder(order: Order): Promise<string> {
    this.createdOrders.push(structuredClone(order));
    return `poster-${order.id}`;
  }

  async voidIncomingOrder(posterOrderId: string): Promise<void> {
    this.voidedOrderIds.push(posterOrderId);
  }
}

export class HttpPosterClient implements PosterClient {
  private readonly baseUrl = 'https://joinposter.com/api';

  constructor(private readonly token: string) {}

  async getProducts(): Promise<PosterProductInput[]> {
    // VERIFY: Poster v3 product list endpoint and field names should be confirmed against the live account.
    const data = await this.posterGet<{ response?: Array<Record<string, unknown>> }>('/menu.getProducts');
    return (data.response ?? []).map((row) => ({
      posterId: String(row.product_id),
      name: String(row.product_name ?? ''),
      category: String(row.category_name ?? ''),
      basePrice: Number(readPosterPrice(row.price)),
      cost: Number(row.cost ?? 0),
      unit: String(row.unit ?? 'pcs'),
      isStopped: Boolean(row.hidden || row.is_stopped),
    }));
  }

  async createIncomingOrder(order: Order): Promise<string> {
    // VERIFY: Poster v3 incomingOrders payload shape, spot id, and custom per-line price support need live validation.
    const payload = {
      order: {
        client_name: order.clientName,
        phone: order.contactPhone,
        comment: order.notes,
        products: order.items.map((item) => ({
          product_id: item.productId,
          count: item.qty,
          price: item.unitPrice,
        })),
      },
    };
    const data = await this.posterPost<{ response?: { incoming_order_id?: string | number } }>('/incomingOrders.createIncomingOrder', payload);
    return String(data.response?.incoming_order_id ?? '');
  }

  async voidIncomingOrder(posterOrderId: string): Promise<void> {
    // VERIFY: Poster v3 incoming order void/reversal endpoint should be confirmed; this isolates the assumption.
    await this.posterPost('/incomingOrders.removeIncomingOrder', { incoming_order_id: posterOrderId });
  }

  private async posterGet<T>(path: string): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set('token', this.token);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Poster GET ${path} failed: ${response.status}`);
    return response.json() as Promise<T>;
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
    return response.json() as Promise<T>;
  }
}

function readPosterPrice(value: unknown): unknown {
  if (value && typeof value === 'object' && '1' in value) return (value as Record<string, unknown>)['1'];
  return value ?? 0;
}
