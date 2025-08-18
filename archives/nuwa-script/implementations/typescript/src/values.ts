// Defines the standard JSON value types.
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[] // Represents JSON arrays
  | { [key: string]: JsonValue }; // Represents JSON objects

// Remove NuwaObject type, use { [key: string]: JsonValue } directly
// export type NuwaObject = { [key: string]: JsonValue };

// --- Type Checking Helper Functions ---

// Renamed from isNuwaObject
export function isJsonObject(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Renamed from isNuwaList
export function isJsonArray(value: JsonValue | undefined): value is JsonValue[] {
  return Array.isArray(value);
}

// Renamed from isNuwaString
export function isString(value: JsonValue | undefined): value is string {
  return typeof value === 'string';
}

// Renamed from isNuwaNumber
export function isNumber(value: JsonValue | undefined): value is number {
  return typeof value === 'number';
}

// Renamed from isNuwaBoolean
export function isBoolean(value: JsonValue | undefined): value is boolean {
  return typeof value === 'boolean';
}

// Renamed from isNuwaNull
export function isNull(value: JsonValue | undefined): value is null {
    return value === null;
}

// --- Equality Comparison ---
// Update signature to use JsonValue
export function jsonValuesAreEqual(v1: JsonValue | undefined, v2: JsonValue | undefined): boolean {
  if (v1 === v2) {
    return true; // Handles primitives and null comparison, plus same object reference
  }

  // If one is undefined, the other must be too for equality
  if (v1 === undefined || v2 === undefined) {
      return v1 === v2;
  }

  if (typeof v1 !== typeof v2) {
    return false; // Different types (and neither is undefined)
  }

  if (v1 === null || v2 === null) {
      return v1 === v2; // Already covered by === but explicit
  }

  if (isJsonArray(v1) && isJsonArray(v2)) {
    if (v1.length !== v2.length) {
      return false;
    }
    for (let i = 0; i < v1.length; i++) {
      // Recursive call
      if (!jsonValuesAreEqual(v1[i], v2[i])) {
        return false;
      }
    }
    return true;
  }

  if (isJsonObject(v1) && isJsonObject(v2)) {
    const keys1 = Object.keys(v1);
    const keys2 = Object.keys(v2);
    if (keys1.length !== keys2.length) {
      return false;
    }
    for (const key of keys1) {
      // Recursive call
      if (!keys2.includes(key) || !jsonValuesAreEqual(v1[key], v2[key])) {
        return false;
      }
    }
    return true;
  }

  // Fallback for any other case (shouldn't happen with exhaustive checks above)
  return false;
}

// --- String Representation (for PRINT or debugging) ---
// Update signature to use JsonValue | undefined
// Renamed from nuwaValueToString
export function jsonValueToString(value: JsonValue | undefined): string {
    if (value === undefined) {
        return 'undefined';
    }
    if (value === null) {
        return 'null';
    }
    if (typeof value === 'string') {
        // Maybe add quotes for clarity?
        // return JSON.stringify(value);
        return value; // Keep simple string return for now
    }
    if (typeof value === 'number') {
        return String(value);
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    if (isJsonArray(value)) {
        // Recursive call for list elements
        const listItems = value.map(item => jsonValueToString(item));
        return `[${listItems.join(', ')}]`;
    }
    if (isJsonObject(value)) {
        // Recursive call for object values
        const objectEntries = Object.entries(value)
            .map(([key, val]) => `${key}: ${jsonValueToString(val)}`);
        return `{${objectEntries.join(', ')}}`;
    }

    // Fallback for any unexpected case (should be unreachable given type definition)
    // Need to handle the case where value is defined but not one of the above.
    // Since JsonValue covers all standard JS types returned by typeof, this is tricky.
    // Let's assume it won't happen with proper usage.
    // const exhaustiveCheck: never = value; // This won't work directly anymore
    return `[Unknown JSON Value: ${typeof value}]`;
}
