import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { api } from "./lib/api";
import { useAuth } from "./lib/auth";

type Project = { id: string; name: string; description: string };
type Repository = { id: string; name: string; remoteUrl: string; defaultBranch: string; projectId: string };
type Asset = { id: string; name: string; kind: "script" | "notebook"; path: string; runtime: "node" | "python"; projectId: string; repositoryId: string };
type Revision = { id: string; content: string; baseRef: string };
type Run = { id: string; status: string; assetId: string; revisionId: string; outputText: string; errorText: string };
type Artifact = { id: string; name: string; deployableKind: "static" | "node-web" | null };
type Deployment = { id: string; kind: "static" | "node-web"; status: string; previewUrl: string; activeDomain: string; certificateStatus: string };
type Worker = { workerId: string; label: string; runtimes: string[]; deployKinds: string[]; online: boolean };
type ChangeRequest = { id: string; title: string; status: string; revisionId: string };
type Workflow = { id: string; name: string; cron: string; enabled: boolean };

function Protected({ children }: { children: ReactElement }) {
  const { auth } = useAuth();
  const location = useLocation();
  if (!auth) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

function AppShell() {
  const { auth, logout } = useAuth();
  const location = useLocation();
  const links = [
    ["/projects", "Projects"],
    ["/scripts", "Scripts"],
    ["/notebooks", "Notebooks"],
    ["/runs", "Runs"],
    ["/changes", "Changes"],
    ["/workflows", "Workflows"],
    ["/deployments", "Deployments"],
    ["/workers", "Workers"],
    ["/settings", "Settings"],
  ] as const;

  return (
    <div className="layout">
      <aside className="rail">
        <div>
          <p className="eyebrow">Agent Execution Plane</p>
          <h1 className="brand-title">Local workers, versioned code, deployable runs.</h1>
        </div>
        <nav className="nav-list">
          {links.map(([href, label]) => (
            <Link key={href} className={`nav-link${location.pathname === href ? " nav-link-active" : ""}`} to={href}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="rail-footer">
          <p className="eyebrow">{auth?.email}</p>
          <button className="secondary-button" onClick={() => logout()}>Logout</button>
        </div>
      </aside>
      <main className="content">{childrenForPath(location.pathname)}</main>
    </div>
  );
}

function childrenForPath(pathname: string) {
  switch (pathname) {
    case "/scripts":
      return <ScriptsPage />;
    case "/notebooks":
      return <NotebooksPage />;
    case "/runs":
      return <RunsPage />;
    case "/changes":
      return <ChangesPage />;
    case "/workflows":
      return <WorkflowsPage />;
    case "/deployments":
      return <DeploymentsPage />;
    case "/workers":
      return <WorkersPage />;
    case "/settings":
      return <SettingsPage />;
    case "/projects":
    default:
      return <ProjectsPage />;
  }
}

function PageFrame(props: { title: string; body: string; children: ReactNode }) {
  return (
    <section className="page-card">
      <header className="page-header">
        <div>
          <p className="eyebrow">Execution Plane</p>
          <h2>{props.title}</h2>
        </div>
        <p className="page-copy">{props.body}</p>
      </header>
      {props.children}
    </section>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const { auth, login } = useAuth();
  const [email, setEmail] = useState("admin@execution.local");
  const [password, setPassword] = useState("execution-admin");
  const [tenantId, setTenantId] = useState("demo-tenant");
  const [error, setError] = useState("");

  if (auth) return <Navigate to="/projects" replace />;

  return (
    <div className="login-screen">
      <div className="login-card">
        <p className="eyebrow">Control Plane</p>
        <h1>Execution Plane</h1>
        <p className="page-copy">Auth, workers, assets, runs, artifacts and deployments in one surface.</p>
        <label>
          <span>Email</span>
          <input data-testid="login-email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          <span>Password</span>
          <input data-testid="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <label>
          <span>Tenant</span>
          <input data-testid="login-tenant" value={tenantId} onChange={(event) => setTenantId(event.target.value)} />
        </label>
        {error ? <p className="error-copy">{error}</p> : null}
        <button
          className="primary-button"
          data-testid="login-submit"
          onClick={async () => {
            try {
              await login(email, password, tenantId);
              navigate("/projects");
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : String(cause));
            }
          }}
        >
          Enter Control Plane
        </button>
      </div>
    </div>
  );
}

function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [settings, setSettings] = useState<{ demoRepositoryPath?: string } | null>(null);
  const [projectName, setProjectName] = useState("Demo Project");
  const [repoName, setRepoName] = useState("demo-repo");
  const [repoUrl, setRepoUrl] = useState("");
  const [scriptName, setScriptName] = useState("hello-script");
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedRepository, setSelectedRepository] = useState("");

  const load = async () => {
    const assetsResponse = selectedProject
      ? api.get<{ assets: Asset[] }>(`/projects/${selectedProject}/assets`).catch(() => ({ assets: [] }))
      : Promise.resolve({ assets: [] as Asset[] });
    const [{ projects }, { settings }, { assets }] = await Promise.all([
      api.get<{ projects: Project[] }>("/projects"),
      api.get<{ settings: { demoRepositoryPath?: string } }>("/settings"),
      assetsResponse,
    ]);
    setProjects(projects ?? []);
    setSettings(settings);
    if (!selectedProject && projects[0]) setSelectedProject(projects[0].id);
    setAssets(assets ?? []);
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    api.get<{ repositories: Repository[] }>(`/projects/${selectedProject}/repositories`).then((response) => {
      const nextRepositories = response.repositories ?? [];
      setRepositories(nextRepositories);
      if (!selectedRepository && nextRepositories[0]) setSelectedRepository(nextRepositories[0].id);
    }).catch(() => undefined);
    api.get<{ assets: Asset[] }>(`/projects/${selectedProject}/assets`).then((response) => setAssets(response.assets ?? [])).catch(() => undefined);
  }, [selectedProject]);

  useEffect(() => {
    if (settings?.demoRepositoryPath && !repoUrl) setRepoUrl(settings.demoRepositoryPath);
  }, [settings, repoUrl]);

  return (
    <PageFrame title="Projects" body="Create the project shell, bind a Git repo, and start versioned assets.">
      <div className="grid-two">
        <div className="panel">
          <h3>Create Project</h3>
          <input data-testid="project-name" value={projectName} onChange={(event) => setProjectName(event.target.value)} />
          <button className="primary-button" data-testid="create-project" onClick={async () => {
            const { project } = await api.post<{ project: Project }>("/projects", { name: projectName, description: "Created from UI" });
            setSelectedProject(project.id);
            await load();
          }}>Create Project</button>
          <div className="list">
            {projects.map((project) => (
              <button key={project.id} className={`list-item${selectedProject === project.id ? " active" : ""}`} onClick={() => setSelectedProject(project.id)}>
                <strong>{project.name}</strong>
                <span>{project.description || "No description"}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="panel">
          <h3>Bind Repository</h3>
          <input value={repoName} onChange={(event) => setRepoName(event.target.value)} />
          <textarea data-testid="repo-url" value={repoUrl} onChange={(event) => setRepoUrl(event.target.value)} />
          <button className="primary-button" data-testid="create-repository" disabled={!selectedProject} onClick={async () => {
            const { repository } = await api.post<{ repository: Repository }>(`/projects/${selectedProject}/repositories`, { name: repoName, remoteUrl: repoUrl, defaultBranch: "main" });
            setSelectedRepository(repository.id);
            const response = await api.get<{ repositories: Repository[] }>(`/projects/${selectedProject}/repositories`);
            setRepositories(response.repositories);
          }}>Create Repository</button>
          <div className="list">
            {repositories.map((repository) => (
              <div key={repository.id} className={`list-item${selectedRepository === repository.id ? " active" : ""}`} onClick={() => setSelectedRepository(repository.id)}>
                <strong>{repository.name}</strong>
                <span>{repository.remoteUrl}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="panel">
        <h3>Create Script Asset</h3>
        <input data-testid="script-name" value={scriptName} onChange={(event) => setScriptName(event.target.value)} />
        <button className="primary-button" data-testid="create-script-asset" disabled={!selectedProject || !selectedRepository} onClick={async () => {
          const { asset } = await api.post<{ asset: Asset }>(`/projects/${selectedProject}/assets`, {
            repositoryId: selectedRepository,
            name: scriptName,
            kind: "script",
            path: `scripts/${scriptName}.js`,
            runtime: "node",
          });
          setAssets((current) => [asset, ...current.filter((entry) => entry.id !== asset.id)]);
        }}>Create Script Asset</button>
        <div className="list">
          {assets.map((asset) => (
            <div key={asset.id} className="list-item">
              <strong>{asset.name}</strong>
              <span>{asset.kind} · {asset.path}</span>
            </div>
          ))}
        </div>
      </div>
    </PageFrame>
  );
}

function ScriptsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [content, setContent] = useState([
    "import fs from 'node:fs';",
    "import path from 'node:path';",
    "const artifactDir = process.env.EP_ARTIFACT_DIR;",
    "fs.mkdirSync(path.join(artifactDir, 'static-site'), { recursive: true });",
    "fs.writeFileSync(path.join(artifactDir, 'static-site', 'index.html'), '<html><body><h1>Execution Plane UI</h1></body></html>');",
    "console.log('ui build complete');",
  ].join("\n"));
  const [revisions, setRevisions] = useState<Revision[]>([]);

  useEffect(() => {
    api.get<{ projects: Project[] }>("/projects").then(async ({ projects }) => {
      if (!projects[0]) return;
      const response = await api.get<{ assets: Asset[] }>(`/projects/${projects[0].id}/assets`);
      const scriptAssets = response.assets.filter((asset) => asset.kind === "script");
      setAssets(scriptAssets);
      if (scriptAssets[0]) setSelectedAsset(scriptAssets[0]);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedAsset) return;
    api.get<{ revisions: Revision[] }>(`/assets/${selectedAsset.id}/revisions`).then((response) => setRevisions(response.revisions)).catch(() => undefined);
  }, [selectedAsset]);

  return (
    <PageFrame title="Scripts" body="Write a revision over the tracked asset and queue a run from the same surface.">
      <div className="grid-two">
        <div className="panel">
          <h3>Assets</h3>
          <div className="list">
            {assets.map((asset) => (
              <button key={asset.id} className={`list-item${selectedAsset?.id === asset.id ? " active" : ""}`} onClick={() => setSelectedAsset(asset)}>
                <strong>{asset.name}</strong>
                <span>{asset.runtime} · {asset.path}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="panel">
          <h3>Revision</h3>
          <textarea data-testid="script-content" className="editor" value={content} onChange={(event) => setContent(event.target.value)} />
          <div className="inline-actions">
            <button className="primary-button" data-testid="save-script-revision" disabled={!selectedAsset} onClick={async () => {
              const { revision } = await api.post<{ revision: Revision }>(`/assets/${selectedAsset?.id}/revisions`, { baseRef: "main", branchName: "ep/ui", content });
              setRevisions((current) => [revision, ...current.filter((entry) => entry.id !== revision.id)]);
            }}>Create Revision</button>
            <button className="secondary-button" data-testid="run-latest-script" disabled={!selectedAsset || !revisions[0]} onClick={async () => {
              await api.post("/runs", { assetId: selectedAsset?.id, revisionId: revisions[0]?.id });
            }}>Queue Run</button>
          </div>
          <div className="list">
            {revisions.map((revision) => (
              <div key={revision.id} className="list-item">
                <strong>{revision.id}</strong>
                <span>{revision.baseRef}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageFrame>
  );
}

function NotebooksPage() {
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedRepository, setSelectedRepository] = useState("");
  const [selectedNotebook, setSelectedNotebook] = useState<Asset | null>(null);
  const [cells, setCells] = useState([
    { id: "cell-1", runtime: "node", label: "prepare", code: "const answer = 21 * 2;\nconsole.log(answer);" },
    { id: "cell-2", runtime: "node", label: "artifact", code: "import fs from 'node:fs';\nimport path from 'node:path';\nfs.mkdirSync(path.join(process.env.EP_ARTIFACT_DIR, 'notebook-out'), { recursive: true });\nfs.writeFileSync(path.join(process.env.EP_ARTIFACT_DIR, 'notebook-out', 'result.txt'), 'done');" },
  ]);

  useEffect(() => {
    api.get<{ projects: Project[] }>("/projects").then(({ projects }) => {
      if (projects[0]) setSelectedProject(projects[0].id);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    api.get<{ repositories: Repository[] }>(`/projects/${selectedProject}/repositories`).then(({ repositories }) => {
      if (repositories[0]) setSelectedRepository(repositories[0].id);
    }).catch(() => undefined);
    api.get<{ assets: Asset[] }>(`/projects/${selectedProject}/assets`).then(({ assets }) => {
      const notebooks = assets.filter((asset) => asset.kind === "notebook");
      if (notebooks[0]) setSelectedNotebook(notebooks[0]);
    }).catch(() => undefined);
  }, [selectedProject]);

  return (
    <PageFrame title="Notebooks" body="Persist notebook cells, execute them as revisions, and promote selected cells to script or workflow.">
      <div className="panel">
        <div className="inline-actions">
          <button className="primary-button" data-testid="create-notebook-asset" disabled={!selectedProject || !selectedRepository} onClick={async () => {
            const { asset } = await api.post<{ asset: Asset }>(`/projects/${selectedProject}/assets`, {
              repositoryId: selectedRepository,
              name: "analysis-notebook",
              kind: "notebook",
              path: "notebooks/analysis.epnb.json",
              runtime: "node",
            });
            setSelectedNotebook(asset);
          }}>Create Notebook</button>
          <button className="secondary-button" data-testid="save-notebook-revision" disabled={!selectedNotebook} onClick={async () => {
            await api.post(`/assets/${selectedNotebook?.id}/revisions`, {
              baseRef: "main",
              branchName: "ep/notebook",
              content: {
                cells,
              },
            });
          }}>Save Notebook Revision</button>
          <button className="secondary-button" data-testid="promote-notebook-script" disabled={!selectedNotebook} onClick={async () => {
            await api.post(`/assets/${selectedNotebook?.id}/promote`, { target: "script", cellIds: cells.map((cell) => cell.id) });
          }}>Promote To Script</button>
          <button className="secondary-button" data-testid="promote-notebook-workflow" disabled={!selectedNotebook} onClick={async () => {
            await api.post(`/assets/${selectedNotebook?.id}/promote`, { target: "workflow", cellIds: cells.map((cell) => cell.id) });
          }}>Promote To Workflow</button>
        </div>
        <div className="notebook-grid">
          {cells.map((cell, index) => (
            <div key={cell.id} className="cell-card">
              <div className="cell-header">
                <strong>{cell.label}</strong>
                <span>{cell.runtime} · {index + 1}</span>
              </div>
              <textarea className="editor" value={cell.code} onChange={(event) => {
                setCells((current) => current.map((entry) => entry.id === cell.id ? { ...entry, code: event.target.value } : entry));
              }} />
            </div>
          ))}
        </div>
      </div>
    </PageFrame>
  );
}

function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [logs, setLogs] = useState<string>("");
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);

  const load = async () => {
    const { runs } = await api.get<{ runs: Run[] }>("/runs");
    setRuns(runs);
    if (runs[0]) setSelectedRun(runs[0]);
  };

  useEffect(() => {
    load().catch(() => undefined);
    const timer = setInterval(() => load().catch(() => undefined), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedRun) return;
    const timer = setInterval(() => {
      api.get<{ transcript: string; logs: Array<{ line: string }> }>(`/runs/${selectedRun.id}/logs`).then(({ transcript }) => setLogs(transcript)).catch(() => undefined);
      api.get<{ artifacts: Artifact[] }>(`/runs/${selectedRun.id}/artifacts`).then(({ artifacts }) => setArtifacts(artifacts)).catch(() => undefined);
    }, 800);
    return () => clearInterval(timer);
  }, [selectedRun]);

  return (
    <PageFrame title="Runs" body="Observe queue state, live transcripts, and the artifacts produced by each execution.">
      <div className="grid-two">
        <div className="panel">
          <h3>Queued And Completed Runs</h3>
          <div className="list">
            {runs.map((run) => (
              <button key={run.id} className={`list-item${selectedRun?.id === run.id ? " active" : ""}`} onClick={() => setSelectedRun(run)}>
                <strong>{run.id}</strong>
                <span>{run.status}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="panel">
          <h3>Logs And Artifacts</h3>
          <pre data-testid="run-logs" className="terminal">{logs || "No logs yet."}</pre>
          <div className="list">
            {artifacts.map((artifact) => (
              <div key={artifact.id} className="list-item">
                <strong>{artifact.name}</strong>
                <span>{artifact.deployableKind ?? "artifact"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageFrame>
  );
}

function ChangesPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedAsset, setSelectedAsset] = useState("");

  useEffect(() => {
    api.get<{ projects: Project[] }>("/projects").then(({ projects }) => {
      setProjects(projects);
      if (projects[0]) setSelectedProject(projects[0].id);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    api.get<{ assets: Asset[] }>(`/projects/${selectedProject}/assets`).then(({ assets }) => {
      setAssets(assets);
      if (assets[0]) setSelectedAsset(assets[0].id);
    }).catch(() => undefined);
    api.get<{ changeRequests: ChangeRequest[] }>(`/projects/${selectedProject}/change-requests`).then(({ changeRequests }) => setChangeRequests(changeRequests)).catch(() => undefined);
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedAsset) return;
    api.get<{ revisions: Revision[] }>(`/assets/${selectedAsset}/revisions`).then(({ revisions }) => setRevisions(revisions)).catch(() => undefined);
  }, [selectedAsset]);

  return (
    <PageFrame title="Change Requests" body="Open reviewable changes inside the product, approve them, and merge after successful runs.">
      <div className="panel">
        <div className="inline-actions">
          <select value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <select value={selectedAsset} onChange={(event) => setSelectedAsset(event.target.value)}>
            {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </select>
          <button className="primary-button" disabled={!selectedProject || !selectedAsset || !revisions[0]} onClick={async () => {
            await api.post(`/projects/${selectedProject}/change-requests`, {
              assetId: selectedAsset,
              revisionId: revisions[0]?.id,
              title: "Review change",
              description: "Created from UI",
              targetBranch: "main",
            });
            const { changeRequests } = await api.get<{ changeRequests: ChangeRequest[] }>(`/projects/${selectedProject}/change-requests`);
            setChangeRequests(changeRequests);
          }}>Open Change Request</button>
        </div>
        <div className="list">
          {changeRequests.map((changeRequest) => (
            <div key={changeRequest.id} className="list-item">
              <strong>{changeRequest.title}</strong>
              <span>{changeRequest.status}</span>
              <div className="inline-actions">
                <button className="secondary-button" onClick={() => api.post(`/change-requests/${changeRequest.id}/reviews`, { status: "approved", notes: "Approved from UI" })}>Approve</button>
                <button className="secondary-button" onClick={() => api.post(`/change-requests/${changeRequest.id}/merge`, {})}>Merge</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageFrame>
  );
}

function WorkflowsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedAsset, setSelectedAsset] = useState("");

  useEffect(() => {
    api.get<{ projects: Project[] }>("/projects").then(({ projects }) => {
      setProjects(projects);
      if (projects[0]) setSelectedProject(projects[0].id);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    api.get<{ assets: Asset[] }>(`/projects/${selectedProject}/assets`).then(({ assets }) => {
      setAssets(assets);
      if (assets[0]) setSelectedAsset(assets[0].id);
    }).catch(() => undefined);
    api.get<{ workflows: Workflow[] }>(`/projects/${selectedProject}/workflows`).then(({ workflows }) => setWorkflows(workflows)).catch(() => undefined);
  }, [selectedProject]);

  return (
    <PageFrame title="Workflows" body="Bundle reusable execution paths and trigger them manually from the control plane.">
      <div className="panel">
        <div className="inline-actions">
          <select value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <select value={selectedAsset} onChange={(event) => setSelectedAsset(event.target.value)}>
            {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </select>
          <button className="primary-button" onClick={async () => {
            await api.post(`/projects/${selectedProject}/workflows`, { assetId: selectedAsset, name: "Workflow", cron: "manual" });
            const { workflows } = await api.get<{ workflows: Workflow[] }>(`/projects/${selectedProject}/workflows`);
            setWorkflows(workflows);
          }}>Create Workflow</button>
        </div>
        <div className="list">
          {workflows.map((workflow) => (
            <div key={workflow.id} className="list-item">
              <strong>{workflow.name}</strong>
              <span>{workflow.cron || "manual"}</span>
              <button className="secondary-button" onClick={() => api.post(`/workflows/${workflow.id}/run`, {})}>Run Now</button>
            </div>
          ))}
        </div>
      </div>
    </PageFrame>
  );
}

function DeploymentsPage() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState("");

  useEffect(() => {
    api.get<{ runs: Run[] }>("/runs").then(async ({ runs }) => {
      if (!runs[0]) return;
      const { artifacts } = await api.get<{ artifacts: Artifact[] }>(`/runs/${runs[0].id}/artifacts`);
      setArtifacts(artifacts);
      if (artifacts[0]) setSelectedArtifact(artifacts[0].id);
    }).catch(() => undefined);
    api.get<{ deployments: Deployment[] }>("/deployments").then(({ deployments }) => setDeployments(deployments)).catch(() => undefined);
  }, []);

  return (
    <PageFrame title="Deployments" body="Promote run artifacts, attach domains, issue certificates, and keep rollback lineage visible.">
      <div className="panel">
        <div className="inline-actions">
          <select value={selectedArtifact} onChange={(event) => setSelectedArtifact(event.target.value)}>
            {artifacts.map((artifact) => <option key={artifact.id} value={artifact.id}>{artifact.name}</option>)}
          </select>
          <button className="primary-button" data-testid="create-deployment" disabled={!selectedArtifact} onClick={async () => {
            await api.post("/deployments", { artifactId: selectedArtifact, kind: "static", environment: "preview" });
            const { deployments } = await api.get<{ deployments: Deployment[] }>("/deployments");
            setDeployments(deployments);
          }}>Create Deployment</button>
        </div>
        <div className="list">
          {deployments.map((deployment) => (
            <div key={deployment.id} className="list-item">
              <strong>{deployment.id}</strong>
              <span>{deployment.kind} · {deployment.status}</span>
              <div className="inline-actions">
                <a className="secondary-button" href={deployment.previewUrl} target="_blank" rel="noreferrer">Preview</a>
                <button className="secondary-button" onClick={() => api.post(`/deployments/${deployment.id}/attach-domain`, { domain: "demo.local" })}>Attach Domain</button>
                <button className="secondary-button" onClick={() => api.post(`/deployments/${deployment.id}/issue-certificate`, { domain: "demo.local" })}>Issue Cert</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageFrame>
  );
}

function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  useEffect(() => {
    api.get<{ workers: Worker[] }>("/workers").then(({ workers }) => setWorkers(workers)).catch(() => undefined);
    const timer = setInterval(() => api.get<{ workers: Worker[] }>("/workers").then(({ workers }) => setWorkers(workers)).catch(() => undefined), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <PageFrame title="Workers" body="See which local machines are online, what runtimes they advertise, and whether they can deploy.">
      <div className="list">
        {workers.map((worker) => (
          <div key={worker.workerId} className="list-item">
            <strong>{worker.label}</strong>
            <span>{worker.runtimes.join(", ")} · {worker.deployKinds.join(", ")}</span>
            <span>{worker.online ? "online" : "offline"}</span>
          </div>
        ))}
      </div>
    </PageFrame>
  );
}

function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  useEffect(() => {
    api.get<{ settings: Record<string, unknown> }>("/settings").then(({ settings }) => setSettings(settings)).catch(() => undefined);
  }, []);
  return (
    <PageFrame title="Settings" body="Current tenant, runtime policy, deployment capability and the local repo hints used by the control plane.">
      <pre className="terminal">{JSON.stringify(settings, null, 2)}</pre>
    </PageFrame>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="*" element={<Protected><AppShell /></Protected>} />
    </Routes>
  );
}
