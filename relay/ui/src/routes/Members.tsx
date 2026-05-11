import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { PageHeader, PageBody } from "../components/PageHeader";
import { Card } from "../components/Card";
import { Table, THead, TH, TR, TD } from "../components/Table";
import { Empty, ErrorMsg, Loading } from "../components/Empty";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";

interface Member {
  userId: string;
  email: string;
  role: "admin" | "user";
  scopes: string[];
}

export function MembersPage() {
  const { auth } = useAuth();
  const tenantId = auth?.tenantId ?? "";
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<string | null>(null);

  const refresh = async () => {
    if (!tenantId) return;
    try {
      const result = await api.get<{ items: Member[] }>(`/tenants/${tenantId}/members`);
      setMembers(result.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  useEffect(() => {
    void refresh();
  }, [tenantId]);

  const handleInvite = async () => {
    if (!email.includes("@")) {
      setError("Enter a valid email address");
      return;
    }
    try {
      const result = await api.post<{ delivered: boolean; reason: string | null }>(
        "/auth/magic-link/start",
        { email, tenantId, purpose: "sign-in" },
      );
      setInviteResult(
        result.delivered
          ? `Magic link sent to ${email}.`
          : `Could not deliver (${result.reason ?? "unknown"}). Check the server log for the URL.`,
      );
      setEmail("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  };

  return (
    <>
      <PageHeader title="Members" />
      <PageBody>
        <Card title="Invite a teammate" subtitle={tenantId ? `Tenant ${tenantId}` : undefined}>
          <div className="flex items-end gap-2 flex-wrap">
            <label className="flex flex-col text-xs flex-1 min-w-[240px]">
              <span className="text-text-muted">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="teammate@example.com"
                className="bg-bg-panel border border-border rounded px-2 py-1 text-sm"
              />
            </label>
            <Button variant="primary" onClick={handleInvite}>
              <UserPlus size={14} /> Send magic link
            </Button>
          </div>
          {inviteResult ? <div className="mt-2 text-xs text-text-muted">{inviteResult}</div> : null}
        </Card>
        <Card title="Current members">
          {error ? <ErrorMsg message={error} /> : null}
          {members == null ? <Loading /> : null}
          {members?.length === 0 ? (
            <Empty title="No members yet" description="Invite teammates with a magic link." />
          ) : null}
          {members && members.length > 0 ? (
            <Table>
              <THead>
                <tr>
                  <TH>Email</TH>
                  <TH>Role</TH>
                  <TH>Scopes</TH>
                </tr>
              </THead>
              <tbody>
                {members.map((member) => (
                  <TR key={member.userId}>
                    <TD>{member.email}</TD>
                    <TD>
                      {member.role === "admin" ? (
                        <Badge variant="info">Admin</Badge>
                      ) : (
                        <Badge variant="success">User</Badge>
                      )}
                    </TD>
                    <TD>
                      <span className="text-text-muted text-[11px]">{member.scopes.length} scopes</span>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          ) : null}
        </Card>
      </PageBody>
    </>
  );
}
