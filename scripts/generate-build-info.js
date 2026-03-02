/**
 * Generates a build info file with the current timestamp.
 * Run as part of the build process to embed the build date/time.
 */
const fs = require('fs')
const path = require('path')

const buildInfo = {
  buildDate: new Date().toISOString()
}

const outPath = path.join(__dirname, '..', 'dist', 'buildInfo.json')
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(buildInfo, null, 2) + '\n')
console.log(`Generated build info: ${buildInfo.buildDate}`)
