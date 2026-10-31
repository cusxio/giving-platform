import { globSync, readFileSync } from 'node:fs'
import path from 'node:path'

import type { ESTree } from 'vite'
import { parseSync } from 'vite'
import { describe, expect, it } from 'vitest'

/** Modules whose server functions still call `*Procedure` adapters. Each wave removes its own. */
const NOT_YET_MIGRATED = new Set(['account', 'auth', 'history', 'payments'])

const root = path.resolve(import.meta.dirname, '../..')
const functionFiles = globSync('src/modules/*/*.functions.ts', { cwd: root }).filter(
  (file) => !NOT_YET_MIGRATED.has(file.split('/')[2] ?? ''),
)

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

/** Each exported name with the action its initializer binds, or `undefined` for any other shape. */
function bindingsOf(file: string): [string, string | undefined][] {
  const { errors, program } = parseSync(file, readFileSync(path.join(root, file), 'utf8'))
  if (errors.length > 0) {
    throw new Error(`${file} does not parse`)
  }
  return program.body
    .filter((node) => node.type === 'ExportNamedDeclaration')
    .flatMap((node) =>
      node.declaration?.type === 'VariableDeclaration' && node.declaration.declarations.length === 1
        ? node.declaration.declarations.map(({ id, init }): [string, string | undefined] => [
            id.type === 'Identifier' ? id.name : '?',
            boundAction(init),
          ])
        : [['?', undefined]],
    )
}

describe('a server function binding', () => {
  it.each(functionFiles)('%s binds every export in one line to an action', (file) => {
    expect.hasAssertions()

    const bindings = bindingsOf(file)

    expect(bindings.length).toBeGreaterThan(0)
    expect(bindings).toStrictEqual(bindings.map(([name]) => [name, `${name}Action`]))
  })
})
