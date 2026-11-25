import { describe, expect, it } from "vitest";
import {
  canTransitionOrderStatus,
  getNextValidStages,
} from "@/lib/pipeline/transitions";

describe("Pipeline Transition Rules (Appendix B)", () => {
  it("allows valid forward transitions", () => {
    expect(
      canTransitionOrderStatus({
        from: "quote",
        to: "order",
        proofApproved: false,
      }).allowed
    ).toBe(true);

    expect(
      canTransitionOrderStatus({
        from: "order",
        to: "artwork",
        proofApproved: false,
      }).allowed
    ).toBe(true);

    expect(
      canTransitionOrderStatus({
        from: "production",
        to: "completed",
        proofApproved: true,
      }).allowed
    ).toBe(true);
  });

  it("blocks proof -> production when proofApproved is false", () => {
    const blocked = canTransitionOrderStatus({
      from: "proof",
      to: "production",
      proofApproved: false,
    });
    expect(blocked.allowed).toBe(false);

    const allowed = canTransitionOrderStatus({
      from: "proof",
      to: "production",
      proofApproved: true,
    });
    expect(allowed.allowed).toBe(true);
  });

  it("rejects invalid stage jumps and cancellation without reason", () => {
    expect(
      canTransitionOrderStatus({
        from: "quote",
        to: "completed",
        proofApproved: true,
      }).allowed
    ).toBe(false);

    expect(
      canTransitionOrderStatus({
        from: "order",
        to: "cancelled",
        proofApproved: false,
        reason: "",
      }).allowed
    ).toBe(false);

    expect(
      canTransitionOrderStatus({
        from: "order",
        to: "cancelled",
        proofApproved: false,
        reason: "Customer requested refund",
      }).allowed
    ).toBe(true);
  });

  it("computes next valid stages accurately", () => {
    expect(getNextValidStages("proof", false)).toEqual([
      "artwork",
      "cancelled",
    ]);
    expect(getNextValidStages("proof", true)).toEqual([
      "artwork",
      "production",
      "cancelled",
    ]);
  });
});
