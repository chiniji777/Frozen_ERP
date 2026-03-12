import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

const CONFIG_DIR = join(homedir(), ".frozen-cli");
const TOKEN_FILE = join(CONFIG_DIR, "token");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

function ensureDir() {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

export function getApiBase(): string {
  ensureDir();
  if (existsSync(CONFIG_FILE)) {
    const cfg = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
    if (cfg.apiBase) return cfg.apiBase;
  }
  return "https://frozen.mhorkub.com/api";
}

export function setApiBase(url: string) {
  ensureDir();
  const cfg = existsSync(CONFIG_FILE)
    ? JSON.parse(readFileSync(CONFIG_FILE, "utf-8"))
    : {};
  cfg.apiBase = url;
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

export function getToken(): string | null {
  ensureDir();
  if (!existsSync(TOKEN_FILE)) return null;
  return readFileSync(TOKEN_FILE, "utf-8").trim();
}

export function saveToken(token: string) {
  ensureDir();
  writeFileSync(TOKEN_FILE, token);
}

export function clearToken() {
  ensureDir();
  if (existsSync(TOKEN_FILE)) writeFileSync(TOKEN_FILE, "");
}
