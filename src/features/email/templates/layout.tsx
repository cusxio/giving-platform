import {
  Body,
  Container,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
  pixelBasedPreset,
} from 'react-email'

import { config } from '#/core/brand'

export interface LayoutProps {
  mode: 'login' | 'signup'
  otp: string
  previewText: string
  text: string
}

/**
 * Do NOT use default export in this file. If you do, the react-email
 * preview server will treat it as an email template and load it automatically.
 */
export function Layout(props: LayoutProps) {
  // For react email preview server
  // oxlint-disable-next-line typescript/no-useless-default-assignment
  const { previewText, text, otp = '777555', mode } = props

  return (
    <Html>
      <Tailwind config={{ presets: [pixelBasedPreset] }}>
        <Body className="px-4 py-8 font-sans">
          <Preview>{previewText}</Preview>
          <Container>
            <Section className="flex items-center justify-center">
              <Text className="my-0 font-bold text-neutral-900 uppercase">{config.entity}</Text>
            </Section>

            <Hr className="mt-4 mb-0 border-t border-neutral-200" />

            <Section className="pt-15 pb-22">
              <Heading className="text-center text-3xl text-neutral-900">Hi there 👋,</Heading>

              <Text className="my-8 text-center text-balance text-neutral-900">{text}</Text>

              <Text className="my-0 bg-neutral-200 p-4 text-center font-mono text-3xl tracking-widest">
                {otp}
              </Text>
            </Section>

            <Hr className="mt-0 mb-6 border-t border-neutral-200" />

            <Section>
              <Text className="my-0 text-center text-xs text-balance text-neutral-500">
                You’ve received this email as part of the {mode === 'signup' ? 'sign up' : 'log in'}{' '}
                process. This is a mandatory service email from {config.entity}.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
