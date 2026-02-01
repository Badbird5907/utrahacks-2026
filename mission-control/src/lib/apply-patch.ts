/**
 * Client-side utility for applying patches via the Flash model API
 */

export interface ApplyPatchOptions {
  validateSyntax?: boolean;
}

export interface ApplyPatchResult {
  success: boolean;
  newContent?: string;
  error?: string;
  syntaxWarning?: string;
}

/**
 * Apply a unified diff patch to file content using the Flash model.
 * 
 * @param filePath - Path to the file being edited (for context in error messages)
 * @param patch - Unified diff patch to apply
 * @param originalContent - Current content of the file
 * @param options - Optional configuration
 * @returns Result containing new content or error details
 */
export async function applyPatch(
  filePath: string,
  patch: string,
  originalContent: string,
  options: ApplyPatchOptions = {}
): Promise<ApplyPatchResult> {
  const { validateSyntax = true } = options;

  try {
    const response = await fetch('/api/apply-patch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath,
        patch,
        originalContent,
        validateSyntax,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const result: ApplyPatchResult = await response.json();
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: `Network error: ${message}`,
    };
  }
}
