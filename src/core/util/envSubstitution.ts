/**
 * Utility for substituting environment variables in configuration values
 */

/**
 * Substitute environment variables in a string value
 * Supports ${VAR_NAME} syntax
 * @param value The string value to process
 * @returns The string with environment variables substituted
 */
export function substituteEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
    return process.env[varName] || '';
  });
}

/**
 * Recursively substitute environment variables in an object
 * @param obj The object to process (can be string, array, object, or primitive)
 * @returns A new object with environment variables substituted
 */
export function substituteEnvVarsInObject(obj: any): any {
  if (typeof obj === 'string') {
    return substituteEnvVars(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => substituteEnvVarsInObject(item));
  }
  if (obj !== null && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteEnvVarsInObject(value);
    }
    return result;
  }
  return obj;
}
