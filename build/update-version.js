const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get tag name from command line argument or environment variable (GitHub Actions)
let tag = process.argv[2] || process.env.GITHUB_REF_NAME;

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
const configYmlPath = path.join(__dirname, 'config.yml');
const pkgPath = path.join(__dirname, '..', 'frontend', 'package.json');

// Update build/config.yml
if (fs.existsSync(configYmlPath)) {
  try {
    let content = fs.readFileSync(configYmlPath, 'utf8');
    content = content.replace(/version:\s*["'][^"']+["']/, `version: "${version}"`);
    fs.writeFileSync(configYmlPath, content, 'utf8');
    console.log(`Successfully updated build/config.yml to version ${version}`);
  } catch (err) {
    console.error(`Error updating build/config.yml: ${err.message}`);
    process.exit(1);
  }
}

// Update build/darwin/Info.plist
const plistPath = path.join(__dirname, 'darwin', 'Info.plist');
if (fs.existsSync(plistPath)) {
  try {
    let plist = fs.readFileSync(plistPath, 'utf8');
    plist = plist.replace(/(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${version}$2`);
    plist = plist.replace(/(<key>CFBundleVersion<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${version}$2`);
    fs.writeFileSync(plistPath, plist, 'utf8');
    console.log(`Successfully updated build/darwin/Info.plist to version ${version}`);
  } catch (err) {
    console.error(`Error updating build/darwin/Info.plist: ${err.message}`);
  }
}

// Update build/windows/info.json
const winInfoPath = path.join(__dirname, 'windows', 'info.json');
if (fs.existsSync(winInfoPath)) {
  try {
    const winInfo = JSON.parse(fs.readFileSync(winInfoPath, 'utf8'));
    if (winInfo.fixed) winInfo.fixed.file_version = version;
    if (winInfo.info?.['0409']) winInfo.info['0409'].ProductVersion = version;
    fs.writeFileSync(winInfoPath, JSON.stringify(winInfo, null, '\t') + '\n');
    console.log(`Successfully updated build/windows/info.json to version ${version}`);
  } catch (err) {
    console.error(`Error updating build/windows/info.json: ${err.message}`);
  }
}

// Update wails.json
if (fs.existsSync(wailsPath)) {
  try {
    const wailsConfig = JSON.parse(fs.readFileSync(wailsPath, 'utf8'));
    if (wailsConfig.info) {
      wailsConfig.info.version = version;
      let commit = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : '';
      if (!commit) {
        try {
          commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
        } catch {
          commit = '';
        }
      }
      if (commit) {
        wailsConfig.info.commit = commit;
      }
      fs.writeFileSync(wailsPath, JSON.stringify(wailsConfig, null, 2) + '\n');
      console.log(`Successfully updated wails.json to version ${version}${commit ? ` (${commit})` : ''}`);
    }
  } catch (err) {
    console.error(`Error updating wails.json: ${err.message}`);
    process.exit(1);
  }
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
