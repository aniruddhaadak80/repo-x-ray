import type { DepKind, Ext, ImportRef } from './types'
import { parseImports } from './parser'

/**
 * Regex scanner â€” fast, dependency-free, used by default and by tests.
 * Kept as the fallback whenever the AST engine isn't loaded.
 */
export { parseImports }

type TsModule = typeof import('typescript')

const SCRIPT_KIND: Record<Ext, 'JS' | 'JSX' | 'TS' | 'TSX'> = {
  js: 'JS',
  jsx: 'JSX',
  ts: 'TS',
  tsx: 'TSX',
}

/** True when a string/template literal node has a statically-known value. */
function literalText(node: any, ts: TsModule): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node) && node.templateSpans.length === 0) return node.head.text
  return null
}

/**
 * AST-based import detection (needs the TypeScript module, loaded lazily).
 * Catches things the regex scanner can't: `import type`, multi-line imports,
 * `import x = require()`, template-literal dynamic imports.
 */
export function parseImportsAst(text: string, ext: Ext, ts: TsModule): ImportRef[] {
  const sf = ts.createSourceFile(`f.${ext}`, text, ts.ScriptTarget.Latest, false, ts.ScriptKind[SCRIPT_KIND[ext]])
  const refs: ImportRef[] = []
  const seen = new Set<string>()

  const push = (specifier: string, kind: DepKind, line: number, reexport = false, unresolvable = false) => {
    const key = `${specifier}|${kind}|${line}`
    if (seen.has(key)) return
    seen.add(key)
    refs.push({
      specifier,
      kind,
      line,
      relative: specifier.startsWith('.'),
      resolved: null,
      unresolved: false,
      external: false,
      reexport,
      ...(unresolvable ? { external: true } : {}),
    })
  }

  const lineOf = (node: any) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
  const lineOfSpec = (node: any) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1

  const visit = (node: any) => {
    // import ... from 'x' / import 'x' / import type ...
    if (ts.isImportDeclaration(node)) {
      const spec = node.moduleSpecifier
      const value = literalText(spec, ts)
      if (value !== null) {
        const isTypeOnly = node.importClause?.isTypeOnly ?? false
        push(value, isTypeOnly ? 'type' : 'esm', lineOfSpec(spec))
      } else {
        push('<dynamic>', 'dynamic', lineOfSpec(spec), false, true)
      }
    }
    // export ... from 'x' / export * from 'x'
    else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const value = literalText(node.moduleSpecifier, ts)
      if (value !== null) push(value, 'esm', lineOfSpec(node.moduleSpecifier), true)
    }
    // import x = require('y')
    else if (ts.isImportEqualsDeclaration(node)) {
      const ref = node.moduleReference
      if (ts.isExternalModuleReference(ref) && ref.expression) {
        const value = literalText(ref.expression, ts)
        if (value !== null) push(value, 'require', lineOf(node))
      }
    }
    // import('x') / require('x')
    else if (ts.isCallExpression(node)) {
      const callee = node.expression
      const isImportCall = callee.kind === ts.SyntaxKind.ImportKeyword
      const isRequire = ts.isIdentifier(callee) && callee.text === 'require'
      if ((isImportCall || isRequire) && node.arguments.length > 0) {
        const arg = node.arguments[0]
        const value = literalText(arg, ts)
        if (value !== null) push(value, isRequire ? 'require' : 'dynamic', lineOf(node))
        else if (isImportCall) push('<dynamic>', 'dynamic', lineOf(node), false, true)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return refs
}
