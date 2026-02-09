/**
 * CLI tests for nuwa-id
 */

import { parseArgs } from '../args';
import { makeDefaultConfig } from '../../cli-lib/types';

describe('CLI Argument Parsing', () => {
  describe('parseArgs', () => {
    it('should parse empty args', () => {
      const result = parseArgs([]);
      expect(result.command).toBeUndefined();
      expect(result.options).toEqual({});
    });

    it('should parse help command', () => {
      const result = parseArgs(['help']);
      expect(result.command).toBe('help');
      expect(result.options).toEqual({});
    });

    it('should parse version command', () => {
      const result = parseArgs(['version']);
      expect(result.command).toBe('version');
      expect(result.options).toEqual({});
    });

    it('should parse status command', () => {
      const result = parseArgs(['status']);
      expect(result.command).toBe('status');
      expect(result.options).toEqual({});
    });

    it('should parse status command with --json flag', () => {
      const result = parseArgs(['status', '--json']);
      expect(result.command).toBe('status');
      expect(result.options).toEqual({ json: true });
    });

    it('should parse init command with options', () => {
      const result = parseArgs(['init', '--force', '--network', 'test']);
      expect(result.command).toBe('init');
      expect(result.options).toEqual({ force: true, network: 'test' });
    });

    it('should parse profile subcommands', () => {
      const result = parseArgs(['profile', 'list', '--json']);
      expect(result.command).toBe('profile:list');
      expect(result.options).toEqual({ json: true });
    });

    it('should parse profile use with --name', () => {
      const result = parseArgs(['profile', 'use', '--name', 'myprofile']);
      expect(result.command).toBe('profile:use');
      expect(result.options).toEqual({ name: 'myprofile' });
    });

    it('should parse -h as help flag', () => {
      const result = parseArgs(['-h']);
      expect(result.command).toBe('help');
      expect(result.options).toEqual({});
    });

    it('should parse --help as help flag', () => {
      const result = parseArgs(['--help']);
      expect(result.command).toBe('help');
      expect(result.options).toEqual({});
    });

    it('should parse -v as version flag', () => {
      const result = parseArgs(['-v']);
      expect(result.command).toBe('version');
      expect(result.options).toEqual({});
    });

    it('should parse --version as version flag', () => {
      const result = parseArgs(['--version']);
      expect(result.command).toBe('version');
      expect(result.options).toEqual({});
    });

    it('should parse options with = syntax', () => {
      const result = parseArgs(['init', '--network=test']);
      expect(result.command).toBe('init');
      expect(result.options).toEqual({ network: 'test' });
    });

    it('should parse boolean flags without values', () => {
      const result = parseArgs(['init', '--force']);
      expect(result.command).toBe('init');
      expect(result.options).toEqual({ force: true });
    });

    it('should parse multiple header options', () => {
      const result = parseArgs(['curl', '--header', 'A: B', '--header', 'C: D']);
      expect(result.command).toBe('curl');
      expect(result.options).toEqual({ header: ['A: B', 'C: D'] });
    });

    it('should throw error for unknown short flag', () => {
      expect(() => parseArgs(['-x'])).toThrow('Unknown flag: -x');
    });

    it('should parse set-did with --did option', () => {
      const result = parseArgs(['set-did', '--did', 'did:test:123']);
      expect(result.command).toBe('set-did');
      expect(result.options).toEqual({ did: 'did:test:123' });
    });
  });

  describe('makeDefaultConfig', () => {
    it('should create default config with expected structure', () => {
      const config = makeDefaultConfig();
      expect(config.version).toBe(2);
      expect(config.activeProfile).toBeDefined();
      expect(config.profiles).toBeDefined();
      expect(Object.keys(config.profiles)).toContain(config.activeProfile);
    });
  });
});
