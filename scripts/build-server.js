#!/usr/bin/env node

// Script to build the server before starting the client in WebContainer mode
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Define the server directory path
const serverDir = path.resolve(__dirname, '../server');
const serverDistDir = path.resolve(serverDir, 'dist');

console.log('🔨 Building server for WebContainer mode...');

try {
  // Check if server directory exists
  if (!fs.existsSync(serverDir)) {
    console.error('❌ Server directory not found!');
    process.exit(1);
  }

  // Build the server
  console.log('🏗️ Building server...');
  execSync('npm run build', { 
    cwd: serverDir, 
    stdio: 'inherit' // This makes the output visible in the console
  });

  // Check if the build was successful
  if (!fs.existsSync(serverDistDir)) {
    console.error('❌ Server build failed: dist directory not found');
    process.exit(1);
  }

  const serverJsPath = path.join(serverDistDir, 'server.js');
  if (!fs.existsSync(serverJsPath)) {
    console.error('❌ Server build failed: server.js not found in dist');
    process.exit(1);
  }

  // Check and create webcontainer asset directories if they don't exist
  const wcAssetBaseDir = path.resolve(__dirname, '../src/assets/webcontainer');
  const wcConfigDir = path.join(wcAssetBaseDir, 'config');
  const wcRoutesDir = path.join(wcAssetBaseDir, 'routes');

  if (!fs.existsSync(wcAssetBaseDir)) {
    fs.mkdirSync(wcAssetBaseDir, { recursive: true });
  }
  if (!fs.existsSync(wcConfigDir)) {
    fs.mkdirSync(wcConfigDir, { recursive: true });
  }
  if (!fs.existsSync(wcRoutesDir)) {
    fs.mkdirSync(wcRoutesDir, { recursive: true });
  }

  // Create placeholder files for all server JS files
  const createPlaceholderForFile = (filePath, relativePath) => {
    const placeholder = `// This file is a placeholder. The Vite plugin will load from server/dist when available.
// Path: ${relativePath}`;
    
    // Calculate the target path in the assets directory
    const relativeToServerDist = path.relative(serverDistDir, filePath);
    const targetPath = path.join(wcAssetBaseDir, relativeToServerDist + '.wcfile');
    
    // Create directory if it doesn't exist
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    // Write the placeholder file
    fs.writeFileSync(targetPath, placeholder);
    console.log(`  📄 Created placeholder: ${path.relative(process.cwd(), targetPath)}`);
  };

  // Find all JS files in the server/dist directory
  const findJsFiles = (dir) => {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    
    let jsFiles = [];
    for (const file of files) {
      const filePath = path.join(dir, file.name);
      if (file.isDirectory()) {
        jsFiles = jsFiles.concat(findJsFiles(filePath));
      } else if (file.name.endsWith('.js') && !file.name.endsWith('.map.js')) {
        jsFiles.push(filePath);
      }
    }
    
    return jsFiles;
  };

  // Create placeholder files
  console.log('📝 Creating placeholder .wcfiles for the server files...');
  const jsFiles = findJsFiles(serverDistDir);
  jsFiles.forEach(file => {
    createPlaceholderForFile(file, path.relative(serverDir, file));
  });

  // Create package.json placeholder
  const packageJsonPath = path.join(wcAssetBaseDir, 'package.json.wcfile');
  fs.writeFileSync(packageJsonPath, '// This file is a placeholder. The Vite plugin will load from server/package.json when available.');
  console.log(`  📄 Created placeholder: ${path.relative(process.cwd(), packageJsonPath)}`);

  console.log('✅ Server build complete and placeholder files created!');
  
} catch (error) {
  console.error('❌ Server build failed:', error.message);
  process.exit(1);
}