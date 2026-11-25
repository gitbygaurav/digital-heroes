import { describe, expect, it } from "vitest";
import {
  canTransitionProofStatus,
  checkPrintFileApprovalGate,
  getNextProofVersion,
} from "@/lib/proofs/gate";

describe("Proof Versioning & Approval Gate (§10, Decision D8)", () => {
  it("returns 403 before proof is approved and 200 after approval", () => {
    const blocked = checkPrintFileApprovalGate({
      proof_approved: false,
      status: "proof",
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.httpStatus).toBe(403);

    const unlocked = checkPrintFileApprovalGate({
      proof_approved: true,
      status: "production",
    });
    expect(unlocked.allowed).toBe(true);
    expect(unlocked.httpStatus).toBe(200);
  });

  it("increments proof versions sequentially (v1 -> v2 -> v3)", () => {
    expect(getNextProofVersion([])).toBe(1);
    expect(getNextProofVersion([1])).toBe(2);
    expect(getNextProofVersion([1, 2])).toBe(3);
  });

  it("enforces valid proof status transitions and locks superseded proofs", () => {
    expect(canTransitionProofStatus("pending", "approved")).toBe(true);
    expect(canTransitionProofStatus("pending", "changes_requested")).toBe(true);
    expect(canTransitionProofStatus("changes_requested", "superseded")).toBe(true);
    expect(canTransitionProofStatus("superseded", "approved")).toBe(false);
  });
});
