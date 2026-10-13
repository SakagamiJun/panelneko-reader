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

// Paths relative to project root (assuming script runs from project root or build/)
const rootDir = path.resolve(__dirname, '..');
const configYmlPath = path.join(__dirname, 'config.yml');
const pkgPath = path.join(rootDir, 'frontend', 'package.json');

// Determine commit hash
let commit = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : '';
if (!commit) {
  try {
    commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    commit = '';
  }
}

// 1. Update build/config.yml (only info.version and info.commit, leave top-level version: '3' intact)
if (fs.existsSync(configYmlPath)) {
  try {
    const lines = fs.readFileSync(configYmlPath, 'utf8').split('\n');
    let inInfo = false;
    let hasVersion = false;
    let hasCommit = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed === 'info:') {
        inInfo = true;
        continue;
      }
      if (inInfo) {
        // If we hit a non-indented line that's not empty and not comment, info section ended
        if (!line.startsWith(' ') && !line.startsWith('\t') && trimmed !== '' && !trimmed.startsWith('#')) {
          inInfo = false;
          continue;
        }
        if (/^\s*version:\s*/.test(line)) {
          lines[i] = `  version: "${version}"`;
          hasVersion = true;
        } else if (/^\s*commit:\s*/.test(line)) {
          lines[i] = `  commit: "${commit}"`;
          hasCommit = true;
        }
      }
    }

    if (!hasCommit && commit) {
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*version:\s*/.test(lines[i])) {
          lines.splice(i + 1, 0, `  commit: "${commit}"`);
          break;
        }
      }
    }

    fs.writeFileSync(configYmlPath, lines.join('\n'), 'utf8');
    console.log(`Successfully updated build/config.yml (info.version: ${version}, info.commit: ${commit || 'none'})`);
  } catch (err) {
    console.error(`Error updating build/config.yml: ${err.message}`);
    process.exit(1);
  }
}

// 2. Update macOS plist files
const plistFiles = [
  path.join(__dirname, 'darwin', 'Info.plist'),
  path.join(__dirname, 'darwin', 'Info.dev.plist'),
];
for (const plistPath of plistFiles) {
  if (fs.existsSync(plistPath)) {
    try {
      let plist = fs.readFileSync(plistPath, 'utf8');
      plist = plist.replace(/(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${version}$2`);
      plist = plist.replace(/(<key>CFBundleVersion<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${version}$2`);
      fs.writeFileSync(plistPath, plist, 'utf8');
      console.log(`Successfully updated ${path.relative(rootDir, plistPath)} to version ${version}`);
    } catch (err) {
      console.error(`Error updating ${plistPath}: ${err.message}`);
    }
  }
}

// 3. Update Windows assets
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

const winManifestPath = path.join(__dirname, 'windows', 'wails.exe.manifest');
if (fs.existsSync(winManifestPath)) {
  try {
    let manifest = fs.readFileSync(winManifestPath, 'utf8');
    manifest = manifest.replace(/(<assemblyIdentity[^>]*\bversion=)["'][^"']+["']/, `$1"${version}"`);
    fs.writeFileSync(winManifestPath, manifest, 'utf8');
    console.log(`Successfully updated build/windows/wails.exe.manifest to version ${version}`);
  } catch (err) {
    console.error(`Error updating build/windows/wails.exe.manifest: ${err.message}`);
  }
}

const nsisToolsPath = path.join(__dirname, 'windows', 'nsis', 'wails_tools.nsh');
if (fs.existsSync(nsisToolsPath)) {
  try {
    let nsh = fs.readFileSync(nsisToolsPath, 'utf8');
    nsh = nsh.replace(/(!define\s+INFO_PRODUCTVERSION\s+)["'][^"']+["']/, `$1"${version}"`);
    fs.writeFileSync(nsisToolsPath, nsh, 'utf8');
    console.log(`Successfully updated build/windows/nsis/wails_tools.nsh to version ${version}`);
  } catch (err) {
    console.error(`Error updating build/windows/nsis/wails_tools.nsh: ${err.message}`);
  }
}

// 4. Update Linux assets
const nfpmPath = path.join(__dirname, 'linux', 'nfpm', 'nfpm.yaml');
if (fs.existsSync(nfpmPath)) {
  try {
    let nfpm = fs.readFileSync(nfpmPath, 'utf8');
    nfpm = nfpm.replace(/(^|\n)(version:\s*)["'][^"']+["']/, `$1$2"${version}"`);
    fs.writeFileSync(nfpmPath, nfpm, 'utf8');
    console.log(`Successfully updated build/linux/nfpm/nfpm.yaml to version ${version}`);
  } catch (err) {
    console.error(`Error updating build/linux/nfpm/nfpm.yaml: ${err.message}`);
  }
}

// 5. Update frontend/package.json
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
