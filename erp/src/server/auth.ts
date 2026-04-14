import { SignJWT, jwtVerify } from "jose";

export interface AdminPrincipal {
  kind: "admin";
  adminId: string;
  email: string;
}

export class ErpAuthService {
  constructor(private readonly secret: string) {}

  async issueAdminToken(input: { adminId: string; email: string }): Promise<string> {
    return await new SignJWT({
      kind: "admin",
      adminId: input.adminId,
      email: input.email,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("12h")
      .sign(new TextEncoder().encode(this.secret));
  }

  async verifyAdminToken(token: string): Promise<AdminPrincipal | null> {
    try {
      const result = await jwtVerify(token, new TextEncoder().encode(this.secret));
      const payload = result.payload as {
        kind?: string;
        adminId?: string;
        email?: string;
      };
      if (payload.kind !== "admin" || !payload.adminId || !payload.email) return null;
      return {
        kind: "admin",
        adminId: payload.adminId,
        email: payload.email,
      };
    } catch {
      return null;
    }
  }
}
