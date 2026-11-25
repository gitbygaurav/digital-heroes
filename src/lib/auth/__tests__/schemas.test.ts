import { describe, expect, it } from "vitest";
import {
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/auth/schemas";

describe("Auth Zod schemas", () => {
  it("validates a valid registration payload without allowing role injection", () => {
    const result = registerSchema.safeParse({
      full_name: "Aarav Sharma",
      email: "aarav@example.com",
      phone: "+91 9876543210",
      company: "TrailBlaze",
      password: "StrongPassword123",
      role: "admin", // client-sent role must be stripped by Zod
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect("role" in result.data).toBe(false);
    }
  });

  it("rejects short passwords on login", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched passwords on reset", () => {
    const result = resetPasswordSchema.safeParse({
      password: "NewPassword123",
      confirmPassword: "DifferentPassword123",
    });
    expect(result.success).toBe(false);
  });
});
