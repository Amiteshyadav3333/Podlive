import Image from "next/image";

interface BrandLogoProps {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  showName?: boolean;
}

export default function BrandLogo({
  className = "gap-2.5",
  iconClassName = "size-9",
  textClassName = "text-lg",
  showName = true,
}: BrandLogoProps) {
  return (
    <span className={`inline-flex shrink-0 items-center ${className}`} aria-label="PodLive">
      <Image
        src="/podlive-mark.svg"
        alt=""
        width={48}
        height={48}
        priority
        className={`${iconClassName} rounded-xl shadow-lg shadow-rose-950/30`}
      />
      {showName && (
        <span className={`whitespace-nowrap font-black tracking-tight ${textClassName}`}>
          Pod<span className="bg-gradient-to-r from-rose-400 to-violet-400 bg-clip-text text-transparent">Live</span>
        </span>
      )}
    </span>
  );
}
