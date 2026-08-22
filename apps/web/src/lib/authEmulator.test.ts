import { getLoopbackAuthEmulatorUrl, isLoopbackUrl } from "./authEmulator";

describe("isLoopbackUrl", () => {
  it("accepts http://127.0.0.1 with port", () => {
    expect(isLoopbackUrl("http://127.0.0.1:9099")).toBe(true);
  });

  it("accepts http://localhost with port", () => {
    expect(isLoopbackUrl("http://localhost:9099")).toBe(true);
  });

  it("accepts loopback without explicit port", () => {
    expect(isLoopbackUrl("http://127.0.0.1")).toBe(true);
    expect(isLoopbackUrl("http://localhost")).toBe(true);
  });

  it("rejects non-loopback https", () => {
    expect(isLoopbackUrl("https://example.com:9099")).toBe(false);
  });

  it("rejects loopback with https (only http allowed)", () => {
    expect(isLoopbackUrl("https://127.0.0.1:9099")).toBe(false);
  });

  it("rejects empty and garbage", () => {
    expect(isLoopbackUrl("")).toBe(false);
    expect(isLoopbackUrl("not-a-url")).toBe(false);
  });

  it("rejects private-network host that is not loopback", () => {
    expect(isLoopbackUrl("http://10.0.0.1:9099")).toBe(false);
    expect(isLoopbackUrl("http://192.168.1.1:9099")).toBe(false);
  });
});

describe("getLoopbackAuthEmulatorUrl", () => {
  it("returns a configured loopback URL", () => {
    expect(getLoopbackAuthEmulatorUrl("http://127.0.0.1:9099")).toBe("http://127.0.0.1:9099");
  });

  it("returns an empty string for missing or non-loopback URLs", () => {
    expect(getLoopbackAuthEmulatorUrl(undefined)).toBe("");
    expect(getLoopbackAuthEmulatorUrl("https://auth.example.com")).toBe("");
  });
});
