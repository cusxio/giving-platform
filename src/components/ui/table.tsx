import type { HTMLAttributes } from 'react'

import { cx } from '#/styles/cx'

export function Table(props: HTMLAttributes<HTMLTableElement>) {
  const { className, ...rest } = props
  return <table className={cx('w-full text-sm', className)} {...rest} />
}

export function TableBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  const { className, ...rest } = props
  return (
    <tbody
      className={cx(
        'border border-border [&_tr:last-child]:border-0',
        className,
      )}
      {...rest}
    />
  )
}

export function TableCell(props: HTMLAttributes<HTMLTableCellElement>) {
  const { className, ...rest } = props
  return (
    <td
      className={cx(
        'px-4 py-2',
        'border-r border-border last:border-none',
        className,
      )}
      {...rest}
    />
  )
}

export function TableFooter(props: HTMLAttributes<HTMLTableSectionElement>) {
  const { className, ...rest } = props
  return <tfoot className={cx('border border-border', className)} {...rest} />
}

export function TableHead(props: HTMLAttributes<HTMLTableCellElement>) {
  const { className, ...rest } = props
  return (
    <th
      className={cx(
        'h-12 px-4 font-medium text-fg-muted',
        'border-r border-border last:border-none',
        className,
      )}
      {...rest}
    />
  )
}

export function TableHeader(props: HTMLAttributes<HTMLTableSectionElement>) {
  const { className, ...rest } = props
  return (
    <thead
      className={cx('border border-border [&_tr]:border-b', className)}
      {...rest}
    />
  )
}

export function TableRow(props: HTMLAttributes<HTMLTableRowElement>) {
  const { className, ...rest } = props
  return <tr className={cx('border-b border-border', className)} {...rest} />
}
