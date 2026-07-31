/**
 * Prodigi print API client.
 *
 * Environment: sandbox vs live is the PRODIGI_API_KEY + PRODIGI_API_URL pair
 * swapped together — never mix one environment's key with the other's URL.
 * Each environment has its own key; a key only authenticates against its
 * own base URL.
 *
 * Sandbox-verified contract notes (2026-07-31, ord_1165638):
 * - SKU BOOK-FE-8_3-SQ-HARD-G requires only the "default" printArea;
 *   "cover" and "spine" are optional.
 * - pageCount is required on book assets.
 * - Branch on the response `outcome`, not the HTTP status: "AlreadyExists"
 *   arrives as HTTP 200 with a sparse order ({ id } only), and
 *   "CreatedWithIssues" is a success that carries status.issues.
 */

type JsonRecord = Record<string, unknown>;

export interface OrderRecipient {
  name: string;
  email?: string;
  phoneNumber?: string;
  address: {
    line1: string;
    line2?: string;
    postalOrZipCode: string;
    countryCode: string;
    townOrCity: string;
    stateOrCounty?: string;
  };
}

export interface ProdigiShipment {
  carrier?: { name?: string; service?: string };
  dispatchDate?: string;
  tracking?: { url?: string; number?: string };
  status?: string;
  [key: string]: unknown;
}

export interface ProdigiOrderStatus {
  stage: string;
  details: Record<string, string>;
  issues: JsonRecord[];
  [key: string]: unknown;
}

export interface ProdigiOrder {
  id: string;
  status?: ProdigiOrderStatus;
  shipments?: ProdigiShipment[];
  charges?: JsonRecord[];
  merchantReference?: string;
  [key: string]: unknown;
}

export interface CreateOrderResult {
  outcome: "Created" | "AlreadyExists" | "CreatedWithIssues" | string;
  order: ProdigiOrder;
}

export interface CreateOrderParams {
  idempotencyKey: string;
  merchantReference: string;
  shippingMethod: string;
  recipient: OrderRecipient;
  callbackUrl?: string;
  items: {
    sku: string;
    copies: number;
    sizing: string;
    assets: { printArea: string; url: string; pageCount: number }[];
  }[];
}

export class ProdigiError extends Error {
  httpStatus: number;
  outcome: string | null;
  traceParent: string | null;

  constructor(
    message: string,
    params: { httpStatus: number; outcome: string | null; traceParent: string | null }
  ) {
    super(message);
    this.name = "ProdigiError";
    this.httpStatus = params.httpStatus;
    this.outcome = params.outcome;
    this.traceParent = params.traceParent;
  }
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: JsonRecord
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${process.env.PRODIGI_API_URL}${path}`, {
      method,
      headers: {
        "X-API-Key": process.env.PRODIGI_API_KEY!,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    // Timeout/abort surfaces as ProdigiError with httpStatus 0 so callers
    // can distinguish "Prodigi never answered" from a Prodigi rejection.
    throw new ProdigiError(
      `Prodigi ${method} ${path} ${
        e instanceof Error && e.name === "TimeoutError" ? "timed out after 30s" : `failed: ${e}`
      }`,
      { httpStatus: 0, outcome: null, traceParent: null }
    );
  }

  const json = (await res.json().catch(() => ({}))) as JsonRecord;

  if (!res.ok) {
    throw new ProdigiError(
      `Prodigi ${method} ${path} failed (${res.status}): ${JSON.stringify(json).slice(0, 500)}`,
      {
        httpStatus: res.status,
        outcome: typeof json.outcome === "string" ? json.outcome : null,
        traceParent: typeof json.traceParent === "string" ? json.traceParent : null,
      }
    );
  }

  return json as T;
}

export async function createOrder(
  params: CreateOrderParams
): Promise<CreateOrderResult> {
  const result = await request<CreateOrderResult>("POST", "/v4.0/orders", {
    ...params,
  });

  // "AlreadyExists" returns a sparse order ({ id } only) — fetch the full
  // order so callers always get a complete object, outcome preserved.
  if (result.outcome === "AlreadyExists" && result.order?.id) {
    const full = await getOrder(result.order.id);
    return { outcome: result.outcome, order: full };
  }

  // "CreatedWithIssues" flows through unchanged — callers inspect
  // result.order.status.issues.
  return result;
}

export async function getOrder(prodigiOrderId: string): Promise<ProdigiOrder> {
  const result = await request<{ order: ProdigiOrder }>(
    "GET",
    `/v4.0/orders/${encodeURIComponent(prodigiOrderId)}`
  );
  return result.order;
}

export async function getProductDetails(sku: string): Promise<JsonRecord> {
  const result = await request<{ product: JsonRecord }>(
    "GET",
    `/v4.0/products/${encodeURIComponent(sku)}`
  );
  return result.product;
}

export async function getSpineDetails(params: {
  sku: string;
  destinationCountryCode: string;
  state?: string;
  numberOfPages: number;
}): Promise<{ widthMm: number }> {
  // US destinations require `state` — sandbox returns HTTP 400
  // "state is required for the selected destinationCountryCode" without it.
  const result = await request<{ spineInfo: { widthMm: number } }>(
    "POST",
    "/v4.0/products/spine",
    { ...params }
  );
  return result.spineInfo;
}
