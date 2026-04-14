import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import { DetailLayout } from "../components/DetailLayout";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { ErrorBlock } from "../components/ErrorBlock";
import { ConfirmDialog } from "../components/ConfirmDialog";

interface Props {
  testId: string;
  children?: React.ReactNode;
}

export function DocumentDetailPage({ testId, children }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, loading, error, refresh } = useApi(() => api.documentDetail(id!), [id]);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  if (loading) return <LoadingSkeleton rows={8} />;
  if (error) return <ErrorBlock message={error} onRetry={refresh} />;
  if (!data) return null;

  const executeAction = async (action: string) => {
    if (action === "reverse" && data.header.id) {
      // Need to find the entry to reverse - for GL entries this differs
      // For documents, we just call the appropriate endpoint
    }
    setConfirmAction(null);
    refresh();
  };

  const actionButtons = data.allowedActions.map((action) => (
    <button
      key={action}
      className={`btn ${action === "reverse" || action === "cancel" ? "btn-danger" : "btn-primary"} btn-sm`}
      onClick={() => setConfirmAction(action)}
    >
      {action.charAt(0).toUpperCase() + action.slice(1)}
    </button>
  ));

  return (
    <>
      <DetailLayout
        testId={testId}
        detail={data}
        actions={
          <>
            {actionButtons}
            <button className="btn btn-outline btn-sm" onClick={refresh}>Refresh</button>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>Back</button>
          </>
        }
      >
        {children}
      </DetailLayout>

      {confirmAction && (
        <ConfirmDialog
          title={`Confirm ${confirmAction}`}
          message={`Are you sure you want to ${confirmAction} document ${data.header.number}?`}
          effects={[`This will ${confirmAction} the document and apply all associated effects.`]}
          danger={confirmAction === "reverse" || confirmAction === "cancel"}
          confirmLabel={confirmAction.charAt(0).toUpperCase() + confirmAction.slice(1)}
          onConfirm={() => executeAction(confirmAction)}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </>
  );
}
