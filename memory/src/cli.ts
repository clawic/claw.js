#!/usr/bin/env node
import { Command } from "commander";
import path from "node:path";
import { printOutput } from "./io";
import { MemoryError } from "./errors";
import { MemoryClass, NoteKind } from "./types";
import { MemoryService, parseHasFilters } from "./service";
import { startServer } from "./server";
import { parseKeyValueFilters } from "./utils";
import { initWorkspace } from "./workspace";

type OutputFormat = "json" | "table";

const program = new Command();
program.name("memory").description("Typed markdown-first memory CLI for agents").version("0.3.0");

program
  .command("init")
  .option("--dir <dir>", "Directory to initialize", process.cwd())
  .option("--force", "Overwrite existing config and schema files")
  .option("--format <format>", "Output format", "json")
  .action((options: { dir: string; force?: boolean; format: OutputFormat }) => {
    const paths = initWorkspace(path.resolve(options.dir), Boolean(options.force));
    printOutput(
      {
        workspace: paths.root,
        schemaDir: paths.schemaDir,
        notesDir: paths.notesDir,
        indexDbPath: paths.indexDbPath
      },
      options.format
    );
  });

program
  .command("validate")
  .option("--format <format>", "Output format", "json")
  .action((options: { format: OutputFormat }) => {
    withService((service) => {
      const result = service.validate();
      if (!result.valid) {
        throw new MemoryError(result.issues.join("\n"));
      }
      printOutput(
        {
          valid: true,
          schemaVersion: result.schema.version,
          schemaHash: result.schema.hash,
          notes: result.notes.length,
          requiresMigration: result.requiresMigration,
          warnings: result.warnings,
          entityKinds: [...result.schema.entityKinds.keys()],
          memoryKinds: [...result.schema.memoryKinds.keys()],
          entityTypes: [...result.schema.entityTypes.keys()],
          memoryTypes: [...result.schema.memoryTypes.keys()]
        },
        options.format
      );
    });
  });

program
  .command("index")
  .option("--format <format>", "Output format", "json")
  .action((options: { format: OutputFormat }) => {
    withService((service) => {
      printOutput(service.index(), options.format);
    });
  });

program
  .command("query")
  .option("--mode <mode>", 'Query mode: "find", "search", or "neighbors"')
  .option("--note-kind <noteKind>", 'Filter by note kind: "entity" or "memory"')
  .option("--type <type>", "Type filter")
  .option("--kind <kind>", "Semantic kind filter")
  .option("--where <key=value>", "Frontmatter field filter", collectRepeatedOption, [])
  .option("--has <relation=value>", "Structured relation or field filter", collectRepeatedOption, [])
  .option("--linked-to <reference>", "Find notes linked to a canonical note reference")
  .option("--path-depth <depth>", "Traversal depth for linked queries", parseInteger)
  .option("--text <text>", "Body/title/alias text filter")
  .option("--exact", "Require a fresh index")
  .option("--format <format>", "Output format", "json")
  .action(
    (options: {
      mode?: "find" | "search" | "neighbors";
      noteKind?: NoteKind;
      type?: string;
      kind?: string;
      where: string[];
      has: string[];
      linkedTo?: string;
      pathDepth?: number;
      text?: string;
      exact?: boolean;
      format: OutputFormat;
    }) => {
      withService((service) => {
        printOutput(
          service.query({
            mode: options.mode,
            noteKind: options.noteKind,
            type: options.type,
            kind: options.kind,
            where: options.where.length > 0 ? parseKeyValueFilters(options.where) : undefined,
            has: options.has.length > 0 ? parseHasFilters(options.has) : undefined,
            linkedTo: options.linkedTo,
            pathDepth: options.pathDepth,
            text: options.text,
            exact: Boolean(options.exact)
          }),
          options.format
        );
      });
    }
  );

program
  .command("new")
  .argument("<kind>", 'Note kind: "entity" or "memory"')
  .argument("<type>", "Type id from schema")
  .requiredOption("--id <id>", "Note id")
  .requiredOption("--title <title>", "Note title")
  .option("--force", "Overwrite existing note")
  .option("--format <format>", "Output format", "json")
  .action(
    (
      kind: NoteKind,
      type: string,
      options: { id: string; title: string; force?: boolean; format: OutputFormat }
    ) => {
      withService((service) => {
        printOutput(service.newNote(kind, type, options.id, options.title, Boolean(options.force)), options.format);
      });
    }
  );

program
  .command("lint")
  .option("--fix", "Rewrite notes in stable frontmatter order")
  .option("--format <format>", "Output format", "json")
  .action((options: { fix?: boolean; format: OutputFormat }) => {
    withService((service) => {
      printOutput(service.lint(Boolean(options.fix)), options.format);
    });
  });

program
  .command("lookup")
  .argument("<reference>", "Reference to resolve")
  .option("--note-kind <noteKind>", 'Filter by note kind: "entity" or "memory"')
  .option("--type <type>", "Type filter")
  .option("--kind <kind>", "Semantic kind filter")
  .option("--strict", "Resolve only canonical id/slug references")
  .option("--format <format>", "Output format", "json")
  .action(
    (
      reference: string,
      options: {
        noteKind?: NoteKind;
        type?: string;
        kind?: string;
        strict?: boolean;
        format: OutputFormat;
      }
    ) => {
      withService((service) => {
        printOutput(
          service.lookup(reference, {
            noteKind: options.noteKind,
            type: options.type,
            kind: options.kind,
            allowLoose: !options.strict
          }),
          options.format
        );
      });
    }
  );

program
  .command("search")
  .requiredOption("--text <text>", "Recall query")
  .option("--limit <limit>", "Maximum results", parseInteger)
  .option("--min-score <score>", "Minimum score", parseNumber)
  .option("--semantic", "Enable local semantic scoring")
  .option("--include-history", "Include expired or superseded memories")
  .option("--class <class>", "Memory class: semantic, episodic, procedural, or archival")
  .option("--scope-user <user>", "User scope")
  .option("--scope-agent <agent>", "Agent scope")
  .option("--scope-project <project>", "Project scope")
  .option("--format <format>", "Output format", "json")
  .action((options: {
    text: string;
    limit?: number;
    minScore?: number;
    semantic?: boolean;
    includeHistory?: boolean;
    class?: string;
    scopeUser?: string;
    scopeAgent?: string;
    scopeProject?: string;
    format: OutputFormat;
  }) => {
    withService((service) => {
      printOutput(
        service.activeSearch({
          text: options.text,
          limit: options.limit,
          minScore: options.minScore,
          semantic: Boolean(options.semantic),
          includeHistory: Boolean(options.includeHistory),
          memoryClass: parseMemoryClass(options.class),
          scopeUser: options.scopeUser,
          scopeAgent: options.scopeAgent,
          scopeProject: options.scopeProject
        }),
        options.format
      );
    });
  });

program
  .command("context")
  .requiredOption("--text <text>", "Prompt or task text")
  .option("--limit <limit>", "Maximum memories", parseInteger)
  .option("--semantic", "Enable local semantic scoring")
  .option("--format <format>", "Output format", "json")
  .action((options: { text: string; limit?: number; semantic?: boolean; format: OutputFormat }) => {
    withService((service) => {
      printOutput(
        service.contextBundle({
          text: options.text,
          limit: options.limit,
          semantic: Boolean(options.semantic)
        }),
        options.format
      );
    });
  });

program
  .command("save")
  .requiredOption("--content <content>", "Memory content")
  .option("--title <title>", "Memory title")
  .option("--class <class>", "Memory class", "semantic")
  .option("--confidence <score>", "Confidence between 0 and 1", parseNumber)
  .option("--trust <score>", "Trust score between 0 and 1", parseNumber)
  .option("--scope-user <user>", "User scope")
  .option("--scope-agent <agent>", "Agent scope")
  .option("--scope-project <project>", "Project scope")
  .option("--format <format>", "Output format", "json")
  .action((options: {
    content: string;
    title?: string;
    class: string;
    confidence?: number;
    trust?: number;
    scopeUser?: string;
    scopeAgent?: string;
    scopeProject?: string;
    format: OutputFormat;
  }) => {
    withService((service) => {
      printOutput(
        service.saveMemory({
          content: options.content,
          title: options.title,
          memoryClass: parseMemoryClass(options.class),
          confidence: options.confidence,
          trustScore: options.trust,
          scopeUser: options.scopeUser,
          scopeAgent: options.scopeAgent,
          scopeProject: options.scopeProject
        }),
        options.format
      );
    });
  });

program
  .command("conclude")
  .requiredOption("--content <content>", "Verbatim conclusion to store")
  .option("--title <title>", "Memory title")
  .option("--format <format>", "Output format", "json")
  .action((options: { content: string; title?: string; format: OutputFormat }) => {
    withService((service) => {
      printOutput(service.concludeMemory(options.content, { title: options.title }), options.format);
    });
  });

program
  .command("capture")
  .option("--session <sessionId>", "Session id")
  .option("--user <text>", "User message", "")
  .option("--assistant <text>", "Assistant message", "")
  .option("--format <format>", "Output format", "json")
  .action((options: { session?: string; user?: string; assistant?: string; format: OutputFormat }) => {
    withService((service) => {
      printOutput(
        service.captureTurn({
          sessionId: options.session,
          user: options.user,
          assistant: options.assistant
        }),
        options.format
      );
    });
  });

program
  .command("promote")
  .argument("<captureId>", "Capture id")
  .option("--format <format>", "Output format", "json")
  .action((captureId: string, options: { format: OutputFormat }) => {
    withService((service) => {
      printOutput(service.promoteCapture(captureId), options.format);
    });
  });

program
  .command("status")
  .option("--format <format>", "Output format", "json")
  .action((options: { format: OutputFormat }) => {
    withService((service) => {
      printOutput(service.activeStatus(), options.format);
    });
  });

program
  .command("serve")
  .option("--port <port>", "Port to listen on", "3333")
  .action((options: { port: string }) => {
    withService((service) => {
      startServer(service, Number.parseInt(options.port, 10));
    });
  });

program
  .command("archive")
  .argument("<reference>", "Reference to the note to archive")
  .option("--format <format>", "Output format", "json")
  .action((reference: string, options: { format: OutputFormat }) => {
    withService((service) => {
      printOutput(service.archiveNote(reference), options.format);
    });
  });

program
  .command("delete")
  .argument("<reference>", "Reference to the note to delete")
  .requiredOption("--confirm", "Confirm deletion")
  .option("--format <format>", "Output format", "json")
  .action((reference: string, options: { confirm: boolean; format: OutputFormat }) => {
    if (!options.confirm) {
      throw new MemoryError("Use --confirm to delete a note");
    }
    withService((service) => {
      printOutput(service.deleteNote(reference), options.format);
    });
  });

program
  .command("doctor")
  .option("--format <format>", "Output format", "json")
  .action((options: { format: OutputFormat }) => {
    withService((service) => {
      printOutput(service.doctor(), options.format);
    });
  });

void program.parseAsync(process.argv).catch(handleError);

function withService(fn: (service: MemoryService) => void): void {
  fn(MemoryService.fromCwd(process.cwd()));
}

function collectRepeatedOption(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Invalid integer value "${value}"`);
  }
  return parsed;
}

function parseNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number value "${value}"`);
  }
  return parsed;
}

function parseMemoryClass(value: string | undefined): MemoryClass | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "semantic" || value === "episodic" || value === "procedural" || value === "archival") {
    return value;
  }
  throw new Error(`Invalid memory class "${value}"`);
}

function handleError(error: unknown): never {
  if (error instanceof MemoryError) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
  if (error instanceof Error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exit(1);
  }
  process.stderr.write("Unknown error\n");
  process.exit(1);
}
