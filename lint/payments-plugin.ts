interface NameNode {
  readonly name?: string
  readonly right?: NameNode
  readonly type: string
}

interface TypeNode {
  readonly qualifier?: NameNode | null
  readonly type: string
  readonly typeName?: NameNode
}

interface Assertion {
  readonly typeAnnotation: TypeNode
}

interface RuleContext {
  readonly report: (descriptor: { message: string; node: Assertion }) => void
}

const lastName = (node: NameNode | null | undefined): string | undefined =>
  node?.type === 'TSQualifiedName' ? lastName(node.right) : node?.name

const isVerified = ({ qualifier, type, typeName }: TypeNode) =>
  (type === 'TSTypeReference' && lastName(typeName) === 'Verified') ||
  (type === 'TSImportType' && lastName(qualifier) === 'Verified')

const isNeverOrAny = ({ type }: TypeNode) => type === 'TSNeverKeyword' || type === 'TSAnyKeyword'

const castRule = (banned: (type: TypeNode) => boolean, message: string) => ({
  create(context: RuleContext) {
    const check = (node: Assertion) => {
      if (banned(node.typeAnnotation)) {
        context.report({ message, node })
      }
    }
    return { TSAsExpression: check, TSTypeAssertion: check }
  },
})

const plugin = {
  meta: { name: 'payments' },
  rules: {
    'no-never-or-any-cast': castRule(
      isNeverOrAny,
      'A value cast to never or any passes as Verified. Cast to the type you mean, and take a Verified value only from payments/eghl.gateway.server.ts.',
    ),
    'no-verified-cast': castRule(
      isVerified,
      'Only payments/eghl.gateway.server.ts marks a gateway reply Verified, after its signature check. Take the Verified value the gateway returns.',
    ),
  },
}

export default plugin
