export class StorageService {
  private readonly PREFIX = 'nuwa_playground_';

  saveApiKey(apiKey: string): void {
    localStorage.setItem(`${this.PREFIX}api_key`, apiKey);
  }

  getApiKey(): string {
    return localStorage.getItem(`${this.PREFIX}api_key`) || '';
  }

  saveBaseUrl(baseUrl: string): void {
    localStorage.setItem(`${this.PREFIX}base_url`, baseUrl);
  }

  getBaseUrl(): string | null {
    return localStorage.getItem(`${this.PREFIX}base_url`);
  }

  saveModel(model: string): void {
    localStorage.setItem(`${this.PREFIX}model`, model);
  }

  getModel(): string | null {
    return localStorage.getItem(`${this.PREFIX}model`);
  }

  saveTemperature(temperature: number): void {
    localStorage.setItem(`${this.PREFIX}temperature`, temperature.toString());
  }

  getTemperature(): number | null {
    const tempStr = localStorage.getItem(`${this.PREFIX}temperature`);
    if (tempStr === null) return null;
    const tempNum = parseFloat(tempStr);
    return isNaN(tempNum) ? null : tempNum;
  }

  saveCustomScript(id: string, script: string): void {
    const customScripts = this.getCustomScripts();
    customScripts[id] = script;
    localStorage.setItem(`${this.PREFIX}custom_scripts`, JSON.stringify(customScripts));
  }

  getCustomScript(id: string): string | null {
    const customScripts = this.getCustomScripts();
    return customScripts[id] || null;
  }

  getCustomScripts(): Record<string, string> {
    try {
      const scripts = localStorage.getItem(`${this.PREFIX}custom_scripts`);
      return scripts ? JSON.parse(scripts) : {};
    } catch (e) {
      console.error('Error parsing custom scripts from localStorage', e);
      return {};
    }
  }

  removeCustomScript(id: string): void {
    const customScripts = this.getCustomScripts();
    delete customScripts[id];
    localStorage.setItem(`${this.PREFIX}custom_scripts`, JSON.stringify(customScripts));
  }

  saveLastSelectedExample(id: string): void {
    localStorage.setItem(`${this.PREFIX}last_example`, id);
  }

  getLastSelectedExample(): string | null {
    return localStorage.getItem(`${this.PREFIX}last_example`);
  }
}

export const storageService = new StorageService();