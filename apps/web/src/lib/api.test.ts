import { apiFetch } from "./api";

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("./config", () => ({
  getConfig: jest.fn().mockResolvedValue({ apiUrl: "https://api.test" }),
}));

const mockGetIdToken = jest.fn().mockResolvedValue("token-123");
const mockGetFirebaseAuth = jest.fn();
jest.mock("./firebase", () => ({
  getFirebaseAuth: (...args: unknown[]) => mockGetFirebaseAuth(...args),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeUser(uid: string): { uid: string; getIdToken: jest.Mock } { return { uid, getIdToken: mockGetIdToken }; }

/** Flush all pending microtasks so async chains advance fully. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function makeOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function makeErrorResponse(): Response {
  return {
    ok: false,
    status: 500,
    json: jest.fn().mockResolvedValue({}),
  } as unknown as Response;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("apiFetch in-flight GET deduplication", () => {
  beforeAll(() => {
    global.fetch = jest.fn();
  });

  beforeEach(() => {
    (global.fetch as jest.Mock).mockReset();
    mockGetIdToken.mockClear();
    mockGetFirebaseAuth.mockClear();
  });

  it("returns the same promise for a second GET started while the first is in-flight", async () => {
    mockGetFirebaseAuth.mockReturnValue({ currentUser: makeUser("uid-a") });

    // Use a controlled promise so we can inspect state between p1 start and p2 start
    let resolveFetch!: (res: Response) => void;
    const fetchPromise = new Promise<Response>(resolve => { resolveFetch = resolve; });
    (global.fetch as jest.Mock).mockReturnValueOnce(fetchPromise);

    // Start first request and let it get past getConfig + getIdToken so inFlight is populated
    const p1 = apiFetch<{ result: string }>("/items");
    await flushMicrotasks();

    // Second request should hit the cache — no additional fetch
    const p2 = apiFetch<{ result: string }>("/items");
    expect(fetch).toHaveBeenCalledTimes(1);

    // Resolve the underlying fetch
    resolveFetch(makeOkResponse({ result: "data" }));
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toEqual({ result: "data" });
    expect(r2).toEqual({ result: "data" });
  });

  it("does NOT deduplicate GET requests from different users", async () => {
    mockGetFirebaseAuth
      .mockReturnValueOnce({ currentUser: makeUser("uid-a") })
      .mockReturnValueOnce({ currentUser: makeUser("uid-b") });

    let resolveA!: (res: Response) => void;
    const promiseA = new Promise<Response>(r => { resolveA = r; });
    (global.fetch as jest.Mock)
      .mockReturnValueOnce(promiseA)
      .mockReturnValueOnce(promiseA);

    const p1 = apiFetch<{ result: string }>("/items");
    await flushMicrotasks(); // p1 past getConfig + getIdToken, fetch called + stored in inFlight

    const p2 = apiFetch<{ result: string }>("/items"); // different uid → different cache key
    await flushMicrotasks(); // p2 past getConfig + getIdToken, fetch called a second time

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mockGetFirebaseAuth).toHaveBeenCalledTimes(2);

    resolveA(makeOkResponse({ result: "x" }));
    await Promise.all([p1, p2]);
  });

  it("does NOT deduplicate POST requests", async () => {
    mockGetFirebaseAuth.mockReturnValue({ currentUser: makeUser("uid-a") });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(makeOkResponse({ ok: true }))
      .mockResolvedValueOnce(makeOkResponse({ ok: true }));

    await Promise.all([
      apiFetch("/items", { method: "POST", body: JSON.stringify({}) }),
      apiFetch("/items", { method: "POST", body: JSON.stringify({}) }),
    ]);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("hits the network again after a completed request", async () => {
    mockGetFirebaseAuth.mockReturnValue({ currentUser: makeUser("uid-a") });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(makeOkResponse({ result: "first" }))
      .mockResolvedValueOnce(makeOkResponse({ result: "second" }));

    const r1 = await apiFetch<{ result: string }>("/items");
    const r2 = await apiFetch<{ result: string }>("/items");

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(r1).toEqual({ result: "first" });
    expect(r2).toEqual({ result: "second" });
  });

  it("clears the cache after a rejected request so retries succeed", async () => {
    mockGetFirebaseAuth.mockReturnValue({ currentUser: makeUser("uid-a") });
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(makeErrorResponse())
      .mockResolvedValueOnce(makeOkResponse({ result: "retry-ok" }));

    await expect(apiFetch("/items")).rejects.toThrow();
    const r2 = await apiFetch<{ result: string }>("/items");

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(r2).toEqual({ result: "retry-ok" });
  });
});
