import type { CSSProperties } from "react"

interface BrandLockupProps {
  className?: string
  titleId?: string
  style?: CSSProperties
}

export function BrandLockup({ className = "", titleId, style }: BrandLockupProps) {
  return (
    <div id={titleId} className={`apz-brand-lockup ${className}`.trim()} aria-label="APZ Legal" style={style}>
      <div className="apz-brand-primary">
        <img src="/apz-legal-mark-charcoal-gold.png" alt="APZ Legal mark" className="apz-brand-mark" />
        <div className="apz-brand-copy">
          <span className="apz-brand-wordmark">APZ</span>
          <span className="apz-brand-descriptor">LEGAL</span>
        </div>
      </div>
      <span className="apz-brand-subline">LEGAL OPERATING SYSTEM</span>
    </div>
  )
}