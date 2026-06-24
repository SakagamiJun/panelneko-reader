const fs = require('fs');
const path = require('path');

// Get tag name from environment variable (GitHub Actions) or command line argument
let tag = process.env.GITHUB_REF_NAME || process.argv[2];

if (!tag) {
  console.log('No version tag or argument provided. Skipping version update.');
  process.exit(0);
}

// Extract version (e.g. v1.2.3 -> 1.2.3)
// Only process if it starts with 'v' followed by a digit or is a semantic version
if (!tag.startsWith('v') && !/^\d+\.\d+/.test(tag)) {
  console.log(`Tag "${tag}" does not look like a version tag. Skipping version update.`);
  process.exit(0);
}

const version = tag.startsWith('v') ? tag.slice(1) : tag;

console.log(`Updating version to: ${version}`);

// Paths relative to project root (assuming script runs from project root)
const wailsPath = path.join(__dirname, '..', 'wails.json');
const pkgPath = path.join(__dirname, '..', 'frontend', 'package.json');

// Update wails.json
if (fs.existsSync(wailsPath)) {
  try {
    const wailsConfig = JSON.parse(fs.readFileSync(wailsPath, 'utf8'));
    if (wailsConfig.info) {
      wailsConfig.info.version = version;
      fs.writeFileSync(wailsPath, JSON.stringify(wailsConfig, null, 2) + '\n');
      console.log(`Successfully updated wails.json to version ${version}`);
    }
  } catch (err) {
    console.error(`Error updating wails.json: ${err.message}`);
    process.exit(1);
  }
} else {
  console.error(`wails.json not found at ${wailsPath}`);
  process.exit(1);
}

// Update frontend/package.json
if (fs.existsSync(pkgPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.version = version;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`Successfully updated frontend/package.json to version ${version}`);
  } catch (err) {
    console.error(`Error updating frontend/package.json: ${err.message}`);
    process.exit(1);
  }
} else {
  console.log(`frontend/package.json not found at ${pkgPath}, skipping package.json update`);
}
