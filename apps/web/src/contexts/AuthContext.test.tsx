import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "./AuthContext";

const mockGetRedirectResult = jest.fn();
const mockGetAdditionalUserInfo = jest.fn();
const mockOnAuthStateChanged = jest.fn();

jest.mock("firebase/auth", () => ({
  GoogleAuthProvider: jest.fn(),
  getRedirectResult: (...args: unknown[]) => mockGetRedirectResult(...args),
  getAdditionalUserInfo: (...args: unknown[]) => mockGetAdditionalUserInfo(...args),
  onAuthStateChanged: (...args: unknown[]) => mockOnAuthStateChanged(...args),
  signInWithPopup: jest.fn(),
  signInWithRedirect: jest.fn(),
  sendSignInLinkToEmail: jest.fn(),
  isSignInWithEmailLink: jest.fn(),
  signInWithEmailLink: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock("@/lib/config", () => ({
  getConfig: jest.fn().mockResolvedValue({}),
}));

jest.mock("@/lib/firebase", () => ({
  initFirebase: jest.fn(() => ({ currentUser: null })),
}));

jest.mock("@/lib/users", () => ({
  getProfile: jest.fn().mockResolvedValue({}),
}));

function RedirectResultProbe(): React.JSX.Element {
  const { redirectNewUser } = useAuth();
  return <div>{redirectNewUser ? `onboard:${redirectNewUser.googleDisplayName ?? "blank"}` : "no-onboarding"}</div>;
}

describe("Google redirect new-user detection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOnAuthStateChanged.mockImplementation((_auth, callback: (user: unknown) => void) => {
      callback({ uid: "firebase-user" });
      return jest.fn();
    });
  });

  it("publishes onboarding metadata for a new Google redirect user", async () => {
    const result = { user: { displayName: "Redirect User" } };
    mockGetRedirectResult.mockResolvedValue(result);
    mockGetAdditionalUserInfo.mockReturnValue({ isNewUser: true });

    render(<AuthProvider><RedirectResultProbe /></AuthProvider>);

    expect(await screen.findByText("onboard:Redirect User")).toBeInTheDocument();
    expect(mockGetAdditionalUserInfo).toHaveBeenCalledWith(result);
  });

  it("does not publish onboarding metadata for a returning Google redirect user", async () => {
    const result = { user: { displayName: "Existing User" } };
    mockGetRedirectResult.mockResolvedValue(result);
    mockGetAdditionalUserInfo.mockReturnValue({ isNewUser: false });

    render(<AuthProvider><RedirectResultProbe /></AuthProvider>);

    await waitFor(() => expect(mockOnAuthStateChanged).toHaveBeenCalled());
    expect(screen.getByText("no-onboarding")).toBeInTheDocument();
  });
});
