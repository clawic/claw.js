#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const scriptRoot = path.resolve(new URL("..", import.meta.url).pathname);

function parseArgs(argv) {
  const args = {
    root: scriptRoot,
    number: null,
    slug: null,
    title: null,
    status: "reserved",
    canonicalName: null,
    json: false,
    dryRun: false,
    create: false,
    backfill: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") args.root = path.resolve(argv[++index]);
    else if (arg === "--number") args.number = argv[++index];
    else if (arg === "--slug") args.slug = argv[++index];
    else if (arg === "--title") args.title = argv[++index];
    else if (arg === "--status") args.status = argv[++index];
    else if (arg === "--canonical-name") args.canonicalName = argv[++index];
    else if (arg === "--json") args.json = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--create") args.create = true;
    else if (arg === "--backfill") args.backfill = true;
    else fail(`Unknown argument: ${arg}`);
  }
  return args;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function assertSlug(slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug ?? "")) {
    fail("--slug must use lowercase a-z, 0-9, and single hyphen separators");
  }
}

function assertNumber(number) {
  if (!/^\d{4}$/u.test(number ?? "")) fail("--number must be next or a zero-padded four digit number");
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function listAdrNumbers(rootDir) {
  const adrDir = path.join(rootDir, "docs/adr");
  const reservationDir = path.join(adrDir, "reservations");
  const numbers = [];
  if (fs.existsSync(adrDir)) {
    for (const entry of fs.readdirSync(adrDir, { withFileTypes: true })) {
      const match = entry.isFile() ? entry.name.match(/^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/u) : null;
      if (match) numbers.push(Number(match[1]));
    }
  }
  if (fs.existsSync(reservationDir)) {
    for (const entry of fs.readdirSync(reservationDir, { withFileTypes: true })) {
      const match = entry.isFile() ? entry.name.match(/^(\d{4})\.json$/u) : null;
      if (match) numbers.push(Number(match[1]));
    }
  }
  return numbers;
}

function nextNumber(rootDir) {
  const numbers = listAdrNumbers(rootDir);
  const next = (numbers.length === 0 ? 0 : Math.max(...numbers)) + 1;
  return String(next).padStart(4, "0");
}

function renderDraft(rootDir, number, slug, title) {
  const templatePath = path.join(rootDir, "docs/adr/TEMPLATE.md");
  const date = new Date().toISOString().slice(0, 10);
  if (!fs.existsSync(templatePath)) {
    return `# ADR ${number}: ${title}\n\nStatus: Proposed\n\nDate: ${date}\n`;
  }
  return readText(templatePath)
    .replace(/^# ADR NNNN: Title/mu, `# ADR ${number}: ${title}`)
    .replace(/^Date: YYYY-MM-DD/mu, `Date: ${date}`);
}

function writeExclusive(filePath, content) {
  const fd = fs.openSync(filePath, "wx", 0o644);
  try {
    fs.writeFileSync(fd, content);
  } finally {
    fs.closeSync(fd);
  }
}

const args = parseArgs(process.argv.slice(2));
if (!args.slug) fail("--slug is required");
if (!args.title) fail("--title is required");
assertSlug(args.slug);
if (!["reserved", "proposed", "accepted", "superseded", "backfilled"].includes(args.status)) {
  fail("--status must be reserved, proposed, accepted, superseded, or backfilled");
}

const rootDir = path.resolve(args.root);
const number = args.number === "next" || !args.number ? nextNumber(rootDir) : args.number;
assertNumber(number);

const adrPath = `docs/adr/${number}-${args.slug}.md`;
const reservationPath = `docs/adr/reservations/${number}.json`;
const reservation = {
  number,
  slug: args.slug,
  title: args.title,
  status: args.status,
  adr: adrPath,
  ...(args.backfill ? { historical: true } : {}),
  ...(args.canonicalName ? { canonicalName: args.canonicalName } : {}),
};

const absoluteReservationPath = path.join(rootDir, reservationPath);
const absoluteAdrPath = path.join(rootDir, adrPath);

if (fs.existsSync(absoluteReservationPath)) fail(`ADR number ${number} is already reserved at ${reservationPath}`);
if (fs.existsSync(absoluteAdrPath) && args.create) fail(`ADR path already exists: ${adrPath}`);

const output = { ok: true, reservationPath, reservation, createdAdr: args.create ? adrPath : null, dryRun: args.dryRun };
if (!args.dryRun) {
  fs.mkdirSync(path.dirname(absoluteReservationPath), { recursive: true });
  writeExclusive(absoluteReservationPath, `${JSON.stringify(reservation, null, 2)}\n`);
  if (args.create) {
    writeExclusive(absoluteAdrPath, renderDraft(rootDir, number, args.slug, args.title));
  }
}

if (args.json) {
  console.log(JSON.stringify(output, null, 2));
} else {
  console.log(`${args.dryRun ? "Would reserve" : "Reserved"} ADR ${number}: ${args.title}`);
  console.log(reservationPath);
  if (args.create) console.log(adrPath);
}
