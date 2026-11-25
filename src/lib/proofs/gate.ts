/**
 * Proof Versioning & Server-Side Approval Gate (PRD §10, Decision D8).
 */

export type ProofStatus =
  | "pending"
  | "approved"
  | "changes_requested"
  | "superseded";

export interface GateOrderState {
  proof_approved: boolean;
  status: string;
}

/**
 * Enforces Decision D8: print-ready files unlock ONLY once a proof is approved.
 */
export function checkPrintFileApprovalGate(order: GateOrderState): {
  allowed: boolean;
  httpStatus: 200 | 403;
  reason?: string;
} {
  if (!order.proof_approved) {
    return {
      allowed: false,
      httpStatus: 403,
      reason: "Print-ready files are locked until a proof is approved.",
    };
  }
  return { allowed: true, httpStatus: 200 };
}

/**
 * Computes the next sequential proof version (1, 2, 3...) without deleting history.
 */
export function getNextProofVersion(existingVersions: number[]): number {
  if (existingVersions.length === 0) return 1;
  return Math.max(...existingVersions) + 1;
}

/**
 * Validates allowed proof status transitions.
 */
export function canTransitionProofStatus(
  from: ProofStatus,
  to: ProofStatus
): boolean {
  if (from === "superseded") return false;
  if (from === "pending") {
    return to === "approved" || to === "changes_requested" || to === "superseded";
  }
  if (from === "changes_requested") {
    return to === "superseded";
  }
  if (from === "approved") {
    return to === "superseded";
  }
  return false;
}
