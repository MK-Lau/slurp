import "@testing-library/jest-dom";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import LoginPage from "./page";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockReplace = jest.fn();
const mockIsEmailSignInLink = jest.fn();
const mockCompleteEmailSignIn = jest.fn();
const mockSignIn = jest.fn();
const mockConsumeRedirectNewUser = jest.fn();
const mockSearchParamsGet = jest.fn< string | null, [string]>(() => null);

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  useSearchParams: () => ({ get: (...args: unknown[]) => mockSearchParamsGet(...(args as [string])) }),
}));

jest.mock("@/lib/slurps", () => ({
  getSlurpPreview: jest.fn().mockRejectedValue(new Error("no preview")),
}));

jest.mock("@/lib/users", () => ({
  updateProfile: jest.fn().mockResolvedValue({}),
  getProfile: jest.fn().mockResolvedValue({}),
}));

const mockRefreshProfile = jest.fn().mockResolvedValue(undefined);
const mockAuthValue: Record<string, unknown> = {
  user: null,
  loading: false,
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signOut: jest.fn(),
  sendEmailSignInLink: jest.fn(),
  isEmailSignInLink: (...args: unknown[]) => mockIsEmailSignInLink(...args),
  completeEmailSignIn: (...args: unknown[]) => mockCompleteEmailSignIn(...args),
  refreshProfile: mockRefreshProfile,
  redirectNewUser: null,
  consumeRedirectNewUser: mockConsumeRedirectNewUser,
  profile: { displayName: undefined, venmoUsername: undefined, dismissedVenmo: false, loading: false, ready: false },
  venmoPromptPending: false,
  triggerVenmoPrompt: jest.fn(),
  clearVenmoPrompt: jest.fn(),
  markVenmoDismissed: jest.fn(),
};

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockAuthValue,
}));

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("login email-link completing state regression (finally bug)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParamsGet.mockReturnValue(null);
    localStorage.clear();
    mockAuthValue.user = null;
    mockAuthValue.loading = false;
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("successful new-user email-link completion clears 'Signing you in…' and shows onboarding", async () => {
    localStorage.setItem("emailForSignIn", "e2e@example.com");
    mockIsEmailSignInLink.mockResolvedValue(true);
    const d = deferred<{ isNewUser: boolean }>();
    // Have the complete call remove the stored email, as the real impl does in finally
    mockCompleteEmailSignIn.mockImplementation(() => d.promise.then((r) => {
      localStorage.removeItem("emailForSignIn");
      return r;
    }));

    render(<LoginPage />);

    // While the promise is pending, the completing state should be visible
    expect(await screen.findByText(/Signing you in/i, {}, { timeout: 3000 })).toBeInTheDocument();

    // Resolve as new user — should clear spinner (finally) and show onboarding
    await act(async () => { d.resolve({ isNewUser: true }); });
    await waitFor(() => expect(screen.queryByText(/Signing you in/i)).not.toBeInTheDocument(), { timeout: 5000 });
    expect(await screen.findByText(/Welcome to Slurp/i, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Get started/i })).toBeInTheDocument();
    expect(mockCompleteEmailSignIn).toHaveBeenCalledWith("e2e@example.com");
  });

  it("does not redirect when Firebase publishes the user before new-user metadata resolves", async () => {
    localStorage.setItem("emailForSignIn", "race@example.com");
    mockIsEmailSignInLink.mockResolvedValue(true);
    const d = deferred<{ isNewUser: boolean }>();
    mockCompleteEmailSignIn.mockReturnValue(d.promise);

    const view = render(<LoginPage />);
    expect(await screen.findByText(/Signing you in/i, {}, { timeout: 3000 })).toBeInTheDocument();

    mockAuthValue.user = { uid: "race-user" };
    view.rerender(<LoginPage />);
    expect(mockReplace).not.toHaveBeenCalled();

    await act(async () => { d.resolve({ isNewUser: true }); });
    expect(await screen.findByText(/Welcome to Slurp/i, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("successful returning-user email-link completion clears completing state (not stuck on spinner)", async () => {
    localStorage.setItem("emailForSignIn", "returning@example.com");
    mockIsEmailSignInLink.mockResolvedValue(true);
    const d = deferred<{ isNewUser: boolean }>();
    mockCompleteEmailSignIn.mockImplementation(() => d.promise.then((r) => {
      localStorage.removeItem("emailForSignIn");
      return r;
    }));

    render(<LoginPage />);

    expect(await screen.findByText(/Signing you in/i, {}, { timeout: 3000 })).toBeInTheDocument();

    await act(async () => { d.resolve({ isNewUser: false }); });
    await waitFor(() => expect(screen.queryByText(/Signing you in/i)).not.toBeInTheDocument(), { timeout: 5000 });
    // Returning user: no onboarding; spinner must be gone and login chooser visible
    expect(screen.queryByText(/Welcome to Slurp/i)).not.toBeInTheDocument();
    expect(await screen.findByText(/Continue with Google/i, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(mockCompleteEmailSignIn).toHaveBeenCalledWith("returning@example.com");
  });

  it("failed email-link completion clears completing state and shows error (finally)", async () => {
    localStorage.setItem("emailForSignIn", "fail@example.com");
    mockIsEmailSignInLink.mockResolvedValue(true);
    const d = deferred<{ isNewUser: boolean }>();
    mockCompleteEmailSignIn.mockReturnValue(d.promise);

    render(<LoginPage />);

    expect(await screen.findByText(/Signing you in/i, {}, { timeout: 3000 })).toBeInTheDocument();

    await act(async () => { d.reject(new Error("expired")); });
    await waitFor(() => expect(screen.queryByText(/Signing you in/i)).not.toBeInTheDocument(), { timeout: 5000 });
    expect(await screen.findByText(/expired|already used/i, {}, { timeout: 5000 })).toBeInTheDocument();
  });
});

describe("new-user onboarding by sign-in provider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParamsGet.mockReturnValue(null);
    mockIsEmailSignInLink.mockResolvedValue(false);
    mockAuthValue.user = null;
    mockAuthValue.loading = false;
    mockAuthValue.redirectNewUser = null;
  });

  it("shows onboarding when Google popup reports a new user", async () => {
    mockSignIn.mockResolvedValue({ isNewUser: true, googleDisplayName: "Google User" });
    render(<LoginPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Continue with Google/i }));

    expect(await screen.findByText(/Welcome to Slurp/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Google User")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("does not show onboarding when Google popup reports a returning user", async () => {
    mockSignIn.mockResolvedValue({ isNewUser: false, googleDisplayName: "Existing User" });
    render(<LoginPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Continue with Google/i }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
    expect(screen.queryByText(/Welcome to Slurp/i)).not.toBeInTheDocument();
  });

  it("shows onboarding when Google redirect return reports a new user", async () => {
    // Firebase publishes the authenticated user in the same initialization pass
    // as the redirect metadata. The generic authenticated redirect must not win.
    mockAuthValue.user = { uid: "redirect-user" };
    mockAuthValue.redirectNewUser = { googleDisplayName: "Redirect User" };
    render(<LoginPage />);

    expect(await screen.findByText(/Welcome to Slurp/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue("Redirect User")).toBeInTheDocument();
    expect(mockConsumeRedirectNewUser).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
