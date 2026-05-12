import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
const BASE_URL = globalThis.__SECRETS_BASE_URL__ || window.location.origin;
async function api(session, pathname, init = {}) {
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
    return await response.json();
}
function readStoredSession() {
    const raw = window.localStorage.getItem("secrets-session");
    if (!raw)
        return null;
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
export function App() {
    const [session, setSession] = useState(() => readStoredSession());
    const [page, setPage] = useState("secrets");
    const [error, setError] = useState("");
    const [secrets, setSecrets] = useState([]);
    const [policies, setPolicies] = useState([]);
    const [principals, setPrincipals] = useState([]);
    const [leases, setLeases] = useState([]);
    const [events, setEvents] = useState([]);
    const [secretTypes, setSecretTypes] = useState([]);
    const [typeSearch, setTypeSearch] = useState("");
    const [selectedSecretCapabilities, setSelectedSecretCapabilities] = useState([]);
    const [selectedSecretActions, setSelectedSecretActions] = useState([]);
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
    async function refreshAll(active) {
        const [secretPayload, policyPayload, principalPayload, leasePayload, auditPayload, secretTypePayload] = await Promise.all([
            api(active, `/v1/tenants/${active.tenantId}/secrets`),
            api(active, `/v1/tenants/${active.tenantId}/policies`),
            api(active, `/v1/tenants/${active.tenantId}/principals`),
            api(active, `/v1/tenants/${active.tenantId}/leases`),
            api(active, `/v1/tenants/${active.tenantId}/audit`),
            fetch(`${BASE_URL}/v1/secret-types`).then(async (response) => {
                if (!response.ok)
                    throw new Error(await response.text());
                return await response.json();
            }),
        ]);
        setSecrets(secretPayload.secrets);
        setPolicies(policyPayload.policies);
        setPrincipals(principalPayload.principals);
        setLeases(leasePayload.leases);
        setEvents(auditPayload.events);
        setSecretTypes(secretTypePayload.types);
    }
    useEffect(() => {
        if (!session)
            return;
        refreshAll(session).catch((nextError) => setError(nextError instanceof Error ? nextError.message : String(nextError)));
    }, [session]);
    useEffect(() => {
        if (!session || !selectedSecret) {
            setSelectedSecretCapabilities([]);
            setSelectedSecretActions([]);
            return;
        }
        Promise.all([
            api(session, `/v1/tenants/${session.tenantId}/secrets/${encodeURIComponent(selectedSecret)}/capabilities`),
            api(session, `/v1/tenants/${session.tenantId}/secrets/${encodeURIComponent(selectedSecret)}/actions`),
        ])
            .then(([capabilityPayload, actionPayload]) => {
            setSelectedSecretCapabilities(capabilityPayload.capabilities);
            setSelectedSecretActions(actionPayload.actions);
        })
            .catch((nextError) => setError(nextError instanceof Error ? nextError.message : String(nextError)));
    }, [session, selectedSecret]);
    const selectedType = useMemo(() => secretTypes.find((entry) => entry.typeId === secretForm.typeId) ?? null, [secretTypes, secretForm.typeId]);
    const filteredTypes = useMemo(() => {
        const query = typeSearch.trim().toLowerCase();
        if (!query)
            return secretTypes;
        return secretTypes.filter((entry) => (entry.typeId.toLowerCase().includes(query)
            || entry.label.toLowerCase().includes(query)
            || entry.description.toLowerCase().includes(query)));
    }, [secretTypes, typeSearch]);
    const pages = useMemo(() => ([
        { id: "secrets", label: "Secrets" },
        { id: "policies", label: "Policies" },
        { id: "principals", label: "Principals" },
        { id: "leases", label: "Leases" },
        { id: "audit", label: "Audit" },
    ]), []);
    if (!session) {
        return _jsx(LoginScreen, { onLogin: (next) => {
                window.localStorage.setItem("secrets-session", JSON.stringify(next));
                setSession(next);
            }, error: error, onError: setError });
    }
    const activeSession = session;
    async function createSecret() {
        try {
            setError("");
            const payload = await api(activeSession, `/v1/tenants/${activeSession.tenantId}/secrets`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...secretForm,
                    structuredFields: secretForm.baseUrl.trim() ? { baseUrl: secretForm.baseUrl.trim() } : {},
                    allowedHosts: secretForm.allowedHosts.split(",").map((entry) => entry.trim()).filter(Boolean),
                    allowedHeaderNames: secretForm.allowedHeaderNames.split(",").map((entry) => entry.trim()).filter(Boolean),
                    leaseModes: secretForm.leaseModes.split(",").map((entry) => entry.trim()).filter(Boolean),
                }),
            });
            setSelectedSecret(payload.secret.secretName);
            setPolicyForm((current) => ({ ...current, secretName: payload.secret.secretName }));
            setLeaseForm((current) => ({ ...current, secretName: payload.secret.secretName }));
            await refreshAll(activeSession);
        }
        catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : String(nextError));
        }
    }
    async function rotateSecret() {
        try {
            setError("");
            await api(activeSession, `/v1/tenants/${activeSession.tenantId}/secrets/${encodeURIComponent(selectedSecret || secretForm.secretName)}/versions`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ secretValue: rotateValue }),
            });
            await refreshAll(activeSession);
        }
        catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : String(nextError));
        }
    }
    async function createPolicy() {
        try {
            setError("");
            await api(activeSession, `/v1/tenants/${activeSession.tenantId}/policies`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(policyForm),
            });
            await refreshAll(activeSession);
        }
        catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : String(nextError));
        }
    }
    async function createPrincipal() {
        try {
            setError("");
            const payload = await api(activeSession, `/v1/tenants/${activeSession.tenantId}/principals`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(principalForm),
            });
            setNewPrincipalToken(payload.principal.token ?? "");
            setSelectedPrincipal(payload.principal.id);
            setPolicyForm((current) => ({ ...current, subjectId: payload.principal.id }));
            await refreshAll(activeSession);
        }
        catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : String(nextError));
        }
    }
    async function createLease() {
        try {
            setError("");
            await api(activeSession, `/v1/tenants/${activeSession.tenantId}/leases`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(leaseForm),
            });
            await refreshAll(activeSession);
        }
        catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : String(nextError));
        }
    }
    async function revokeLease(leaseId) {
        try {
            setError("");
            await api(activeSession, `/v1/tenants/${activeSession.tenantId}/leases/${leaseId}/revoke`, { method: "POST" });
            await refreshAll(activeSession);
        }
        catch (nextError) {
            setError(nextError instanceof Error ? nextError.message : String(nextError));
        }
    }
    return (_jsxs("div", { className: "shell", "data-testid": "secrets-console", children: [_jsxs("aside", { className: "rail", children: [_jsxs("div", { children: [_jsxs("div", { className: "brand brand-mark", children: [_jsx("img", { src: "/brand/logo.png", alt: "ClawJS", width: "28", height: "28" }), _jsx("span", { children: "Secrets" })] }), _jsx("div", { className: "hint", children: session.tenantId })] }), _jsx("nav", { className: "nav", children: pages.map((item) => (_jsx("button", { "data-testid": `nav-${item.id}`, className: page === item.id ? "nav-item nav-item-active" : "nav-item", onClick: () => setPage(item.id), children: item.label }, item.id))) }), _jsx("button", { className: "ghost", onClick: () => {
                            window.localStorage.removeItem("secrets-session");
                            setSession(null);
                        }, children: "Sign out" })] }), _jsxs("main", { className: "content", children: [_jsxs("header", { className: "page-header", children: [_jsxs("div", { children: [_jsx("h1", { children: "Secrets Console" }), _jsx("p", { children: "Brokered secrets with non-exportable defaults." })] }), _jsxs("div", { className: "status", children: [_jsx("span", { children: activeSession.email }), _jsx("span", { children: activeSession.role })] })] }), error ? _jsx("div", { className: "error", "data-testid": "error-banner", children: error }) : null, _jsxs("div", { className: "grid", children: [page === "secrets" ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Create Secret" }), _jsxs("label", { children: ["Type search", _jsx("input", { "data-testid": "secret-type-search", value: typeSearch, onChange: (event) => setTypeSearch(event.target.value) })] }), _jsxs("label", { children: ["Secret type", _jsx("select", { "data-testid": "secret-type-select", value: secretForm.typeId, onChange: (event) => {
                                                            const nextType = secretTypes.find((entry) => entry.typeId === event.target.value);
                                                            setSecretForm((current) => ({
                                                                ...current,
                                                                typeId: event.target.value,
                                                                kind: nextType?.kind ?? current.kind,
                                                                allowedHosts: nextType?.defaultAllowedHosts.join(",") ?? current.allowedHosts,
                                                                allowedHeaderNames: nextType?.defaultAllowedHeaderNames.join(",") ?? current.allowedHeaderNames,
                                                                allowInURL: nextType?.defaultAllowInURL ?? current.allowInURL,
                                                                allowInRequestBody: nextType?.defaultAllowInRequestBody ?? current.allowInRequestBody,
                                                                allowLocalNetwork: nextType?.defaultAllowLocalNetwork ?? current.allowLocalNetwork,
                                                                readOnly: nextType?.defaultReadOnly ?? current.readOnly,
                                                                leaseModes: nextType?.defaultLeaseModes.join(",") || current.leaseModes,
                                                            }));
                                                        }, children: filteredTypes.map((type) => (_jsx("option", { value: type.typeId, children: type.label }, type.typeId))) })] }), _jsxs("label", { children: ["Secret name", _jsx("input", { "data-testid": "secret-name-input", value: secretForm.secretName, onChange: (event) => setSecretForm({ ...secretForm, secretName: event.target.value }) })] }), _jsxs("label", { children: ["Secret value", _jsx("textarea", { "data-testid": "secret-value-input", value: secretForm.secretValue, onChange: (event) => setSecretForm({ ...secretForm, secretValue: event.target.value }) })] }), selectedType?.fields.some((field) => field.id === "baseUrl") ? (_jsxs("label", { children: ["Base URL override", _jsx("input", { "data-testid": "secret-base-url-input", value: secretForm.baseUrl, onChange: (event) => setSecretForm({ ...secretForm, baseUrl: event.target.value }) })] })) : null, _jsxs("label", { children: ["Allowed hosts", _jsx("input", { value: secretForm.allowedHosts, onChange: (event) => setSecretForm({ ...secretForm, allowedHosts: event.target.value }) })] }), _jsxs("label", { children: ["Allowed headers", _jsx("input", { value: secretForm.allowedHeaderNames, onChange: (event) => setSecretForm({ ...secretForm, allowedHeaderNames: event.target.value }) })] }), _jsxs("label", { children: ["Lease modes", _jsx("input", { value: secretForm.leaseModes, onChange: (event) => setSecretForm({ ...secretForm, leaseModes: event.target.value }) })] }), _jsxs("div", { className: "toggles", children: [_jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: secretForm.readOnly, onChange: (event) => setSecretForm({ ...secretForm, readOnly: event.target.checked }) }), " Read only"] }), _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: secretForm.allowInURL, onChange: (event) => setSecretForm({ ...secretForm, allowInURL: event.target.checked }) }), " URL injection"] }), _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: secretForm.allowInRequestBody, onChange: (event) => setSecretForm({ ...secretForm, allowInRequestBody: event.target.checked }) }), " Body injection"] })] }), _jsx("button", { "data-testid": "create-secret-submit", onClick: createSecret, children: "Store secret" })] }), _jsxs("section", { className: "card", children: [_jsx("h2", { children: "Secrets" }), _jsx("div", { className: "list", children: secrets.map((secret) => (_jsxs("button", { "data-testid": `secret-card-${secret.secretName}`, className: selectedSecret === secret.secretName ? "list-card list-card-active" : "list-card", onClick: () => setSelectedSecret(secret.secretName), children: [_jsx("strong", { children: secret.secretName }), _jsx("span", { children: secret.typeId || secret.kind || "generic" }), _jsx("span", { children: secret.maskedFingerprint }), _jsxs("span", { children: ["v", secret.version] })] }, secret.secretName))) }), _jsx("div", { className: "divider" }), _jsxs("label", { children: ["Rotate selected secret", _jsx("textarea", { "data-testid": "rotate-secret-input", value: rotateValue, onChange: (event) => setRotateValue(event.target.value) })] }), _jsx("button", { "data-testid": "rotate-secret-submit", disabled: !selectedSecret, onClick: rotateSecret, children: "Rotate secret" })] }), _jsxs("section", { className: "card", children: [_jsx("h2", { children: "Selected Secret" }), _jsxs("div", { className: "list", children: [selectedSecretCapabilities.map((entry) => (_jsxs("div", { className: "list-card", "data-testid": `capability-${entry.capability}`, children: [_jsx("strong", { children: entry.capability }), _jsx("span", { children: entry.allowed ? "allow" : "deny" })] }, entry.capability))), selectedSecretActions.map((action) => (_jsxs("div", { className: "list-card", "data-testid": `action-${action.id}`, children: [_jsx("strong", { children: action.label }), _jsx("span", { children: action.id }), _jsx("span", { children: action.allowed ? "allow" : "deny" })] }, action.id)))] })] })] })) : null, page === "policies" ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Create Policy" }), _jsxs("label", { children: ["Subject type", _jsxs("select", { "data-testid": "policy-subject-type", value: policyForm.subjectType, onChange: (event) => setPolicyForm({ ...policyForm, subjectType: event.target.value }), children: [_jsx("option", { value: "service_principal", children: "service_principal" }), _jsx("option", { value: "sidecar_principal", children: "sidecar_principal" }), _jsx("option", { value: "tenant_operator", children: "tenant_operator" }), _jsx("option", { value: "tenant_admin", children: "tenant_admin" }), _jsx("option", { value: "*", children: "*" })] })] }), _jsxs("label", { children: ["Subject id", _jsx("input", { "data-testid": "policy-subject-id", value: policyForm.subjectId, onChange: (event) => setPolicyForm({ ...policyForm, subjectId: event.target.value }) })] }), _jsxs("label", { children: ["Secret", _jsx("select", { "data-testid": "policy-secret-name", value: policyForm.secretName, onChange: (event) => setPolicyForm({ ...policyForm, secretName: event.target.value }), children: (secrets.length > 0 ? secrets : [{ secretName: policyForm.secretName }]).map((secret) => (_jsx("option", { value: secret.secretName, children: secret.secretName }, secret.secretName))) })] }), _jsxs("label", { children: ["Capability", _jsxs("select", { "data-testid": "policy-capability", value: policyForm.capability, onChange: (event) => setPolicyForm({ ...policyForm, capability: event.target.value }), children: [_jsx("option", { value: "metadata.read", children: "metadata.read" }), _jsx("option", { value: "secret.rotate", children: "secret.rotate" }), _jsx("option", { value: "broker.http", children: "broker.http" }), _jsx("option", { value: "lease.process", children: "lease.process" }), _jsx("option", { value: "lease.browser", children: "lease.browser" }), _jsx("option", { value: "audit.read", children: "audit.read" })] })] }), _jsxs("label", { children: ["Effect", _jsxs("select", { "data-testid": "policy-effect", value: policyForm.effect, onChange: (event) => setPolicyForm({ ...policyForm, effect: event.target.value }), children: [_jsx("option", { value: "allow", children: "allow" }), _jsx("option", { value: "deny", children: "deny" })] })] }), _jsx("button", { "data-testid": "create-policy-submit", onClick: createPolicy, children: "Create policy" })] }), _jsxs("section", { className: "card", children: [_jsx("h2", { children: "Policies" }), _jsx("div", { className: "list", children: policies.map((policy) => (_jsxs("div", { className: "list-card", "data-testid": `policy-card-${policy.id}`, children: [_jsxs("strong", { children: [policy.effect, " ", policy.capability] }), _jsxs("span", { children: [policy.subjectType, ":", policy.subjectId] }), _jsx("span", { children: policy.secretName })] }, policy.id))) })] })] })) : null, page === "principals" ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Create Principal" }), _jsxs("label", { children: ["Type", _jsxs("select", { "data-testid": "principal-type", value: principalForm.type, onChange: (event) => setPrincipalForm({ ...principalForm, type: event.target.value }), children: [_jsx("option", { value: "sidecar_principal", children: "sidecar_principal" }), _jsx("option", { value: "service_principal", children: "service_principal" })] })] }), _jsxs("label", { children: ["Label", _jsx("input", { "data-testid": "principal-label", value: principalForm.label, onChange: (event) => setPrincipalForm({ ...principalForm, label: event.target.value }) })] }), _jsx("button", { "data-testid": "create-principal-submit", onClick: createPrincipal, children: "Create principal" }), newPrincipalToken ? _jsx("code", { id: "principal-token-output", children: newPrincipalToken }) : null] }), _jsxs("section", { className: "card", children: [_jsx("h2", { children: "Principals" }), _jsx("div", { className: "list", children: principals.map((principal) => (_jsxs("div", { className: "list-card", "data-testid": `principal-card-${principal.id}`, children: [_jsx("strong", { children: principal.label }), _jsx("span", { children: principal.type }), _jsx("span", { children: principal.id })] }, principal.id))) })] })] })) : null, page === "leases" ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "card", children: [_jsx("h2", { children: "Create Lease" }), _jsxs("label", { children: ["Secret", _jsx("select", { "data-testid": "lease-secret-name", value: leaseForm.secretName, onChange: (event) => setLeaseForm({ ...leaseForm, secretName: event.target.value }), children: (secrets.length > 0 ? secrets : [{ secretName: leaseForm.secretName }]).map((secret) => (_jsx("option", { value: secret.secretName, children: secret.secretName }, secret.secretName))) })] }), _jsxs("label", { children: ["Capability", _jsxs("select", { "data-testid": "lease-capability", value: leaseForm.capability, onChange: (event) => setLeaseForm({ ...leaseForm, capability: event.target.value }), children: [_jsx("option", { value: "lease.process", children: "lease.process" }), _jsx("option", { value: "lease.browser", children: "lease.browser" })] })] }), _jsxs("label", { children: ["Mode", _jsxs("select", { "data-testid": "lease-mode", value: leaseForm.mode, onChange: (event) => setLeaseForm({ ...leaseForm, mode: event.target.value }), children: [_jsx("option", { value: "process", children: "process" }), _jsx("option", { value: "browser", children: "browser" })] })] }), _jsx("button", { "data-testid": "create-lease-submit", onClick: createLease, children: "Create lease" })] }), _jsxs("section", { className: "card", children: [_jsx("h2", { children: "Leases" }), _jsx("div", { className: "list", children: leases.map((lease) => (_jsxs("div", { className: "list-card", "data-testid": `lease-card-${lease.id}`, children: [_jsx("strong", { children: lease.secretName }), _jsxs("span", { children: [lease.mode, " / ", lease.capability] }), _jsx("span", { children: lease.revokedAt ? "revoked" : lease.consumedAt ? "consumed" : "active" }), !lease.revokedAt ? _jsx("button", { "data-testid": `revoke-lease-${lease.id}`, onClick: () => revokeLease(lease.id), children: "Revoke" }) : null] }, lease.id))) })] })] })) : null, page === "audit" ? (_jsxs("section", { className: "card card-wide", children: [_jsx("h2", { children: "Audit" }), _jsx("div", { className: "list", children: events.map((event) => (_jsxs("div", { className: "list-card", "data-testid": `audit-card-${event.id}`, children: [_jsx("strong", { children: event.action }), _jsx("span", { children: event.secretName || "no-secret" }), _jsx("span", { children: event.status }), _jsx("span", { children: event.detail })] }, event.id))) })] })) : null] })] })] }));
}
function LoginScreen(props) {
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
            if (!response.ok)
                throw new Error(await response.text());
            const payload = await response.json();
            props.onLogin(payload);
        }
        catch (error) {
            props.onError(error instanceof Error ? error.message : String(error));
        }
    }
    return (_jsx("div", { className: "login-shell", children: _jsxs("div", { className: "login-card", children: [_jsxs("div", { className: "login-brand-mark", children: [_jsx("img", { src: "/brand/logo.png", alt: "ClawJS", width: "32", height: "32" }), _jsx("h1", { children: "Secrets" })] }), _jsx("p", { children: "Zero-read secrets by default, brokered access by policy." }), _jsxs("label", { children: ["Tenant", _jsx("input", { "data-testid": "login-tenant", value: tenantId, onChange: (event) => setTenantId(event.target.value) })] }), _jsxs("label", { children: ["Email", _jsx("input", { "data-testid": "login-email", value: email, onChange: (event) => setEmail(event.target.value) })] }), _jsxs("label", { children: ["Password", _jsx("input", { "data-testid": "login-password", type: "password", value: password, onChange: (event) => setPassword(event.target.value) })] }), props.error ? _jsx("div", { className: "error", children: props.error }) : null, _jsx("button", { "data-testid": "login-submit", onClick: handleLogin, children: "Sign in" })] }) }));
}
