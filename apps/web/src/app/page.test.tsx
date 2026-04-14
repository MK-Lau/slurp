import { render, screen, act } from "@testing-library/react";
import Home from "./page";

// Mock Firebase and AuthContext so the page renders without real auth
jest.mock("@/lib/firebase", () => ({ auth: {} }));
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: (): { user: null; loading: boolean; signIn: jest.Mock; signOut: jest.Mock } => ({ user: null, loading: false, signIn: jest.fn(), signOut: jest.fn() }),
}));
jest.mock("@/lib/config", () => ({
  getConfig: () => Promise.resolve({
    apiKey: "test-api-key",
    authDomain: "test-project.firebaseapp.com",
    projectId: "test-project",
    appId: "test-app-id",
    apiUrl: "http://localhost:8080",
    firestoreDatabase: "slurp-dev",
    appUrl: "",
  }),
}));

// Stable router so the useEffect dependency doesn't re-fire on every render
const stableRouter = { replace: jest.fn(), push: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: (): typeof stableRouter => stableRouter,
}));

describe("Home page", () => {
  it("renders the app title", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: /slurp/i })).toBeDefined();
  });

  it("renders sign-in button when unauthenticated", () => {
    render(<Home />);
    expect(screen.getByRole("link", { name: /get started/i })).toBeDefined();
  });
});

describe("Home page — magic link handling", () => {
  beforeEach(() => {
    stableRouter.replace.mockClear();
    window.history.pushState({}, "", "/");
    // jsdom logs "not implemented: navigation" when window.location.href is assigned
    // (cross-origin navigation). Suppress it — the assignment itself is what we're testing.
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it("takes the cross-origin path for a trusted continueUrl (router.replace not called)", async () => {
    // jsdom's window.location.origin is http://localhost
    // getConfig() mock returns projectId "test-project", so firebaseapp.com is trusted
    const trustedOrigin = "https://test-project.firebaseapp.com";
    const search = `?mode=signIn&oobCode=abc123&continueUrl=${encodeURIComponent(`${trustedOrigin}/login`)}`;
    window.history.pushState({}, "", search);

    await act(async () => { render(<Home />); });

    // router.replace is NOT called — the code took the window.location.href path instead
    expect(stableRouter.replace).not.toHaveBeenCalled();
  });

  it("falls through to router.replace for an untrusted continueUrl", async () => {
    const search = `?mode=signIn&oobCode=abc123&continueUrl=${encodeURIComponent("https://attacker.com/login")}`;
    window.history.pushState({}, "", search);

    await act(async () => { render(<Home />); });

    expect(stableRouter.replace).toHaveBeenCalledWith(`/login${search}`);
  });

  it("does nothing when oobCode is absent", async () => {
    window.history.pushState({}, "", "?mode=signIn");

    await act(async () => { render(<Home />); });

    expect(stableRouter.replace).not.toHaveBeenCalled();
  });

  it("falls through to router.replace when continueUrl is same-origin (http://localhost)", async () => {
    // jsdom's default origin is http://localhost — same as the app origin in tests
    const search = `?mode=signIn&oobCode=abc123&continueUrl=${encodeURIComponent("http://localhost/login")}`;
    window.history.pushState({}, "", search);

    await act(async () => { render(<Home />); });

    expect(stableRouter.replace).toHaveBeenCalledWith(`/login${search}`);
  });

  it("falls through to router.replace when continueUrl is malformed", async () => {
    const search = "?mode=signIn&oobCode=abc123&continueUrl=not-a-valid-url";
    window.history.pushState({}, "", search);

    await act(async () => { render(<Home />); });

    expect(stableRouter.replace).toHaveBeenCalledWith(`/login${search}`);
  });
});
