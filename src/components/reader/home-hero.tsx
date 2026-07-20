import { withBookBasePath } from "@/runtime/base-path";

const HERO_WIDTHS = [640, 1024, 1536] as const;
const HERO_ASSET_PREFIX =
  "/images/home/engineering-reliable-agentic-ai-systems-hero";
const HERO_SIZES = "(max-width: 56rem) calc(100vw - 2rem), 48rem";

function heroSourceSet(format: "avif" | "webp"): string {
  return HERO_WIDTHS.map(
    (width) =>
      `${withBookBasePath(`${HERO_ASSET_PREFIX}-${width}.${format}`)} ${width}w`,
  ).join(", ");
}

export function HomeHero() {
  return (
    <figure className="home-hero">
      <div className="home-hero-frame">
        <picture>
          <source
            sizes={HERO_SIZES}
            srcSet={heroSourceSet("avif")}
            type="image/avif"
          />
          <source
            sizes={HERO_SIZES}
            srcSet={heroSourceSet("webp")}
            type="image/webp"
          />
          {/* Static export cannot use Next's default image optimizer. */}
          <img
            alt="A layered agentic AI system with observable execution paths and guarded boundaries"
            className="home-hero-image"
            decoding="async"
            fetchPriority="high"
            height={864}
            loading="eager"
            sizes={HERO_SIZES}
            src={withBookBasePath(`${HERO_ASSET_PREFIX}-1536.webp`)}
            srcSet={heroSourceSet("webp")}
            width={1536}
          />
        </picture>
      </div>
      <figcaption className="home-hero-caption">
        <span className="home-hero-caption-label">Systems view</span>
        <span>
          Reliable agency emerges from observable execution, bounded authority,
          and verified state transitions.
        </span>
      </figcaption>
    </figure>
  );
}
