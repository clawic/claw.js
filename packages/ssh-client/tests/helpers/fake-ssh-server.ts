import ssh2Pkg from "ssh2";
import type {
  Connection,
  Server as Ssh2ServerType,
} from "ssh2";
import type { AddressInfo } from "node:net";

const { Server, utils } = ssh2Pkg as unknown as {
  Server: new (
    opts: { hostKeys: (string | Buffer)[] },
    handler: (client: Connection) => void,
  ) => Ssh2ServerType;
  utils: typeof import("ssh2").utils;
};

export interface FakeServerOptions {
  acceptPassword?: string;
  acceptPublicKey?: Buffer;
  execHandlers?: Record<
    string,
    (input: {
      command: string;
      write: (data: string) => void;
      writeStderr: (data: string) => void;
      exit: (code: number) => void;
      end: () => void;
    }) => void
  >;
  sftpAccept?: boolean;
}

export interface FakeServerHandle {
  port: number;
  host: string;
  hostKey: string;
  hostKeyPublic: string;
  close(): Promise<void>;
}

export async function startFakeSshServer(
  options: FakeServerOptions = {},
): Promise<FakeServerHandle> {
  const keys = utils.generateKeyPairSync("rsa", { bits: 2048 });
  const server = new Server({ hostKeys: [keys.private] }, (client) => {
    client.on("authentication", (ctx) => {
      if (ctx.method === "password") {
        if (options.acceptPassword && ctx.password === options.acceptPassword) {
          ctx.accept();
          return;
        }
        ctx.reject(["password", "publickey"]);
        return;
      }
      if (ctx.method === "publickey") {
        if (!options.acceptPublicKey) {
          ctx.reject(["password", "publickey"]);
          return;
        }
        const parsedResult = utils.parseKey(options.acceptPublicKey);
        if (parsedResult instanceof Error || Array.isArray(parsedResult)) {
          ctx.reject(["password", "publickey"]);
          return;
        }
        const parsed = parsedResult;
        const expectedPublic = parsed.getPublicSSH();
        if (
          ctx.key.algo === parsed.type &&
          Buffer.compare(ctx.key.data, expectedPublic) === 0
        ) {
          if (ctx.signature) {
            if (parsed.verify(ctx.blob!, ctx.signature, ctx.hashAlgo) === true) {
              ctx.accept();
            } else {
              ctx.reject(["password", "publickey"]);
            }
          } else {
            ctx.accept();
          }
          return;
        }
        ctx.reject(["password", "publickey"]);
        return;
      }
      ctx.reject(["password", "publickey"]);
    });

    client.on("ready", () => {
      client.on("session", (accept) => {
        const session = accept();
        session.on("exec", (acceptExec, _rejectExec, info) => {
          const stream = acceptExec();
          const handler = options.execHandlers?.[info.command];
          const handle = {
            command: info.command,
            write: (data: string) => stream.write(data),
            writeStderr: (data: string) => stream.stderr.write(data),
            exit: (code: number) => stream.exit(code),
            end: () => stream.end(),
          };
          if (handler) {
            handler(handle);
          } else {
            stream.stderr.write(`fake-ssh: no handler for: ${info.command}\n`);
            stream.exit(127);
            stream.end();
          }
        });
        if (options.sftpAccept !== false) {
          session.on("sftp", (acceptSftp) => {
            acceptSftp();
          });
        }
      });
    });
    client.on("error", () => {
      /* swallow */
    });
  });

  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = server.address() as AddressInfo;

  return {
    port: address.port,
    host: "127.0.0.1",
    hostKey: keys.private,
    hostKeyPublic: keys.public,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

export function makeClientKeyPair(): { publicKey: string; privateKey: string } {
  const kp = utils.generateKeyPairSync("rsa", { bits: 2048 });
  return { publicKey: kp.public, privateKey: kp.private };
}
