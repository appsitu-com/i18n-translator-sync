#!/usr/bin/env node

const path = require('path');
const sharp = require('sharp');

const rootDir = path.resolve(__dirname, '..');
const sourcePath = path.join(rootDir, 'images', 'icon.svg');
const targetPath = path.join(rootDir, 'images', 'icon.png');

async function convertIcon() {
  await sharp(sourcePath)
    .resize(256, 256)
    .png()
    .toFile(targetPath);

  console.log('Converted images/icon.svg -> images/icon.png');
}

convertIcon().catch((error) => {
  console.error('Failed to convert icon.svg to icon.png');
  console.error(error);
  process.exit(1);
});
