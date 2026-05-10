import { z } from "zod";

export const SshSecretKindSchema = z.enum([
  "private-key",
  "password",
  "passphrase",
]);
export type SshSecretKind = z.infer<typeof SshSecretKindSchema>;

export const SshSecretSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("private-key"),
    privateKeyPem: z.string().min(1),
    passphrase: z.string().optional(),
  }),
  z.object({
    kind: z.literal("password"),
    password: z.string().min(1),
  }),
  z.object({
    kind: z.literal("passphrase"),
    passphrase: z.string().min(1),
  }),
]);
export type SshSecret = z.infer<typeof SshSecretSchema>;

export interface SecretResolver {
  resolve(secretId: string): Promise<SshSecret | null>;
}

export class InMemorySecretResolver implements SecretResolver {
  private readonly bag = new Map<string, SshSecret>();

  put(id: string, secret: SshSecret): void {
    this.bag.set(id, SshSecretSchema.parse(secret));
  }

  remove(id: string): void {
    this.bag.delete(id);
  }

  async resolve(id: string): Promise<SshSecret | null> {
    return this.bag.get(id) ?? null;
  }
}
