import type { OrderStatus } from "@/types/orders";

export interface TransitionCheckInput {
  from: OrderStatus;
  to: OrderStatus;
  proofApproved: boolean;
  reason?: string;
}

export interface TransitionCheckResult {
  allowed: boolean;
  error?: string;
}

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  quote: ["order", "cancelled"],
  order: ["artwork", "cancelled"],
  artwork: ["proof", "cancelled"],
  proof: ["artwork", "production", "cancelled"],
  production: ["completed", "cancelled"],
  completed: ["cancelled"],
  cancelled: [],
};

/**
 * Enforces Appendix B Pipeline Transition Rules.
 * Invalid status jumps are rejected; `proof -> production` requires `proofApproved = true`.
 */
export function canTransitionOrderStatus(
  input: TransitionCheckInput
): TransitionCheckResult {
  const { from, to, proofApproved, reason } = input;

  if (from === to) {
    return { allowed: false, error: `Order is already in "${from}" stage.` };
  }

  if (to === "cancelled") {
    if (from === "cancelled") {
      return { allowed: false, error: "Order is already cancelled." };
    }
    if (!reason || reason.trim().length < 3) {
      return {
        allowed: false,
        error: "Cancellation requires a reason (minimum 3 characters).",
      };
    }
    return { allowed: true };
  }

  const allowedNext = VALID_TRANSITIONS[from] ?? [];
  if (!allowedNext.includes(to)) {
    return {
      allowed: false,
      error: `Invalid pipeline transition: "${from}" → "${to}" is not permitted.`,
    };
  }

  if (from === "proof" && to === "production" && !proofApproved) {
    return {
      allowed: false,
      error: "Cannot move to production until the customer approves a proof.",
    };
  }

  return { allowed: true };
}

export function getNextValidStages(
  current: OrderStatus,
  proofApproved: boolean
): OrderStatus[] {
  return (VALID_TRANSITIONS[current] ?? []).filter(
    (next) => !(current === "proof" && next === "production" && !proofApproved)
  );
}
