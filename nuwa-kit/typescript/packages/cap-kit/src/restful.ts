import { Cap, Page, Result } from "./type";
import * as yaml from "js-yaml";

export interface DownloadCaps {
  successful: { [id: string]: Cap },
  failed: { [id: string]: string },
  summary: {
    total: number,
    successful: number,
    failed: number,
  },
}

export class CapKitRestful {
  protected apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  async queryCaps(name?: string,
    tags?: string[],
    page?: number,
    pageSize?: number,
    sortBy?: 'average_rating' | 'downloads' | 'favorites' | 'rating_count' | 'updated_at',
    sortOrder?: 'asc' | 'desc'): Promise<Result<Page<Cap>>> {
    const params = new URLSearchParams();

    if (name) params.append('name', name);
    if (tags && tags.length > 0) {
      tags.forEach(tag => params.append('tags', tag));
    }
    if (page !== undefined) params.append('page', page.toString());
    if (pageSize !== undefined) params.append('pageSize', pageSize.toString());
    if (sortBy) params.append('sortBy', sortBy);
    if (sortOrder) params.append('sortOrder', sortOrder);

    const url = params.toString() ? `${this.apiUrl}/caps?${params.toString()}` : `${this.apiUrl}/caps`;
    const response = await fetch(url);
    return await response.json();
  }

  async queryUserInstalledCaps(did: string): Promise<Result<Page<Cap>>> {
    const response = await fetch(`${this.apiUrl}/caps/installed/${did}`);
    return await response.json();
  }

  async queryCap(capId: string): Promise<Cap> {
    const response = await fetch(`${this.apiUrl}/cap/${capId}`);
    return await response.json();
  }

  async downloadCap(capId: string): Promise<Cap> {
    const response = await fetch(`${this.apiUrl}/cap/download/${capId}`);

    const result =  await response.json();
    const utf8 = new TextDecoder().decode(Uint8Array.from(atob(result.data.raw_data), c => c.charCodeAt(0)))

    return yaml.load(utf8) as Cap;
  }

  async downloadCaps(cpdIds: string[]): Promise<DownloadCaps> {
    const response = await fetch(`${this.apiUrl}/caps/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: cpdIds }),
    });

    const result =  await response.json();
    const successful = result.data.successful
    const formatSuccessful: { [id: string]: Cap } = {};
    for (const [id, value] of Object.entries(successful)) {
      const utf8 = new TextDecoder().decode(Uint8Array.from(atob(value as string), c => c.charCodeAt(0)))
      const cap = yaml.load(utf8) as Cap;
      formatSuccessful[id] = cap;
    }

    return {
      ...result.data,
      successful: formatSuccessful,
    }
  }
}
