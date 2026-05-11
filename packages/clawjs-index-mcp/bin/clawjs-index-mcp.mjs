#!/usr/bin/env node
import { runIndexMcpServer } from "../dist/index.js";

const baseUrl = process.env.CLAWJS_INDEX_BASE ?? "http://127.0.0.1:7796";
const token = process.env.CLAWJS_INDEX_ADMIN_TOKEN ?? process.env.CLAWJS_INDEX_TOKEN;

runIndexMcpServer({ baseUrl, token });
