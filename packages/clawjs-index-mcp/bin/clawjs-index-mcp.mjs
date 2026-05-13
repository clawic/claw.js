#!/usr/bin/env node
import { runIndexMcpServer } from "../dist/index.js";

const baseUrl = process.env.CLAW_SEARCH_BASE ?? "http://127.0.0.1:24106";
const token = process.env.CLAW_SEARCH_ADMIN_TOKEN ?? process.env.CLAW_SEARCH_TOKEN;

runIndexMcpServer({ baseUrl, token });
