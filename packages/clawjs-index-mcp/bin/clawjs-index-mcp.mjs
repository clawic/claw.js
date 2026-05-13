#!/usr/bin/env node
import { runIndexMcpServer } from "../dist/index.js";

const baseUrl = process.env.CLAW_INDEX_BASE ?? "http://127.0.0.1:7796";
const token = process.env.CLAW_INDEX_ADMIN_TOKEN ?? process.env.CLAW_INDEX_TOKEN;

runIndexMcpServer({ baseUrl, token });
