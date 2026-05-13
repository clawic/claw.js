// Optional client to clawjs-drive. Today media lives on local disk under
// <dataDir>/media; this client is a placeholder so future offload to Drive can
// be wired without touching the rest of the framework.

export interface DriveClient {
  putObject(opts: { name: string; mimeType: string; body: Buffer }): Promise<{ path: string; disk: "drive" | "local" }>;
  getObject(path: string): Promise<Buffer | null>;
}

export function createDriveClient(baseUrl: string | null): DriveClient | null {
  if (!baseUrl) return null;
  return {
    async putObject() {
      throw new Error("drive client not yet implemented");
    },
    async getObject() {
      return null;
    },
  };
}
