'use client'

import * as React from 'react'
import { useMotionValue, useSpring, type SpringOptions } from 'motion/react'

import { useIsInView, type UseIsInViewOptions } from '@/hooks/use-is-in-view'

export type CountingNumberProps = Omit<React.ComponentProps<'span'>, 'children'> & {
  number: number
  fromNumber?: number
  padStart?: boolean
  decimalSeparator?: string
  decimalPlaces?: number
  transition?: SpringOptions
  delay?: number
  initiallyStable?: boolean
  format?: (value: number) => string
} & UseIsInViewOptions

export function CountingNumber({
  ref,
  number,
  fromNumber = 0,
  padStart = false,
  inView = false,
  inViewMargin = '0px',
  inViewOnce = true,
  decimalSeparator = '.',
  transition = { stiffness: 90, damping: 50 },
  decimalPlaces = 0,
  delay = 0,
  initiallyStable = false,
  format,
  ...props
}: CountingNumberProps) {
  const { ref: localRef, isInView } = useIsInView(
    ref as React.Ref<HTMLElement>,
    { inView, inViewOnce, inViewMargin },
  )

  const numberStr = number.toString()
  const decimals =
    typeof decimalPlaces === 'number'
      ? decimalPlaces
      : numberStr.includes('.')
        ? (numberStr.split('.')[1]?.length ?? 0)
        : 0

  const motionVal = useMotionValue(initiallyStable ? number : fromNumber)
  const springVal = useSpring(motionVal, transition)

  const finalIntLength = Math.floor(Math.abs(number)).toString().length

  const formatValue = React.useCallback(
    (val: number) => {
      if (format) return format(decimals > 0 ? val : Math.round(val))
      let out = decimals > 0 ? val.toFixed(decimals) : Math.round(val).toString()
      if (decimals > 0) out = out.replace('.', decimalSeparator)
      if (padStart) {
        const [intPart, fracPart] = out.split(decimalSeparator)
        const paddedInt = (intPart ?? '').padStart(finalIntLength, '0')
        out = fracPart ? `${paddedInt}${decimalSeparator}${fracPart}` : paddedInt
      }
      return out
    },
    [decimals, decimalSeparator, padStart, finalIntLength, format],
  )

  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (isInView) motionVal.set(number)
    }, delay)
    return () => clearTimeout(timeoutId)
  }, [isInView, number, motionVal, delay])

  React.useEffect(() => {
    const unsubscribe = springVal.on('change', (latest) => {
      if (localRef.current) {
        localRef.current.textContent = formatValue(latest)
      }
    })
    return () => unsubscribe()
  }, [springVal, formatValue, localRef])

  const initialText = initiallyStable
    ? formatValue(number)
    : format
      ? format(0)
      : padStart
        ? '0'.padStart(finalIntLength, '0') + (decimals > 0 ? decimalSeparator + '0'.repeat(decimals) : '')
        : '0' + (decimals > 0 ? decimalSeparator + '0'.repeat(decimals) : '')

  return (
    <span ref={localRef} data-slot="counting-number" {...props}>
      {initialText}
    </span>
  )
}
