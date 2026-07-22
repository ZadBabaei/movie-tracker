import "./Hero.css";

const Hero = ({
  backgroundImage = "",
  heroText,
  heroTextSub = "",
  eyebrow = "",
  stats = "",
  height = "60vh",
  variant = "group",
}) => {
  return (
    <header className="hero-navbar hero-glass" style={{ height }}>
      {variant === "group" && backgroundImage && (
        <img
          className="hero-glass-backdrop"
          src={backgroundImage}
          alt=""
          aria-hidden="true"
        />
      )}
      {variant === "group" && <div className="hero-glass-scrim" />}

      {variant === "group" && (
        <div className="hero-glass-inner">
          {eyebrow && <p className="hero-glass-eyebrow">{eyebrow}</p>}
          <h1 className="hero-glass-title">{heroText}</h1>
          {heroTextSub && <p className="hero-glass-sub">{heroTextSub}</p>}
          {stats && <p className="hero-glass-stats">{stats}</p>}
        </div>
      )}

      {variant === "home" && (
        <div
          className="hero-banner parallax-hero"
          style={{ backgroundImage: `url(${backgroundImage})`, height }}
        >
          <div className="banner-overlay"></div>
          <div className="home-title-container">
            <h1 className="main-heading">{heroText}</h1>
            <p className="sub-heading">{heroTextSub}</p>
          </div>
        </div>
      )}
    </header>
  );
};

export default Hero;
