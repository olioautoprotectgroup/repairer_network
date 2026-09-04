import { describe, expect, it } from "vitest";
import type { HttpRequest } from "@azure/functions";
import { isAuthorizedRepairerManager, isAuthorizedStaff } from "./auth";

/**
 * Builds the shape these helpers actually read: a request whose
 * `x-ms-client-principal` header carries the base64 principal SWA attaches
 * once a user is signed in. Pass null for a request with no header at all
 * (an unauthenticated caller hitting the API directly).
 */
function requestAs(userDetails: string | null): HttpRequest {
  const headers = new Map<string, string>();
  if (userDetails !== null) {
    const principal = {
      identityProvider: "aad",
      userId: "00000000-0000-0000-0000-000000000000",
      userDetails,
      userRoles: ["authenticated"],
    };
    headers.set(
      "x-ms-client-principal",
      Buffer.from(JSON.stringify(principal), "utf-8").toString("base64"),
    );
  }
  return {
    headers: { get: (name: string) => headers.get(name) ?? null },
  } as unknown as HttpRequest;
}

describe("isAuthorizedRepairerManager", () => {
  it("allows the named repairer network owner", () => {
    expect(isAuthorizedRepairerManager(requestAs("jake.quaradeghini@autoprotectgroup.co.uk"))).toBe(
      true,
    );
  });

  it("ignores the casing AAD echoes back from the login prompt", () => {
    expect(isAuthorizedRepairerManager(requestAs("Jake.Quaradeghini@AutoProtectGroup.co.uk"))).toBe(
      true,
    );
  });

  it("allows every address on the list, not just the first", () => {
    expect(isAuthorizedRepairerManager(requestAs("oliver.oakes@autoprotectgroup.co.uk"))).toBe(
      true,
    );
  });

  it("rejects other staff on the allowed domain", () => {
    expect(isAuthorizedRepairerManager(requestAs("someone.else@autoprotectgroup.co.uk"))).toBe(
      false,
    );
  });

  it("rejects a lookalike address on another domain", () => {
    expect(isAuthorizedRepairerManager(requestAs("jake.quaradeghini@example.com"))).toBe(false);
  });

  it("rejects a caller with no client principal", () => {
    expect(isAuthorizedRepairerManager(requestAs(null))).toBe(false);
  });
});

describe("isAuthorizedStaff", () => {
  // Search is deliberately unaffected by the Manage Repairers restriction:
  // every staff domain keeps read-only access.
  it("still allows any signed-in member of the primary domain", () => {
    expect(isAuthorizedStaff(requestAs("someone.else@autoprotectgroup.co.uk"))).toBe(true);
  });

  it("allows the second staff domain", () => {
    expect(isAuthorizedStaff(requestAs("someone.else@autoprotect.net"))).toBe(true);
  });

  it("ignores casing on either domain", () => {
    expect(isAuthorizedStaff(requestAs("Someone.Else@AutoProtect.net"))).toBe(true);
  });

  it("rejects an address outside every staff domain", () => {
    expect(isAuthorizedStaff(requestAs("someone@example.com"))).toBe(false);
    expect(isAuthorizedStaff(requestAs(null))).toBe(false);
  });

  // This is why every entry keeps its leading "@". Matching on the bare
  // "autoprotect.net" would hand the whole repairer network to anyone who
  // registered a domain ending in it.
  it("rejects a lookalike domain that merely ends with a staff domain", () => {
    expect(isAuthorizedStaff(requestAs("attacker@not-autoprotect.net"))).toBe(false);
    expect(isAuthorizedStaff(requestAs("attacker@evilautoprotect.net"))).toBe(false);
    expect(isAuthorizedStaff(requestAs("attacker@fake-autoprotectgroup.co.uk"))).toBe(false);
  });

  // A subdomain is a different mail domain and is not covered by either
  // entry -- worth pinning so a future "helpful" loosening is deliberate.
  it("rejects a subdomain of a staff domain", () => {
    expect(isAuthorizedStaff(requestAs("someone@mail.autoprotect.net"))).toBe(false);
  });
});
