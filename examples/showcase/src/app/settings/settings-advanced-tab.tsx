"use client";

import MarkdownEditor from "@/components/markdown-editor";

export function SettingsAdvancedTab(props: {
  workspaceFiles: Array<{ fileName: string; content: string }>;
  activeWorkspaceFile: string;
  setActiveWorkspaceFile: (fileName: string) => void;
  workspaceFilesSaving: Record<string, boolean>;
  setWorkspaceFiles: React.Dispatch<React.SetStateAction<Array<{ fileName: string; content: string }>>>;
  workspaceFilesLoaded: boolean;
  saveWorkspaceFile: (fileName: string, content: string) => void;
  messages: any;
}) {
  const {
    workspaceFiles,
    activeWorkspaceFile,
    setActiveWorkspaceFile,
    workspaceFilesSaving,
    setWorkspaceFiles,
    workspaceFilesLoaded,
    saveWorkspaceFile,
    messages,
  } = props;


  const activeFile = workspaceFiles.find((f) => f.fileName === activeWorkspaceFile) || null;
  const FILE_DESCRIPTIONS: Record<string, string> = {
    "SOUL.md": messages.settings.advanced.soulDesc,
    "USER.md": messages.settings.advanced.userDesc,
    "IDENTITY.md": messages.settings.advanced.identityDesc,
    "AGENTS.md": messages.settings.advanced.agentsDesc,
    "TOOLS.md": messages.settings.advanced.toolsDesc,
    "HEARTBEAT.md": messages.settings.advanced.heartbeatDesc,
  };

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground mb-4">
        {messages.settings.advanced.intro}
      </p>

      <div className="flex flex-wrap gap-1.5 mb-4" data-testid="workspace-files-nav">
        {workspaceFiles.map((file) => {
          const active = file.fileName === activeWorkspaceFile;
          return (
            <button
              key={file.fileName}
              onClick={() => setActiveWorkspaceFile(file.fileName)}
              data-testid={`workspace-file-tab-${file.fileName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
              className={`px-3 py-1.5 rounded-lg text-[13px] transition-all ${
                active
                  ? "bg-foreground text-background font-medium shadow-sm"
                  : "bg-card text-strong-foreground hover:bg-muted"
              }`}
            >
              {file.fileName}
            </button>
          );
        })}
      </div>

      {activeFile && (
        <div>
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h3 className="text-sm font-medium text-strong-foreground">{activeFile.fileName}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {FILE_DESCRIPTIONS[activeFile.fileName] || ""}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => saveWorkspaceFile(activeFile.fileName, activeFile.content)}
                disabled={!!workspaceFilesSaving[activeFile.fileName]}
                data-testid={`workspace-file-save-${activeFile.fileName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
                className="px-3 py-1.5 bg-foreground text-background rounded-lg text-xs hover:bg-foreground-intense disabled:opacity-40 transition-all active:scale-[0.97]"
              >
                {workspaceFilesSaving[activeFile.fileName]
                  ? messages.common.saving
                  : messages.settings.advanced.saveFile}
              </button>
            </div>
          </div>
          <MarkdownEditor
            key={activeFile.fileName}
            value={activeFile.content}
            data-testid={`workspace-file-editor-${activeFile.fileName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
            onChange={(v) => {
              setWorkspaceFiles((prev) =>
                prev.map((f) =>
                  f.fileName === activeFile.fileName
                    ? { ...f, content: v }
                    : f
                )
              );
            }}
            rows={20}
            spellCheck={false}
            mono
          />
        </div>
      )}

      {!workspaceFilesLoaded && (
        <p className="text-xs text-muted-foreground">{messages.common.loading}</p>
      )}
    </div>
  );

}
