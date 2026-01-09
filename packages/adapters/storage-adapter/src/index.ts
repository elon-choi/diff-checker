import { promises as fs } from 'fs';
import path from 'path';

export const StorageAdapter = {
  async ensureDir(dirPath: string) {
    await fs.mkdir(dirPath, { recursive: true });
  },

  async writeJson(filePath: string, data: unknown) {
    await this.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return filePath;
  },

  async writeText(filePath: string, text: string) {
    await this.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, text, 'utf-8');
    return filePath;
  },

  async saveText(filePath: string, content: string) {
    return this.writeText(filePath, content);
  },

  async readJson<T = any>(filePath: string): Promise<T> {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  },

  async readText(filePath: string) {
    return fs.readFile(filePath, 'utf8');
  },
};


