const CLAW_PUBLIC_API_PREFIX = "/v" + "1";
function clawApiPath(path = "") {
  const suffix = String(path).replace(/^\/+/, "");
  return suffix ? CLAW_PUBLIC_API_PREFIX + "/" + suffix : CLAW_PUBLIC_API_PREFIX;
}
const SECRETS_SESSION_STORAGE_KEY = "clawjs.secrets.session";
import { useEffect, useMemo, useState } from "react";

type Secret = {
  secretName: string;
  label?: string;
  kind?: string;
  typeId?: string;
  notes?: string;
  structuredFields?: Record<string, string>;
  allowedHosts: string[];
  allowedHeaderNames: string[];
  allowInURL: boolean;
  allowInRequestBody: boolean;
  allowLocalNetwork: boolean;
  readOnly: boolean;
  exportable: boolean;
  leaseModes: string[];
  maskedFingerprint: string;
  version: number;
  updatedAt: string;
};

type SecretType = {
  typeId: string;
  label?: string;
  description?: string;
  kind: string;
  governanceDefaults?: {
    allowedHosts?: string[];
    allowedHeaders?: string[];
    allowInUrl?: boolean;
    allowInBody?: boolean;
    allowLocalNetwork?: boolean;
  };
  fields: Array<{
    name: string;
    label?: string;
    kind: string;
    placement?: string;
    isSecret?: boolean;
    required: boolean;
    description?: string;
  }>;
  actions: Array<{
    id: string;
    label: string;
    description: string;
    capability: string;
    method: string;
  }>;
};

type SecretCapability = {
  capability: string;
  allowed: boolean;
};

type SecretAction = {
  id: string;
  label: string;
  description: string;
  capability: string;
  method: string;
  allowed?: boolean;
};

type Policy = {
  id: string;
  subjectType: string;
  subjectId: string;
  secretName: string;
  capability: string;
  effect: string;
};

type Principal = {
  id: string;
  type: string;
  label: string;
  createdAt: string;
  token?: string;
};

type Lease = {
  id: string;
  secretName: string;
  capability: string;
  mode: string;
  expiresAt: string;
  revokedAt?: string | null;
  consumedAt?: string | null;
};

type AuditEvent = {
  id: string;
  action: string;
  kind?: string;
  secretName?: string | null;
  status: string;
  detail: string;
  createdAt: string;
};

function normalizeSecret(secret: Secret & { internalName?: string; versionNumber?: number; fields?: Array<{ hasCiphertext?: boolean }> }): Secret {
  return {
    ...secret,
    secretName: secret.secretName ?? secret.internalName ?? "",
    version: secret.version ?? secret.versionNumber ?? 0,
    maskedFingerprint: secret.maskedFingerprint ?? (secret.fields?.some((field) => field.hasCiphertext) ? "encrypted" : ""),
  };
}

type Session = {
  accessToken: string;
  tenantId: string;
  email: string;
  role: string;
};

const BASE_URL = (globalThis as { __CLAW_SECRETS_BASE_URL__?: string }).__CLAW_SECRETS_BASE_URL__ || window.location.origin;

async function api<T>(session: Session, pathname: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return await response.json() as T;
}

function readStoredSession(): Session | null {
  const raw = window.localStorage.getItem(SECRETS_SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function App() {
  const [session, setSession] = useState<Session | null>(() => readStoredSession());
  const [page, setPage] = useState<"secrets" | "policies" | "principals" | "leases" | "audit">("secrets");
  const [error, setError] = useState("");
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [principals, setPrincipals] = useState<Principal[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [secretTypes, setSecretTypes] = useState<SecretType[]>([]);
  const [typeSearch, setTypeSearch] = useState("");
  const [selectedSecretCapabilities, setSelectedSecretCapabilities] = useState<SecretCapability[]>([]);
  const [selectedSecretActions, setSelectedSecretActions] = useState<SecretAction[]>([]);
  const [newPrincipalToken, setNewPrincipalToken] = useState("");
  const [selectedSecret, setSelectedSecret] = useState("");
  const [selectedPrincipal, setSelectedPrincipal] = useState("*");

  const [secretForm, setSecretForm] = useState({
    typeId: "telegram.bot_token",
    secretName: "telegram_support_bot_token",
    secretValue: "top-secret-token-v1",
    label: "Telegram bot",
    kind: "token",
    notes: "Support bot token",
    baseUrl: "",
    allowedHosts: "api.telegram.org",
    allowedHeaderNames: "Authorization",
    allowInURL: false,
    allowInRequestBody: false,
    allowLocalNetwork: false,
    readOnly: false,
    leaseModes: "process,browser",
  });
  const [policyForm, setPolicyForm] = useState({
    subjectType: "service_principal",
    subjectId: "*",
    secretName: "telegram_support_bot_token",
    capability: "broker.http",
    effect: "allow",
  });
  const [principalForm, setPrincipalForm] = useState({
    type: "sidecar_principal",
    label: "local-sidecar",
  });
  const [leaseForm, setLeaseForm] = useState({
    secretName: "telegram_support_bot_token",
    capability: "lease.process",
    mode: "process",
    ttlSec: 60,
  });
  const [rotateValue, setRotateValue] = useState("top-secret-token-v2");

  async function refreshAll(active: Session) {
    const [secretPayload, policyPayload, principalPayload, leasePayload, auditPayload, secretTypePayload] = await Promise.all([
      api<{ secrets: Secret[] }>(active, clawApiPath(`tenants/${active.tenantId}/secrets`)),
      api<{ policies: Policy[] }>(active, clawApiPath(`tenants/${active.tenantId}/policies`)),
      api<{ principals: Principal[] }>(active, clawApiPath(`tenants/${active.tenantId}/principals`)),
      api<{ leases: Lease[] }>(active, clawApiPath(`tenants/${active.tenantId}/leases`)),
      api<{ events: AuditEvent[] }>(active, clawApiPath(`tenants/${active.tenantId}/audit`)),
      fetch(`${BASE_URL}/v1/secret-types`).then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return await response.json() as { types: SecretType[] };
      }),
    ]);
    setSecrets(secretPayload.secrets.map((secret) => normalizeSecret(secret)));
    setPolicies(policyPayload.policies);
    setPrincipals(principalPayload.principals);
    setLeases(leasePayload.leases);
    setEvents(auditPayload.events.map((event) => ({
      ...event,
      action: event.action ?? event.kind ?? "",
    })));
    setSecretTypes(secretTypePayload.types);
  }

  useEffect(() => {
    if (!session) return;
    refreshAll(session).catch((nextError) => setError(nextError instanceof Error ? nextError.message : String(nextError)));
  }, [session]);

  useEffect(() => {
    if (!session || !selectedSecret) {
      setSelectedSecretCapabilities([]);
      setSelectedSecretActions([]);
      return;
    }
    Promise.all([
      api<{ capabilities: SecretCapability[] }>(session, clawApiPath(`tenants/${session.tenantId}/secrets/${encodeURIComponent(selectedSecret)}/capabilities`)),
      api<{ actions: SecretAction[] }>(session, clawApiPath(`tenants/${session.tenantId}/secrets/${encodeURIComponent(selectedSecret)}/actions`)),
    ])
      .then(([capabilityPayload, actionPayload]) => {
        setSelectedSecretCapabilities(capabilityPayload.capabilities);
        setSelectedSecretActions(actionPayload.actions);
      })
      .catch((nextError) => setError(nextError instanceof Error ? nextError.message : String(nextError)));
  }, [session, selectedSecret]);

  const selectedType = useMemo(
    () => secretTypes.find((entry) => entry.typeId === secretForm.typeId) ?? null,
    [secretTypes, secretForm.typeId],
  );

  const filteredTypes = useMemo(() => {
    const query = typeSearch.trim().toLowerCase();
    if (!query) return secretTypes;
    return secretTypes.filter((entry) => (
      entry.typeId.toLowerCase().includes(query)
      || (entry.label ?? "").toLowerCase().includes(query)
      || (entry.description ?? "").toLowerCase().includes(query)
    ));
  }, [secretTypes, typeSearch]);

  const pages = useMemo(() => ([
    { id: "secrets", label: "Secrets" },
    { id: "policies", label: "Policies" },
    { id: "principals", label: "Principals" },
    { id: "leases", label: "Leases" },
    { id: "audit", label: "Audit" },
  ]), []);

  if (!session) {
    return <LoginScreen onLogin={(next) => {
      window.localStorage.setItem(SECRETS_SESSION_STORAGE_KEY, JSON.stringify(next));
      setSession(next);
    }} error={error} onError={setError} />;
  }

  const activeSession = session;

  async function createSecret() {
    try {
      setError("");
      const payload = await api<{ secret: Secret }>(activeSession, clawApiPath(`tenants/${activeSession.tenantId}/secrets`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: {
            typeId: secretForm.typeId,
            internalName: secretForm.secretName,
            title: secretForm.label || secretForm.secretName,
            notes: secretForm.notes,
            fields: (selectedType?.fields.length ? selectedType.fields : [{ name: "token", kind: "password", placement: "header", isSecret: true }]).map((field, index) => ({
              fieldName: field.name,
              fieldKind: field.kind === "password" ? "password" : "text",
              placement: field.placement ?? (index === 0 ? "header" : "none"),
              isSecret: field.isSecret ?? field.kind === "password",
              ...(field.isSecret ?? field.kind === "password" ? { secretValue: secretForm.secretValue } : {}),
              ...(field.name === "baseUrl" && secretForm.baseUrl.trim() ? { publicValue: secretForm.baseUrl.trim() } : {}),
            })),
            governance: {
              allowedHosts: secretForm.allowedHosts.split(",").map((entry) => entry.trim()).filter(Boolean),
              allowedHeaders: secretForm.allowedHeaderNames.split(",").map((entry) => entry.trim()).filter(Boolean),
              allowInUrl: secretForm.allowInURL,
              allowInBody: secretForm.allowInRequestBody,
              allowLocalNetwork: secretForm.allowLocalNetwork,
            },
          },
        }),
      });
      const nextSecret = normalizeSecret(payload.secret);
      setSelectedSecret(nextSecret.secretName);
      setPolicyForm((current) => ({ ...current, secretName: nextSecret.secretName }));
      setLeaseForm((current) => ({ ...current, secretName: nextSecret.secretName }));
      await refreshAll(activeSession);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  async function rotateSecret() {
    try {
      setError("");
      await api(activeSession, clawApiPath(`tenants/${activeSession.tenantId}/secrets/${encodeURIComponent(selectedSecret || secretForm.secretName)}/versions`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secretValue: rotateValue }),
      });
      await refreshAll(activeSession);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  async function createPolicy() {
    try {
      setError("");
      await api(activeSession, clawApiPath(`tenants/${activeSession.tenantId}/policies`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policyForm),
      });
      await refreshAll(activeSession);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  async function createPrincipal() {
    try {
      setError("");
      const payload = await api<{ principal: Principal; token?: string }>(activeSession, clawApiPath(`tenants/${activeSession.tenantId}/principals`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(principalForm),
      });
      setNewPrincipalToken(payload.token ?? payload.principal.token ?? "");
      setSelectedPrincipal(payload.principal.id);
      setPolicyForm((current) => ({ ...current, subjectId: payload.principal.id }));
      await refreshAll(activeSession);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  async function createLease() {
    try {
      setError("");
      await api(activeSession, clawApiPath(`tenants/${activeSession.tenantId}/leases`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leaseForm),
      });
      await refreshAll(activeSession);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  async function revokeLease(leaseId: string) {
    try {
      setError("");
      await api(activeSession, clawApiPath(`tenants/${activeSession.tenantId}/leases/${leaseId}/revoke`), { method: "POST" });
      await refreshAll(activeSession);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  return (
    <div className="shell" data-testid="secrets-console">
      <aside className="rail">
        <div>
          <div className="brand brand-mark">
            <img src="/brand/logo.png" alt="ClawJS" width="28" height="28" />
            <span>Secrets</span>
          </div>
          <div className="hint">{session.tenantId}</div>
        </div>
        <nav className="nav">
          {pages.map((item) => (
            <button
              key={item.id}
              data-testid={`nav-${item.id}`}
              className={page === item.id ? "nav-item nav-item-active" : "nav-item"}
              onClick={() => setPage(item.id as typeof page)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button className="ghost" onClick={() => {
          window.localStorage.removeItem(SECRETS_SESSION_STORAGE_KEY);
          setSession(null);
        }}
        >
          Sign out
        </button>
      </aside>
      <main className="content">
        <header className="page-header">
          <div>
            <h1>Secrets Console</h1>
            <p>Brokered secrets with non-exportable defaults.</p>
          </div>
          <div className="status">
            <span>{activeSession.email}</span>
            <span>{activeSession.role}</span>
          </div>
        </header>
        {error ? <div className="error" data-testid="error-banner">{error}</div> : null}
        <div className="grid">
          {page === "secrets" ? (
            <>
              <section className="card">
                <h2>Create Secret</h2>
                <label>Type search<input data-testid="secret-type-search" value={typeSearch} onChange={(event) => setTypeSearch(event.target.value)} /></label>
                <label>Secret type<select data-testid="secret-type-select" value={secretForm.typeId} onChange={(event) => {
                  const nextType = secretTypes.find((entry) => entry.typeId === event.target.value);
                  setSecretForm((current) => ({
                    ...current,
                    typeId: event.target.value,
                    kind: nextType?.kind ?? current.kind,
                    allowedHosts: nextType?.governanceDefaults?.allowedHosts?.join(",") ?? current.allowedHosts,
                    allowedHeaderNames: nextType?.governanceDefaults?.allowedHeaders?.join(",") ?? current.allowedHeaderNames,
                    allowInURL: nextType?.governanceDefaults?.allowInUrl ?? current.allowInURL,
                    allowInRequestBody: nextType?.governanceDefaults?.allowInBody ?? current.allowInRequestBody,
                    allowLocalNetwork: nextType?.governanceDefaults?.allowLocalNetwork ?? current.allowLocalNetwork,
                  }));
                }}>
                  {filteredTypes.map((type) => (
                    <option key={type.typeId} value={type.typeId}>{type.label ?? type.typeId}</option>
                  ))}
                </select></label>
                <label>Secret name<input data-testid="secret-name-input" value={secretForm.secretName} onChange={(event) => setSecretForm({ ...secretForm, secretName: event.target.value })} /></label>
                <label>Secret value<textarea data-testid="secret-value-input" value={secretForm.secretValue} onChange={(event) => setSecretForm({ ...secretForm, secretValue: event.target.value })} /></label>
                {selectedType?.fields.some((field) => field.name === "baseUrl") ? (
                  <label>Base URL override<input data-testid="secret-base-url-input" value={secretForm.baseUrl} onChange={(event) => setSecretForm({ ...secretForm, baseUrl: event.target.value })} /></label>
                ) : null}
                <label>Allowed hosts<input value={secretForm.allowedHosts} onChange={(event) => setSecretForm({ ...secretForm, allowedHosts: event.target.value })} /></label>
                <label>Allowed headers<input value={secretForm.allowedHeaderNames} onChange={(event) => setSecretForm({ ...secretForm, allowedHeaderNames: event.target.value })} /></label>
                <label>Lease modes<input value={secretForm.leaseModes} onChange={(event) => setSecretForm({ ...secretForm, leaseModes: event.target.value })} /></label>
                <div className="toggles">
                  <label><input type="checkbox" checked={secretForm.readOnly} onChange={(event) => setSecretForm({ ...secretForm, readOnly: event.target.checked })} /> Read only</label>
                  <label><input type="checkbox" checked={secretForm.allowInURL} onChange={(event) => setSecretForm({ ...secretForm, allowInURL: event.target.checked })} /> URL injection</label>
                  <label><input type="checkbox" checked={secretForm.allowInRequestBody} onChange={(event) => setSecretForm({ ...secretForm, allowInRequestBody: event.target.checked })} /> Body injection</label>
                </div>
                <button data-testid="create-secret-submit" onClick={createSecret}>Store secret</button>
              </section>
              <section className="card">
                <h2>Secrets</h2>
                <div className="list">
                  {secrets.map((secret) => (
                    <button key={secret.secretName} data-testid={`secret-card-${secret.secretName}`} className={selectedSecret === secret.secretName ? "list-card list-card-active" : "list-card"} onClick={() => setSelectedSecret(secret.secretName)}>
                      <strong>{secret.secretName}</strong>
                      <span>{secret.typeId || secret.kind || "generic"}</span>
                      <span>{secret.maskedFingerprint}</span>
                      <span>v{secret.version}</span>
                    </button>
                  ))}
                </div>
                <div className="divider" />
                <label>Rotate selected secret<textarea data-testid="rotate-secret-input" value={rotateValue} onChange={(event) => setRotateValue(event.target.value)} /></label>
                <button data-testid="rotate-secret-submit" disabled={!selectedSecret} onClick={rotateSecret}>Rotate secret</button>
              </section>
              <section className="card">
                <h2>Selected Secret</h2>
                <div className="list">
                  {selectedSecretCapabilities.map((entry) => (
                    <div key={entry.capability} className="list-card" data-testid={`capability-${entry.capability}`}>
                      <strong>{entry.capability}</strong>
                      <span>{entry.allowed ? "allow" : "deny"}</span>
                    </div>
                  ))}
                  {selectedSecretActions.map((action) => (
                    <div key={action.id} className="list-card" data-testid={`action-${action.id}`}>
                      <strong>{action.label}</strong>
                      <span>{action.id}</span>
                      <span>{action.allowed ? "allow" : "deny"}</span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : null}

          {page === "policies" ? (
            <>
              <section className="card">
                <h2>Create Policy</h2>
                <label>Subject type<select data-testid="policy-subject-type" value={policyForm.subjectType} onChange={(event) => setPolicyForm({ ...policyForm, subjectType: event.target.value })}>
                  <option value="service_principal">service_principal</option>
                  <option value="sidecar_principal">sidecar_principal</option>
                  <option value="tenant_operator">tenant_operator</option>
                  <option value="tenant_admin">tenant_admin</option>
                  <option value="*">*</option>
                </select></label>
                <label>Subject id<input data-testid="policy-subject-id" value={policyForm.subjectId} onChange={(event) => setPolicyForm({ ...policyForm, subjectId: event.target.value })} /></label>
                <label>Secret<select data-testid="policy-secret-name" value={policyForm.secretName} onChange={(event) => setPolicyForm({ ...policyForm, secretName: event.target.value })}>
                  {(secrets.length > 0 ? secrets : [{ secretName: policyForm.secretName } as Secret]).map((secret) => (
                    <option key={secret.secretName} value={secret.secretName}>{secret.secretName}</option>
                  ))}
                </select></label>
                <label>Capability<select data-testid="policy-capability" value={policyForm.capability} onChange={(event) => setPolicyForm({ ...policyForm, capability: event.target.value })}>
                  <option value="metadata.read">metadata.read</option>
                  <option value="secret.rotate">secret.rotate</option>
                  <option value="broker.http">broker.http</option>
                  <option value="lease.process">lease.process</option>
                  <option value="lease.browser">lease.browser</option>
                  <option value="audit.read">audit.read</option>
                </select></label>
                <label>Effect<select data-testid="policy-effect" value={policyForm.effect} onChange={(event) => setPolicyForm({ ...policyForm, effect: event.target.value })}>
                  <option value="allow">allow</option>
                  <option value="deny">deny</option>
                </select></label>
                <button data-testid="create-policy-submit" onClick={createPolicy}>Create policy</button>
              </section>
              <section className="card">
                <h2>Policies</h2>
                <div className="list">
                  {policies.map((policy) => (
                    <div key={policy.id} className="list-card" data-testid={`policy-card-${policy.id}`}>
                      <strong>{policy.effect} {policy.capability}</strong>
                      <span>{policy.subjectType}:{policy.subjectId}</span>
                      <span>{policy.secretName}</span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : null}

          {page === "principals" ? (
            <>
              <section className="card">
                <h2>Create Principal</h2>
                <label>Type<select data-testid="principal-type" value={principalForm.type} onChange={(event) => setPrincipalForm({ ...principalForm, type: event.target.value })}>
                  <option value="sidecar_principal">sidecar_principal</option>
                  <option value="service_principal">service_principal</option>
                </select></label>
                <label>Label<input data-testid="principal-label" value={principalForm.label} onChange={(event) => setPrincipalForm({ ...principalForm, label: event.target.value })} /></label>
                <button data-testid="create-principal-submit" onClick={createPrincipal}>Create principal</button>
                {newPrincipalToken ? <code id="principal-token-output">{newPrincipalToken}</code> : null}
              </section>
              <section className="card">
                <h2>Principals</h2>
                <div className="list">
                  {principals.map((principal) => (
                    <div key={principal.id} className="list-card" data-testid={`principal-card-${principal.id}`}>
                      <strong>{principal.label}</strong>
                      <span>{principal.type}</span>
                      <span>{principal.id}</span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : null}

          {page === "leases" ? (
            <>
              <section className="card">
                <h2>Create Lease</h2>
                <label>Secret<select data-testid="lease-secret-name" value={leaseForm.secretName} onChange={(event) => setLeaseForm({ ...leaseForm, secretName: event.target.value })}>
                  {(secrets.length > 0 ? secrets : [{ secretName: leaseForm.secretName } as Secret]).map((secret) => (
                    <option key={secret.secretName} value={secret.secretName}>{secret.secretName}</option>
                  ))}
                </select></label>
                <label>Capability<select data-testid="lease-capability" value={leaseForm.capability} onChange={(event) => setLeaseForm({ ...leaseForm, capability: event.target.value })}>
                  <option value="lease.process">lease.process</option>
                  <option value="lease.browser">lease.browser</option>
                </select></label>
                <label>Mode<select data-testid="lease-mode" value={leaseForm.mode} onChange={(event) => setLeaseForm({ ...leaseForm, mode: event.target.value })}>
                  <option value="process">process</option>
                  <option value="browser">browser</option>
                </select></label>
                <button data-testid="create-lease-submit" onClick={createLease}>Create lease</button>
              </section>
              <section className="card">
                <h2>Leases</h2>
                <div className="list">
                  {leases.map((lease) => (
                    <div key={lease.id} className="list-card" data-testid={`lease-card-${lease.id}`}>
                      <strong>{lease.secretName}</strong>
                      <span>{lease.mode} / {lease.capability}</span>
                      <span>{lease.revokedAt ? "revoked" : lease.consumedAt ? "consumed" : "active"}</span>
                      {!lease.revokedAt ? <button data-testid={`revoke-lease-${lease.id}`} onClick={() => revokeLease(lease.id)}>Revoke</button> : null}
                    </div>
                  ))}
                </div>
              </section>
            </>
          ) : null}

          {page === "audit" ? (
            <section className="card card-wide">
              <h2>Audit</h2>
              <div className="list">
                {events.map((event) => (
                  <div key={event.id} className="list-card" data-testid={`audit-card-${event.id}`}>
                    <strong>{event.action}</strong>
                    <span>{event.secretName || "no-secret"}</span>
                    <span>{event.status}</span>
                    <span>{event.detail}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function LoginScreen(props: { onLogin: (session: Session) => void; error: string; onError: (value: string) => void }) {
  const [tenantId, setTenantId] = useState("demo-tenant");
  const [email, setEmail] = useState("admin@secrets.local");
  const [password, setPassword] = useState("secrets-admin");

  async function handleLogin() {
    try {
      props.onError("");
      const response = await fetch(`${BASE_URL}/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, email, password }),
      });
      if (!response.ok) throw new Error(await response.text());
      const payload = await response.json() as Session;
      props.onLogin(payload);
    } catch (error) {
      props.onError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand-mark">
          <img src="/brand/logo.png" alt="ClawJS" width="32" height="32" />
          <h1>Secrets</h1>
        </div>
        <p>Zero-read secrets by default, brokered access by policy.</p>
        <label>Tenant<input data-testid="login-tenant" value={tenantId} onChange={(event) => setTenantId(event.target.value)} /></label>
        <label>Email<input data-testid="login-email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<input data-testid="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {props.error ? <div className="error">{props.error}</div> : null}
        <button data-testid="login-submit" onClick={handleLogin}>Sign in</button>
      </div>
    </div>
  );
}
