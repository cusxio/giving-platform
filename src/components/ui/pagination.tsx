import type { Icon } from '@phosphor-icons/react'
import {
  CaretDoubleLeftIcon,
  CaretDoubleRightIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from '@phosphor-icons/react/dist/ssr'
import { Link } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'

import { cx } from '#/styles/cx'

interface PaginationLinkProps extends Pick<
  LinkProps,
  'disabled' | 'search' | 'to'
> {
  icon: ReturnType<Icon>
}

interface PaginationProps {
  page: number
  pageCount: number
  to: LinkProps['to']
}

export function Pagination(props: PaginationProps) {
  const { page, pageCount, to } = props
  return (
    <div className="flex items-center justify-end gap-x-4 text-fg-muted">
      <span className="text-sm">
        Page <span className="text-fg-1">{page}</span> of{' '}
        <span className="text-fg-1">{pageCount}</span>
      </span>

      <div className="flex items-center gap-x-1.5">
        <PaginationLink
          disabled={page === 1}
          icon={<CaretDoubleLeftIcon size={14} weight="bold" />}
          search={{ page: undefined }}
          to={to}
        />
        <PaginationLink
          disabled={page === 1}
          icon={<CaretLeftIcon size={14} weight="bold" />}
          search={{ page: page - 1 === 0 ? undefined : page - 1 }}
          to={to}
        />
        <PaginationLink
          disabled={page === pageCount}
          icon={<CaretRightIcon size={14} weight="bold" />}
          search={{ page: page + 1 }}
          to={to}
        />
        <PaginationLink
          disabled={page === pageCount}
          icon={<CaretDoubleRightIcon size={14} weight="bold" />}
          search={{ page: pageCount }}
          to={to}
        />
      </div>
    </div>
  )
}

function PaginationLink(props: PaginationLinkProps) {
  const { icon, ...rest } = props
  return (
    <Link
      className={cx(
        'h-6 w-6 border border-border',
        'inline-flex items-center justify-center',
        'text-fg-1 aria-disabled:text-fg-subtle',
      )}
      {...rest}
    >
      {icon}
    </Link>
  )
}
