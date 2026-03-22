/**
 * Output Protection Validator Property-Based Tests
 * 输出目录保护验证器属性测试
 * 
 * Feature: initialize, Property 17: 输出目录保护
 * **Validates: Requirements 7.2, 7.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateOutputProtection,
  isProtectedPath,
  PROTECTED_OUTPUT_DIR,
} from './output-protection.js';
import { ErrorCodes } from '../types/index.js';

/**
 * Arbitrary: Generate a valid file path segment (alphanumeric with dashes and underscores)
 */
const pathSegmentArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'),
  { minLength: 1, maxLength: 20 }
).filter((s) => /^[a-z0-9][a-z0-9-_]*$/.test(s));

/**
 * Arbitrary: Generate a file extension
 */
const fileExtensionArb = fc.constantFrom('.yaml', '.yml', '.json', '.md', '.ts', '.js', '.txt');

/**
 * Arbitrary: Generate a file name with extension
 */
const fileNameArb = fc.tuple(pathSegmentArb, fileExtensionArb)
  .map(([name, ext]) => `${name}${ext}`);

/**
 * Arbitrary: Generate a directory path (1-4 segments)
 */
const directoryPathArb = fc.array(pathSegmentArb, { minLength: 0, maxLength: 4 })
  .map((segments) => segments.join('/'));

/**
 * Arbitrary: Generate a file path starting with _build/ (protected)
 */
const protectedPathStartingWithBuildArb = fc.tuple(directoryPathArb, fileNameArb)
  .map(([dir, file]) => dir ? `_build/${dir}/${file}` : `_build/${file}`);

/**
 * Arbitrary: Generate a file path containing /_build/ in the middle (protected)
 */
const protectedPathContainingBuildArb = fc.tuple(
  fc.array(pathSegmentArb, { minLength: 1, maxLength: 3 }),
  directoryPathArb,
  fileNameArb
).map(([prefix, suffix, file]) => {
  const prefixPath = prefix.join('/');
  return suffix ? `${prefixPath}/_build/${suffix}/${file}` : `${prefixPath}/_build/${file}`;
});

/**
 * Arbitrary: Generate any protected path (either starting with or containing _build/)
 */
const protectedPathArb = fc.oneof(
  protectedPathStartingWithBuildArb,
  protectedPathContainingBuildArb
);

/**
 * Arbitrary: Generate a safe directory name that doesn't match _build pattern
 */
const safeDirectoryNameArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'),
  { minLength: 1, maxLength: 15 }
).filter((s) => 
  /^[a-z][a-z0-9-]*$/.test(s) && 
  s !== '_build' && 
  !s.startsWith('_build')
);

/**
 * Arbitrary: Generate a non-protected file path (not in _build/ directory)
 */
const nonProtectedPathArb = fc.tuple(
  fc.array(safeDirectoryNameArb, { minLength: 0, maxLength: 4 }),
  fileNameArb
).map(([dirs, file]) => {
  if (dirs.length === 0) return file;
  return `${dirs.join('/')}/${file}`;
}).filter((path) => !isProtectedPath(path));

/**
 * Arbitrary: Generate paths that look similar to _build but are NOT protected
 */
const similarButNotProtectedPathArb = fc.oneof(
  // _build_backup/file.yaml - has suffix
  fc.tuple(pathSegmentArb, fileNameArb).map(([suffix, file]) => `_build_${suffix}/${file}`),
  // _builds/file.yaml - plural
  fc.tuple(directoryPathArb, fileNameArb).map(([dir, file]) => dir ? `_builds/${dir}/${file}` : `_builds/${file}`),
  // _builder/file.yaml - different word
  fc.tuple(directoryPathArb, fileNameArb).map(([dir, file]) => dir ? `_builder/${dir}/${file}` : `_builder/${file}`),
  // my_build/file.yaml - prefix
  fc.tuple(pathSegmentArb, fileNameArb).map(([prefix, file]) => `${prefix}_build/${file}`),
  // submissions/_build.yaml - _build as filename, not directory
  fc.tuple(safeDirectoryNameArb, fc.constant('_build.yaml')).map(([dir, file]) => `${dir}/${file}`)
);

describe('Feature: initialize, Property 17: 输出目录保护', () => {
  /**
   * Property 17.1: Any file path starting with _build/ is detected as protected
   * 
   * For any file path that starts with "_build/", the isProtectedPath function
   * should return true.
   */
  it('should detect any path starting with _build/ as protected', async () => {
    await fc.assert(
      fc.asyncProperty(
        protectedPathStartingWithBuildArb,
        async (filePath) => {
          const result = isProtectedPath(filePath);
          
          expect(result).toBe(true);
          expect(filePath.startsWith('_build/')).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 17.2: Any file path containing /_build/ is detected as protected
   * 
   * For any file path that contains "/_build/" (nested _build directory),
   * the isProtectedPath function should return true.
   */
  it('should detect any path containing /_build/ as protected', async () => {
    await fc.assert(
      fc.asyncProperty(
        protectedPathContainingBuildArb,
        async (filePath) => {
          const result = isProtectedPath(filePath);
          
          expect(result).toBe(true);
          expect(filePath.includes('/_build/')).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 17.3: Files not in _build/ directory pass validation
   * 
   * For any file path that does not start with "_build/" and does not contain
   * "/_build/", the validation should pass (valid: true).
   */
  it('should pass validation for files not in _build/ directory', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(nonProtectedPathArb, { minLength: 1, maxLength: 10 }),
        async (filePaths) => {
          const result = validateOutputProtection(filePaths);
          
          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          
          // Verify none of the paths are protected
          for (const path of filePaths) {
            expect(isProtectedPath(path)).toBe(false);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 17.4: Error code is always ERR_OUTPUT_MODIFIED when protected files are found
   * 
   * For any file list containing at least one protected file, the validation
   * should fail with exactly one error having code ERR_OUTPUT_MODIFIED.
   */
  it('should return ERR_OUTPUT_MODIFIED error code when protected files are found', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(protectedPathArb, { minLength: 1, maxLength: 5 }),
        fc.array(nonProtectedPathArb, { minLength: 0, maxLength: 5 }),
        async (protectedPaths, nonProtectedPaths) => {
          const allPaths = [...protectedPaths, ...nonProtectedPaths];
          const result = validateOutputProtection(allPaths);
          
          expect(result.valid).toBe(false);
          expect(result.hardErrors).toHaveLength(1);
          expect(result.hardErrors[0].code).toBe(ErrorCodes.OUTPUT_MODIFIED);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 17.5: All protected files are listed in relatedEntities
   * 
   * For any file list containing protected files, all protected files
   * should be listed in the error's relatedEntities array.
   */
  it('should list all protected files in relatedEntities', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(protectedPathArb, { minLength: 1, maxLength: 5 }),
        fc.array(nonProtectedPathArb, { minLength: 0, maxLength: 5 }),
        async (protectedPaths, nonProtectedPaths) => {
          const allPaths = [...protectedPaths, ...nonProtectedPaths];
          const result = validateOutputProtection(allPaths);
          
          expect(result.valid).toBe(false);
          expect(result.hardErrors).toHaveLength(1);
          
          const relatedEntities = result.hardErrors[0].relatedEntities;
          expect(relatedEntities).toBeDefined();
          
          // All protected paths should be in relatedEntities
          for (const protectedPath of protectedPaths) {
            expect(relatedEntities).toContain(protectedPath);
          }
          
          // relatedEntities should only contain protected paths
          expect(relatedEntities!.length).toBe(protectedPaths.length);
          
          // No non-protected paths should be in relatedEntities
          for (const nonProtectedPath of nonProtectedPaths) {
            expect(relatedEntities).not.toContain(nonProtectedPath);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 17.6: Validation is consistent regardless of file order in the list
   * 
   * For any file list, shuffling the order of files should not change
   * the validation result (valid/invalid) or the set of protected files found.
   */
  it('should produce consistent results regardless of file order', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(protectedPathArb, { minLength: 1, maxLength: 3 }),
        fc.array(nonProtectedPathArb, { minLength: 0, maxLength: 3 }),
        async (protectedPaths, nonProtectedPaths) => {
          const allPaths = [...protectedPaths, ...nonProtectedPaths];
          
          // Get result with original order
          const result1 = validateOutputProtection(allPaths);
          
          // Shuffle the array
          const shuffled = [...allPaths].sort(() => Math.random() - 0.5);
          const result2 = validateOutputProtection(shuffled);
          
          // Both should have same validity
          expect(result1.valid).toBe(result2.valid);
          expect(result1.hardErrors.length).toBe(result2.hardErrors.length);
          
          // Both should have same set of protected files (order may differ)
          const entities1 = result1.hardErrors[0].relatedEntities!.sort();
          const entities2 = result2.hardErrors[0].relatedEntities!.sort();
          expect(entities1).toEqual(entities2);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 17.7: Similar but non-protected paths should pass validation
   * 
   * Paths that look similar to _build/ but are not actually in the _build/
   * directory should pass validation (e.g., _builds/, _build_backup/, my_build/).
   */
  it('should not falsely detect similar but non-protected paths', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(similarButNotProtectedPathArb, { minLength: 1, maxLength: 5 }),
        async (filePaths) => {
          // First verify these paths are indeed not protected
          for (const path of filePaths) {
            expect(isProtectedPath(path)).toBe(false);
          }
          
          const result = validateOutputProtection(filePaths);
          
          expect(result.valid).toBe(true);
          expect(result.hardErrors).toHaveLength(0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 17.8: Empty file list should pass validation
   * 
   * An empty file list should always pass validation.
   */
  it('should pass validation for empty file list', async () => {
    const result = validateOutputProtection([]);
    
    expect(result.valid).toBe(true);
    expect(result.hardErrors).toHaveLength(0);
    expect(result.softWarnings).toHaveLength(0);
  });

  /**
   * Property 17.9: Error message should contain bilingual description
   * 
   * When protected files are found, the error message should contain
   * both Chinese and English descriptions.
   */
  it('should include bilingual error messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(protectedPathArb, { minLength: 1, maxLength: 3 }),
        async (protectedPaths) => {
          const result = validateOutputProtection(protectedPaths);
          
          expect(result.valid).toBe(false);
          expect(result.hardErrors).toHaveLength(1);
          
          const error = result.hardErrors[0];
          
          // Should have both zh and en messages
          expect(error.message.zh).toBeDefined();
          expect(error.message.en).toBeDefined();
          expect(error.message.zh.length).toBeGreaterThan(0);
          expect(error.message.en.length).toBeGreaterThan(0);
          
          // Messages should mention _build/
          expect(error.message.zh).toContain('_build/');
          expect(error.message.en).toContain('_build/');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 17.10: Error location should reference the first protected file
   * 
   * The error location's file field should reference the first protected
   * file found in the input list.
   */
  it('should set error location to first protected file', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(protectedPathArb, { minLength: 1, maxLength: 5 }),
        async (protectedPaths) => {
          const result = validateOutputProtection(protectedPaths);
          
          expect(result.valid).toBe(false);
          expect(result.hardErrors).toHaveLength(1);
          
          const error = result.hardErrors[0];
          
          // Location file should be the first protected file
          expect(error.location.file).toBe(protectedPaths[0]);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 17.11: PROTECTED_OUTPUT_DIR constant should be _build/
   * 
   * The PROTECTED_OUTPUT_DIR constant should always be "_build/".
   */
  it('should have PROTECTED_OUTPUT_DIR as _build/', () => {
    expect(PROTECTED_OUTPUT_DIR).toBe('_build/');
  });

  /**
   * Property 17.12: Windows-style path separators should be handled
   * 
   * Paths with Windows-style backslashes should be correctly detected
   * as protected when they reference the _build/ directory.
   */
  it('should handle Windows-style path separators', async () => {
    await fc.assert(
      fc.asyncProperty(
        protectedPathStartingWithBuildArb,
        async (filePath) => {
          // Convert to Windows-style path
          const windowsPath = filePath.replace(/\//g, '\\');
          
          const result = isProtectedPath(windowsPath);
          
          expect(result).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 17.13: Mixed protected and non-protected paths
   * 
   * When a file list contains both protected and non-protected paths,
   * only the protected paths should be reported in the error.
   */
  it('should correctly separate protected from non-protected paths', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(protectedPathArb, { minLength: 1, maxLength: 3 }),
        fc.array(nonProtectedPathArb, { minLength: 1, maxLength: 3 }),
        async (protectedPaths, nonProtectedPaths) => {
          const allPaths = [...protectedPaths, ...nonProtectedPaths];
          const result = validateOutputProtection(allPaths);
          
          expect(result.valid).toBe(false);
          
          const relatedEntities = result.hardErrors[0].relatedEntities!;
          
          // Count should match protected paths count
          expect(relatedEntities.length).toBe(protectedPaths.length);
          
          // Each protected path should be in relatedEntities
          for (const path of protectedPaths) {
            expect(relatedEntities).toContain(path);
          }
          
          // Each non-protected path should NOT be in relatedEntities
          for (const path of nonProtectedPaths) {
            expect(relatedEntities).not.toContain(path);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
