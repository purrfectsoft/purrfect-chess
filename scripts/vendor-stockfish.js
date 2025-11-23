#!/usr/bin/env node
/**
 * Stockfish Vendoring Script
 *
 * Automatically copies ALL Stockfish variants from node_modules
 * to the public/libs directory for use in the Next.js application.
 *
 * Stockfish Package Details:
 * - Package: stockfish@17.1.0 (chess.com maintained)
 * - Source: https://github.com/nmrugg/stockfish.js
 * - License: GPL v3
 *
 * Available Variants (all copied):
 * 1. Full Multi-threaded WASM (~75MB): Strongest, requires CORS headers
 * 2. Full Single-threaded WASM (~75MB): Strongest without CORS, DEFAULT
 * 3. Lite Multi-threaded WASM (~7MB): Moderate, requires CORS headers
 * 4. Lite Single-threaded WASM (~7MB): Moderate, no CORS required
 * 5. ASM.js (~10MB): Weakest, universal compatibility
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const STOCKFISH_VERSION = '17.1';

const SOURCE_DIR = path.join(
  __dirname,
  '..',
  'node_modules',
  'stockfish',
  'src'
);
const TARGET_DIR = path.join(__dirname, '..', 'public', 'libs');

/**
 * All Stockfish variants to vendor
 * Ordered by strength (strongest first)
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const VARIANTS = require('../lib/stockfish-variants.json');

/**
 * Get files to copy for a variant
 */
const getFilesToCopy = (variant) => {
  // Full multi-threaded WASM variant uses filenames without the variant id in the base name
  const baseName = variant.id === 'wasm'
    ? `stockfish-${STOCKFISH_VERSION}-${variant.hash}`
    : `stockfish-${STOCKFISH_VERSION}-${variant.id}-${variant.hash}`;
  const files = [];

  // JS file
  files.push({
    src: `${baseName}.js`,
    dest: `stockfish-${variant.id}.js`,
  });

  // WASM file(s)
  if (variant.hasWasm) {
    if (variant.wasmParts > 0) {
      // Multi-part WASM (full variants)
      for (let i = 0; i < variant.wasmParts; i++) {
        files.push({
          src: `${baseName}-part-${i}.wasm`,
          dest: `stockfish-${variant.id}-part-${i}.wasm`,
        });
      }
    } else {
      // Single WASM file (lite variants)
      files.push({
        src: `${baseName}.wasm`,
        dest: `stockfish-${variant.id}.wasm`,
      });
    }
  }

  return files;
};

// Main vendoring function
function vendorStockfish() {
  console.log('=== Stockfish Multi-Variant Vendoring Script ===');
  console.log(`Version: ${STOCKFISH_VERSION}`);
  console.log(`Variants: ${VARIANTS.length}`);
  console.log(`Source: ${SOURCE_DIR}`);
  console.log(`Target: ${TARGET_DIR}`);
  console.log('');

  // Ensure target directory exists
  if (!fs.existsSync(TARGET_DIR)) {
    console.log('Creating target directory...');
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  let totalSize = 0;
  let totalFiles = 0;
  const variantSizes = [];

  // Process each variant
  for (const variant of VARIANTS) {
    console.log(`\n📦 Processing: ${variant.name}`);
    const files = getFilesToCopy(variant);

    let variantSize = 0;
    let variantFiles = 0;

    // Copy each file
    for (const { src, dest } of files) {
      const sourcePath = path.join(SOURCE_DIR, src);
      const targetPath = path.join(TARGET_DIR, dest);

      if (!fs.existsSync(sourcePath)) {
        console.error(`  ❌ Source file not found: ${src}`);
        console.error(`     Expected at: ${sourcePath}`);
        process.exit(1);
      }

      // Copy file
      fs.copyFileSync(sourcePath, targetPath);

      // Get file size
      const stats = fs.statSync(targetPath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      variantSize += stats.size;
      variantFiles++;

      console.log(`  ✓ ${dest} (${sizeMB} MB)`);
    }

    const variantSizeMB = (variantSize / (1024 * 1024)).toFixed(2);
    variantSizes.push({
      name: variant.name,
      sizeMB: variantSizeMB,
      files: variantFiles,
    });

    totalSize += variantSize;
    totalFiles += variantFiles;

    console.log(`  📊 Total for ${variant.id}: ${variantSizeMB} MB (${variantFiles} files)`);
  }

  const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);

  console.log('\n=== Vendoring Complete ===');
  console.log(`Total files copied: ${totalFiles}`);
  console.log(`Total size: ${totalSizeMB} MB`);
  console.log('');
  console.log('Variant Summary:');
  for (const { name, sizeMB, files } of variantSizes) {
    console.log(`  • ${name}: ${sizeMB} MB (${files} files)`);
  }
  console.log('');
  console.log('✓ All Stockfish variants are now available in public/libs/');
  console.log('  Workers can load from: /libs/stockfish-{variant-id}.js');
}

// Run the script
try {
  vendorStockfish();
} catch (error) {
  console.error('❌ Vendoring failed:', error.message);
  process.exit(1);
}
