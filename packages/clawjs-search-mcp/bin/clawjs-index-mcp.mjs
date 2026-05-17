#!/usr/bin/env node
import { runSearchMcpServer } from "../dist/index.js";

const dbPath = process.env.CLAW_SEARCH_DB_PATH;
const dataDir = process.env.CLAW_DATA_DIR;

runSearchMcpServer({ dbPath, dataDir });
