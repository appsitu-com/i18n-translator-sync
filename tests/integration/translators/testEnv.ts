export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable for integration tests: ${name}. ` +
      `Set it in ./translator.env or directly in your environment.`
    )
  }
  return value
}
