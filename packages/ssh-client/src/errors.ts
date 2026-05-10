export class SshClientError extends Error {
  readonly code: string;
  readonly hostId?: string;
  constructor(code: string, message: string, hostId?: string) {
    super(message);
    this.name = "SshClientError";
    this.code = code;
    this.hostId = hostId;
  }
}

export class SshAuthError extends SshClientError {
  constructor(message: string, hostId?: string) {
    super("auth", message, hostId);
    this.name = "SshAuthError";
  }
}

export class SshHostKeyError extends SshClientError {
  readonly expectedFingerprint?: string;
  readonly presentedFingerprint: string;
  constructor(
    message: string,
    presentedFingerprint: string,
    expectedFingerprint: string | undefined,
    hostId?: string,
  ) {
    super("host-key", message, hostId);
    this.name = "SshHostKeyError";
    this.presentedFingerprint = presentedFingerprint;
    this.expectedFingerprint = expectedFingerprint;
  }
}

export class SshConfigError extends SshClientError {
  constructor(message: string, hostId?: string) {
    super("config", message, hostId);
    this.name = "SshConfigError";
  }
}
