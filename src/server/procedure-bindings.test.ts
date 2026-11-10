import { globSync, readFileSync } from 'node:fs'
import path from 'node:path'

import type { ESTree } from 'vite'
import { parseSync } from 'vite'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const functionFiles = globSync('src/modules/*/*.functions.ts', { cwd: root })

const isCall = (node: ESTree.Node | null | undefined): node is ESTree.CallExpression =>
  node?.type === 'CallExpression'

/** The method name a chained call invokes, and the call it was invoked on. */
function step(call: ESTree.CallExpression) {
  const { callee } = call
  return callee.type === 'MemberExpression' && callee.property.type === 'Identifier'
    ? { method: callee.property.name, on: callee.object }
    : undefined
}

/**
 * The action a server function hands its whole invocation to, when its initializer is exactly
 * `createServerFn(...).validator(X).handler((ctx) => <name>Action(ctx))`.
 */
function boundAction(init: ESTree.Expression | null): string | undefined {
  if (!isCall(init)) {
    return undefined
  }
  const handler = step(init)
  const validator = isCall(handler?.on) ? step(handler.on) : undefined
  const create = isCall(validator?.on) ? validator.on : undefined
  const [arrow] = init.arguments
  if (
    handler?.method !== 'handler' ||
    validator?.method !== 'validator' ||
    !isCall(handler.on) ||
    handler.on.arguments.length !== 1 ||
    create?.callee.type !== 'Identifier' ||
    create.callee.name !== 'createServerFn' ||
    init.arguments.length !== 1 ||
    arrow?.type !== 'ArrowFunctionExpression' ||
    !arrow.expression
  ) {
    return undefined
  }
  const [param] = arrow.params
  const { body } = arrow
  const [argument] = isCall(body) ? body.arguments : []
  if (
    arrow.params.length !== 1 ||
    param?.type !== 'Identifier' ||
    !isCall(body) ||
    body.callee.type !== 'Identifier' ||
    !body.callee.name.endsWith('Action') ||
    body.arguments.length !== 1 ||
    argument?.type !== 'Identifier' ||
    argument.name !== param.name
  ) {
    return undefined
  }
  return body.callee.name
}

/** The name a node exports under. */
function nameOf(node: ESTree.Node | null | undefined): string {
  if (node?.type === 'Identifier') {
    return node.name
  }
  return node?.type === 'Literal' ? String(node.value) : '?'
}

/** Each exported name with the action its initializer binds, or `undefined` for any other shape. */
function bindingsOf(file: string, source: string): [string, string | undefined][] {
  const { errors, program } = parseSync(file, source)
  if (errors.length > 0) {
    throw new Error(`${file} does not parse`)
  }
  return program.body.flatMap((node): [string, string | undefined][] => {
    if (node.type === 'ExportDefaultDeclaration') {
      return [['default', undefined]]
    }
    if (node.type === 'ExportAllDeclaration') {
      return [[node.exported ? nameOf(node.exported) : '*', undefined]]
    }
    if (node.type !== 'ExportNamedDeclaration') {
      return []
    }
    const { declaration } = node
    if (declaration === null || declaration === undefined) {
      return node.specifiers.map((specifier) => [nameOf(specifier.exported), undefined])
    }
    if (declaration.type === 'VariableDeclaration') {
      const single = declaration.declarations.length === 1
      return declaration.declarations.map(({ id, init }) => [
        nameOf(id),
        single ? boundAction(init) : undefined,
      ])
    }
    return [['id' in declaration ? nameOf(declaration.id) : '?', undefined]]
  })
}

/** The exports that are not `createServerFn(...).validator(X).handler((ctx) => <name>Action(ctx))`. */
const unbound = (bindings: [string, string | undefined][]) =>
  bindings.filter(([name, action]) => action !== `${name}Action`).map(([name]) => name)

describe('a server function binding', () => {
  it.each(functionFiles)('%s binds every export in one line to an action', (file) => {
    expect.hasAssertions()

    const bindings = bindingsOf(file, readFileSync(path.join(root, file), 'utf8'))

    expect(bindings.length).toBeGreaterThan(0)
    expect(unbound(bindings)).toStrictEqual([])
  })

  it('names each export of another shape', () => {
    expect.hasAssertions()

    const source = [
      'export const good = createServerFn().validator(v).handler((ctx) => goodAction(ctx))',
      'export const wrong = createServerFn().validator(v).handler((ctx) => otherAction(ctx))',
      'export function declared() {}',
      'export type Shape = string',
      'export { good as renamed }',
      'export default good',
    ].join('\n')

    expect(unbound(bindingsOf('fixture.functions.ts', source))).toStrictEqual([
      'wrong',
      'declared',
      'Shape',
      'renamed',
      'default',
    ])
  })
})
