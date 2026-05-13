import { Octokit } from '@octokit/rest';
import { Base64 } from 'js-base64';

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

export interface GitHubFile {
  path: string;
  content: string;
  sha?: string;
}

export class GitHubClient {
  private octokit: Octokit;
  private config: GitHubConfig;

  constructor(config: GitHubConfig) {
    this.config = config;
    this.octokit = new Octokit({
      auth: config.token,
    });
  }

  async getFile(path: string): Promise<GitHubFile | null> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner: this.config.owner,
        repo: this.config.repo,
        path,
        ref: this.config.branch,
      });

      if ('content' in response.data && !Array.isArray(response.data)) {
        return {
          path,
          content: Base64.decode(response.data.content),
          sha: response.data.sha,
        };
      }
      return null;
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async putFile(file: GitHubFile, message: string): Promise<void> {
    const content = Base64.encode(file.content);
    
    await this.octokit.rest.repos.createOrUpdateFileContents({
      owner: this.config.owner,
      repo: this.config.repo,
      path: file.path,
      message,
      content,
      branch: this.config.branch,
      sha: file.sha,
    });
  }

  async listFiles(directory: string = ''): Promise<string[]> {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner: this.config.owner,
        repo: this.config.repo,
        path: directory,
        ref: this.config.branch,
      });

      if (Array.isArray(response.data)) {
        return response.data
          .filter(item => item.type === 'file')
          .map(item => item.path);
      }
      return [];
    } catch (error: any) {
      if (error.status === 404) {
        return [];
      }
      throw error;
    }
  }

  async deleteFile(path: string, sha: string, message: string): Promise<void> {
    await this.octokit.rest.repos.deleteFile({
      owner: this.config.owner,
      repo: this.config.repo,
      path,
      message,
      sha,
      branch: this.config.branch,
    });
  }

  async getLastCommit(): Promise<string> {
    const response = await this.octokit.rest.repos.getBranch({
      owner: this.config.owner,
      repo: this.config.repo,
      branch: this.config.branch,
    });
    return response.data.commit.sha;
  }

  async getCommits(path?: string, limit: number = 10): Promise<any[]> {
    const response = await this.octokit.rest.repos.listCommits({
      owner: this.config.owner,
      repo: this.config.repo,
      path,
      per_page: limit,
    });
    return response.data;
  }
}