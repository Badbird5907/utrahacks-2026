"use client";

/*
 * Copyright (c) Eric Traut
 * Wrapper interface around the monaco editor component.
 */

import Editor, { loader } from "@monaco-editor/react";
// @ts-expect-error - monaco-editor is not typed
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
/*
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
*/

import {
  ForwardedRef,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import {
  CompletionItem,
  CompletionItemKind,
  Diagnostic,
  DiagnosticSeverity,
  InsertReplaceEdit,
  MarkupContent,
  Range,
  SignatureInformation,
  TextDocumentEdit,
} from "vscode-languageserver-types";
import { LspClient } from "@/components/editor/lsp-client";
import { useTheme } from "next-themes";

// Language ID for Arduino/C++
const ARDUINO_LANGUAGE_ID = "cpp";

loader
  .init()
  .then((monaco) => {
    // Register providers for both Python (legacy) and C++/Arduino
    const languages = ["python", ARDUINO_LANGUAGE_ID];
    
    languages.forEach((langId) => {
      monaco.languages.registerHoverProvider(langId, {
        provideHover: handleHoverRequest,
      });
      monaco.languages.registerSignatureHelpProvider(langId, {
        provideSignatureHelp: handleSignatureHelpRequest,
        signatureHelpTriggerCharacters: ["(", ","],
      });
      monaco.languages.registerCompletionItemProvider(langId, {
        provideCompletionItems: handleProvideCompletionRequest,
        resolveCompletionItem: handleResolveCompletionRequest,
        triggerCharacters: [".", "[", '"', "'", "<", ":"],
      });
      monaco.languages.registerRenameProvider(langId, {
        provideRenameEdits: handleRenameRequest,
      });
    });
  })
  .catch((error) =>
    console.error("An error occurred during initialization of Monaco: ", error),
  );

const options: monaco.editor.IStandaloneEditorConstructionOptions = {
  selectOnLineNumbers: true,
  minimap: { enabled: false },
  fixedOverflowWidgets: true,
  tabCompletion: "on",
  hover: { enabled: true },
  scrollBeyondLastLine: false,
  autoClosingOvertype: "always",
  autoSurround: "quotes",
  autoIndent: "full",
  // The default settings prefer "Menlo", but "Monaco" looks better
  // for our purposes. Swap the order so Monaco is used if available.
  // fontFamily: 'Monaco, Menlo, "Courier New", monospace',
  showUnused: true,
  wordBasedSuggestions: "off",
  overviewRulerLanes: 0,
  renderWhitespace: "none",
  guides: {
    indentation: false,
  },
  renderLineHighlight: "none",
};

interface RegisteredModel {
  model: monaco.editor.ITextModel;
  lspClient: LspClient<never>;
  filePath: string;
}
const registeredModels: RegisteredModel[] = [];

export interface MonacoEditorProps {
  lspClient?: LspClient<never>;
  filePath: string;
  code: string;
  diagnostics: Diagnostic[];

  onUpdateCode: (code: string) => void;
  onSave?: () => void;
}

export interface MonacoEditorRef {
  focus: () => void;
  selectRange: (range: Range) => void;
}

export const MonacoEditor = forwardRef(function MonacoEditor(
  props: MonacoEditorProps,
  ref: ForwardedRef<MonacoEditorRef>,
) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);
  const { theme } = useTheme();

  function handleEditorDidMount(
    editor: monaco.editor.IStandaloneCodeEditor,
    monacoInstance: typeof monaco,
  ) {
    editorRef.current = editor;
    monacoRef.current = monacoInstance;

    // Add Ctrl+S handler for save
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
      props.onSave?.();
    });

    editor.focus();
  }

  useImperativeHandle(ref, () => {
    return {
      focus: () => {
        const editor = editorRef.current;
        if (editor) {
          editor.focus();
        }
      },
      selectRange: (range: Range) => {
        const editor = editorRef.current;
        if (editor) {
          const monacoRange = convertRange(range);
          editor.setSelection(monacoRange);
          editor.revealLineInCenterIfOutsideViewport(
            monacoRange.startLineNumber,
          );
        }
      },
    };
  });

  useEffect(() => {
    if (monacoRef?.current && editorRef?.current) {
      const model = editorRef.current.getModel()!;
      setFileMarkers(monacoRef.current, model, props.diagnostics);

      // Register the editor and the LSP Client so they can be accessed
      // by the hover provider, etc.
      if (props.lspClient) {
        registerModel(model, props.lspClient, props.filePath);
      }
    }
  }, [props.diagnostics, props.lspClient, props.filePath]);

  return (
    <Editor
      options={options}
      language={ARDUINO_LANGUAGE_ID}
      height={"100%"}
      width={"100%"}
      value={props.code}
      theme={theme === "dark" ? "vs-dark" : "vs"}
      onChange={(value) => {
        props.onUpdateCode(value ?? "");
      }}
      onMount={handleEditorDidMount}
    />
  );
});

function setFileMarkers(
  monacoInstance: typeof monaco,
  model: monaco.editor.ITextModel,
  diagnostics: Diagnostic[],
) {
  const markers: monaco.editor.IMarkerData[] = [];

  diagnostics.forEach((diag) => {
    const markerData: monaco.editor.IMarkerData = {
      ...convertRange(diag.range),
      severity: convertSeverity(diag.severity!),
      message: diag.message,
    };

    if (diag.tags) {
      markerData.tags = diag.tags;
    }
    markers.push(markerData);
  });

  monacoInstance.editor.setModelMarkers(model, "arduino-lsp", markers);
}

function convertSeverity(severity: DiagnosticSeverity): monaco.MarkerSeverity {
  switch (severity) {
    case DiagnosticSeverity.Error:
    default:
      return monaco.MarkerSeverity.Error;

    case DiagnosticSeverity.Warning:
      return monaco.MarkerSeverity.Warning;

    case DiagnosticSeverity.Information:
      return monaco.MarkerSeverity.Info;

    case DiagnosticSeverity.Hint:
      return monaco.MarkerSeverity.Hint;
  }
}

function convertRange(range?: Range): monaco.IRange {
  if (!range) {
    return {
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 1,
    };
  }
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  };
}

async function handleHoverRequest(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): Promise<monaco.languages.Hover | null> {
  const registered = getRegisteredModel(model);
  if (!registered) {
    return null;
  }
  try {
    const hoverInfo = await (registered.lspClient as unknown as LspClient<never>).getHoverInfo(registered.filePath, {
      line: position.lineNumber - 1,
      character: position.column - 1,
    });

    if (!hoverInfo || !hoverInfo.contents) {
      return null;
    }

    // Handle different content formats
    let value = '';
    if (typeof hoverInfo.contents === 'string') {
      value = hoverInfo.contents;
    } else if (Array.isArray(hoverInfo.contents)) {
      value = hoverInfo.contents.map((c: unknown) => 
        typeof c === 'string' ? c : (c as { value: string }).value || ''
      ).join('\n\n');
    } else if ((hoverInfo.contents as MarkupContent).value) {
      value = (hoverInfo.contents as MarkupContent).value;
    }

    if (!value) {
      return null;
    }

    return {
      contents: [{ value }],
      range: convertRange(hoverInfo.range),
    };
  } catch (error) {
    console.error('[Monaco] Hover request failed:', error);
    return null;
  }
}

async function handleRenameRequest(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  newName: string,
): Promise<monaco.languages.WorkspaceEdit | null> {
  const registered = getRegisteredModel(model);
  if (!registered) {
    return null;
  }

  try {
    const renameEdits = await (registered.lspClient as unknown as LspClient<never>).getRenameEdits(
      registered.filePath,
      {
        line: position.lineNumber - 1,
        character: position.column - 1,
      },
      newName,
    );

    const edits: monaco.languages.IWorkspaceTextEdit[] = [];

    if (renameEdits?.documentChanges) {
      for (const docChange of renameEdits.documentChanges) {
        if (TextDocumentEdit.is(docChange)) {
          for (const textEdit of docChange.edits) {
            edits.push({
              resource: model.uri,
              versionId: undefined,
              textEdit: {
                range: convertRange(textEdit.range),
                text: textEdit.newText,
              },
            });
          }
        }
      }
    }

    return { edits };
  } catch {
    return null;
  }
}

async function handleSignatureHelpRequest(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): Promise<monaco.languages.SignatureHelpResult | null> {
  const registered = getRegisteredModel(model);
  if (!registered) {
    return null;
  }

  try {
    const sigInfo = await (registered.lspClient as unknown as LspClient<never>).getSignatureHelp(registered.filePath, {
      line: position.lineNumber - 1,
      character: position.column - 1,
    });

    if (!sigInfo || !sigInfo.signatures || sigInfo.signatures.length === 0) {
      return null;
    }

    return {
      value: {
        signatures: sigInfo.signatures.map((sig: SignatureInformation) => {
          return {
            label: sig.label,
            documentation: sig.documentation,
            parameters: sig.parameters,
            activeParameter: sig.activeParameter,
          };
        }) as monaco.languages.SignatureInformation[],
        activeSignature: sigInfo.activeSignature ?? 0,
        activeParameter: sigInfo.activeParameter ?? 0,
      },
      dispose: () => {},
    };
  } catch (error) {
    console.error('[Monaco] Signature help request failed:', error);
    return null;
  }
}

async function handleProvideCompletionRequest(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): Promise<monaco.languages.CompletionList | null> {
  const registered = getRegisteredModel(model);
  if (!registered) {
    console.warn('[Monaco] No registered model found for completion request');
    return null;
  }

  try {
    const completionResult = await (registered.lspClient as unknown as LspClient<never>).getCompletion(registered.filePath, {
      line: position.lineNumber - 1,
      character: position.column - 1,
    });

    if (!completionResult) {
      return { suggestions: [], incomplete: false, dispose: () => {} };
    }

    // Handle both CompletionList and CompletionItem[] responses
    let items: CompletionItem[];
    let isIncomplete = false;
    
    if (Array.isArray(completionResult)) {
      // Response is CompletionItem[]
      items = completionResult;
    } else if (completionResult.items) {
      // Response is CompletionList
      items = completionResult.items;
      isIncomplete = completionResult.isIncomplete ?? false;
    } else {
      console.warn('[Monaco] Unexpected completion response format:', completionResult);
      return { suggestions: [], incomplete: false, dispose: () => {} };
    }

    return {
      suggestions: items.map((item) => {
        return convertCompletionItem(item, model);
      }),
      incomplete: isIncomplete,
      dispose: () => {},
    };
  } catch (error) {
    console.error('[Monaco] Completion request failed:', error);
    return null;
  }
}

type CompletionItemWithModelAndOriginal = monaco.languages.CompletionItem & {
  model: monaco.editor.ITextModel;
  __original: CompletionItem;
};

/**
 * Handle completion item resolve requests.
 * Note: The Arduino Language Server does NOT support completionItem/resolve,
 * so we simply return the item as-is without making the LSP call.
 */
async function handleResolveCompletionRequest(
  item: monaco.languages.CompletionItem,
): Promise<monaco.languages.CompletionItem> {
  // Arduino LSP doesn't support completionItem/resolve - just return the item as-is
  // This avoids a crash in the Arduino Language Server which panics on unimplemented methods
  return item;
}

function convertCompletionItem(
  item: CompletionItem,
  model?: monaco.editor.ITextModel,
): monaco.languages.CompletionItem {
  const converted: monaco.languages.CompletionItem = {
    label: item.label,
    kind: convertCompletionItemKind(item.kind),
    tags: item.tags,
    detail: item.detail,
    documentation: item.documentation,
    sortText: item.sortText,
    filterText: item.filterText,
    preselect: item.preselect,
    insertText: item.label,
    range: undefined as unknown as monaco.IRange, // hack
  };

  if (item.textEdit) {
    converted.insertText = item.textEdit.newText;
    if (InsertReplaceEdit.is(item.textEdit)) {
      converted.range = {
        insert: convertRange(item.textEdit.insert),
        replace: convertRange(item.textEdit.replace),
      };
    } else {
      converted.range = convertRange(item.textEdit.range);
    }
  }

  if (item.additionalTextEdits) {
    converted.additionalTextEdits = item.additionalTextEdits.map((edit) => {
      return {
        range: convertRange(edit.range),
        text: edit.newText,
      };
    });
  }

  // Stash a few additional pieces of information.
  (converted as CompletionItemWithModelAndOriginal).__original = item;
  if (model) {
    (converted as CompletionItemWithModelAndOriginal).model = model;
  }

  return converted;
}
function convertCompletionItemKind(
  itemKind: CompletionItemKind | undefined,
): monaco.languages.CompletionItemKind {
  switch (itemKind) {
    case CompletionItemKind.Constant:
      return monaco.languages.CompletionItemKind.Constant;

    case CompletionItemKind.Variable:
      return monaco.languages.CompletionItemKind.Variable;

    case CompletionItemKind.Function:
      return monaco.languages.CompletionItemKind.Function;

    case CompletionItemKind.Field:
      return monaco.languages.CompletionItemKind.Field;

    case CompletionItemKind.Keyword:
      return monaco.languages.CompletionItemKind.Keyword;

    default:
      return monaco.languages.CompletionItemKind.Reference;
  }
}

// Register an instantiated text model (which backs a monaco editor
// instance and its associated LSP client. This is a bit of a hack,
// but it's required to support the various providers (e.g. hover).
function registerModel(
  model: monaco.editor.ITextModel,
  lspClient: LspClient<never>,
  filePath: string,
) {
  // Remove old registration for this model if exists
  const existingIndex = registeredModels.findIndex((m) => m.model === model);
  if (existingIndex >= 0) {
    registeredModels.splice(existingIndex, 1);
  }

  registeredModels.push({ model, lspClient, filePath });
}

function getRegisteredModel(
  model: monaco.editor.ITextModel,
): RegisteredModel | undefined {
  return registeredModels.find((m) => m.model === model);
}