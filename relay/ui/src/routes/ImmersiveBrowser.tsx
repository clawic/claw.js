import { useParams } from "react-router-dom";
import { BrowserTab } from "./workspace/BrowserTab";

export function ImmersiveBrowserPage() {
  const { tenantId, agentId, workspaceId } = useParams();
  const prefix = `/tenants/${tenantId}/agents/${agentId}/workspaces/${workspaceId}`;
  const workspaceHref = `/workspace/${tenantId}/${agentId}/${workspaceId}/browser`;

  return <BrowserTab prefix={prefix} variant="immersive" workspaceHref={workspaceHref} />;
}
