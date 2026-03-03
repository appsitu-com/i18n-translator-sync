/**
 * Generates a build info file with the current timestamp
 * and copies static assets (e.g. samples/) into dist/.
 * Run as part of the build process.
 */
const fs = require('fs')
const path = require('path')

const rootDir = path.join(__dirname, '..')
const distDir = path.join(rootDir, 'dist')

// --- Generate build info ---
const buildInfo = {
  buildDate: new Date().toISOString()
}

const outPath = path.join(distDir, 'buildInfo.json')
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(buildInfo, null, 2) + '\n')
console.log(`Generated build info: ${buildInfo.buildDate}`)

// --- Copy static asset folders into dist ---
const assetFolders = ['samples']

for (const folder of assetFolders) {
  const src = path.join(rootDir, folder)
  const dest = path.join(distDir, folder)
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true })
    console.log(`Copied ${folder}/ -> dist/${folder}/`)
  } else {
    console.warn(`Warning: ${folder}/ not found, skipping copy`)
  }
}
