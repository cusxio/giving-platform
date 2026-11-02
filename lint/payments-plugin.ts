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

const noVerifiedCast = {
  create(context: RuleContext) {
    const check = (node: Assertion) => {
      if (isVerified(node.typeAnnotation)) {
        context.report({
          message:
            'Only payments/eghl.gateway.server.ts marks a gateway reply Verified, after its signature check. Take the Verified value the gateway returns.',
          node,
        })
      }
    }
    return { TSAsExpression: check, TSTypeAssertion: check }
  },
}

const plugin = { meta: { name: 'payments' }, rules: { 'no-verified-cast': noVerifiedCast } }

export default plugin
