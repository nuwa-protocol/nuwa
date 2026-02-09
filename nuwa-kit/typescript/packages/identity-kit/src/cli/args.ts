export type ParsedArgs = {
  command?: string;
  options: Record<string, string | boolean | string[]>;
};

export function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0) return { options: {} };
  const [first, ...tail] = argv;

  // Handle short flags (-h, -v)
  if (first === '-h' || first === '--help') {
    return { command: 'help', options: {} };
  }
  if (first === '-v' || first === '--version') {
    return { command: 'version', options: {} };
  }
  if (first.startsWith('-')) {
    throw new Error(`Unknown flag: ${first}`);
  }

  let command = first;
  let rest = tail;
  if (first === 'profile') {
    const action = tail[0];
    if (!action || action.startsWith('--')) {
      throw new Error('profile command requires subcommand: list | use | create');
    }
    command = `profile:${action}`;
    rest = tail.slice(1);
  }
  const options: ParsedArgs['options'] = {};

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!token.startsWith('-')) continue;

    // Handle short flags
    if (token.startsWith('-') && !token.startsWith('--')) {
      const flag = token.slice(1);
      if (flag === 'h') {
        addOption(options, 'help', true);
        continue;
      }
      if (flag === 'v') {
        addOption(options, 'version', true);
        continue;
      }
      // Unknown short flag
      throw new Error(`Unknown flag: -${flag}`);
    }

    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    if (inlineValue !== undefined) {
      addOption(options, rawKey, inlineValue);
      continue;
    }

    const next = rest[i + 1];
    if (!next || next.startsWith('--')) {
      addOption(options, rawKey, true);
      continue;
    }

    addOption(options, rawKey, next);
    i += 1;
  }

  return { command, options };
}

function addOption(
  options: ParsedArgs['options'],
  key: string,
  value: string | boolean
): void {
  const existing = options[key];
  if (existing === undefined) {
    options[key] = value;
    return;
  }
  if (Array.isArray(existing)) {
    existing.push(String(value));
    options[key] = existing;
    return;
  }
  options[key] = [String(existing), String(value)];
}
